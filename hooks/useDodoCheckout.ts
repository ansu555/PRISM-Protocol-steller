'use client';

import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

interface CheckoutInput {
  loanId: number;
  amountUsd: number;
  borrowerPubkey: string;
}

interface CheckoutResponse {
  payment_id: string;
  checkout_url: string;
  mock: boolean;
}

/**
 * Creates a Dodo Payments checkout session for a fiat loan repayment.
 * On success, redirects the browser to the hosted checkout URL.
 */
export function useDodoCheckout() {
  return useMutation<CheckoutResponse, Error, CheckoutInput>({
    mutationFn: async (input) => {
      const res = await fetch('/api/dodo/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Checkout failed (${res.status})`);
      }
      return (await res.json()) as CheckoutResponse;
    },
    onSuccess: (data) => {
      if (data.mock) {
        toast.info('Opening sandbox Dodo checkout (mock mode)');
      } else {
        toast.info('Redirecting to Dodo checkout…');
      }
      window.location.href = data.checkout_url;
    },
    onError: (err) => toast.error(err.message),
  });
}
