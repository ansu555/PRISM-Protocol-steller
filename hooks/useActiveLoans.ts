'use client';

// Probe loan IDs 1..maxScan; collect what comes back.
//
// Loans on Soroban are keyed by u32 id (not PDA). We start at 1 because
// prism-core originates loans starting at id 1 (see Phase 3 contract tests).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PRISM_CORE_CONTRACT_ID, VAULT_ID } from '@/app/lib/constants';
import { getCoreClient, nativeToScVal } from '@/app/lib/stellar';

export type LoanRecord = {
  id: number;
  pda: string;
  borrower: string;
  principal: bigint;
  aprBps: number;
  originationTs: number;
  maturityTs: number;
  state: string;
  totalRepaid: bigint;
};

interface LoanSnapshot {
  apr_bps: number;
  borrower: string;
  id: number;
  maturity_ts: bigint;
  origination_ts: bigint;
  principal: bigint;
  state: string;
  total_repaid: bigint;
  vault_id: number;
}

function queryKey(vaultId: number) {
  return ['active-loans', vaultId] as const;
}

export function useActiveLoans(vaultId = VAULT_ID, maxScan = 20) {
  return useQuery({
    queryKey: queryKey(vaultId),
    refetchInterval: 8_000,
    queryFn: async (): Promise<LoanRecord[]> => {
      const core = getCoreClient();
      const loans: LoanRecord[] = [];

      // Probe in parallel; stop appending after a gap so we mirror the
      // old "break on first missing" behaviour.
      const results = await Promise.all(
        Array.from({ length: maxScan }, (_, i) =>
          core
            .read<LoanSnapshot | null>('get_loan', [nativeToScVal(i + 1, { type: 'u32' })])
            .catch(() => null),
        ),
      );

      let consecutiveMissing = 0;
      for (let i = 0; i < results.length; i++) {
        const loan = results[i];
        if (!loan || loan.vault_id !== vaultId) {
          consecutiveMissing++;
          if (consecutiveMissing >= 3) break;
          continue;
        }
        consecutiveMissing = 0;
        loans.push({
          id: loan.id,
          pda: `${PRISM_CORE_CONTRACT_ID}#loan${loan.id}`,
          borrower: loan.borrower,
          principal: BigInt(loan.principal.toString()),
          aprBps: loan.apr_bps,
          originationTs: Number(loan.origination_ts.toString()),
          maturityTs: Number(loan.maturity_ts.toString()),
          state: String(loan.state),
          totalRepaid: BigInt(loan.total_repaid.toString()),
        });
      }

      return loans;
    },
  });
}

// ─── DB write-through unchanged — it just POSTs to /api/loans ───────────────

export type UpsertLoanPayload = {
  loanId: number;
  vaultId?: number;
  pda: string;
  borrower: string;
  principal: bigint;
  aprBps: number;
  originationTs: number;
  maturityTs: number;
  state: string;
  totalRepaid?: bigint;
};

export function useUpsertLoan(vaultId = VAULT_ID) {
  const qc = useQueryClient();
  return useMutation<void, Error, UpsertLoanPayload>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          vaultId: payload.vaultId ?? vaultId,
          principal: payload.principal.toString(),
          totalRepaid: (payload.totalRepaid ?? 0n).toString(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'failed to save loan');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKey(vaultId) }),
  });
}
