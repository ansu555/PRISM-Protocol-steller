'use client';

// Deposit USDC into a tranche by invoking `deposit` on prism-core.
//
// Soroban flow:
//   1. Auto-establish pToken trustline if missing (changeTrust → Horizon)
//   2. Build the deposit contract-call tx and simulate via Soroban RPC
//   3. The user signs via the connected Stellar wallet (Freighter etc.)
//   4. Submit + poll for confirmation

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Asset, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import { NETWORK_PASSPHRASE, TrancheKind } from '@/app/lib/constants';
import {
  addr,
  getCoreClient,
  getHorizonServer,
  getRpcServer,
  nativeToScVal,
} from '@/app/lib/stellar';
import { ACTIVE_NETWORK } from '@/app/lib/addresses';
import { useSelectedVaultId } from '@/hooks/useSelectedVault';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

const TRANCHE_LABELS = ['Prime', 'Core', 'Alpha'];

// Issuer of the underlying classic Stellar asset wrapped by each pToken SAC.
// On each network this is the deployer account that ran `stellar contract asset deploy`.
const PTOKEN_ISSUER: Record<'testnet' | 'mainnet', string> = {
  mainnet: 'GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO',
  testnet: 'GCZFPAJEJHMQPZ4BQUWUEBV7KJQ7GEKDF4FAWYUW4NOIRSWXCMDEOESW',
};

// Classic asset codes for each tranche's pToken.
const PTOKEN_ASSET_CODE: Record<TrancheKind, string> = {
  [TrancheKind.Prime]: 'PPRIME',
  [TrancheKind.Core]: 'PCORE',
  [TrancheKind.Alpha]: 'PALPHA',
};

export function useDeposit() {
  const wallet = useStellarWallet();
  const queryClient = useQueryClient();
  const { vaultId } = useSelectedVaultId();

  return useMutation({
    mutationFn: async ({
      trancheKind,
      usdcAmount,
    }: {
      trancheKind: TrancheKind;
      usdcAmount: bigint;
    }) => {
      if (!wallet.address) {
        throw new Error('Connect a Stellar wallet first');
      }

      const issuer = PTOKEN_ISSUER[ACTIVE_NETWORK];

      // The pToken issuer cannot hold its own issued asset — Stellar rejects
      // mint with "operation invalid on issuer".
      if (wallet.address === issuer) {
        throw new Error(
          'This wallet is the pToken issuer and cannot hold pTokens. ' +
          'Connect a different Stellar wallet to deposit.',
        );
      }

      const horizon = getHorizonServer();
      const core = getCoreClient();
      const server = getRpcServer();

      let source = await horizon.loadAccount(wallet.address);

      // Auto-establish the pToken trustline if the wallet doesn't have one yet.
      // Stellar requires a trustline before any asset can be minted to an account.
      // We submit a changeTrust tx first (one extra Freighter prompt, first deposit only).
      const assetCode = PTOKEN_ASSET_CODE[trancheKind];
      const hasTrustline = source.balances.some(
        (b) =>
          b.asset_type !== 'native' &&
          (b as { asset_code: string; asset_issuer: string }).asset_code === assetCode &&
          (b as { asset_code: string; asset_issuer: string }).asset_issuer === issuer,
      );

      if (!hasTrustline) {
        toast.info(`Adding ${assetCode} trustline to your wallet…`);

        const pTokenAsset = new Asset(assetCode, issuer);
        const trustTx = new TransactionBuilder(source, {
          fee: '1000',
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(Operation.changeTrust({ asset: pTokenAsset }))
          .setTimeout(60)
          .build();

        const signedTrustXdr = await wallet.signTransaction(trustTx.toXDR());
        const signedTrustTx = TransactionBuilder.fromXDR(signedTrustXdr, NETWORK_PASSPHRASE);
        await horizon.submitTransaction(signedTrustTx as never);

        // Reload account — sequence number advanced after the trustline tx.
        source = await horizon.loadAccount(wallet.address);
      }

      // Build a tx invoking `deposit(user, vault_id, kind, amount)`.
      let tx = new TransactionBuilder(source, {
        fee: '1000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          core.contract.call(
            'deposit',
            addr(wallet.address),
            nativeToScVal(vaultId, { type: 'u32' }),
            nativeToScVal(trancheKind, { type: 'u32' }),
            nativeToScVal(usdcAmount, { type: 'i128' }),
          ),
        )
        .setTimeout(60)
        .build();

      // Soroban-specific simulation + footprint assembly.
      tx = await server.prepareTransaction(tx);

      // Sign through the wallet kit (Freighter etc.).
      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      // Submit + poll.
      const sendResult = await server.sendTransaction(signedTx as never);
      if (sendResult.status === 'ERROR') {
        throw new Error(`Deposit submission failed: ${JSON.stringify(sendResult.errorResult)}`);
      }

      let status = await server.getTransaction(sendResult.hash);
      const deadline = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        status = await server.getTransaction(sendResult.hash);
      }
      if (status.status !== 'SUCCESS') {
        throw new Error(`Deposit failed: status=${status.status}`);
      }

      return sendResult.hash;
    },
    onSuccess: (hash, { trancheKind }) => {
      const label = `Deposited into ${TRANCHE_LABELS[trancheKind]}`;
      toast.success(label, {
        description: (
          <a
            href={`https://stellar.expert/explorer/${ACTIVE_NETWORK}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 flex items-center gap-1 font-mono text-[10px] text-pink-400/80 hover:text-pink-400 hover:underline"
          >
            TX: {hash.slice(0, 8)}...{hash.slice(-8)}
          </a>
        ),
      });
      queryClient.invalidateQueries({ queryKey: ['vault-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-position'] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Deposit failed');
    },
  });
}
