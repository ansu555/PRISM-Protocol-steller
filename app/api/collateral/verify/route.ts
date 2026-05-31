import { parseStellarError } from '@/app/lib/errors';
// verify_collateral — submits the oracle attestation to advance collateral
// from Pending → Attached. After this, disburse_loan is unblocked.

import { NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { loanId, messageHex, signatureHex, borrowerAddress } = body as {
    loanId?: number;
    messageHex?: string;
    signatureHex?: string;
    borrowerAddress?: string;
  };

  if (loanId == null || !messageHex || !signatureHex) {
    return NextResponse.json({ error: 'Missing: loanId, messageHex, signatureHex' }, { status: 400 });
  }

  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) return NextResponse.json({ error: 'ADMIN_SECRET_SEED not set' }, { status: 500 });

  let keypair: Keypair;
  try { keypair = Keypair.fromSecret(seed); }
  catch { return NextResponse.json({ error: 'Invalid ADMIN_SECRET_SEED' }, { status: 500 }); }

  try {
    const core   = getCoreClient();
    const signer = keypairSigner(keypair);

    const msgBytes = Buffer.from(messageHex, 'hex');
    const sigBytes = Buffer.from(signatureHex, 'hex');

    if (msgBytes.length !== 73) {
      return NextResponse.json({ error: `Message must be 73 bytes (got ${msgBytes.length})` }, { status: 400 });
    }
    if (sigBytes.length !== 64) {
      return NextResponse.json({ error: `Signature must be 64 bytes (got ${sigBytes.length})` }, { status: 400 });
    }

    const { hash } = await core.invoke(signer, 'verify_collateral', [
      addr(keypair.publicKey()),                                   // relayer (admin)
      nativeToScVal(loanId,   { type: 'u32' }),                  // loan_id
      nativeToScVal(msgBytes, { type: 'bytes' }),                 // message (73 bytes)
      nativeToScVal(sigBytes, { type: 'bytes' }),                 // signature (64 bytes)
    ]);

    return NextResponse.json({ ok: true, hash, loanId, status: 'Attached' });
  } catch (err) {
    const msg = parseStellarError(err);
    // AlreadyVerified (#61) = already Attached — treat as success
    if (msg.includes('#61') || msg.includes('AlreadyVerified')) {
      return NextResponse.json({ ok: true, loanId, status: 'AlreadyAttached', skipped: true });
    }
    // CollateralNotAttached (#60) = borrower hasn't called attach_collateral yet via Freighter.
    // The watcher will retry; the borrower UI will prompt them to sign.
    if (msg.includes('#60') || msg.includes('CollateralNotAttached')) {
      return NextResponse.json({ error: 'Collateral not registered yet — borrower must sign attach_collateral with Freighter first', needsAttach: true }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
