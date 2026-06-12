// verify_collateral — submits the oracle attestation to advance collateral
// from Pending → Attached. After this, disburse_loan is unblocked.
//
// XION: the contract derives the relayer from info.sender (the admin signer),
// so no relayer address arg. message/signature are HexBinary (hex strings).

import { NextRequest, NextResponse } from 'next/server';

import { coreExecute } from '@/app/lib/xion';
import { adminSigner, hex, isContractError, xionErrorMessage } from '@/app/lib/xion-server';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { loanId, messageHex, signatureHex } = body as {
    loanId?: number;
    messageHex?: string;
    signatureHex?: string;
  };

  if (loanId == null || !messageHex || !signatureHex) {
    return NextResponse.json({ error: 'Missing: loanId, messageHex, signatureHex' }, { status: 400 });
  }

  const message = hex(messageHex);
  const signature = hex(signatureHex);
  // 73-byte attestation message = 146 hex chars; 64-byte signature = 128.
  if (message.length !== 146) {
    return NextResponse.json({ error: `Message must be 73 bytes (got ${message.length / 2})` }, { status: 400 });
  }
  if (signature.length !== 128) {
    return NextResponse.json({ error: `Signature must be 64 bytes (got ${signature.length / 2})` }, { status: 400 });
  }

  try {
    const signer = await adminSigner();
    const res = await coreExecute(signer, {
      verify_collateral: { loan_id: loanId, message, signature },
    });
    return NextResponse.json({ ok: true, hash: res.transactionHash, loanId, status: 'Attached' });
  } catch (err) {
    if (isContractError(err, 'collateral already verified', 'already verified')) {
      return NextResponse.json({ ok: true, loanId, status: 'AlreadyAttached', skipped: true });
    }
    if (isContractError(err, 'collateral not attached')) {
      return NextResponse.json(
        { error: 'Collateral not registered yet — borrower must attach_collateral first', needsAttach: true },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: xionErrorMessage(err), loanId }, { status: 500 });
  }
}
