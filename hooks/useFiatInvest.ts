'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { DodoIntentStatus } from '@/lib/dodoStore';

export type FiatInvestStatus = DodoIntentStatus | 'none';

interface InvestCheckoutInput {
  trancheKind: number;
  amountUsd: number;
  investorPubkey: string;
  returnPath?: string;
}

interface InvestCheckoutResponse {
  payment_id: string;
  checkout_url: string;
  mock: boolean;
}

export interface InvestStatusResponse {
  status: FiatInvestStatus;
  paymentId?: string;
  txSig?: string | null;
  amountUsdMicro?: string;
  trancheKind?: number;
}

export function useFiatInvestCheckout() {
  return useMutation<InvestCheckoutResponse, Error, InvestCheckoutInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/dodo/invest/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Checkout failed (${res.status})`);
      }
      return (await res.json()) as InvestCheckoutResponse;
    },
    onSuccess: (data) => {
      if (data.mock) toast.info('Opening sandbox Dodo checkout (mock mode)');
      else toast.info('Redirecting to Dodo checkout…');
      window.location.href = data.checkout_url;
    },
    onError: (err) => toast.error(err.message),
  });
}

export function useCancelInvestIntent(investorPubkey: string | null, trancheKind: number) {
  const qc = useQueryClient();
  return useMutation<void, Error>({
    mutationFn: async () => {
      if (!investorPubkey) throw new Error('no wallet connected');
      const res = await fetch('/api/dodo/invest/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investorPubkey, trancheKind }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Cancel failed (${res.status})`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dodo-invest-status', investorPubkey, trancheKind] });
    },
    onError: (err) => toast.error(err.message),
  });
}

/**
 * Polls the DB (via /api/dodo/invest/status) for the active investment intent
 * for a given investor + tranche. No localStorage — state lives entirely in the DB.
 */
export function useFiatInvestStatus(
  investorPubkey: string | null,
  trancheKind: number,
) {
  return useQuery<InvestStatusResponse>({
    queryKey: ['dodo-invest-status', investorPubkey, trancheKind],
    enabled: !!investorPubkey,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (s === 'credited' || s === 'failed' || s === 'none') return false;
      return 4_000;
    },
    queryFn: async () => {
      const res = await fetch(
        `/api/dodo/invest/status?investorPubkey=${investorPubkey}&trancheKind=${trancheKind}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Status query failed (${res.status})`);
      }
      return (await res.json()) as InvestStatusResponse;
    },
  });
}
