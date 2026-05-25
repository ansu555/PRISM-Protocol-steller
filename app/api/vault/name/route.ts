import { NextRequest, NextResponse } from 'next/server';

import { getVaultName, setVaultName } from '@/lib/vaultStore';

export const runtime = 'nodejs';

// GET /api/vault/name?vaultId=0
export async function GET(req: NextRequest) {
  const vaultIdRaw = req.nextUrl.searchParams.get('vaultId');
  const vaultId = Number(vaultIdRaw);
  if (!Number.isFinite(vaultId) || vaultId < 0) {
    return NextResponse.json({ error: 'invalid vaultId' }, { status: 400 });
  }

  try {
    const name = await getVaultName(vaultId);
    return NextResponse.json({ name: name ?? `Credit Vault #${vaultId}` });
  } catch (err) {
    console.error('[vault/name GET]', err);
    return NextResponse.json({ name: `Credit Vault #${vaultId}` });
  }
}

// POST /api/vault/name  { vaultId: number, name: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const vaultId = Number(body?.vaultId);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!Number.isFinite(vaultId) || vaultId < 0) {
    return NextResponse.json({ error: 'invalid vaultId' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    await setVaultName(vaultId, name);
    return NextResponse.json({ ok: true, name });
  } catch (err) {
    console.error('[vault/name POST]', err);
    const msg = err instanceof Error ? err.message : 'failed to save name';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
