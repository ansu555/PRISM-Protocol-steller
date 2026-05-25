'use client';

import { useMarketStats } from '@/hooks/useMarketStats';
import { formatUsdc } from '@/app/lib/format';

const SPARKLINE_DATA = [
  [4, 6, 5, 8, 7, 10, 9, 13, 12, 15, 14, 18],
  [3, 5, 4, 7, 6, 8,  9, 11, 10, 13, 15, 16],
  [14, 15, 13, 15, 14, 16, 15, 16, 15, 17, 16, 18],
  [2, 3, 2, 4, 3, 5, 4,  6,  5,  8,  7, 10],
];

function Sparkline({ points, color = '#e879a0' }: { points: number[], color?: string }) {
  const W = 64;
  const H = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * W;
      const y = H - ((p - min) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 opacity-60">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarketHeader() {
  const { totalTvl, totalActiveCredit, avgPrimeYield, activeVaults, isLoading } = useMarketStats();

  const stats = [
    {
      label: 'Total Protocol TVL',
      value: isLoading ? '---' : `$${formatUsdc(totalTvl, 0)}`,
      sub: '+2.4% last 24h',
      subColor: 'text-emerald-400/80',
      sparkIdx: 0,
      sparkColor: '#10b981'
    },
    {
      label: 'Active Credit',
      value: isLoading ? '---' : `$${formatUsdc(totalActiveCredit, 0)}`,
      sub: 'Structural utilization high',
      subColor: 'text-white/40',
      sparkIdx: 1,
      sparkColor: '#f59e0b'
    },
    {
      label: 'Avg Prime Yield',
      value: isLoading ? '---' : `${avgPrimeYield.toFixed(2)}%`,
      sub: 'Top-tier senior credit',
      subColor: 'text-blue-400/80',
      sparkIdx: 2,
      sparkColor: '#3b82f6'
    },
    {
      label: 'Active Vaults',
      value: isLoading ? '---' : activeVaults.toString(),
      sub: 'Verified institutional pools',
      subColor: 'text-white/40',
      sparkIdx: 3,
      sparkColor: '#a855f7'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04] divide-x divide-white/[0.08]">
      {stats.map((stat) => (
        <div key={stat.label} className="group flex flex-col justify-between px-5 py-5 transition-colors hover:bg-white/[0.04]">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-white/40">
            {stat.label}
          </span>

          <div className="mt-3 flex items-center justify-between gap-4">
            <div className="font-mono text-3xl font-medium leading-none text-white tabular-nums">
              {stat.value}
            </div>
            <Sparkline points={SPARKLINE_DATA[stat.sparkIdx]} color={stat.sparkColor} />
          </div>

          <span className={`mt-3 font-mono text-[10px] uppercase tracking-widest ${stat.subColor}`}>
            {stat.sub}
          </span>
        </div>
      ))}
    </div>
  );
}
