'use client';

import { useState, useEffect } from 'react';
import { formatUsdc } from '@/app/lib/format';

// ─── Sparkline ────────────────────────────────────────────────────────────────

const RED = '#e54b73';
const FLAT_POINTS = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

function Sparkline({ points }: { points: number[] }) {
  const VW = 100;
  const VH = 20;
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
      className="opacity-25"
    >
      <polyline
        points={coords}
        fill="none"
        stroke={RED}
        strokeWidth="1.2"
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
      subColor: netWorth > 0n ? 'text-emerald-500/80' : 'text-white/20',
    },
    {
      label: 'Total Supplied',
      value: isMounted ? `$${formatUsdc(totalSupplied, 2)}` : '$0.00',
      sub: totalSupplied > 0n ? 'Earning across tranches' : 'Nothing earning yet',
      subColor: 'text-white/25',
    },
    {
      label: 'Total Borrowed',
      value: isMounted ? `$${formatUsdc(totalBorrowed, 2)}` : '$0.00',
      sub: totalBorrowed > 0n ? 'Active credit position' : 'No active loans',
      subColor: 'text-white/25',
    },
    {
      label: 'Daily Yield',
      value: isMounted ? `$${formatUsdc(dailyYield, 2)}` : '$0.00',
      sub: dailyYield > 0n ? 'Accruing yield' : 'Accrues on deposit',
      subColor: dailyYield > 0n ? 'text-emerald-500/80' : 'text-white/20',
    },
    {
      label: 'Health Factor',
      value: isMounted ? String(healthFactor) : '—',
      sub: hfSafe ? 'Position is healthy' : 'At risk — add collateral',
      subColor: hfSafe ? 'text-emerald-500/80' : 'text-rose-500/80',
    },
    {
      label: 'Claimable',
      value: isMounted ? `$${formatUsdc(claimableRewards, 2)}` : '$0.00',
      sub: claimableRewards > 0n ? 'Ready to withdraw' : 'No rewards pending',
      subColor: claimableRewards > 0n ? 'text-[#e54b73]/80' : 'text-white/20',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-5">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="flex flex-col gap-2 p-5 rounded-2xl border border-white/[0.03] bg-[#0c0c0f] transition-all duration-200 hover:border-white/[0.06] overflow-hidden"
        >
          {/* Label */}
          <span className="font-mono text-[9px] uppercase tracking-wider text-white/30 font-semibold">
            {m.label}
          </span>

          {/* Value */}
          <div className="font-mono text-xl font-medium leading-none text-white/80 tabular-nums">
            {m.value}
          </div>

          {/* Sparkline */}
          <div className="w-full py-1">
            <Sparkline points={FLAT_POINTS} />
          </div>

          {/* Subtitle */}
          <span className={`font-mono text-[9px] leading-tight ${m.subColor}`}>
            {m.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
