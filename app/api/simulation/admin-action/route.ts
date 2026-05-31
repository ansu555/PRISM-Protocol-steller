// Server-side execution of admin-gated contract calls.
// The admin keypair (GBF7...) is only available server-side via ADMIN_SECRET_SEED.
// ActionPanel calls this instead of invoking the contract client-side with the
// wrong random keypair that useIdentity generates for the admin role.

import { createPrivateKey, createPublicKey } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';

import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import { parseStellarError } from '@/app/lib/errors';
import {
  VAULT_ID,
  DEFAULT_DEMO_YIELD_AMOUNT,
  DEFAULT_DEMO_LOSS_AMOUNT,
} from '@/app/lib/constants';

export type AdminAction =
  | 'accrue_yield'
  | 'trigger_credit_event'
  | 'disburse_loan'
  | 'init_loan'
  | 'add_collateral_oracle'
  | 'pause'
  | 'unpause';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function deriveOraclePubkeyHex(seedHex: string): string {
  const seed = Buffer.from(seedHex, 'hex');
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
  return createPublicKey(privateKey)
    .export({ type: 'spki', format: 'der' })
    .slice(-32)
    .toString('hex');
}

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
    borrower?: string;
    principal?: string;
    aprBps?: number;
    maturityDays?: number;
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
    let hash = '';

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

    } else if (action === 'init_loan') {
      const borrower = body.borrower;
      if (!borrower) throw new Error('borrower address required for init_loan');

      const principal = BigInt(body.principal ?? '0');
      if (principal <= 0n) throw new Error('principal must be > 0');

      const aprBps = body.aprBps ?? 800;
      const maturityDays = body.maturityDays ?? 90;
      const maturityTs = BigInt(Math.floor(Date.now() / 1000) + maturityDays * 86400);

      // Find the next unused sequential loan ID (probe 0..29)
      let nextLoanId = 0;
      for (let id = 0; id < 30; id++) {
        const existing = await core
          .read<Record<string, unknown> | null>('get_loan', [nativeToScVal(id, { type: 'u32' })])
          .catch(() => null);
        if (!existing) { nextLoanId = id; break; }
        if (id === 29) throw new Error('Too many loans — could not find a free loan ID');
      }

      const result = await core.invoke(signer, 'init_loan', [
        nativeToScVal(VAULT_ID,     { type: 'u32' }),
        nativeToScVal(nextLoanId,   { type: 'u32' }),
        addr(borrower),
        nativeToScVal(principal,    { type: 'i128' }),
        nativeToScVal(aprBps,       { type: 'u32' }),
        nativeToScVal(maturityTs,   { type: 'u64' }),
      ]);
      hash = result.hash;
      // Return the loan_id so the caller can persist it
      return NextResponse.json({ ok: true, action, hash, adminAddress: adminAddr, loanId: nextLoanId });

    } else if (action === 'add_collateral_oracle') {
      const oracleSeed =
        process.env.COLLATERAL_ORACLE_SEED ??
        process.env.COLLATERAL_ORACLE_SEED_DEV ??
        process.env.IKA_TEST_ORACLE_SECRET_SEED;
      if (!oracleSeed) throw new Error('COLLATERAL_ORACLE_SEED not set in environment');
      const pubkeyHex = deriveOraclePubkeyHex(oracleSeed.trim());
      const pubkeyBytes = Buffer.from(pubkeyHex, 'hex');

      const result = await core.invoke(signer, 'add_oracle_to_allowlist', [
        nativeToScVal(pubkeyBytes, { type: 'bytes' }),
      ]);
      hash = result.hash;
      return NextResponse.json({ ok: true, action, hash, adminAddress: adminAddr, oraclePubkeyHex: pubkeyHex });

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
    return NextResponse.json({ error: parseStellarError(err) }, { status: 500 });
  }
}
