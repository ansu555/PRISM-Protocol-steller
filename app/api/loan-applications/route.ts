import { type NextRequest, NextResponse } from 'next/server';
import { listApplications, insertApplication } from '@/lib/loanApplicationStore';
import { VAULT_ID } from '@/app/lib/constants';

export async function GET(req: NextRequest) {
  const vaultId = Number(new URL(req.url).searchParams.get('vaultId') ?? VAULT_ID);
  try {
    const rows = await listApplications(vaultId);
    return NextResponse.json({ applications: rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const id = String(body.id ?? crypto.randomUUID());
  const borrowerPubkey = String(body.borrowerPubkey ?? '');
  const requestedUsdc = Number(body.requestedUsdc ?? 0);
  const maturityDays = Number(body.maturityDays ?? 90);
  const purpose = String(body.purpose ?? '');
  const vaultId = Number(body.vaultId ?? VAULT_ID);
  const submittedAt = Number(body.submittedAt ?? Date.now());

  if (!borrowerPubkey) {
    return NextResponse.json({ error: 'borrowerPubkey is required' }, { status: 400 });
  }

  try {
    await insertApplication({ id, borrowerPubkey, requestedUsdc, maturityDays, purpose, vaultId, submittedAt });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
