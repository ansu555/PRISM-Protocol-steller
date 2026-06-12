// Server-side execution of admin-gated contract calls.
// The admin mnemonic (ADMIN_MNEMONIC) is only available server-side. ActionPanel
// calls this instead of signing client-side (the demo admin identity has no
// usable secret on the client).

import { createPrivateKey, createPublicKey } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  ACTIVE_XION,
  coreExecute,
  coreQuery,
  increaseAllowance,
  type XionSigner,
} from '@/app/lib/xion';
import { adminSigner, xionErrorMessage } from '@/app/lib/xion-server';
import { VAULT_ID, DEFAULT_DEMO_YIELD_AMOUNT, DEFAULT_DEMO_LOSS_AMOUNT } from '@/app/lib/constants';

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
  return createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).slice(-32).toString('hex');
}

export async function POST(req: NextRequest) {
  let signer: XionSigner;
  try {
    signer = await adminSigner();
  } catch (e) {
    return NextResponse.json({ error: xionErrorMessage(e) }, { status: 500 });
  }
  const adminAddr = signer.address;

  const body = (await req.json().catch(() => ({}))) as {
    action: AdminAction;
    loanId?: number;
    borrower?: string;
    principal?: string;
    aprBps?: number;
    maturityDays?: number;
    yieldAmount?: string;
    lossAmount?: string;
    severity?: number;
    eventType?: number;
  };

  const { action } = body;
  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 });
  }

  try {
    let hash = '';

    if (action === 'accrue_yield') {
      const amount = BigInt(body.yieldAmount ?? String(DEFAULT_DEMO_YIELD_AMOUNT));
      // accrue_yield pulls USDC from `payer` via cw20 TransferFrom — admin (the
      // payer) must grant prism-core an allowance first, and hold the USDC.
      await increaseAllowance(signer, ACTIVE_XION.usdc, ACTIVE_XION.prismCore, amount);
      const res = await coreExecute(signer, {
        accrue_yield: { vault_id: VAULT_ID, payer: adminAddr, amount: amount.toString() },
      });
      hash = res.transactionHash;
    } else if (action === 'trigger_credit_event') {
      const amount = BigInt(body.lossAmount ?? String(DEFAULT_DEMO_LOSS_AMOUNT));
      // Reference-card §4.5 cascade defaults: Default event, full severity.
      const eventType = body.eventType ?? 0; // 0=Default, 1=PartialLoss, 2=Recovery
      const severityBps = body.severity ?? 10_000;
      const loanId = body.loanId ?? 0;
      const res = await coreExecute(signer, {
        trigger_credit_event: {
          vault_id: VAULT_ID,
          event_type: eventType,
          loss_amount: amount.toString(),
          severity_bps: severityBps,
          loan_id: loanId,
        },
      });
      hash = res.transactionHash;
    } else if (action === 'disburse_loan') {
      const loanId = body.loanId ?? 0;
      const res = await coreExecute(signer, { disburse_loan: { vault_id: VAULT_ID, loan_id: loanId } });
      hash = res.transactionHash;
    } else if (action === 'init_loan') {
      const borrower = body.borrower;
      if (!borrower) throw new Error('borrower address required for init_loan');
      const principal = BigInt(body.principal ?? '0');
      if (principal <= 0n) throw new Error('principal must be > 0');
      const aprBps = body.aprBps ?? 800;
      const maturityDays = body.maturityDays ?? 90;
      const maturityTs = Math.floor(Date.now() / 1000) + maturityDays * 86400;

      // Find the next unused sequential loan id (probe 0..29).
      let nextLoanId = 0;
      for (let id = 0; id < 30; id++) {
        const existing = await coreQuery({ get_loan: { loan_id: id } }).catch(() => null);
        if (!existing) {
          nextLoanId = id;
          break;
        }
        if (id === 29) throw new Error('Too many loans — could not find a free loan id');
      }

      const res = await coreExecute(signer, {
        init_loan: {
          vault_id: VAULT_ID,
          loan_id: nextLoanId,
          borrower,
          principal: principal.toString(),
          apr_bps: aprBps,
          maturity_ts: maturityTs,
        },
      });
      return NextResponse.json({ ok: true, action, hash: res.transactionHash, adminAddress: adminAddr, loanId: nextLoanId });
    } else if (action === 'add_collateral_oracle') {
      const oracleSeed =
        process.env.COLLATERAL_ORACLE_SEED ??
        process.env.COLLATERAL_ORACLE_SEED_DEV ??
        process.env.IKA_TEST_ORACLE_SECRET_SEED;
      if (!oracleSeed) throw new Error('COLLATERAL_ORACLE_SEED not set in environment');
      const pubkeyHex = deriveOraclePubkeyHex(oracleSeed.trim());
      const res = await coreExecute(signer, { add_oracle_to_allowlist: { oracle_pubkey: pubkeyHex } });
      return NextResponse.json({ ok: true, action, hash: res.transactionHash, adminAddress: adminAddr, oraclePubkeyHex: pubkeyHex });
    } else if (action === 'pause') {
      const res = await coreExecute(signer, { pause: {} });
      hash = res.transactionHash;
    } else if (action === 'unpause') {
      const res = await coreExecute(signer, { unpause: {} });
      hash = res.transactionHash;
    } else {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, action, hash, adminAddress: adminAddr });
  } catch (err) {
    return NextResponse.json({ error: xionErrorMessage(err) }, { status: 500 });
  }
}
