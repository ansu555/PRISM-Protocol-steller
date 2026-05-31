'use client';

// Deposit USDC into a tranche by invoking `deposit` on prism-core.
//
// Soroban flow:
//   1. Build the contract-call tx via app/lib/stellar's ContractClient.invoke
//   2. The user signs via the connected Stellar wallet (Freighter etc.)
//   3. Result is the new pToken share count
//
// Hook shape kept stable so dashboard components don't change.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TransactionBuilder } from '@stellar/stellar-sdk';
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

// The pToken SACs on mainnet were issued by this account. Stellar forbids the
// issuer of a classic asset from holding that asset, so any `mint` call with
// this address as recipient will fail with "operation invalid on issuer".
// Users must connect a different wallet to deposit on mainnet.
const PTOKEN_ISSUER_MAINNET = 'GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO';

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

      // The pToken issuer account cannot receive minted tokens — Stellar rejects
      // it with "operation invalid on issuer". Catch this before submitting.
      if (ACTIVE_NETWORK === 'mainnet' && wallet.address === PTOKEN_ISSUER_MAINNET) {
        throw new Error(
          'This wallet is the pToken issuer and cannot hold pTokens. ' +
          'Connect a different Stellar wallet to deposit.',
        );
      }

      const core = getCoreClient();
      const server = getRpcServer();
      const source = await getHorizonServer().loadAccount(wallet.address);

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
