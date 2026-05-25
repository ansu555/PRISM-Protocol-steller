/**
 * Create a Dodo Payments hosted-checkout session for a loan repayment.
 *
 * Pattern follows app/api/ika-test-oracle/attest/route.ts:
 *   - validate JSON body
 *   - call out to a server-side helper
 *   - return JSON
 *
 * Records the intent in dodo_intents (status='pending') so the webhook can
 * reconcile when the borrower completes payment on Dodo's hosted page.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createCheckout } from '@/app/lib/dodo';
import { recordIntent } from '@/lib/dodoStore';

export const runtime = 'nodejs';

const Body = z.object({
  loanId: z.number().int().nonnegative(),
  amountUsd: z.number().positive().max(500_000),
  borrowerPubkey: z.string().min(32).max(64),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { loanId, amountUsd, borrowerPubkey } = parsed.data;

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${proto}://${host}`);
  const successUrl = `${appUrl}/borrow?dodo=success&loanId=${loanId}`;
  const amountUsdCents = Math.round(amountUsd * 100);
  const amountUsdMicro = BigInt(amountUsdCents) * 10_000n; // cents -> micro-USDC (6dp)

  try {
    const session = await createCheckout({
      loanId,
      amountUsdCents,
      borrowerPubkey,
      successUrl,
      appUrl,
    });

    await recordIntent({
      paymentId: session.payment_id,
      loanId,
      borrowerPubkey,
      amountUsdMicro,
    });

    return NextResponse.json({
      payment_id: session.payment_id,
      checkout_url: session.checkout_url,
      mock: session.mock ?? false,
    });
  } catch (err) {
    console.error('[dodo/checkout]', err);
    const msg = err instanceof Error ? err.message : 'checkout failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
