/**
 * Mock-mode shim: signs a fake payment.succeeded payload with DODO_WEBHOOK_SECRET
 * and forwards it to /api/dodo/webhook. Lets the local simulator at
 * /dodo-mock-pay drive the same code path the real Dodo webhook would.
 *
 * ONLY available when MOCK_DODO=true.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { signWebhook } from '@/app/lib/dodo';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (process.env.MOCK_DODO !== 'true') {
    return NextResponse.json({ error: 'mock webhook disabled' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const paymentId = body?.payment_id as string | undefined;
  const loanId = body?.loan_id as string | undefined;
  const borrowerPubkey = body?.borrower_pubkey as string | undefined;

  if (!paymentId || !loanId || !borrowerPubkey) {
    return NextResponse.json(
      { error: 'missing payment_id / loan_id / borrower_pubkey' },
      { status: 400 },
    );
  }

  const event = {
    type: 'payment.succeeded',
    data: {
      payment_id: paymentId,
      metadata: {
        loan_id: Number(loanId),
        borrower_pubkey: borrowerPubkey,
      },
    },
  };

  const raw = JSON.stringify(event);
  const id = `mock-evt-${crypto.randomBytes(8).toString('hex')}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Reuse the same secret the real verifier expects.
  const secret =
    process.env.DODO_WEBHOOK_SECRET ||
    // Fallback for zero-config mock-only dev: any non-empty string works as
    // long as both signer and verifier read the same env var. We set it
    // ephemerally below if missing so the hand-off succeeds.
    'mock-dev-secret-rotate-me';
  if (!process.env.DODO_WEBHOOK_SECRET) {
    process.env.DODO_WEBHOOK_SECRET = secret;
  }

  const signature = signWebhook(raw, id, timestamp, secret);

  // Forward to the real webhook handler. We construct an absolute URL using
  // the request's origin so this works behind cloudflared too.
  const url = new URL('/api/dodo/webhook', req.nextUrl.origin);
  const fwd = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': timestamp,
      'webhook-signature': signature,
    },
    body: raw,
  });

  const j = await fwd.json().catch(() => ({}));
  return NextResponse.json(j, { status: fwd.status });
}
