// Server-side execution of admin-gated contract calls.
// The admin keypair (GBF7...) is only available server-side via ADMIN_SECRET_SEED.
// ActionPanel calls this instead of invoking the contract client-side with the
// wrong random keypair that useIdentity generates for the admin role.

import { NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';

import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import {
  VAULT_ID,
  DEFAULT_DEMO_YIELD_AMOUNT,
  DEFAULT_DEMO_LOSS_AMOUNT,
} from '@/app/lib/constants';

export type AdminAction =
  | 'accrue_yield'
  | 'trigger_credit_event'
  | 'disburse_loan'
  | 'pause'
  | 'unpause';

export async function POST(req: NextRequest) {
  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) {
    return NextResponse.json({ error: 'ADMIN_SECRET_SEED not set' }, { status: 500 });
  }

  let adminKeypair: Keypair;
  try {
    adminKeypair = Keypair.fromSecret(seed);
  } catch {
    return NextResponse.json({ error: 'Invalid ADMIN_SECRET_SEED' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({})) as {
    action: AdminAction;
    loanId?: number;
    yieldAmount?: string;
    lossAmount?: string;
    severity?: number;
  };

  const { action } = body;
  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  const signer = keypairSigner(adminKeypair);
  const core   = getCoreClient();
  const adminAddr = adminKeypair.publicKey();

  try {
    let hash: string;

    if (action === 'accrue_yield') {
      const amount = BigInt(body.yieldAmount ?? String(DEFAULT_DEMO_YIELD_AMOUNT));
      const result = await core.invoke(signer, 'accrue_yield', [
        addr(adminAddr),
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(amount,   { type: 'i128' }),
      ]);
      hash = result.hash;

    } else if (action === 'trigger_credit_event') {
      const amount   = BigInt(body.lossAmount ?? String(DEFAULT_DEMO_LOSS_AMOUNT));
      const severity = body.severity ?? 2;
      const result = await core.invoke(signer, 'trigger_credit_event', [
        addr(adminAddr),
        nativeToScVal(VAULT_ID,  { type: 'u32' }),
        nativeToScVal(amount,    { type: 'i128' }),
        nativeToScVal(severity,  { type: 'u32' }),
      ]);
      hash = result.hash;

    } else if (action === 'disburse_loan') {
      const loanId = body.loanId ?? 0;
      const result = await core.invoke(signer, 'disburse_loan', [
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(loanId,   { type: 'u32' }),
      ]);
      hash = result.hash;

    } else if (action === 'pause') {
      const result = await core.invoke(signer, 'pause', []);
      hash = result.hash;

    } else if (action === 'unpause') {
      const result = await core.invoke(signer, 'unpause', []);
      hash = result.hash;

    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, action, hash, adminAddress: adminAddr });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
