'use client';

// Admin-only: disburse the principal from prism-core's reserve to the
// borrower's address. Loan must be in `Originated` state.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import { NETWORK_PASSPHRASE, VAULT_ID } from '@/app/lib/constants';
import {
  getCoreClient,
  getRpcServer,
  nativeToScVal,
} from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-context';

export interface DisburseLoanParams {
  loanId: number;
  vaultId?: number;
}

export function useDisburseLoan() {
  const wallet = useStellarWallet();
  const qc = useQueryClient();

  return useMutation<string, Error, DisburseLoanParams>({
    mutationFn: async (params) => {
      if (!wallet.address) {
        throw new Error('Connect the admin/deployer wallet first');
      }

      const core = getCoreClient();
      const server = getRpcServer();
      const source = await server.getAccount(wallet.address);

      let tx = new TransactionBuilder(source, {
        fee: '1000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          core.contract.call(
            'disburse_loan',
            nativeToScVal(params.vaultId ?? VAULT_ID, { type: 'u32' }),
            nativeToScVal(params.loanId, { type: 'u32' }),
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
          `disburse_loan submission failed: ${JSON.stringify(sendResult.errorResult)}`,
        );
      }

      let status = await server.getTransaction(sendResult.hash);
      const deadline = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        status = await server.getTransaction(sendResult.hash);
      }
      if (status.status !== 'SUCCESS') {
        throw new Error(`disburse_loan failed on-chain: status=${status.status}`);
      }

      return sendResult.hash;
    },
    onSuccess: (hash, params) => {
      toast.success(`Loan #${params.loanId} disbursed`, {
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
      const msg = e.message ?? 'disburse_loan failed';
      // Common cases: loan in wrong state (#4), insufficient reserves, not admin.
      if (/#4|LoanInWrongState/i.test(msg)) {
        toast.error('Loan must be in Originated state to disburse.');
      } else if (/#1|VaultNotActive/i.test(msg)) {
        toast.error('Vault is not Active — disburse is blocked.');
      } else if (/admin/i.test(msg) && /auth/i.test(msg)) {
        toast.error(
          'This action requires the admin/deployer wallet.',
        );
      } else {
        toast.error(`Disburse failed: ${msg}`);
      }
    },
  });
}
