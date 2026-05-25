'use client';

import { useState, useEffect } from 'react';
import { formatUsdc } from '@/app/lib/format';

// ─── Sparkline ────────────────────────────────────────────────────────────────

const PINK = '#e879a0';

// Flat placeholder — shown when there's no historical time-series data yet.
const FLAT_POINTS = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

function Sparkline({ points }: { points: number[] }) {
  const VW = 100;
  const VH = 24;
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

  return (
    <svg
      width="100%"
      height={VH}
      viewBox={`0 0 ${VW} ${VH}`}
      preserveAspectRatio="none"
      className="opacity-30"
    >
      <polyline
        points={coords}
        fill="none"
        stroke={PINK}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ─── KPIStrip ─────────────────────────────────────────────────────────────────

interface KPIStripProps {
  netWorth: bigint;
  totalSupplied: bigint;
  totalBorrowed: bigint;
  dailyYield: bigint;
  healthFactor: number | string;
  claimableRewards: bigint;
}

export function KPIStrip({
  netWorth,
  totalSupplied,
  totalBorrowed,
  dailyYield,
  healthFactor,
  claimableRewards,
}: KPIStripProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const hfSafe = typeof healthFactor === 'number' ? healthFactor >= 1.5 : true;

  const metrics = [
    {
      label: 'Net Worth',
      value: isMounted ? `$${formatUsdc(netWorth, 2)}` : '$0.00',
      sub: netWorth > 0n ? 'Active positions' : 'No positions yet',
      subColor: netWorth > 0n ? 'text-emerald-400/70' : 'text-white/25',
    },
    {
      label: 'Total Supplied',
      value: isMounted ? `$${formatUsdc(totalSupplied, 2)}` : '$0.00',
      sub: totalSupplied > 0n ? 'Earning across tranches' : 'Nothing earning yet',
      subColor: 'text-white/30',
    },
    {
      label: 'Total Borrowed',
      value: isMounted ? `$${formatUsdc(totalBorrowed, 2)}` : '$0.00',
      sub: totalBorrowed > 0n ? 'Active credit position' : 'No active loans',
      subColor: 'text-white/30',
    },
    {
      label: 'Daily Yield',
      value: isMounted ? `$${formatUsdc(dailyYield, 2)}` : '$0.00',
      sub: dailyYield > 0n ? 'Accruing yield' : 'Accrues on deposit',
      subColor: dailyYield > 0n ? 'text-emerald-400/70' : 'text-white/25',
    },
    {
      label: 'Health Factor',
      value: isMounted ? String(healthFactor) : '—',
      sub: hfSafe ? 'Position is healthy' : 'At risk — add collateral',
      subColor: hfSafe ? 'text-emerald-400/70' : 'text-rose-400/80',
    },
    {
      label: 'Claimable',
      value: isMounted ? `$${formatUsdc(claimableRewards, 2)}` : '$0.00',
      sub: claimableRewards > 0n ? 'Ready to withdraw →' : 'No rewards pending',
      subColor: claimableRewards > 0n ? 'text-[#eca8d6]/70' : 'text-white/25',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04] divide-x divide-white/[0.08]">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="group flex flex-col gap-2 px-5 py-5 transition-colors hover:bg-white/[0.04] overflow-hidden"
        >
          {/* Label */}
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
            {m.label}
          </span>

          {/* Value — full width, never truncated */}
          <div className="font-mono text-[22px] font-medium leading-none text-white/90 tabular-nums">
            {m.value}
          </div>

          {/* Sparkline — flat until historical data is available */}
          <div className="w-full">
            <Sparkline points={FLAT_POINTS} />
          </div>

          {/* Subtitle */}
          <span className={`font-mono text-[10px] ${m.subColor}`}>
            {m.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
