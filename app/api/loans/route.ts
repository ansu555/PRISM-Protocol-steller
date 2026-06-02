import { type NextRequest, NextResponse } from 'next/server';
import { listLoans, upsertLoan } from '@/lib/loanStore';
import { VAULT_ID } from '@/app/lib/constants';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const vaultId = Number(url.searchParams.get('vaultId') ?? VAULT_ID);
  const network = url.searchParams.get('network') ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';

  try {
    const loans = await listLoans(vaultId, network);
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
  const pda = String(b.pda ?? '');
  const borrower = String(b.borrower ?? '');
  const principal = BigInt(String(b.principal ?? '0'));
  const aprBps = Number(b.aprBps ?? 0);
  const originationTs = Number(b.originationTs ?? 0);
  const maturityTs = Number(b.maturityTs ?? 0);
  const state = String(b.state ?? 'Originated');
  const totalRepaid = BigInt(String(b.totalRepaid ?? '0'));
  const network = String(b.network ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet');

  if (!pda || !borrower) {
    return NextResponse.json({ error: 'pda and borrower are required' }, { status: 400 });
  }

  try {
    await upsertLoan({
      loanId,
      vaultId,
      pda,
      borrower,
      principal,
      aprBps,
      originationTs,
      maturityTs,
      state,
      totalRepaid,
      network
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
