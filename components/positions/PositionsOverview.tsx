'use client';

import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Activity, Briefcase, Layers, TrendingUp } from 'lucide-react';
import { TrancheKind, Q64_ONE } from '@/app/lib/constants';
import { formatUsdc } from '@/app/lib/format';
import { useUserPosition } from '@/hooks/useUserPosition';
import { useVaultState } from '@/hooks/useVaultState';
import { useNavHistory, type NavHistoryMap } from '@/hooks/useNavHistory';
import { useWallet, useWalletModal } from '@/components/providers/stellar-wallet-provider';

// ─── Design tokens (matched to Dashboard) ─────────────────────────────────────

const ACCENT   = '#e54b73';   // same as dashboard
const EMERALD  = '#10b981';
const ROSE     = '#f43f5e';

// ─── Sparkline ────────────────────────────────────────────────────────────────
// Matches KPIStrip.tsx: thin stroke, no fill, low opacity — analytical not cinematic

function Sparkline({
  points,
  color = ACCENT,
  height = 20,
  showFill = false,
}: {
  points: number[];
  color?: string;
  height?: number;
  showFill?: boolean;
}) {
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

  const gradId = `sg-${color.replace('#', '')}-${height}`;

  return (
    <svg
      width="100%"
      height={VH}
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="none"
      className="block opacity-[0.35]"
    >
      {showFill && (
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.12" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {showFill && (
        <polyline
          points={`0,${VH} ${coords} ${VW},${VH}`}
          fill={`url(#${gradId})`}
          stroke="none"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={coords}
        fill="none"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ─── Mock historical data ─────────────────────────────────────────────────────

function generateGrowth(seed: number, baseValue: number, growthPct: number, points = 30): number[] {
  const result: number[] = [];
  const target = baseValue * (1 + growthPct / 100);
  const step = (target - baseValue) / (points - 1);
  for (let i = 0; i < points; i++) {
    const noise = Math.sin(seed * (i + 1) * 0.7) * baseValue * 0.015;
    result.push(baseValue + step * i + noise);
  }
  return result;
}

// ─── Tranche metadata ─────────────────────────────────────────────────────────

const TRANCHE_INFO: Record<TrancheKind, {
  label: string; sub: string; color: string;
  bg: string; border: string; apyBase: number;
}> = {
  [TrancheKind.Prime]: {
    label: 'Prime',  sub: 'Senior · Protected',
    color: '#647b8c', bg: 'rgba(50,61,70,0.04)', border: 'rgba(100,123,140,0.18)', apyBase: 5.0,
  },
  [TrancheKind.Core]: {
    label: 'Core',   sub: 'Mezzanine · Balanced',
    color: '#b29b70', bg: 'rgba(178,155,112,0.04)', border: 'rgba(178,155,112,0.18)', apyBase: 8.0,
  },
  [TrancheKind.Alpha]: {
    label: 'Alpha',  sub: 'Equity · First Loss',
    color: '#b07073', bg: 'rgba(176,112,115,0.04)', border: 'rgba(176,112,115,0.18)', apyBase: 15.0,
  },
};

// ─── Data hook ────────────────────────────────────────────────────────────────

function usePositionsData() {
  const { data: userPositions } = useUserPosition();
  const vaultState = useVaultState(0);

  return useMemo(() => {
    const tranches = vaultState.data?.tranches ?? [];

    const positions = (userPositions ?? []).map((pos) => {
      const tranche = tranches.find((t) => t.kind === pos.kind);
      const navQ = tranche?.navPerShareQ ?? Q64_ONE;
      const currentValue = (pos.balance * navQ) / Q64_ONE;
      const investedValue = pos.balance;
      const growthAbs = currentValue - investedValue;
      const growthPct = investedValue > 0n
        ? Number((growthAbs * 10000n) / investedValue) / 100
        : 0;
      const meta = TRANCHE_INFO[pos.kind];

      return {
        kind: pos.kind, meta,
        balance: pos.balance,
        invested: investedValue,
        currentValue, growthAbs, growthPct,
        apy: meta.apyBase, vaultId: 0,
      };
    }).filter((p) => p.balance > 0n);

    const totalInvested    = positions.reduce((s, p) => s + p.invested,      0n);
    const totalCurrent     = positions.reduce((s, p) => s + p.currentValue,   0n);
    const totalGrowthAbs   = totalCurrent - totalInvested;
    const totalGrowthPct   = totalInvested > 0n
      ? Number((totalGrowthAbs * 10000n) / totalInvested) / 100
      : 0;
    const bestPerformer    = [...positions].sort((a, b) => b.growthPct - a.growthPct)[0];
    const dailyYield       = positions.reduce((s, p) => {
      const annual = (Number(p.currentValue) * p.apy) / 100;
      return s + BigInt(Math.floor(annual / 365));
    }, 0n);

    return {
      positions, totalInvested, totalCurrent,
      totalGrowthAbs, totalGrowthPct, bestPerformer, dailyYield,
      isLoading: vaultState.isLoading,
    };
  }, [userPositions, vaultState.data, vaultState.isLoading]);
}

// ─── KPI Strip — matches Dashboard KPIStrip card style exactly ───────────────

function PortfolioKPIs({
  totalInvested, totalCurrent, totalGrowthAbs, totalGrowthPct,
  dailyYield, activeCount, bestPerformer,
}: {
  totalInvested: bigint; totalCurrent: bigint;
  totalGrowthAbs: bigint; totalGrowthPct: number;
  dailyYield: bigint; activeCount: number; bestPerformer: any;
}) {
  const isPositive = totalGrowthAbs >= 0n;

  const kpis = [
    {
      label: 'Total Invested',
      value: `$${formatUsdc(totalInvested, 2)}`,
      sub: `Across ${activeCount} position${activeCount !== 1 ? 's' : ''}`,
      subColor: 'text-white/25',
      spark: generateGrowth(1, 100, 8),
      sparkColor: ACCENT,
    },
    {
      label: 'Current Value',
      value: `$${formatUsdc(totalCurrent, 2)}`,
      sub: 'Mark-to-market NAV',
      subColor: 'text-white/25',
      spark: generateGrowth(2, 100, Number(totalGrowthPct) || 5),
      sparkColor: EMERALD,
    },
    {
      label: 'Net P&L',
      value: `${isPositive ? '+' : ''}$${formatUsdc(isPositive ? totalGrowthAbs : -totalGrowthAbs, 2)}`,
      sub: `${isPositive ? '+' : ''}${totalGrowthPct.toFixed(2)}% all-time`,
      subColor: isPositive ? 'text-emerald-400/80' : 'text-rose-400/80',
      spark: generateGrowth(3, 100, Number(totalGrowthPct) || 0),
      sparkColor: isPositive ? EMERALD : ROSE,
    },
    {
      label: 'Daily Yield',
      value: `$${formatUsdc(dailyYield, 2)}`,
      sub: dailyYield > 0n ? 'Compounding daily' : 'Accrues on deposit',
      subColor: dailyYield > 0n ? 'text-emerald-400/80' : 'text-white/20',
      spark: generateGrowth(4, 100, 12),
      sparkColor: ACCENT,
    },
    {
      label: 'Best Performer',
      value: bestPerformer ? bestPerformer.meta.label : '—',
      sub: bestPerformer ? `+${bestPerformer.growthPct.toFixed(2)}% return` : 'No positions',
      subColor: bestPerformer ? 'text-emerald-400/80' : 'text-white/20',
      spark: generateGrowth(5, 100, bestPerformer?.growthPct || 0),
      sparkColor: EMERALD,
    },
    {
      label: 'Active Positions',
      value: activeCount.toString(),
      sub: activeCount > 0 ? 'Tranches funded' : 'Open a position →',
      subColor: activeCount > 0 ? 'text-white/30' : `text-[#e54b73]/60`,
      spark: Array(12).fill(activeCount),
      sparkColor: ACCENT,
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-5">
      {kpis.map((k) => (
        <div
          key={k.label}
          className="flex flex-col gap-2 p-5 rounded-2xl border border-white/[0.03] bg-[#0c0c0f] transition-all duration-200 hover:border-white/[0.06] overflow-hidden"
        >
          <span className="font-mono text-[9px] uppercase tracking-wider text-white/30 font-semibold">
            {k.label}
          </span>
          <div className="font-mono text-xl font-medium leading-none text-white/80 tabular-nums">
            {k.value}
          </div>
          <div className="w-full py-1">
            <Sparkline points={k.spark} color={k.sparkColor} height={20} />
          </div>
          <span className={`font-mono text-[9px] leading-tight ${k.subColor}`}>
            {k.sub}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Portfolio Growth Chart ───────────────────────────────────────────────────

function PortfolioGrowthChart({
  totalCurrent, totalGrowthPct,
}: { totalCurrent: bigint; totalGrowthPct: number }) {
  const baseValue = Number(totalCurrent) > 0
    ? Number(totalCurrent) / (1 + totalGrowthPct / 100)
    : 100;
  const points = generateGrowth(7, baseValue, totalGrowthPct, 60);
  const isPositive = totalGrowthPct >= 0;
  const lineColor = isPositive ? EMERALD : ROSE;

  const ranges = ['1D', '1W', '1M', '3M', '1Y', 'ALL'] as const;

  return (
    <div className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.03]">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-wider text-white/25 font-semibold">
            Capital Growth
          </p>
          <h2 className="mt-1 font-sans text-base font-medium text-white">Portfolio Performance</h2>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.03] bg-white/[0.01] p-0.5">
          {ranges.map((r, i) => (
            <button
              key={r}
              className={`px-2.5 py-1 rounded-md font-mono text-[9px] uppercase tracking-widest transition-colors ${
                i === 4
                  ? 'bg-white/[0.08] text-white font-semibold'
                  : 'text-white/30 hover:text-white/60'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="font-mono text-2xl font-medium text-white/90 tabular-nums leading-none">
              ${formatUsdc(totalCurrent, 2)}
            </div>
            <div className={`mt-1.5 font-mono text-[10px] font-semibold ${isPositive ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
              {isPositive ? '+' : ''}{totalGrowthPct.toFixed(2)}% all-time return
            </div>
          </div>
        </div>

        {/* Chart area — flat, clean, no glow */}
        <div className="h-36 -mx-1">
          <Sparkline points={points} color={lineColor} height={144} showFill />
        </div>
      </div>
    </div>
  );
}

// ─── Position Card ────────────────────────────────────────────────────────────

const MS_24H = 24 * 60 * 60_000;
const SPARK_POINTS = 30;

function PositionCard({ position, history }: { position: any; history: NavHistoryMap }) {
  const kindHistory = history[position.kind as TrancheKind] ?? [];

  // Real sparkline — last SPARK_POINTS NAV readings, fallback to mock
  const sparkData = kindHistory.length >= 2
    ? kindHistory.slice(-SPARK_POINTS).map((p) => p.navPerShare)
    : generateGrowth(position.kind + 1, 100, position.growthPct, SPARK_POINTS);

  // Real 24h delta — find the point closest to 24h ago, compare to latest
  const now = Date.now();
  const latest = kindHistory[kindHistory.length - 1];
  const point24hAgo = kindHistory.filter((p) => p.timestamp <= now - MS_24H).pop();
  const change24h =
    point24hAgo && latest
      ? ((latest.navPerShare - point24hAgo.navPerShare) / point24hAgo.navPerShare) * 100
      : position.growthPct; // fallback: all-time return if <24h of data

  const hasRealDelta = !!point24hAgo && kindHistory.length >= 2;

  const isPositive = change24h >= 0;
  const lineColor = isPositive ? EMERALD : ROSE;

  return (
    <div className="group relative rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden transition-all duration-200 hover:border-white/[0.07]">

      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: position.meta.color }}
            />
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/30 font-semibold">
              {position.meta.sub}
            </span>
          </div>
          <h3 className="font-sans text-lg font-semibold text-white tracking-tight">
            {position.meta.label}
          </h3>
          <p className="mt-0.5 font-mono text-[9px] text-white/20">
            Vault #{position.vaultId} · Tranche
          </p>
        </div>

        {/* Return badge */}
        <div className="shrink-0 flex flex-col items-end gap-0.5">
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded border font-mono text-[10px] font-bold tabular-nums ${
              isPositive
                ? 'border-emerald-500/15 text-emerald-400 bg-emerald-500/[0.04]'
                : 'border-rose-500/15 text-rose-400 bg-rose-500/[0.04]'
            }`}
          >
            {isPositive
              ? <ArrowUpRight className="h-3 w-3" />
              : <ArrowDownRight className="h-3 w-3" />}
            {isPositive ? '+' : ''}{change24h.toFixed(2)}%
          </div>
          <span className="font-mono text-[8px] uppercase tracking-wider text-white/20">
            {hasRealDelta ? '24h' : 'all-time'}
          </span>
        </div>
      </div>

      {/* Mini sparkline — flat, subtle, no glow */}
      <div className="px-5 pb-4 h-14">
        <Sparkline points={sparkData} color={lineColor} height={48} showFill />
      </div>

      {/* Stats grid */}
      <div className="border-t border-white/[0.03] px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-4">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/25 font-semibold mb-1">
            Invested
          </div>
          <div className="font-mono text-sm font-medium text-white/70 tabular-nums">
            ${formatUsdc(position.invested, 2)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/25 font-semibold mb-1">
            Current Value
          </div>
          <div className="font-mono text-sm font-medium text-white/90 tabular-nums">
            ${formatUsdc(position.currentValue, 2)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/25 font-semibold mb-1">
            Net P&amp;L
          </div>
          <div className={`font-mono text-sm font-medium tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
            {isPositive ? '+' : '-'}${formatUsdc(isPositive ? position.growthAbs : -position.growthAbs, 2)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-wider text-white/25 font-semibold mb-1">
            APY
          </div>
          <div className="font-mono text-sm font-medium text-emerald-400 tabular-nums">
            {position.apy.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.03] px-5 py-3 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/25 font-semibold">
          Shares: {formatUsdc(position.balance, 2)}
        </span>
        <button className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-white/35 hover:text-white/70 transition-colors group/btn">
          Manage
          <ArrowUpRight className="h-3 w-3 group-hover/btn:text-[#e54b73] transition-colors" />
        </button>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyPositions() {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.04] bg-[#0c0c0f] py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.03] bg-white/[0.02] mb-4">
        <Briefcase className="h-5 w-5 text-white/25" strokeWidth={1.5} />
      </div>
      <h3 className="font-sans text-base font-medium text-white/80 tracking-tight">
        No active positions
      </h3>
      <p className="mt-1.5 font-mono text-[10px] text-white/30">
        Deposit into a tranche to start earning.
      </p>
      <a
        href="/earn"
        className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/[0.04] bg-white/[0.01] px-5 py-2.5 font-mono text-[9px] uppercase tracking-wider text-white/60 hover:bg-white/[0.03] hover:text-white/80 transition-all font-semibold"
      >
        Browse Markets
        <ArrowUpRight className="h-3 w-3" />
      </a>
    </div>
  );
}

// ─── Connect Wall ─────────────────────────────────────────────────────────────

function ConnectWall({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="w-full max-w-sm mx-auto mt-16 flex flex-col items-center text-center px-6 pb-16">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.03] bg-[#0c0c0f] mb-6">
        <Briefcase className="h-7 w-7 text-white/20" strokeWidth={1.5} />
      </div>
      <h1 className="font-sans text-xl font-semibold text-white tracking-tight mb-2">
        Portfolio Exposure
      </h1>
      <p className="font-mono text-[10px] text-white/35 leading-relaxed mb-8 max-w-xs">
        Connect your wallet to view active tranches, real-time NAV growth, and accumulated protocol yield.
      </p>
      <button
        onClick={onConnect}
        className="rounded-xl bg-white px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-wider text-black transition-all hover:opacity-90 active:scale-[0.98]"
      >
        Connect Wallet
      </button>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function PositionsOverview() {
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();
  const data = usePositionsData();
  const { history } = useNavHistory();

  if (!connected) {
    return <ConnectWall onConnect={() => setVisible(true)} />;
  }

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-6 pb-16">
      {/* Page header */}


      {/* KPI strip */}
      <PortfolioKPIs
        totalInvested={data.totalInvested}
        totalCurrent={data.totalCurrent}
        totalGrowthAbs={data.totalGrowthAbs}
        totalGrowthPct={data.totalGrowthPct}
        dailyYield={data.dailyYield}
        activeCount={data.positions.length}
        bestPerformer={data.bestPerformer}
      />

      {/* Growth chart */}
      <PortfolioGrowthChart
        totalCurrent={data.totalCurrent}
        totalGrowthPct={data.totalGrowthPct}
      />

      {/* Position cards section */}
      <div className="flex items-center gap-3 pt-1">
        <Layers className="h-3.5 w-3.5 text-white/20" />
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/30 font-semibold">
          Position Detail
        </span>
        <div className="h-px flex-1 bg-white/[0.04]" />
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/20 font-semibold">
          {data.positions.length} active
        </span>
      </div>

      {data.positions.length === 0 ? (
        <EmptyPositions />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {data.positions.map((p) => (
            <PositionCard key={p.kind} position={p} history={history} />
          ))}
        </div>
      )}
    </div>
  );
}
