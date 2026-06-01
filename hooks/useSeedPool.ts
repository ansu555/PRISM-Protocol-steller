'use client';

// Seed a Soroswap AMM pool for one tranche.
//
// Flow (3 sequential signed txs):
//   1. Transfer pTokens from admin wallet → prism-core contract
//   2. Transfer USDC from admin wallet → prism-core contract
//   3. Call prism-core::seed_pool_liquidity → approves router + calls add_liquidity

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import { TrancheKind, NETWORK_PASSPHRASE } from '@/app/lib/constants';
import {
  addr,
  getCoreClient,
  nativeToScVal,
  ContractClient,
  type StellarSigner,
} from '@/app/lib/stellar';
import { ACTIVE_CONTRACTS } from '@/app/lib/addresses';
import { useStellarWallet } from '@/components/providers/stellar-wallet-context';
import { useSelectedVaultId } from '@/hooks/useSelectedVault';

const PTOKEN_BY_KIND: Record<TrancheKind, keyof typeof ACTIVE_CONTRACTS> = {
  [TrancheKind.Prime]: 'ptokenPrime',
  [TrancheKind.Core]:  'ptokenCore',
  [TrancheKind.Alpha]: 'ptokenAlpha',
};

export function useSeedPool() {
  const wallet    = useStellarWallet();
  const queryClient = useQueryClient();
  const { vaultId } = useSelectedVaultId();

  return useMutation({
    mutationFn: async ({
      trancheKind,
      usdcAmount,
      ptokenAmount,
    }: {
      trancheKind: TrancheKind;
      usdcAmount: bigint;
      ptokenAmount: bigint;
    }) => {
      if (!wallet.address) throw new Error('Connect your admin Stellar wallet first');

      const contracts    = ACTIVE_CONTRACTS;
      const ptokenId     = contracts[PTOKEN_BY_KIND[trancheKind]] as string;
      const ptokenClient = new ContractClient(ptokenId);
      const usdcClient   = new ContractClient(contracts.usdc);
      const coreClient   = getCoreClient();

      // Wrap the Freighter wallet as a StellarSigner.
      const signer: StellarSigner = {
        publicKey: () => wallet.address!,
        sign: async (tx) => {
          const signedXdr = await wallet.signTransaction(tx.toXDR());
          const signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
          for (const sig of signed.signatures) {
            tx.signatures.push(sig);
          }
        },
      };

      // ── Step 1: transfer pTokens wallet → contract ─────────────────────
      toast.info('Step 1/3: Sending pTokens to contract…');
      await ptokenClient.invoke(signer, 'transfer', [
        addr(wallet.address),
        addr(contracts.prismCore),
        nativeToScVal(ptokenAmount, { type: 'i128' }),
      ]);

      // ── Step 2: transfer USDC wallet → contract ────────────────────────
      toast.info('Step 2/3: Sending USDC to contract…');
      await usdcClient.invoke(signer, 'transfer', [
        addr(wallet.address),
        addr(contracts.prismCore),
        nativeToScVal(usdcAmount, { type: 'i128' }),
      ]);

      // ── Step 3: seed_pool_liquidity ────────────────────────────────────
      toast.info('Step 3/3: Seeding the AMM pool…');
      await coreClient.invoke(signer, 'seed_pool_liquidity', [
        addr(wallet.address),
        nativeToScVal(vaultId, { type: 'u32' }),
        nativeToScVal(trancheKind, { type: 'u32' }),
        addr(contracts.soroswapRouter),
        nativeToScVal(usdcAmount, { type: 'i128' }),
        nativeToScVal(ptokenAmount, { type: 'i128' }),
        nativeToScVal(0n, { type: 'i128' }),
        nativeToScVal(0n, { type: 'i128' }),
      ]);
    },

    onSuccess: (_, { trancheKind }) => {
      const labels = ['pPRIME', 'pCORE', 'pALPHA'];
      toast.success(`${labels[trancheKind]} pool seeded — swaps are now live!`);
      queryClient.invalidateQueries({ queryKey: ['vault-state'] });
    },

    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Pool seeding failed');
    },
  });
}
