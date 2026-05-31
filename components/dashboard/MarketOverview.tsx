'use client';

import { Activity, ArrowUpRight, Layers, TrendingUp, Database } from 'lucide-react';
import { useAllVaults } from '@/hooks/useAllVaults';
import { useMarketSignals } from '@/hooks/useMarketSignals';
import { MarketHeader } from '@/components/marketplace/MarketHeader';
import { MarketSignals } from '@/components/marketplace/MarketSignals';
import { MarketFilter } from '@/components/marketplace/MarketFilter';
import { VaultMarketCard } from '@/components/marketplace/VaultMarketCard';
import { formatUsdc } from '@/app/lib/format';
import { useRouter } from 'next/navigation';

// ─── Tranche metadata for table ───────────────────────────────────────────────

const TRANCHE_ROWS = [
  { label: 'Senior',     risk: 'Low',    color: '#647b8c' },
  { label: 'Core',       risk: 'Medium', color: '#b29b70' },
  { label: 'Alpha',      risk: 'High',   color: '#b07073' },
];

// ─── Opportunities Table ──────────────────────────────────────────────────────

function OpportunitiesTable({ vaults }: { vaults: any[] }) {
  const router = useRouter();

  const rows = vaults.flatMap((vault) =>
    vault.tranches.map((t: any, idx: number) => {
      const meta = TRANCHE_ROWS[idx] ?? TRANCHE_ROWS[2];
      const utilization = Number(vault.utilization) || 0;
      const active = (t.totalAssets as bigint) > 0n;
      return {
        vaultId: vault.id,
        tranche: meta.label,
        color:   meta.color,
        risk:    meta.risk,
        apy:     (t.targetApyBps / 100).toFixed(1),
        tvl:     t.totalAssets as bigint,
        util:    utilization,
        active,
      };
    })
  );

  return (
    <div className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden">
      {/* Header row */}
      <div className="hidden md:grid grid-cols-[1fr_100px_68px_96px_72px_1fr_60px] gap-4 items-center px-5 py-2.5 border-b border-white/[0.03]">
        {['Vault', 'Tranche', 'APY', 'TVL', 'Risk', 'Utilization', ''].map((h) => (
          <span key={h} className="font-mono text-[9px] text-white/25">{h}</span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center font-mono text-[10px] text-white/20">
          No opportunities found
        </div>
      ) : (
        <div className="divide-y divide-white/[0.025]">
          {rows.map((row, i) => (
            <div
              key={i}
              onClick={() => router.push(`/earn/${row.vaultId}`)}
              className="flex flex-col md:grid md:grid-cols-[1fr_100px_68px_96px_72px_1fr_60px] gap-2 md:gap-4 items-start md:items-center px-5 py-3.5 hover:bg-white/[0.015] transition-colors duration-150 cursor-pointer group"
            >
              <span className="font-sans text-sm font-medium text-white/80 group-hover:text-white/95 transition-colors">
                Credit Vault #{row.vaultId}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                <span className="font-mono text-xs text-white/55">{row.tranche}</span>
              </div>
              <span className="font-mono text-sm font-medium tabular-nums text-emerald-400/80">
                {row.apy}%
              </span>
              <span className="font-mono text-sm text-white/60 tabular-nums">
                ${formatUsdc(row.tvl, 2)}
              </span>
              <span className="font-mono text-xs text-white/40">{row.risk}</span>
              <div className="flex items-center gap-2 w-full">
                <div className="flex-1 h-0.5 rounded-full bg-white/[0.05] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#e54b73]/35 transition-all duration-700"
                    style={{ width: `${Math.min(row.util, 100)}%` }}
                  />
                </div>
                <span className="font-mono text-[9px] text-white/30 tabular-nums w-8 text-right shrink-0">
                  {row.util.toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-end">
                <button className="flex items-center gap-0.5 font-mono text-[10px] text-white/25 group-hover:text-[#e54b73] transition-colors">
                  Deposit <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Protocol Activity ────────────────────────────────────────────────────────

function ProtocolActivity() {
  const { data: signals, isLoading } = useMarketSignals();

  const items = signals?.slice(0, 8) ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[9px] text-white/30 font-semibold">Protocol Activity</span>
        <div className="h-px flex-1 bg-white/[0.03]" />
        <div className="flex items-center gap-1.5">
          <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[9px] text-emerald-400/55">Live</span>
        </div>
      </div>

      <div className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden divide-y divide-white/[0.025]">
        {isLoading ? (
          <div className="px-5 py-4 font-mono text-[10px] text-white/20 animate-pulse">Loading activity…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-4 font-mono text-[10px] text-white/20">No recent activity</div>
        ) : (
          items.map((s: any, i: number) => {
            const time = new Date(s.timestamp * 1000).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div
                key={`${s.signature}-${i}`}
                className="flex items-center gap-4 px-5 py-3 hover:bg-white/[0.01] transition-colors group"
              >
                <span className="font-mono text-[9px] text-white/20 w-10 shrink-0">{time}</span>
                <span className="font-mono text-[10px] text-white/50 uppercase tracking-wide shrink-0 w-28">
                  {s.eventType}
                </span>
                <span className="font-mono text-[10px] text-white/30 truncate flex-1 min-w-0">
                  {s.message}
                </span>
                <div className="shrink-0 h-1 w-1 rounded-full bg-emerald-400/40" />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function MarketOverview() {
  const { data: allVaults, isLoading: isLoadingVaults } = useAllVaults();

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-5 pb-10">

      {/* ── Hero header ──────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-5 pb-5">
          <div>
            <p className="font-mono text-[9px] text-white/25">PRISM · Institutional Credit</p>
            <h1 className="mt-0.5 font-sans text-xl font-semibold tracking-tight text-white">Marketplace</h1>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.03] bg-white/[0.01]">
            <Activity className="h-3 w-3 text-emerald-500" />
            <span className="font-mono text-[9px] text-white/30">Operational</span>
          </div>
        </div>
        <div className="px-6 pb-5">
          <MarketHeader />
        </div>
      </section>

      {/* ── Live ticker ──────────────────────────────────────────────── */}
      <MarketSignals />

      {/* ── Filter bar ───────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] px-5">
        <MarketFilter />
      </div>

      {/* ── Credit pools grid ────────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] text-white/25">Verified · Tier 1</p>
            <h2 className="mt-0.5 font-sans text-base font-semibold tracking-tight text-white">Credit Pools</h2>
          </div>
          {!isLoadingVaults && allVaults && allVaults.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] text-white/25">
                {allVaults.length} pool{allVaults.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoadingVaults ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[320px] rounded-2xl bg-white/[0.02] border border-white/[0.03] animate-pulse" />
            ))
          ) : !allVaults || allVaults.length === 0 ? (
            <div className="col-span-full py-14 text-center border border-dashed border-white/[0.04] rounded-2xl">
              <div className="font-mono text-[10px] text-white/20">No active markets</div>
            </div>
          ) : (
            allVaults.map((vault) => (
              <VaultMarketCard key={vault.address} vault={vault} />
            ))
          )}
        </div>
      </section>

      {/* ── Opportunities table ──────────────────────────────────────── */}
      {!isLoadingVaults && allVaults && allVaults.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[9px] text-white/25">All tranches · sortable</p>
              <h2 className="mt-0.5 font-sans text-base font-semibold tracking-tight text-white">Yield Discovery</h2>
            </div>
            <div className="text-right">
              <p className="font-mono text-[9px] text-white/25">Avg alpha APY</p>
              <p className="font-mono text-sm font-medium text-amber-400/75 tabular-nums">
                {allVaults.length > 0
                  ? `${((allVaults[0].tranches[2] as any)?.targetApyBps / 100).toFixed(1)}%`
                  : '15.0%'}
              </p>
            </div>
          </div>
          <OpportunitiesTable vaults={allVaults} />
        </section>
      )}

      {/* ── Protocol activity ────────────────────────────────────────── */}
      <ProtocolActivity />

    </div>
  );
}
