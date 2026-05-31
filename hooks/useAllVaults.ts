'use client';

// Enumerate vaults the contract knows about.
//
// Soroban doesn't have account.all() — there's no enumerable index. We have
// to ask for known vault IDs. For now we probe IDs [0..MAX_VAULTS_TO_PROBE)
// and keep whatever comes back non-null. In production this would be backed
// by an indexer / event log; for the demo this is sufficient.

import { useQuery } from '@tanstack/react-query';

import {
  PRISM_CORE_CONTRACT_ID,
  TRANCHE_CONFIG,
  TrancheKind,
  POOL_NAMES,
} from '@/app/lib/constants';
import { toBigInt } from '@/app/lib/format';
import { getCoreClient, nativeToScVal } from '@/app/lib/stellar';

const MAX_VAULTS_TO_PROBE = 4;

interface VaultSnapshot {
  credit_event_seq: number;
  id: number;
  last_yield_timestamp: bigint;
  state: 'Active' | 'Defaulted' | 'Resolved';
  total_deposits: bigint;
  total_loaned: bigint;
}

interface TrancheSnapshot {
  cumulative_loss: bigint;
  cumulative_yield: bigint;
  kind: 'Prime' | 'Core' | 'Alpha';
  nav_per_share_q: bigint;
  ptoken: string;
  target_apy_bps: number;
  total_assets: bigint;
  total_supply: bigint;
}

export type VaultSummary = {
  address: string;
  id: number;
  utilization: number;
  totalDeposits: bigint;
  totalLoaned: bigint;
  tranches: Array<
    { kind: 'Prime' | 'Core' | 'Alpha' } & Record<string, unknown>
  >;
  // Free-form metadata lets dashboard cards consume optional market fields.
  [key: string]: unknown;
};

export function useAllVaults() {
  return useQuery<VaultSummary[]>({
    queryKey: ['all-vaults', PRISM_CORE_CONTRACT_ID],
    refetchInterval: 10_000,
    queryFn: async () => {
      const core = getCoreClient();

      const probes = await Promise.all(
        Array.from({ length: MAX_VAULTS_TO_PROBE }, (_, id) =>
          core
            .read<VaultSnapshot | null>('get_vault', [nativeToScVal(id, { type: 'u32' })])
            .catch((err) => { console.warn(`[useAllVaults] get_vault(${id}) failed:`, err?.message ?? err); return null; })
            .then((v) => (v ? { id, vault: v } : null)),
        ),
      );

      const live = probes.filter((p): p is { id: number; vault: VaultSnapshot } => p !== null);
      if (live.length === 0) return [];

      return Promise.all(
        live.map(async ({ id, vault }) => {
          const tranches = await Promise.all(
            [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha].map(async (kind) => {
              const t = await core
                .read<TrancheSnapshot | null>('get_tranche', [
                  nativeToScVal(id, { type: 'u32' }),
                  nativeToScVal(kind, { type: 'u32' }),
                ])
                .catch(() => null);
              return {
                kind: (['Prime', 'Core', 'Alpha'] as const)[kind],
                ...TRANCHE_CONFIG[kind],
                totalAssets: t ? toBigInt(t.total_assets) : 0n,
                totalSupply: t ? toBigInt(t.total_supply) : 0n,
                navPerShareQ: t ? toBigInt(t.nav_per_share_q) : 0n,
                cumulativeYield: t ? toBigInt(t.cumulative_yield) : 0n,
                cumulativeLoss: t ? toBigInt(t.cumulative_loss) : 0n,
                ptoken: t?.ptoken ?? '',
                targetApyBps: t?.target_apy_bps ?? 0,
              };
            }),
          );

          const totalDeposits = toBigInt(vault.total_deposits);
          const totalLoaned = toBigInt(vault.total_loaned);
          const utilization =
            totalDeposits > 0n
              ? Number((totalLoaned * 10_000n) / totalDeposits) / 100
              : 0;

          return {
            address: `${PRISM_CORE_CONTRACT_ID}#vault${id}`,
            id,
            utilization,
            totalDeposits,
            totalLoaned,
            name: POOL_NAMES[id] ?? `Vault ${id}`,
            tranches,
            state: vault.state,
            creditEventSeq: vault.credit_event_seq,
          };
        }),
      );
    },
  });
}
