'use client';

import { useQuery } from '@tanstack/react-query';

import type { DodoIntentStatus } from '@/lib/dodoStore';

export type FiatRepaymentStatus = DodoIntentStatus | 'none';

interface StatusResponse {
  status: FiatRepaymentStatus;
  paymentId?: string;
  txSig?: string | null;
  amountUsdMicro?: string;
}

/**
 * Polls /api/dodo/status every 4s for the most recent Dodo intent on this loan.
 * Stops polling once the intent reaches a terminal state (`credited` or `failed`).
 */
export function useFiatRepaymentStatus(loanId: number | null) {
  return useQuery<StatusResponse>({
    queryKey: ['dodo-status', loanId],
    enabled: loanId != null && loanId >= 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'credited' || status === 'failed') return false;
      return 4000;
    },
    queryFn: async () => {
      const res = await fetch(`/api/dodo/status?loanId=${loanId}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Status query failed (${res.status})`);
      }
      return (await res.json()) as StatusResponse;
    },
  });
}
