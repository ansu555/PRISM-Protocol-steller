'use client';

// Admin-only: originate a loan via prism-core's init_loan handler.
//
// On Soroban the loan is keyed by u32 id (the admin chooses it). After
// origination the loan sits in `Originated` state until admin calls
// disburse_loan, which moves USDC from the contract reserve to the borrower.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Address, TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import {
  NETWORK_PASSPHRASE,
  USDC_BASE_UNITS,
  VAULT_ID,
} from '@/app/lib/constants';
import {
  addr,
  getCoreClient,
  getRpcServer,
  nativeToScVal,
} from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-context';

export interface OriginateLoanParams {
  /** u32 id you want this loan stored under. Pick something unique. */
  loanId: number;
  /** Stellar address (`G...`) that will receive the disbursed USDC. */
  borrower: string;
  /** Principal in USDC (UI float, e.g. 10 for 10 USDC). */
  principalUsdc: number;
  /** Annual percentage rate in basis points (e.g. 800 = 8%). */
  aprBps: number;
  /** Maturity timestamp in seconds since epoch. Must be in the future. */
  maturityTs: number;
  /** Override the default vault id if you're running multiple. */
  vaultId?: number;
}

export function useOriginateLoan() {
  const wallet = useStellarWallet();
  const qc = useQueryClient();

  return useMutation<string, Error, OriginateLoanParams>({
    mutationFn: async (params) => {
      if (!wallet.address) {
        throw new Error('Connect the admin/deployer wallet first');
      }
      if (!Number.isFinite(params.principalUsdc) || params.principalUsdc <= 0) {
        throw new Error('Principal must be > 0');
      }
      if (!Number.isFinite(params.aprBps) || params.aprBps < 0 || params.aprBps > 10_000) {
        throw new Error('APR must be 0..10000 bps');
      }
      const nowSec = Math.floor(Date.now() / 1000);
      if (params.maturityTs <= nowSec) {
        throw new Error('Maturity must be in the future');
      }
      // Validate borrower is a parseable Stellar address.
      try {
        Address.fromString(params.borrower);
      } catch {
        throw new Error('Borrower must be a valid Stellar `G...` address');
      }

      const principal = BigInt(
        Math.floor(params.principalUsdc * Number(USDC_BASE_UNITS)),
      );

      const core = getCoreClient();
      const server = getRpcServer();
      const source = await server.getAccount(wallet.address);

      let tx = new TransactionBuilder(source, {
        fee: '1000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          core.contract.call(
            'init_loan',
            nativeToScVal(params.vaultId ?? VAULT_ID, { type: 'u32' }),
            nativeToScVal(params.loanId, { type: 'u32' }),
            addr(params.borrower),
            nativeToScVal(principal, { type: 'i128' }),
            nativeToScVal(params.aprBps, { type: 'u32' }),
            nativeToScVal(BigInt(params.maturityTs), { type: 'u64' }),
          ),
        )
        .setTimeout(60)
        .build();

      tx = await server.prepareTransaction(tx);
      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResult = await server.sendTransaction(signedTx as never);
      if (sendResult.status === 'ERROR') {
        throw new Error(
          `init_loan submission failed: ${JSON.stringify(sendResult.errorResult)}`,
        );
      }

      let status = await server.getTransaction(sendResult.hash);
      const deadline = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        status = await server.getTransaction(sendResult.hash);
      }
      if (status.status !== 'SUCCESS') {
        throw new Error(`init_loan failed on-chain: status=${status.status}`);
      }

      return sendResult.hash;
    },
    onSuccess: (hash, params) => {
      toast.success(`Loan #${params.loanId} originated`, {
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
      qc.invalidateQueries({ queryKey: ['active-loans'] });
      qc.invalidateQueries({ queryKey: ['vault-state'] });
    },
    onError: (e: Error) => {
      const msg = e.message ?? 'init_loan failed';
      // Soroban error code #50 = AlreadyInitialized — surface a friendlier hint.
      if (/#50|AlreadyInitialized/i.test(msg)) {
        toast.error('A loan with that id already exists. Pick a different loan id.');
      } else if (/admin/i.test(msg) && /auth/i.test(msg)) {
        toast.error(
          'This action requires the admin/deployer wallet. Switch to the wallet that ran init_config.',
        );
      } else {
        toast.error(`Origination failed: ${msg}`);
      }
    },
  });
}
