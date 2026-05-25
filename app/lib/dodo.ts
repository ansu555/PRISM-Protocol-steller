/**
 * Dodo Payments REST wrapper + Standard Webhooks signature verification.
 *
 * Server-only. Reads DODO_API_KEY, DODO_API_BASE, DODO_WEBHOOK_SECRET, MOCK_DODO.
 * Pattern follows app/api/ika-test-oracle/attest/route.ts (node:crypto, no SDK).
 */

import crypto from 'node:crypto';

const DODO_API_BASE = process.env.DODO_API_BASE ?? 'https://test.dodopayments.com';
const DODO_API_KEY = process.env.DODO_API_KEY ?? '';
const MOCK_DODO = process.env.MOCK_DODO === 'true';

export interface CreateCheckoutParams {
  loanId: number;
  amountUsdCents: number; // smallest unit (cents)
  borrowerPubkey: string;
  successUrl: string;
  appUrl: string; // base URL of the app, derived from request headers in the route
}

export interface CheckoutSession {
  payment_id: string;
  checkout_url: string;
  mock?: boolean;
}

/**
 * Create a Dodo hosted-checkout session.
 *
 * In MOCK_DODO=true mode, returns a fake checkout URL pointing at a local
 * simulator route. This lets the demo run end-to-end before sandbox keys
 * are provisioned, and is the documented fallback in the implementation plan.
 */
export async function createCheckout(params: CreateCheckoutParams): Promise<CheckoutSession> {
  if (MOCK_DODO || !DODO_API_KEY) {
    const paymentId = `mock_${crypto.randomBytes(8).toString('hex')}`;
    const successUrl = new URL(params.successUrl);
    successUrl.searchParams.set('payment_id', paymentId);
    // Local mock checkout page that POSTs a self-signed webhook back.
    const mockUrl = new URL('/dodo-mock-pay', params.appUrl);
    mockUrl.searchParams.set('payment_id', paymentId);
    mockUrl.searchParams.set('amount_cents', params.amountUsdCents.toString());
    mockUrl.searchParams.set('loan_id', params.loanId.toString());
    mockUrl.searchParams.set('borrower', params.borrowerPubkey);
    mockUrl.searchParams.set('success_url', successUrl.toString());
    return {
      payment_id: paymentId,
      checkout_url: mockUrl.toString(),
      mock: true,
    };
  }

  // Real Dodo Payments API — POST /checkouts
  // product_cart requires a pre-created product in the Dodo dashboard.
  // Set DODO_REPAYMENT_PRODUCT_ID in env to the ID of a variable-price product.
  const productId = process.env.DODO_REPAYMENT_PRODUCT_ID ?? '';
  if (!productId) {
    throw new Error('DODO_REPAYMENT_PRODUCT_ID env var is not set');
  }

  const res = await fetch(`${DODO_API_BASE}/checkouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DODO_API_KEY}`,
    },
    body: JSON.stringify({
      product_cart: [{ product_id: productId, quantity: 1 }],
      allowed_payment_method_types: ['card', 'upi'],
      return_url: params.successUrl,
      cancel_url: params.successUrl,
      metadata: {
        loan_id: params.loanId,
        borrower_pubkey: params.borrowerPubkey,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Dodo /checkouts ${res.status}: ${text.slice(0, 240)}`);
  }

  // Dodo checkout session response: { session_id, checkout_url }
  const data = (await res.json()) as { session_id?: string; checkout_url?: string };
  if (!data.session_id || !data.checkout_url) {
    throw new Error('Dodo response missing session_id/checkout_url');
  }
  return { payment_id: data.session_id, checkout_url: data.checkout_url };
}

function getAppOrigin(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard Webhooks signature verification
// Spec: https://standardwebhooks.com
// ─────────────────────────────────────────────────────────────────────────────

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

const REPLAY_WINDOW_SECONDS = 5 * 60;

/**
 * Verify a Dodo webhook signature. Compares timing-safely against every
 * `v1,<sig>` token in the signature header.
 *
 * Returns reason on failure so the caller can return a 400 with logs.
 */
export function verifyWebhookSignature(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
): { ok: true } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: 'webhook secret not configured' };
  if (!headers.id || !headers.timestamp || !headers.signature) {
    return { ok: false, reason: 'missing webhook headers' };
  }

  const tsNum = Number(headers.timestamp);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: 'bad timestamp' };
  const skew = Math.abs(Date.now() / 1000 - tsNum);
  if (skew > REPLAY_WINDOW_SECONDS) {
    return { ok: false, reason: `timestamp skew ${Math.round(skew)}s` };
  }

  const signedPayload = `${headers.id}.${headers.timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('base64');

  // Header may contain multiple space-separated entries: "v1,<sig> v1,<sig2>"
  const tokens = headers.signature.split(/\s+/);
  for (const tok of tokens) {
    const idx = tok.indexOf(',');
    if (idx < 0) continue;
    const version = tok.slice(0, idx);
    const sig = tok.slice(idx + 1);
    if (version !== 'v1') continue;
    try {
      const a = Buffer.from(sig, 'base64');
      const b = Buffer.from(expected, 'base64');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return { ok: true };
      }
    } catch {
      // bad base64; keep trying other tokens
    }
  }
  return { ok: false, reason: 'no signature match' };
}

/** Sign a payload with the same scheme. Used by the mock webhook simulator. */
export function signWebhook(
  rawBody: string,
  id: string,
  timestamp: string,
  secret: string,
): string {
  const signedPayload = `${id}.${timestamp}.${rawBody}`;
  const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('base64');
  return `v1,${sig}`;
}
