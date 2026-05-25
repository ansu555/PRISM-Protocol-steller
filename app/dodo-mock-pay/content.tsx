'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, Smartphone } from 'lucide-react';

export default function DodoMockPayContent() {
  const params = useSearchParams();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<'upi' | 'card'>('upi');

  const paymentId = params?.get('payment_id') ?? '';
  const amountCents = Number(params?.get('amount_cents') ?? '0');
  const successUrl = params?.get('success_url') ?? '/borrow';
  const loanId = params?.get('loan_id') ?? '';
  const borrower = params?.get('borrower') ?? '';

  const dollars = (amountCents / 100).toFixed(2);

  useEffect(() => {
    document.title = 'Dodo Payments · Demo Checkout';
  }, []);

  async function pay() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/dodo/mock-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_id: paymentId,
          loan_id: loanId,
          borrower_pubkey: borrower,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Mock webhook failed (${res.status})`);
      }
      window.location.href = successUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment failed');
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/40">
            Dodo Payments · Sandbox
          </div>
          <h1 className="mt-3 font-display text-3xl text-white">Confirm payment</h1>
          <p className="mt-2 text-sm text-white/50">
            This is a local simulator for the PRISM × Dodo integration demo.
          </p>
        </div>

        <div className="rounded-md border border-white/10 bg-black/35 p-6 shadow-[0_8px_24px_rgba(60,46,22,0.05)]">
          <div className="border-b border-white/10 pb-4 text-center">
            <div className="text-[11px] uppercase tracking-[0.24em] text-white/40">
              Amount due
            </div>
            <div className="mt-2 font-display text-4xl text-white">${dollars}</div>
            <div className="mt-1 text-xs text-white/40">
              Loan #{loanId} · payment {paymentId.slice(0, 14)}…
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => setMethod('upi')}
              className={
                'w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ' +
                (method === 'upi'
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-white/10 hover:bg-white/[0.04]')
              }
            >
              <Smartphone className="h-5 w-5 text-emerald-300" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">UPI</div>
                <div className="text-xs text-white/50">PhonePe · Google Pay · Paytm</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setMethod('card')}
              className={
                'w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ' +
                (method === 'card'
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'border-white/10 hover:bg-white/[0.04]')
              }
            >
              <CreditCard className="h-5 w-5 text-emerald-300" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">Card</div>
                <div className="text-xs text-white/50">Visa · Mastercard · Amex</div>
              </div>
            </button>
          </div>

          <button
            onClick={pay}
            disabled={submitting}
            className="mt-6 w-full rounded-lg bg-emerald-500/30 border border-emerald-500/40 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/40 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Processing…' : `Pay $${dollars} via ${method.toUpperCase()}`}
          </button>

          {error ? (
            <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mt-4 text-center text-[10px] uppercase tracking-[0.18em] text-white/30">
            Powered by Dodo Payments — sandbox simulation
          </div>
        </div>
      </div>
    </div>
  );
}
