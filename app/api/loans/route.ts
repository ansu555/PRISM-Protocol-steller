import { type NextRequest, NextResponse } from 'next/server';

import { listLoans, upsertLoan } from '@/lib/loanStore';
import { VAULT_ID } from '@/app/lib/constants';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const vaultId = Number(url.searchParams.get('vaultId') ?? VAULT_ID);

  try {
    const loans = await listLoans(vaultId);
    return NextResponse.json({ loans });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const loanId = Number(b.loanId);
  const vaultId = Number(b.vaultId ?? VAULT_ID);
  const contractRef = String(b.contractRef ?? '');
  const borrower = String(b.borrower ?? '');
  const principal = BigInt(String(b.principal ?? '0'));
  const aprBps = Number(b.aprBps ?? 0);
  const originationTs = Number(b.originationTs ?? 0);
  const maturityTs = Number(b.maturityTs ?? 0);
  const state = String(b.state ?? 'Originated');
  const totalRepaid = BigInt(String(b.totalRepaid ?? '0'));

  if (!contractRef || !borrower) {
    return NextResponse.json({ error: 'contractRef and borrower are required' }, { status: 400 });
  }

  try {
    await upsertLoan({ loanId, vaultId, contractRef, borrower, principal, aprBps, originationTs, maturityTs, state, totalRepaid });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
