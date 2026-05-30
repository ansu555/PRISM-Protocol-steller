// Server-side vault snapshot — reads vault + tranche state from Soroban and
// returns it as JSON. The marketplace fetches this instead of calling Soroban
// directly from the browser, avoiding any potential client-side bundling issues.

import { NextResponse } from 'next/server';
import { getCoreClient, nativeToScVal } from '@/app/lib/stellar';
import { POOL_NAMES, TRANCHE_CONFIG, TrancheKind } from '@/app/lib/constants';
import { toBigInt } from '@/app/lib/format';

const MAX_VAULTS = 4;

export async function GET() {
  try {
    const core = getCoreClient();
    const vaults = [];

    for (let id = 0; id < MAX_VAULTS; id++) {
      const vault = await core
        .read('get_vault', [nativeToScVal(id, { type: 'u32' })])
        .catch(() => null);
      if (!vault) continue;

      const tranches = await Promise.all(
        [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha].map(async (kind) => {
          const t = await core
            .read<Record<string, unknown> | null>('get_tranche', [
              nativeToScVal(id, { type: 'u32' }),
              nativeToScVal(kind, { type: 'u32' }),
            ])
            .catch(() => null);
          return {
            kind: (['Prime', 'Core', 'Alpha'] as const)[kind],
            ...TRANCHE_CONFIG[kind],
            totalAssets:    String(t ? toBigInt(t.total_assets as string) : 0n),
            totalSupply:    String(t ? toBigInt(t.total_supply as string) : 0n),
            navPerShareQ:   String(t ? toBigInt(t.nav_per_share_q as string) : 0n),
            cumulativeYield:String(t ? toBigInt(t.cumulative_yield as string) : 0n),
            cumulativeLoss: String(t ? toBigInt(t.cumulative_loss as string) : 0n),
            ptoken:         (t?.ptoken as string) ?? '',
            targetApyBps:   Number(t?.target_apy_bps ?? 0),
          };
        }),
      );

      const v = vault as Record<string, unknown>;
      const totalDeposits = toBigInt(v.total_deposits as string);
      const totalLoaned   = toBigInt(v.total_loaned as string);

      vaults.push({
        id,
        name: POOL_NAMES[id] ?? `Vault ${id}`,
        state: Array.isArray(v.state) ? v.state[0] : v.state,
        totalDeposits: String(totalDeposits),
        totalLoaned:   String(totalLoaned),
        utilization: totalDeposits > 0n
          ? Number((totalLoaned * 10_000n) / totalDeposits) / 100
          : 0,
        creditEventSeq: Number(v.credit_event_seq ?? 0),
        tranches,
      });
    }

    return NextResponse.json({ vaults });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
