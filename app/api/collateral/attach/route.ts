// attach_collateral — registers the collateral oracle pubkey for a loan on-chain.
// Called by the borrower before the oracle verifies the lock.
// Signs with ADMIN_SECRET_SEED because attach requires borrower.require_auth()
// and in the demo the borrower is the session keypair (not Freighter-capable server-side).
// For production, this should accept a signed XDR from the browser.

import { NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import { VAULT_ID } from '@/app/lib/constants';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { loanId, oraclePubkeyHex, borrowerAddress } = body as {
    loanId?: number;
    oraclePubkeyHex?: string;
    borrowerAddress?: string;
  };

  if (loanId == null || !oraclePubkeyHex || !borrowerAddress) {
    return NextResponse.json({ error: 'Missing: loanId, oraclePubkeyHex, borrowerAddress' }, { status: 400 });
  }

  // In the demo the borrower is always the admin keypair (simulation identity).
  // The contract only checks borrower.require_auth() and borrower === loan.borrower.
  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) return NextResponse.json({ error: 'ADMIN_SECRET_SEED not set' }, { status: 500 });

  let keypair: Keypair;
  try { keypair = Keypair.fromSecret(seed); }
  catch { return NextResponse.json({ error: 'Invalid ADMIN_SECRET_SEED' }, { status: 500 }); }

  try {
    const core   = getCoreClient();
    const signer = keypairSigner(keypair);

    const oraclePubkeyBytes = Buffer.from(oraclePubkeyHex, 'hex');
    if (oraclePubkeyBytes.length !== 32) {
      return NextResponse.json({ error: 'oraclePubkeyHex must be 64 hex chars (32 bytes)' }, { status: 400 });
    }

    const { hash } = await core.invoke(signer, 'attach_collateral', [
      addr(keypair.publicKey()),                                      // borrower
      nativeToScVal(loanId, { type: 'u32' }),                        // loan_id
      nativeToScVal(oraclePubkeyBytes, { type: 'bytes' }),           // oracle_pubkey
    ]);

    return NextResponse.json({ ok: true, hash, loanId, status: 'Pending' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // AlreadyInitialized or CollateralAlreadyVerified means it was already attached — treat as ok
    if (msg.includes('#50') || msg.includes('AlreadyInitialized') ||
        msg.includes('#61') || msg.includes('CollateralAlreadyVerified')) {
      return NextResponse.json({ ok: true, loanId, status: 'AlreadyAttached', skipped: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
