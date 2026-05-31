'use client';

// Swap pTranche tokens ↔ USDC via the Soroswap router.
//
// Phase 2 change: this hook now calls Soroswap's `swap_exact_tokens_for_tokens`
// directly (not the internal prism-amm). The path is [tokenIn, tokenOut]:
//   - Tranche → USDC: [ptoken, usdc_sac]
//   - USDC → Tranche: [usdc_sac, ptoken]
//
// The hook reads the pToken address from the prism-core contract, builds the
// Soroswap call, and polls until the transaction settles.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Address, Contract, TransactionBuilder, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import {
  NETWORK_PASSPHRASE,
  SOROSWAP_ROUTER_ID,
  USDC_CONTRACT_ID,
  VAULT_ID,
  TrancheKind,
} from '@/app/lib/constants';
import { getCoreClient, getRpcServer, getHorizonServer, nativeToScVal as ntsv } from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { explorerTxUrl } from '@/app/lib/horizon';

export const SWAP_DIR_TRANCHE_TO_USDC = 0 as const;
export const SWAP_DIR_USDC_TO_TRANCHE = 1 as const;
export type SwapDirection = 0 | 1;

export interface SwapParams {
  trancheKind: TrancheKind;
  amountIn: bigint;
  minAmountOut: bigint;
  direction: SwapDirection;
}

const TRANCHE_LABELS = ['pPRIME', 'pCORE', 'pALPHA'] as const;

interface TrancheSnapshot {
  ptoken: string;
}

/** Build a Vec<Address> ScVal from an array of contract ID strings. */
function addressVec(addresses: string[]): xdr.ScVal {
  return xdr.ScVal.scvVec(addresses.map((a) => new Address(a).toScVal()));
}

export function useSwap() {
  const wallet = useStellarWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ trancheKind, amountIn, minAmountOut, direction }: SwapParams) => {
      if (!wallet.address) {
        throw new Error('Connect a Stellar wallet first');
      }

      // 1. Look up the pToken contract address from prism-core.
      const core = getCoreClient();
      const tranche = await core.read<TrancheSnapshot | null>('get_tranche', [
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(trancheKind, { type: 'u32' }),
      ]);
      if (!tranche?.ptoken) {
        throw new Error('Tranche pToken not initialized');
      }

      // 2. Build swap path: [tokenIn, tokenOut]
      const path: [string, string] =
        direction === SWAP_DIR_TRANCHE_TO_USDC
          ? [tranche.ptoken, USDC_CONTRACT_ID]
          : [USDC_CONTRACT_ID, tranche.ptoken];

      // 3. Build and submit the Soroswap swap_exact_tokens_for_tokens transaction.
      const server = getRpcServer();
      const source = await getHorizonServer().loadAccount(wallet.address);
      const router = new Contract(SOROSWAP_ROUTER_ID);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

      let tx = new TransactionBuilder(source, {
        fee: '1000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          router.call(
            'swap_exact_tokens_for_tokens',
            nativeToScVal(amountIn, { type: 'i128' }),
            nativeToScVal(minAmountOut, { type: 'i128' }),
            addressVec(path),
            new Address(wallet.address).toScVal(),
            nativeToScVal(deadline, { type: 'u64' }),
          ),
        )
        .setTimeout(60)
        .build();

      tx = await server.prepareTransaction(tx);

      // Wallet signs via signTransaction (XDR string in → XDR string out).
      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResult = await server.sendTransaction(signedTx as never);
      if (sendResult.status === 'ERROR') {
        throw new Error(`Swap submission failed: ${JSON.stringify(sendResult.errorResult)}`);
      }

      // 4. Poll until the tx settles.
      let status = await server.getTransaction(sendResult.hash);
      const deadline2 = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline2) {
        await new Promise((r) => setTimeout(r, 1_500));
        status = await server.getTransaction(sendResult.hash);
      }
      if (status.status !== 'SUCCESS') {
        throw new Error(`Swap failed: status=${status.status}`);
      }

      return sendResult.hash;
    },

    onSuccess: (hash, { trancheKind, direction }) => {
      const trancheLabel = TRANCHE_LABELS[trancheKind];
      const label =
        direction === SWAP_DIR_USDC_TO_TRANCHE
          ? `Bought ${trancheLabel}`
          : `Sold ${trancheLabel} for USDC`;

      const txUrl = explorerTxUrl(hash);

      toast.success(label, {
        description: (
          <a
            href={txUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1 font-mono text-[10px] text-pink-400/80 hover:text-pink-400 hover:underline"
          >
            TX: {hash.slice(0, 8)}...{hash.slice(-8)} ↗ Soroswap
          </a>
        ),
      });

      queryClient.invalidateQueries({ queryKey: ['vault-state'] });
      queryClient.invalidateQueries({ queryKey: ['identity-balances'] });
      queryClient.invalidateQueries({ queryKey: ['user-position'] });
    },

    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Swap failed');
    },
  });
}
