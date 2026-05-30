'use client';

// Read on-chain loan records from prism-core.
// Probes loan IDs 0..MAX_LOANS_TO_PROBE and returns all non-null results.

import { useQuery } from '@tanstack/react-query';
import { getCoreClient, nativeToScVal } from '@/app/lib/stellar';
import { PRISM_CORE_CONTRACT_ID } from '@/app/lib/constants';
import { toBigInt } from '@/app/lib/format';

const MAX_LOANS_TO_PROBE = 10;

export interface OnChainLoan {
  id: number;
  borrower: string;
  vaultId: number;
  principal: bigint;
  aprBps: number;
  originationTs: bigint;
  maturityTs: bigint;
  totalRepaid: bigint;
  state: string; // 'Originated' | 'Active' | 'Repaid' | 'Defaulted'
}

function parseLoanState(raw: unknown): string {
  if (Array.isArray(raw)) return String(raw[0]);
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object') return Object.keys(raw)[0] ?? 'Unknown';
  return 'Unknown';
}

export function useLoans() {
  return useQuery<OnChainLoan[]>({
    queryKey: ['on-chain-loans', PRISM_CORE_CONTRACT_ID],
    refetchInterval: 10_000,
    queryFn: async () => {
      const core = getCoreClient();
      const results: OnChainLoan[] = [];

      for (let id = 0; id < MAX_LOANS_TO_PROBE; id++) {
        const raw = await core
          .read<Record<string, unknown> | null>('get_loan', [nativeToScVal(id, { type: 'u32' })])
          .catch(() => null);
        if (!raw) break; // no more loans

        results.push({
          id,
          borrower:       String(raw.borrower ?? ''),
          vaultId:        Number(raw.vault_id ?? 0),
          principal:      toBigInt(raw.principal),
          aprBps:         Number(raw.apr_bps ?? 0),
          originationTs:  toBigInt(raw.origination_ts),
          maturityTs:     toBigInt(raw.maturity_ts),
          totalRepaid:    toBigInt(raw.total_repaid),
          state:          parseLoanState(raw.state),
        });
      }

      return results;
    },
  });
}

/** Return the loan for a specific borrower address, or undefined. */
export function useBorrowerLoan(borrowerAddress: string | null | undefined) {
  const { data: loans = [], ...rest } = useLoans();
  const loan = borrowerAddress
    ? loans.find((l) => l.borrower === borrowerAddress)
    : undefined;
  return { loan, ...rest };
}
