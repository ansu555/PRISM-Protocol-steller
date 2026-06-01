'use client';

// Seed a Soroswap AMM pool for one tranche — admin-direct.
//
// We add liquidity straight from the admin wallet rather than routing through
// prism-core's `seed_pool_liquidity`. That handler approves the router and calls
// add_liquidity as the contract, but this router pulls tokens with a plain
// `transfer(from = prism_core, …)`; since prism-core is not the direct caller of
// that transfer, its auth is not automatic and the call fails with
// Error(Auth, InvalidAction). The deployed contract has no `authorize_as_current_contract`
// and no upgrade entrypoint, so we seed from the admin account instead — its single
// signature authorizes the router's internal transfers and pair creation.
//
// Token sources (the admin is `to`, so also the source of both legs):
//   - pToken: the admin IS the pToken issuer, so the router's transfer mints it.
//   - USDC:   the admin must already hold >= usdcAmount of real USDC.
//
// The admin receives the LP tokens.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import { TrancheKind, NETWORK_PASSPHRASE } from '@/app/lib/constants';
import { type StellarSigner } from '@/app/lib/stellar';
import { addLiquidity } from '@/app/lib/soroswap';
import { ACTIVE_CONTRACTS } from '@/app/lib/addresses';
import { useStellarWallet } from '@/components/providers/stellar-wallet-context';

const PTOKEN_BY_KIND: Record<TrancheKind, keyof typeof ACTIVE_CONTRACTS> = {
  [TrancheKind.Prime]: 'ptokenPrime',
  [TrancheKind.Core]:  'ptokenCore',
  [TrancheKind.Alpha]: 'ptokenAlpha',
};

export function useSeedPool() {
  const wallet      = useStellarWallet();
  const queryClient = useQueryClient();

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

      const contracts = ACTIVE_CONTRACTS;
      const ptokenId  = contracts[PTOKEN_BY_KIND[trancheKind]] as string;

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

      // One signed router call: creates the pair, transfers USDC + pToken into it,
      // and mints LP tokens back to the admin. Mins are 0 — initial seed has no price.
      toast.info('Seeding the AMM pool — one signature…');
      return addLiquidity(
        signer,
        contracts.usdc,
        ptokenId,
        usdcAmount,
        ptokenAmount,
        0n,
        0n,
        contracts.soroswapRouter,
      );
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
