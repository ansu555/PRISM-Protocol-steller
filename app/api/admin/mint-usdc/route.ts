// Mint test USDC (cw20) to a XION address.
// Uses the cw20 minter key (USDC_ADMIN_MNEMONIC / ADMIN_MNEMONIC) to call
// `mint` on the cw20 USDC contract. Demo/testnet only.

import { NextRequest, NextResponse } from 'next/server';

import { ACTIVE_XION } from '@/app/lib/xion';
import { usdcAdminSigner, cw20Mint, xionErrorMessage } from '@/app/lib/xion-server';

const MAX_MINT = 10_000_000_000_000n; // 1,000,000 USDC — hard cap per call (7 decimals)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const to: string = body.to;
  const rawAmount: unknown = body.amount;

  if (!to || typeof to !== 'string') {
    return NextResponse.json({ error: 'Missing `to` address in request body' }, { status: 400 });
  }

  const amount = rawAmount ? BigInt(String(rawAmount)) : 100_000_000_000n; // default 10,000 USDC
  if (amount <= 0n || amount > MAX_MINT) {
    return NextResponse.json(
      { error: `Amount must be between 1 and ${MAX_MINT} (7-decimal base units)` },
      { status: 400 },
    );
  }

  try {
    const minter = await usdcAdminSigner();
    const res = await cw20Mint(minter, ACTIVE_XION.usdc, to, amount);
    return NextResponse.json({ ok: true, hash: res.transactionHash, to, amount: amount.toString() });
  } catch (err) {
    // cw20 "Unauthorized" => the configured key is not the token's minter.
    return NextResponse.json({ error: xionErrorMessage(err) }, { status: 500 });
  }
}
