'use client';

// AMM swap on prism-amm. Soroban version is much smaller — no SPL token
// account creation, no associated-token-address derivation; the AMM contract
// holds reserves in its own SAC balance and pulls/pushes from the user's
// SAC balance directly.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import {
  NETWORK_PASSPHRASE,
  VAULT_ID,
  TrancheKind,
} from '@/app/lib/constants';
import {
  addr,
  getAmmClient,
  getCoreClient,
  getRpcServer,
  nativeToScVal,
} from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

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

export function useSwap() {
  const wallet = useStellarWallet();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ trancheKind, amountIn, minAmountOut, direction }: SwapParams) => {
      if (!wallet.address) {
        throw new Error('Connect a Stellar wallet first');
      }

      // Find the pTranche contract id for the chosen tranche.
      const core = getCoreClient();
      const tranche = await core.read<TrancheSnapshot | null>('get_tranche', [
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(trancheKind, { type: 'u32' }),
      ]);
      if (!tranche?.ptoken) {
        throw new Error('Tranche pToken not initialized');
      }

      const amm = getAmmClient();
      const server = getRpcServer();
      const source = await server.getAccount(wallet.address);

      let tx = new TransactionBuilder(source, {
        fee: '1000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          amm.contract.call(
            'swap',
            addr(wallet.address),
            addr(tranche.ptoken),
            nativeToScVal(amountIn, { type: 'i128' }),
            nativeToScVal(minAmountOut, { type: 'i128' }),
            nativeToScVal(direction, { type: 'u32' }),
          ),
        )
        .setTimeout(60)
        .build();

      tx = await server.prepareTransaction(tx);
      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResult = await server.sendTransaction(signedTx as never);
      if (sendResult.status === 'ERROR') {
        throw new Error(`Swap submission failed: ${JSON.stringify(sendResult.errorResult)}`);
      }

      let status = await server.getTransaction(sendResult.hash);
      const deadline = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
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

      toast.success(label, {
        description: (
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1 font-mono text-[10px] text-pink-400/80 hover:text-pink-400 hover:underline"
          >
            TX: {hash.slice(0, 8)}...{hash.slice(-8)}
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
