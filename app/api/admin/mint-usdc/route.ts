import { parseStellarError } from '@/app/lib/errors';
// Mint test USDC (TUSDC) to a given Stellar address.
// Uses the deployer's ADMIN_SECRET_SEED to call `mint(to, amount)` on the TUSDC SAC.
// Only valid on testnet — the SAC admin is the TUSDC issuer (deployer).

import { NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';

import { getCoreClient, getUsdcClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';

const MAX_MINT = 10_000_000_000_000n; // 1,000,000 TUSDC — hard cap per call (7 decimals)

export async function POST(req: NextRequest) {
  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) {
    return NextResponse.json(
      { error: 'ADMIN_SECRET_SEED is not set on the server. Add it to .env.local.' },
      { status: 500 },
    );
  }

  let adminKeypair: Keypair;
  try {
    adminKeypair = Keypair.fromSecret(seed);
  } catch {
    return NextResponse.json({ error: 'ADMIN_SECRET_SEED is not a valid Stellar secret key' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const to: string = body.to;
  const rawAmount: unknown = body.amount;

  if (!to || typeof to !== 'string') {
    return NextResponse.json({ error: 'Missing `to` address in request body' }, { status: 400 });
  }

  const amount = rawAmount ? BigInt(String(rawAmount)) : 100_000_000_000n; // default 10,000 TUSDC
  if (amount <= 0n || amount > MAX_MINT) {
    return NextResponse.json(
      { error: `Amount must be between 1 and ${MAX_MINT} (7-decimal base units)` },
      { status: 400 },
    );
  }

  // USDC mint requires the SAC admin (deployer/GCZF...), not the prism-core admin.
  const usdcSeed = process.env.USDC_ADMIN_SECRET_SEED ?? process.env.ADMIN_SECRET_SEED!;
  let usdcKeypair: Keypair;
  try {
    usdcKeypair = Keypair.fromSecret(usdcSeed);
  } catch {
    return NextResponse.json({ error: 'USDC_ADMIN_SECRET_SEED is not a valid Stellar secret key' }, { status: 500 });
  }

  try {
    const signer = keypairSigner(usdcKeypair);
    const usdc = getUsdcClient();

    const { hash } = await usdc.invoke(signer, 'mint', [
      addr(to),
      nativeToScVal(amount, { type: 'i128' }),
    ]);

    return NextResponse.json({ ok: true, hash, to, amount: amount.toString() });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    // SAC error #13 = trustline missing (different from PRISM #13 = loss exceeds assets)
    if (raw.includes('#13') || /trustline/i.test(raw)) {
      return NextResponse.json({
        error: `Trustline missing — ${to} must add a trustline for PTUSDC before receiving it. Use the "Add Trustlines" button in Protocol Setup or connect that wallet and approve the banner prompt.`,
      }, { status: 400 });
    }
    return NextResponse.json({ error: parseStellarError(err) }, { status: 500 });
  }
}
