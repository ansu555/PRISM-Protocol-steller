/**
 * Dodo Payments webhook handler (Stellar build).
 *
 * On a verified `payment.succeeded`:
 *   1. Atomic SQL transition pending -> paid (idempotency boundary)
 *   2. Server-side admin transfers USDC from contract to borrower via Soroban
 *   3. SQL transition paid -> credited with the tx hash
 *
 * Always returns 200 to suppress Dodo retry storms; failures are logged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

import { verifyWebhookSignature } from '@/app/lib/dodo';
import { getAdminKeypair } from '@/app/lib/adminKeypair';
import {
  markPaidAtomic,
  markCredited,
  markFailed,
  type DodoIntent,
} from '@/lib/dodoStore';
import {
  NETWORK_PASSPHRASE,
  USDC_CONTRACT_ID,
} from '@/app/lib/constants';
import { addr, getRpcServer, getUsdcClient, nativeToScVal } from '@/app/lib/stellar';

export const runtime = 'nodejs';

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

  let intent: DodoIntent | null;
  try {
    intent = await markPaidAtomic(paymentId);
  } catch (e) {
    console.error('[dodo/webhook] markPaidAtomic threw', e);
    return ok({ error: 'db' });
  }

  if (!intent) {
    return ok({ payment_id: paymentId, deduped: true });
  }

  let txHash: string | null = null;
  try {
    txHash = await transferUsdcToBorrower(
      intent.borrower_pubkey,
      BigInt(intent.amount_usd_micro.toString()),
    );
  } catch (e) {
    console.error('[dodo/webhook] USDC transfer failed', e);
    return ok({ error: 'transfer_failed', payment_id: paymentId });
  }

  try {
    await markCredited(paymentId, txHash);
  } catch (e) {
    console.error('[dodo/webhook] markCredited failed', e);
  }

  console.log(
    `[dodo/webhook] credited payment ${paymentId} with hash ${txHash} (loan ${intent.loan_id})`,
  );

  return ok({ payment_id: paymentId, tx_hash: txHash });
}

async function transferUsdcToBorrower(
  borrowerAddress: string,
  amountMicro: bigint,
): Promise<string> {
  const admin = getAdminKeypair();
  const server = getRpcServer();
  const usdc = getUsdcClient();

  const source = await server.getAccount(admin.publicKey());

  let tx = new TransactionBuilder(source, {
    fee: '1000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      usdc.contract.call(
        'transfer',
        addr(admin.publicKey()),
        addr(borrowerAddress),
        nativeToScVal(amountMicro, { type: 'i128' }),
      ),
    )
    .setTimeout(60)
    .build();

  tx = await server.prepareTransaction(tx);
  tx.sign(admin);

  const sendResult = await server.sendTransaction(tx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`USDC transfer failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  let status = await server.getTransaction(sendResult.hash);
  const deadline = Date.now() + 30_000;
  while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1_500));
    status = await server.getTransaction(sendResult.hash);
  }
  if (status.status !== 'SUCCESS') {
    throw new Error(`USDC transfer settled with status ${status.status}`);
  }

  return sendResult.hash;
}
