'use client';

// Seed a Soroswap AMM pool for one tranche.
//
// Flow (3 sequential signed txs):
//   1. Transfer pTokens from admin wallet → prism-core contract
//   2. Transfer USDC from admin wallet → prism-core contract
//   3. Call prism-core::seed_pool_liquidity → approves router + calls add_liquidity

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Asset, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import { TrancheKind, NETWORK_PASSPHRASE } from '@/app/lib/constants';
import {
  addr,
  getCoreClient,
  getHorizonServer,
  nativeToScVal,
  ContractClient,
  type StellarSigner,
} from '@/app/lib/stellar';
import { ACTIVE_CONTRACTS, ACTIVE_NETWORK } from '@/app/lib/addresses';

const BASE_RESERVE_XLM = 0.5;
const FEE_BUFFER_XLM = 0.02;

const PTOKEN_ISSUER: Record<'testnet' | 'mainnet', string> = {
  mainnet: 'GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO',
  testnet: 'GCZFPAJEJHMQPZ4BQUWUEBV7KJQ7GEKDF4FAWYUW4NOIRSWXCMDEOESW',
};

const PTOKEN_ASSET_CODE: Record<TrancheKind, string> = {
  [TrancheKind.Prime]: 'PPRIME',
  [TrancheKind.Core]:  'PCORE',
  [TrancheKind.Alpha]: 'PALPHA',
};
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

      // ── Trustline pre-flight ───────────────────────────────────────────────
      // The admin wallet must have a trustline for the pToken before it can
      // hold or transfer it. Auto-establish it if missing (one extra Freighter
      // prompt on first seed only).
      const horizon   = getHorizonServer();
      const issuer    = PTOKEN_ISSUER[ACTIVE_NETWORK];
      const assetCode = PTOKEN_ASSET_CODE[trancheKind];

      // The asset issuer holds an implicit, unlimited balance of its own asset and
      // is forbidden from creating a trustline to it — Stellar rejects that as
      // op_malformed. In the default single-key setup the admin wallet *is* the
      // pToken issuer, so we must skip the trustline pre-flight: `transfer` from
      // the issuer mints the pTokens straight to the contract, no trustline needed.
      const isIssuer = wallet.address === issuer;

      let source = await horizon.loadAccount(wallet.address);

      const hasTrustline = source.balances.some(
        (b) =>
          b.asset_type !== 'native' &&
          (b as { asset_code: string; asset_issuer: string }).asset_code === assetCode &&
          (b as { asset_code: string; asset_issuer: string }).asset_issuer === issuer,
      );

      if (!hasTrustline && !isIssuer) {
        const nativeEntry = source.balances.find(
          (b) => b.asset_type === 'native',
        ) as { balance: string; selling_liabilities?: string } | undefined;
        const nativeBalance      = Number(nativeEntry?.balance ?? '0');
        const sellingLiabilities = Number(nativeEntry?.selling_liabilities ?? '0');
        const requiredXlm =
          (2 + source.subentry_count + 1) * BASE_RESERVE_XLM +
          sellingLiabilities +
          FEE_BUFFER_XLM;

        if (nativeBalance < requiredXlm) {
          const shortfall = (requiredXlm - nativeBalance).toFixed(2);
          throw new Error(
            `Not enough XLM to add the ${assetCode} trustline. Need ~${shortfall} more XLM.`,
          );
        }

        toast.info(`Adding ${assetCode} trustline to admin wallet…`);

        source = await horizon.loadAccount(wallet.address);
        const trustTx = new TransactionBuilder(source, {
          fee: '10000',
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(Operation.changeTrust({ asset: new Asset(assetCode, issuer) }))
          .setTimeout(180)
          .build();

        const signedTrustXdr = await wallet.signTransaction(trustTx.toXDR());
        const horizonUrl = horizon.serverURL.toString().replace(/\/$/, '');
        const horizonResp = await fetch(`${horizonUrl}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ tx: signedTrustXdr }),
        });

        if (!horizonResp.ok) {
          const body = await horizonResp.json().catch(() => ({})) as {
            extras?: { result_codes?: { transaction?: string; operations?: string[] } };
          };
          const opCode = body?.extras?.result_codes?.operations?.[0];
          const txCode = body?.extras?.result_codes?.transaction;
          if (opCode === 'op_low_reserve') {
            throw new Error(
              'Not enough XLM to add a trustline. Top up your XLM and try again.',
            );
          }
          throw new Error(
            `Trustline setup failed (${opCode ?? txCode ?? horizonResp.status}).`,
          );
        }

        source = await horizon.loadAccount(wallet.address);
      }

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
