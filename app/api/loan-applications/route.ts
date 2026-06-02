import { type NextRequest, NextResponse } from 'next/server';
import { listApplications, insertApplication, deleteApplicationsByStatus } from '@/lib/loanApplicationStore';
import { VAULT_ID } from '@/app/lib/constants';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const vaultId = Number(url.searchParams.get('vaultId') ?? VAULT_ID);
  const network = url.searchParams.get('network') ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  try {
    const rows = await listApplications(vaultId, network);
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
  const requestedUsdc = Number(body.requestedUsdc ?? body.requestedUSDC ?? 0);
  const maturityDays = Number(body.maturityDays ?? 90);
  const purpose = String(body.purpose ?? '');
  const vaultId = Number(body.vaultId ?? VAULT_ID);
  const submittedAt = Number(body.submittedAt ?? Date.now());
  const network = String(body.network ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet');

  if (!borrowerPubkey) {
    return NextResponse.json({ error: 'borrowerPubkey is required' }, { status: 400 });
  }

  try {
    await insertApplication({ id, borrowerPubkey, requestedUsdc, maturityDays, purpose, vaultId, submittedAt, network });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const vaultId = Number(url.searchParams.get('vaultId') ?? VAULT_ID);
  const network = url.searchParams.get('network') ?? process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
  const status = (url.searchParams.get('status') ?? 'all') as 'pending' | 'approved' | 'rejected' | 'all';
  try {
    const deleted = await deleteApplicationsByStatus(vaultId, network, status);
    return NextResponse.json({ ok: true, deleted });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
