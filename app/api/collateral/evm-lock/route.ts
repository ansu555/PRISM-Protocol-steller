// GET /api/collateral/evm-lock?loanId=X
// Returns the lock state from the EVM PrismCollateralVault contract.
// Used by the admin panel to show EVM collateral status alongside Stellar state.

import { NextRequest, NextResponse } from 'next/server';
import { getEvmLock } from '@/app/lib/evmVault';

export async function GET(req: NextRequest) {
  const loanId = Number(req.nextUrl.searchParams.get('loanId'));
  if (!loanId && loanId !== 0) {
    return NextResponse.json({ error: 'Missing loanId' }, { status: 400 });
  }
  try {
    const lock = await getEvmLock(loanId);
    // bigint fields (amount, lockedAt) aren't JSON-serializable — stringify them.
    const serialized = lock
      ? { ...lock, amount: lock.amount.toString(), lockedAt: lock.lockedAt.toString() }
      : null;
    return NextResponse.json({ ok: true, lock: serialized });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'EVM fetch failed' }, { status: 500 });
  }
}
