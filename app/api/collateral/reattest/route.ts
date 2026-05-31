// POST /api/collateral/reattest
// Manually triggers the full attach + verify flow for a loan whose collateral
// is already locked on EVM but was never attested to Stellar (e.g. watcher
// was down or RPC was failing during the lock).
//
// Body: { loanId: number, borrowerAddress: string }

import { NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import { parseStellarError } from '@/app/lib/errors';
import { getEvmLock } from '@/app/lib/evmVault';

const ORACLE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { loanId?: number; borrowerAddress?: string };
  const { loanId, borrowerAddress } = body;

  if (loanId == null || !borrowerAddress) {
    return NextResponse.json({ error: 'Missing: loanId, borrowerAddress' }, { status: 400 });
  }

  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) return NextResponse.json({ error: 'ADMIN_SECRET_SEED not set' }, { status: 500 });

  let keypair: Keypair;
  try { keypair = Keypair.fromSecret(seed); }
  catch { return NextResponse.json({ error: 'Invalid ADMIN_SECRET_SEED' }, { status: 500 }); }

  // 1. Fetch EVM lock to get real chain data (token, amount, lockedAt)
  let chainId = 1;
  let assetAddressHex = '00'.repeat(32);
  let amountUsdMicro = '0';
  let valuedAtTs = Math.floor(Date.now() / 1000).toString();

  try {
    const lock = await getEvmLock(loanId);
    if (!lock || lock.state === 'Empty') {
      return NextResponse.json({ error: `No EVM collateral found for loan #${loanId} — lock it first` }, { status: 400 });
    }
    if (lock.state !== 'Locked') {
      return NextResponse.json({ error: `EVM collateral state is ${lock.state} — only Locked can be re-attested` }, { status: 400 });
    }
    // Pad 20-byte EVM address to 32 bytes
    assetAddressHex = lock.token.replace('0x', '').toLowerCase().padStart(64, '0');
    amountUsdMicro  = lock.amount.toString();
    valuedAtTs      = lock.lockedAt > 0n ? lock.lockedAt.toString() : valuedAtTs;
  } catch (evmErr) {
    console.warn('[reattest] Could not fetch EVM lock — using defaults:', evmErr instanceof Error ? evmErr.message : evmErr);
  }

  const nonce = BigInt(Date.now()).toString();

  try {
    // 2. Get oracle attestation (status=attached, 0x01)
    const attestRes = await fetch(`${ORACLE_URL}/api/collateral-oracle/attest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loan_id:          loanId,
        chain_id:         chainId,
        asset_address:    assetAddressHex,
        amount_usd_micro: amountUsdMicro,
        valued_at_ts:     valuedAtTs,
        nonce,
        status:           'attached',
      }),
    });
    const attestData = await attestRes.json() as Record<string, string>;
    if (!attestRes.ok) throw new Error(`Oracle attest failed: ${attestData['error'] ?? attestRes.status}`);

    const oraclePubkeyHex = attestData['oracle_pubkey_hex']!;
    const messageHex      = attestData['message_hex']!;
    const signatureHex    = attestData['signature']!;

    const core   = getCoreClient();
    const signer = keypairSigner(keypair);

    // 3. attach_collateral (idempotent — safe to call again if already Pending)
    let attachHash: string | null = null;
    try {
      const oraclePubkeyBytes = Buffer.from(oraclePubkeyHex, 'hex');
      const { hash } = await core.invoke(signer, 'attach_collateral', [
        addr(keypair.publicKey()),
        nativeToScVal(loanId, { type: 'u32' }),
        nativeToScVal(oraclePubkeyBytes, { type: 'bytes' }),
      ]);
      attachHash = hash;
    } catch (attachErr) {
      const msg = parseStellarError(attachErr);
      // AlreadyVerified (#61) = already Attached — skip attach, still run verify
      if (!msg.includes('#61') && !msg.includes('AlreadyVerified') && !msg.includes('#50')) {
        throw new Error(`attach_collateral failed: ${msg}`);
      }
    }

    // 4. verify_collateral — advances Pending → Attached
    const msgBytes = Buffer.from(messageHex, 'hex');
    const sigBytes = Buffer.from(signatureHex, 'hex');
    const { hash: verifyHash } = await core.invoke(signer, 'verify_collateral', [
      addr(keypair.publicKey()),
      nativeToScVal(loanId,   { type: 'u32'   }),
      nativeToScVal(msgBytes, { type: 'bytes'  }),
      nativeToScVal(sigBytes, { type: 'bytes'  }),
    ]);

    return NextResponse.json({
      ok: true, loanId,
      attachHash, verifyHash,
      status: 'Attached',
      message: `Loan #${loanId} collateral successfully attested to Stellar`,
    });

  } catch (err) {
    const msg = parseStellarError(err);
    // CollateralAlreadyVerified = it was already Attached — treat as success
    if (msg.includes('#61') || msg.includes('AlreadyVerified')) {
      return NextResponse.json({ ok: true, loanId, status: 'AlreadyAttached', skipped: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
