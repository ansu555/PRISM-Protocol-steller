import { NextRequest, NextResponse } from 'next/server';

import { cancelInvestIntent } from '@/lib/dodoStore';

export const runtime = 'nodejs';

// POST /api/dodo/invest/cancel
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const investorPubkey = body?.investorPubkey as string | undefined;
  const trancheKindRaw = body?.trancheKind;

  if (!investorPubkey) {
    return NextResponse.json({ error: 'missing investorPubkey' }, { status: 400 });
  }
  const trancheKind = Number(trancheKindRaw);
  if (!Number.isFinite(trancheKind) || trancheKind < 0 || trancheKind > 2) {
    return NextResponse.json({ error: 'invalid trancheKind' }, { status: 400 });
  }

  try {
    await cancelInvestIntent(investorPubkey, trancheKind);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[dodo/invest/cancel]', err);
    const msg = err instanceof Error ? err.message : 'cancel failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
