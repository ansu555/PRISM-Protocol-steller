'use client';

import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Activity, Briefcase, TrendingUp, Layers } from 'lucide-react';
import { TrancheKind, Q64_ONE } from '@/app/lib/constants';
import { formatUsdc } from '@/app/lib/format';
import { useUserPosition } from '@/hooks/useUserPosition';
import { useVaultState } from '@/hooks/useVaultState';
import { useWallet } from '@/components/providers/stellar-wallet-provider';
import { useWalletModal } from '@/components/providers/stellar-wallet-provider';

// ─── Sparkline ────────────────────────────────────────────────────────────────

const PINK = '#e879a0';
const EMERALD = '#10b981';
const ROSE = '#f43f5e';

function Sparkline({ points, color = PINK, height = 32 }: { points: number[]; color?: string; height?: number }) {
  const VW = 100;
  const VH = height;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * VW;
      const y = VH - ((p - min) / range) * (VH - 4) - 2;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const areaCoords = `0,${VH} ${coords} ${VW},${VH}`;

  return (
    <svg width="100%" height={VH} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="block">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={areaCoords} fill={`url(#grad-${color.replace('#', '')})`} stroke="none" vectorEffect="non-scaling-stroke" />
      <polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ─── Mock historical data (deterministic by seed) ─────────────────────────────

function generateGrowth(seed: number, baseValue: number, growthPct: number, points = 30): number[] {
  const result: number[] = [];
  const target = baseValue * (1 + growthPct / 100);
  const step = (target - baseValue) / (points - 1);
  for (let i = 0; i < points; i++) {
    // Pseudo-random noise based on seed
    const noise = Math.sin(seed * (i + 1) * 0.7) * baseValue * 0.015;
    result.push(baseValue + step * i + noise);
  }
  return result;
}

// ─── Tranche metadata ─────────────────────────────────────────────────────────

const TRANCHE_INFO: Record<TrancheKind, { label: string; sub: string; color: string; bg: string; border: string; apyBase: number }> = {
  [TrancheKind.Prime]: { label: 'Prime',  sub: 'Senior · Protected',     color: '#4a7d94', bg: 'rgba(45,78,92,0.30)',  border: 'border-[#3d6678]/40', apyBase: 5.0 },
  [TrancheKind.Core]:  { label: 'Core',   sub: 'Mezzanine · Balanced',   color: '#c8963a', bg: 'rgba(107,74,16,0.30)', border: 'border-[#8f6518]/40', apyBase: 8.0 },
  [TrancheKind.Alpha]: { label: 'Alpha',  sub: 'Equity · First Loss',    color: '#c07060', bg: 'rgba(92,36,22,0.30)',  border: 'border-[#7a3020]/40', apyBase: 15.0 },
};

// ─── Hook: aggregated positions data ──────────────────────────────────────────

function usePositionsData() {
  const { data: userPositions } = useUserPosition();
  const vaultState = useVaultState(0);

  return useMemo(() => {
    const tranches = vaultState.data?.tranches ?? [];

    const positions = (userPositions ?? []).map((pos) => {
      const tranche = tranches.find((t) => t.kind === pos.kind);
      const navQ = tranche?.navPerShareQ ?? Q64_ONE;
      const currentValue = (pos.balance * navQ) / Q64_ONE;
      // Mock cost basis: assume invested at NAV 1.0 (simplified)
      const investedValue = pos.balance;
      const growthAbs = currentValue - investedValue;
      const growthPct = investedValue > 0n ? Number((growthAbs * 10000n) / investedValue) / 100 : 0;
      const meta = TRANCHE_INFO[pos.kind];

      return {
        kind: pos.kind,
        meta,
        balance: pos.balance,
        invested: investedValue,
        currentValue,
        growthAbs,
        growthPct,
        apy: meta.apyBase,
        vaultId: 0,
      };
    }).filter((p) => p.balance > 0n);

    const totalInvested = positions.reduce((s, p) => s + p.invested, 0n);
    const totalCurrent = positions.reduce((s, p) => s + p.currentValue, 0n);
    const totalGrowthAbs = totalCurrent - totalInvested;
    const totalGrowthPct = totalInvested > 0n ? Number((totalGrowthAbs * 10000n) / totalInvested) / 100 : 0;

    const bestPerformer = [...positions].sort((a, b) => b.growthPct - a.growthPct)[0];

    const dailyYield = positions.reduce((s, p) => {
      const annualYield = (Number(p.currentValue) * p.apy) / 100;
      return s + BigInt(Math.floor(annualYield / 365));
    }, 0n);

    return {
      positions,
      totalInvested,
      totalCurrent,
      totalGrowthAbs,
      totalGrowthPct,
      bestPerformer,
      dailyYield,
      isLoading: vaultState.isLoading,
    };
  }, [userPositions, vaultState.data, vaultState.isLoading]);
}

// ─── Page Header ──────────────────────────────────────────────────────────────

function PositionsHeader({ totalCurrent, totalGrowthPct }: { totalCurrent: bigint; totalGrowthPct: number }) {
  const isPositive = totalGrowthPct >= 0;
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 80% at 100% 0%, rgba(232,121,160,0.10) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 0% 100%, rgba(168,85,247,0.08) 0%, transparent 50%)',
        }}
      />
      <div className="relative flex flex-col gap-6 px-8 py-7 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-white/30">
              PRISM Protocol · Portfolio
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400/80">Live</span>
            </span>
          </div>
          <h1 className="font-display text-5xl leading-none text-white tracking-tight">My Positions</h1>
          <p className="mt-2 font-mono text-sm text-white/30">
            Track every investment · Real-time NAV · Per-position growth
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:block text-right">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-white/25 mb-1">
              Portfolio Value
            </div>
            <div className="font-mono text-3xl font-medium text-white/90 tabular-nums">
              ${formatUsdc(totalCurrent, 2)}
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-white/[0.06]" />
          <div className="hidden sm:block text-right">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-white/25 mb-1">
              Total Return
            </div>
            <div className={`font-mono text-3xl font-medium tabular-nums flex items-center justify-end gap-1.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPositive ? <ArrowUpRight className="h-6 w-6" /> : <ArrowDownRight className="h-6 w-6" />}
              {isPositive ? '+' : ''}{totalGrowthPct.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Strip ────────────────────────────────────────────────────────────────

function PortfolioKPIs({
  totalInvested, totalCurrent, totalGrowthAbs, totalGrowthPct, dailyYield, activeCount, bestPerformer,
}: {
  totalInvested: bigint; totalCurrent: bigint; totalGrowthAbs: bigint; totalGrowthPct: number;
  dailyYield: bigint; activeCount: number; bestPerformer: any;
}) {
  const isPositive = totalGrowthAbs >= 0n;

  const kpis = [
    {
      label: 'Total Invested',
      value: `$${formatUsdc(totalInvested, 2)}`,
      sub: `Across ${activeCount} positions`,
      subColor: 'text-white/30',
      sparkData: generateGrowth(1, 100, 8),
      sparkColor: PINK,
    },
    {
      label: 'Current Value',
      value: `$${formatUsdc(totalCurrent, 2)}`,
      sub: 'Mark-to-market NAV',
      subColor: 'text-white/30',
      sparkData: generateGrowth(2, 100, Number(totalGrowthPct) || 5),
      sparkColor: EMERALD,
    },
    {
      label: 'Net P&L',
      value: `${isPositive ? '+' : ''}$${formatUsdc(isPositive ? totalGrowthAbs : -totalGrowthAbs, 2)}`,
      sub: `${isPositive ? '+' : ''}${totalGrowthPct.toFixed(2)}% all-time`,
      subColor: isPositive ? 'text-emerald-400/80' : 'text-rose-400/80',
      sparkData: generateGrowth(3, 100, Number(totalGrowthPct) || 0),
      sparkColor: isPositive ? EMERALD : ROSE,
    },
    {
      label: 'Daily Yield',
      value: `$${formatUsdc(dailyYield, 2)}`,
      sub: dailyYield > 0n ? 'Compounding daily' : 'Accrues on deposit',
      subColor: dailyYield > 0n ? 'text-emerald-400/80' : 'text-white/25',
      sparkData: generateGrowth(4, 100, 12),
      sparkColor: PINK,
    },
    {
      label: 'Best Performer',
      value: bestPerformer ? bestPerformer.meta.label : '—',
      sub: bestPerformer ? `+${bestPerformer.growthPct.toFixed(2)}% return` : 'No positions',
      subColor: bestPerformer ? 'text-emerald-400/80' : 'text-white/25',
      sparkData: generateGrowth(5, 100, bestPerformer?.growthPct || 0),
      sparkColor: EMERALD,
    },
    {
      label: 'Active Positions',
      value: activeCount.toString(),
      sub: activeCount > 0 ? 'Tranches funded' : 'Open a position →',
      subColor: activeCount > 0 ? 'text-white/40' : 'text-[#eca8d6]/70',
      sparkData: [activeCount, activeCount, activeCount, activeCount, activeCount],
      sparkColor: PINK,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04] divide-x divide-white/[0.08]">
      {kpis.map((k) => (
        <div key={k.label} className="group flex flex-col gap-2 px-5 py-5 transition-colors hover:bg-white/[0.04] overflow-hidden">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/30">{k.label}</span>
          <div className="font-mono text-[22px] font-medium leading-none text-white/90 tabular-nums">
            {k.value}
          </div>
          <div className="w-full">
            <Sparkline points={k.sparkData} color={k.sparkColor} height={28} />
          </div>
          <span className={`font-mono text-[11px] ${k.subColor}`}>{k.sub}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Portfolio Growth Chart (large) ───────────────────────────────────────────

function PortfolioGrowthChart({ totalCurrent, totalGrowthPct }: { totalCurrent: bigint; totalGrowthPct: number }) {
  const baseValue = Number(totalCurrent) > 0 ? Number(totalCurrent) / (1 + totalGrowthPct / 100) : 100;
  const points = generateGrowth(7, baseValue, totalGrowthPct, 60);

  const ranges = ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const;

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04]">
      <div className="flex items-center justify-between px-8 py-5 border-b border-white/[0.07]">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-white/30">Capital Growth</p>
          <h2 className="mt-1.5 font-display text-2xl text-white">Portfolio Performance</h2>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] p-1">
          {ranges.map((r, i) => (
            <button
              key={r}
              className={`px-3 py-1 rounded-full font-mono text-[10px] uppercase tracking-widest transition-colors ${
                i === 4 ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="px-8 py-7">
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="font-mono text-3xl font-medium text-white/90 tabular-nums leading-none">
              ${formatUsdc(totalCurrent, 2)}
            </div>
            <div className={`mt-2 font-mono text-sm ${totalGrowthPct >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
              {totalGrowthPct >= 0 ? '+' : ''}{totalGrowthPct.toFixed(2)}% all-time return
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.05]">
            <Activity className="h-3 w-3 text-emerald-400" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/80">NAV synced</span>
          </div>
        </div>

        <div className="h-48 -mx-2">
          <Sparkline points={points} color={totalGrowthPct >= 0 ? EMERALD : ROSE} height={192} />
        </div>
      </div>
    </div>
  );
}

// ─── Position Card ────────────────────────────────────────────────────────────

function PositionCard({ position }: { position: any }) {
  const isPositive = position.growthPct >= 0;
  const sparkData = generateGrowth(position.kind + 1, 100, position.growthPct, 24);

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-white/[0.08] backdrop-blur-md bg-white/[0.03] transition-all hover:border-white/[0.18] hover:bg-white/[0.05]"
      style={{
        backgroundImage: `radial-gradient(ellipse 40% 70% at 100% 0%, ${position.meta.bg} 0%, transparent 60%)`,
      }}
    >
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06] flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: position.meta.color }}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
              {position.meta.sub}
            </span>
          </div>
          <h3 className="font-display text-2xl text-white tracking-tight">{position.meta.label}</h3>
          <p className="mt-1 font-mono text-[11px] text-white/30">
            Vault #{position.vaultId} · Tranche
          </p>
        </div>
        <div className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full border ${
          isPositive ? 'border-emerald-500/20 bg-emerald-500/[0.06]' : 'border-rose-500/20 bg-rose-500/[0.06]'
        }`}>
          {isPositive ? (
            <ArrowUpRight className={`h-3.5 w-3.5 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`} />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5 text-rose-400" />
          )}
          <span className={`font-mono text-xs font-bold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : ''}{position.growthPct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-6 pt-5 pb-3 h-24">
        <Sparkline points={sparkData} color={isPositive ? EMERALD : ROSE} height={80} />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-6 py-5 border-t border-white/[0.06] bg-white/[0.01]">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-1.5">Invested</div>
          <div className="font-mono text-base font-medium text-white/80 tabular-nums">
            ${formatUsdc(position.invested, 2)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-1.5">Current Value</div>
          <div className="font-mono text-base font-medium text-white tabular-nums">
            ${formatUsdc(position.currentValue, 2)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-1.5">Net P&L</div>
          <div className={`font-mono text-base font-medium tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : '-'}${formatUsdc(isPositive ? position.growthAbs : -position.growthAbs, 2)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/30 mb-1.5">APY</div>
          <div className="font-mono text-base font-medium text-emerald-400 tabular-nums">
            {position.apy.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-white/[0.04] flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
          Shares: {formatUsdc(position.balance, 2)}
        </span>
        <button className="font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white transition-colors flex items-center gap-1">
          Manage <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyPositions() {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.10] bg-white/[0.02] py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.03] mb-5">
        <Briefcase className="h-6 w-6 text-white/30" />
      </div>
      <h3 className="font-display text-2xl text-white tracking-tight">No active positions</h3>
      <p className="mt-2 font-mono text-sm text-white/40">Deposit into a tranche to start earning.</p>
      <a
        href="/earn"
        className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.15] bg-white/[0.04] px-5 py-2 font-mono text-xs uppercase tracking-widest text-white/80 hover:bg-white/[0.08] transition-colors"
      >
        Browse Markets <ArrowUpRight className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PositionsOverview() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const data = usePositionsData();

  if (!connected) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-20 flex flex-col items-center justify-center text-center px-6">
        <div className="relative mb-10">
          <div className="absolute inset-0 bg-white/20 blur-[100px] rounded-full" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl">
            <Briefcase className="h-10 w-10 text-white/40" strokeWidth={1.5} />
          </div>
        </div>
        <h1 className="font-display text-4xl text-white tracking-tight mb-4">Portfolio Exposure</h1>
        <p className="max-w-md text-white/40 leading-relaxed mb-10">
          Connect your wallet to view your active tranches, real-time NAV growth, and accumulated protocol yield.
        </p>
        <button 
          onClick={() => setVisible(true)}
          className="rounded-xl bg-white px-8 py-4 font-mono text-[13px] font-bold uppercase tracking-widest text-black transition-all hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] shadow-[0_20px_50px_rgba(255,255,255,0.1)]"
        >
          Connect Wallet to View Positions
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-6 pb-16">
      <PositionsHeader totalCurrent={data.totalCurrent} totalGrowthPct={data.totalGrowthPct} />

      <PortfolioKPIs
        totalInvested={data.totalInvested}
        totalCurrent={data.totalCurrent}
        totalGrowthAbs={data.totalGrowthAbs}
        totalGrowthPct={data.totalGrowthPct}
        dailyYield={data.dailyYield}
        activeCount={data.positions.length}
        bestPerformer={data.bestPerformer}
      />

      <PortfolioGrowthChart totalCurrent={data.totalCurrent} totalGrowthPct={data.totalGrowthPct} />

      {/* Section header */}
      <div className="flex items-center gap-3 pt-2">
        <Layers className="h-4 w-4 text-white/30" />
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/40">Position Detail</span>
        <div className="h-px flex-1 bg-white/[0.06]" />
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/25">
          {data.positions.length} active
        </span>
      </div>

      {data.positions.length === 0 ? (
        <EmptyPositions />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {data.positions.map((p) => (
            <PositionCard key={p.kind} position={p} />
          ))}
        </div>
      )}
    </div>
  );
}
