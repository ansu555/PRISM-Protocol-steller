'use client';

// Repay USDC against a loan via prism-core's `repay_loan` handler.
//
// Same Stellar build + sign + submit pattern as useDeposit.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import {
  NETWORK_PASSPHRASE,
  USDC_BASE_UNITS,
} from '@/app/lib/constants';
import {
  addr,
  getCoreClient,
  getRpcServer,
  nativeToScVal,
} from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

export function useRepayLoan() {
  const wallet = useStellarWallet();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      vaultId: _vaultId,
      loanId,
      amountUsdc,
    }: {
      vaultId: number;
      loanId: number;
      amountUsdc: number;
    }) => {
      if (!wallet.address) {
        throw new Error('Connect a Stellar wallet first');
      }

      // amountUsdc is a UI float (e.g. 12.5); convert to base units (7 decimals).
      const amountBigInt =
        BigInt(Math.floor(amountUsdc * Number(USDC_BASE_UNITS))) ?? 0n;

      const core = getCoreClient();
      const server = getRpcServer();
      const source = await server.getAccount(wallet.address);

      let tx = new TransactionBuilder(source, {
        fee: '1000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          core.contract.call(
            'repay_loan',
            addr(wallet.address),
            nativeToScVal(loanId, { type: 'u32' }),
            nativeToScVal(amountBigInt, { type: 'i128' }),
          ),
        )
        .setTimeout(60)
        .build();

      tx = await server.prepareTransaction(tx);

      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResult = await server.sendTransaction(signedTx as never);
      if (sendResult.status === 'ERROR') {
        throw new Error(`Repayment submission failed: ${JSON.stringify(sendResult.errorResult)}`);
      }

      let status = await server.getTransaction(sendResult.hash);
      const deadline = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        status = await server.getTransaction(sendResult.hash);
      }
      if (status.status !== 'SUCCESS') {
        throw new Error(`Repayment failed: status=${status.status}`);
      }

      return sendResult.hash;
    },
    onSuccess: (hash, variables) => {
      qc.invalidateQueries({ queryKey: ['loan-account', variables.loanId] });
      qc.invalidateQueries({ queryKey: ['active-loans', variables.vaultId] });
      qc.invalidateQueries({ queryKey: ['vault-state'] });
      toast.success('Repayment successful', {
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
    },
    onError: (e: Error) => {
      console.error('Repayment failed:', e);
      toast.error(`Repayment failed: ${e.message}`);
    },
  });
}
