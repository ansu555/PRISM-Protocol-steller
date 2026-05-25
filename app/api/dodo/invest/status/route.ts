import { NextRequest, NextResponse } from 'next/server';

import { getActiveInvestIntent } from '@/lib/dodoStore';

export const runtime = 'nodejs';

// GET /api/dodo/invest/status?investorPubkey=<pk>&trancheKind=<0|1|2>
export async function GET(req: NextRequest) {
  const investorPubkey = req.nextUrl.searchParams.get('investorPubkey');
  const trancheKindRaw = req.nextUrl.searchParams.get('trancheKind');

  if (!investorPubkey) {
    return NextResponse.json({ error: 'missing investorPubkey' }, { status: 400 });
  }
  const trancheKind = Number(trancheKindRaw);
  if (!Number.isFinite(trancheKind) || trancheKind < 0 || trancheKind > 2) {
    return NextResponse.json({ error: 'invalid trancheKind' }, { status: 400 });
  }

  try {
    const row = await getActiveInvestIntent(investorPubkey, trancheKind);
    if (!row) return NextResponse.json({ status: 'none' });

    return NextResponse.json({
      status: row.status,
      paymentId: row.payment_id,
      txSig: row.usdc_credit_sig,
      amountUsdMicro: row.amount_usd_micro.toString(),
      trancheKind: row.tranche_kind,
    });
  } catch (err) {
    console.error('[dodo/invest/status]', err);
    const msg = err instanceof Error ? err.message : 'status query failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
