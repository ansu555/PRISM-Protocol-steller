/**
 * Dodo Payments webhook handler — the load-bearing component.
 *
 * On a verified `payment.succeeded`:
 *   1. Atomic SQL transition pending -> paid (idempotency boundary)
 *   2. Server-side admin transfers USDC from admin's ATA to borrower's ATA
 *   3. SQL transition paid -> credited with the tx signature
 *
 * Always returns 200 to suppress Dodo retry storms; failures are logged.
 *
 * Standard Webhooks signature scheme:
 *   HMAC-SHA256(secret, `${id}.${timestamp}.${rawBody}`) base64
 *   replay window 5 min
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';

import { verifyWebhookSignature } from '@/app/lib/dodo';
import { getAdminKeypair } from '@/app/lib/adminKeypair';
import {
  markPaidAtomic,
  markCredited,
  markFailed,
  type DodoIntent,
} from '@/lib/dodoStore';

export const runtime = 'nodejs';

const USDC_MINT_B58 =
  process.env.NEXT_PUBLIC_USDC_MINT ?? 'CoSmAscHkm3KxFvsd3QvrLzzSX6Ke1qEfGvcWLPG1GJ1';
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';

// Always return 200 OK to avoid Dodo retry storms; log on the server.
function ok(extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: true, ...extra }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const headers = {
    id: req.headers.get('webhook-id'),
    timestamp: req.headers.get('webhook-timestamp'),
    signature: req.headers.get('webhook-signature'),
  };

  const secret = process.env.DODO_WEBHOOK_SECRET ?? '';
  const verdict = verifyWebhookSignature(raw, headers, secret);
  if (!verdict.ok) {
    console.warn('[dodo/webhook] signature reject:', verdict.reason);
    return NextResponse.json({ error: verdict.reason }, { status: 400 });
  }

  let event: {
    type?: string;
    business_id?: string;
    timestamp?: string;
    data?: { payment_id?: string; metadata?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  // Dodo webhook payload uses `type` (Standard Webhooks spec confirmed in docs)
  const eventName = event.type ?? '';
  const paymentId = event.data?.payment_id;

  if (!paymentId) {
    console.warn('[dodo/webhook] missing payment_id in event');
    return ok({ skipped: 'no payment_id' });
  }

  if (eventName === 'payment.failed' || eventName === 'payment.cancelled') {
    await markFailed(paymentId).catch((e) =>
      console.error('[dodo/webhook] markFailed', e),
    );
    return ok({ event: eventName, payment_id: paymentId });
  }

  if (eventName !== 'payment.succeeded') {
    return ok({ event: eventName, skipped: true });
  }

  // ── 1. Atomic transition. Only one webhook can win ──────────────────────
  let intent: DodoIntent | null;
  try {
    intent = await markPaidAtomic(paymentId);
  } catch (e) {
    console.error('[dodo/webhook] markPaidAtomic threw', e);
    return ok({ error: 'db' });
  }

  if (!intent) {
    // Either unknown payment_id or already processed (paid/credited).
    return ok({ payment_id: paymentId, deduped: true });
  }

  // ── 2. Bridge: admin SPL transfer to borrower's USDC ATA ───────────────
  let txSig: string | null = null;
  try {
    txSig = await transferUsdcToBorrower(
      intent.borrower_pubkey,
      BigInt(intent.amount_usd_micro.toString()),
    );
  } catch (e) {
    console.error('[dodo/webhook] SPL transfer failed', e);
    // Do not flip back to pending — leave row in 'paid' so a manual operator
    // can replay (future work). Always 200 so Dodo doesn't retry.
    return ok({ error: 'transfer_failed', payment_id: paymentId });
  }

  // ── 3. Mark credited with the tx sig ───────────────────────────────────
  try {
    await markCredited(paymentId, txSig);
  } catch (e) {
    console.error('[dodo/webhook] markCredited failed', e);
  }

  console.log(
    `[dodo/webhook] credited payment ${paymentId} with sig ${txSig} (loan ${intent.loan_id})`,
  );

  return ok({ payment_id: paymentId, tx_sig: txSig });
}

/**
 * Transfers `amountUsdMicro` USDC from the admin's ATA to the borrower's ATA,
 * creating the borrower's ATA if it does not yet exist.
 *
 * Returns the confirmed transaction signature.
 */
async function transferUsdcToBorrower(
  borrowerPubkeyB58: string,
  amountUsdMicro: bigint,
): Promise<string> {
  const admin = getAdminKeypair();
  const conn = new Connection(RPC_URL, 'confirmed');

  const usdcMint = new PublicKey(USDC_MINT_B58);
  const borrowerPubkey = new PublicKey(borrowerPubkeyB58);

  const adminUsdcAta = await getAssociatedTokenAddress(usdcMint, admin.publicKey);
  const borrowerUsdcAta = await getAssociatedTokenAddress(usdcMint, borrowerPubkey);

  const tx = new Transaction();

  // Create the borrower's ATA if missing — admin pays rent.
  const borrowerAtaInfo = await conn.getAccountInfo(borrowerUsdcAta);
  if (!borrowerAtaInfo) {
    tx.add(
      createAssociatedTokenAccountInstruction(
        admin.publicKey,
        borrowerUsdcAta,
        borrowerPubkey,
        usdcMint,
      ),
    );
  }

  // SPL transfer — note BigInt -> bigint cast is required by spl-token typings.
  tx.add(
    createTransferInstruction(
      adminUsdcAta,
      borrowerUsdcAta,
      admin.publicKey,
      amountUsdMicro,
    ),
  );

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);

  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}
