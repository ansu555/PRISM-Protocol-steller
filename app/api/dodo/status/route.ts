/**
 * Status polling endpoint for the borrower's UI.
 * GET /api/dodo/status?loanId=123  ->  { status, txSig, paymentId, amountUsdMicro }
 *
 * Polled every 4s by hooks/useFiatRepaymentStatus.ts. Returns 'none' if
 * no intent has been recorded yet (e.g. the user hasn't started checkout).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getIntentByLoan } from '@/lib/dodoStore';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const loanIdRaw = req.nextUrl.searchParams.get('loanId');
  const loanId = loanIdRaw ? Number(loanIdRaw) : NaN;
  if (!Number.isFinite(loanId) || loanId < 0) {
    return NextResponse.json({ error: 'bad loanId' }, { status: 400 });
  }

  try {
    const row = await getIntentByLoan(loanId);
    if (!row) {
      return NextResponse.json({ status: 'none' });
    }
    return NextResponse.json({
      status: row.status,
      paymentId: row.payment_id,
      txSig: row.usdc_credit_sig,
      amountUsdMicro: row.amount_usd_micro.toString(),
    });
  } catch (err) {
    console.error('[dodo/status]', err);
    const msg = err instanceof Error ? err.message : 'status query failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
