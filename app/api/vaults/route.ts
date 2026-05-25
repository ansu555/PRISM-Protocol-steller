import { type NextRequest, NextResponse } from 'next/server';

import { listRegisteredVaults, registerVault } from '@/lib/vaultRegistry';

export async function GET() {
  try {
    const vaults = await listRegisteredVaults();
    return NextResponse.json({ vaults });
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
  const vaultId = Number(b.vaultId);
  const name = String(b.name ?? '').trim();
  const primeBps = Number(b.primeBps ?? 500);
  const coreBps = Number(b.coreBps ?? 800);
  const alphaBps = Number(b.alphaBps ?? 1500);
  const loanPrincipal = BigInt(String(b.loanPrincipal ?? '20000000000'));
  const maturityDays = Number(b.maturityDays ?? 365);

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (isNaN(vaultId) || vaultId < 0) {
    return NextResponse.json({ error: 'invalid vaultId' }, { status: 400 });
  }

  try {
    await registerVault({ vaultId, name, primeBps, coreBps, alphaBps, loanPrincipal, maturityDays });
    return NextResponse.json({ ok: true, vaultId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
