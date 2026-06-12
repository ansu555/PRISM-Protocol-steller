// seed-pools — admin-direct tranche-token pool seeding.
//
// XION migration: the Soroswap router + on-chain seed_pool_liquidity are gone.
// Seeding now targets a self-deployed cw20 pair (Astroport-style) via
// `provide_liquidity`. That pair contract is deployed in the DEX slice (Slice 3);
// until ACTIVE_XION.dexRouter is configured this route is a no-op stub so the
// admin UI degrades gracefully instead of hard-failing.

import { NextRequest, NextResponse } from 'next/server';

import { ACTIVE_XION } from '@/app/lib/xion';

export async function POST(_req: NextRequest) {
  if (!ACTIVE_XION.dexRouter) {
    return NextResponse.json({
      ok: false,
      pending: true,
      message:
        'Pool seeding requires the XION DEX pair (deployed in the DEX slice). Set NEXT_PUBLIC_DEX_ROUTER_ID once it is live.',
      steps: [],
    });
  }

  // TODO (Slice 3): for each tranche — mint USDC to admin → deposit to receive
  // pTokens → provide_liquidity(USDC, pToken) on the cw20 pair, LP → admin.
  return NextResponse.json({
    ok: false,
    pending: true,
    message: 'DEX pair detected, but seed-pools provide_liquidity is not wired yet (Slice 3).',
    steps: [],
  });
}
