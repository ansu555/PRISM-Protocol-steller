import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createCheckout } from '@/app/lib/dodo';
import { recordInvestIntent } from '@/lib/dodoStore';

export const runtime = 'nodejs';

const Body = z.object({
  trancheKind: z.number().int().min(0).max(2),
  amountUsd: z.number().positive().max(500_000),
  investorPubkey: z.string().min(32).max(64),
  returnPath: z.string().optional(),
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
  const { trancheKind, amountUsd, investorPubkey, returnPath } = parsed.data;

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `${proto}://${host}`);
  const targetPath = returnPath || '/dashboard';
  const successUrl = `${appUrl}${targetPath}${targetPath.includes('?') ? '&' : '?'}dodo=invested&tranche=${trancheKind}`;
  const amountUsdCents = Math.round(amountUsd * 100);
  const amountUsdMicro = BigInt(amountUsdCents) * 10_000n;

  try {
    const session = await createCheckout({
      loanId: trancheKind,
      amountUsdCents,
      borrowerPubkey: investorPubkey,
      successUrl,
      appUrl,
    });

    await recordInvestIntent({
      paymentId: session.payment_id,
      trancheKind,
      investorPubkey,
      amountUsdMicro,
    });

    return NextResponse.json({
      payment_id: session.payment_id,
      checkout_url: session.checkout_url,
      mock: session.mock ?? false,
    });
  } catch (err) {
    console.error('[dodo/invest/checkout]', err);
    const msg = err instanceof Error ? err.message : 'checkout failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
