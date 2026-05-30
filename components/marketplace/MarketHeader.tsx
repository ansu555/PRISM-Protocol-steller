'use client';

import { useMarketStats } from '@/hooks/useMarketStats';
import { formatUsdc } from '@/app/lib/format';

const ACCENT = '#e54b73';

const SPARKLINE_DATA = [
  [4, 6, 5, 8, 7, 10, 9, 13, 12, 15, 14, 18],
  [3, 5, 4, 7, 6,  8, 9, 11, 10, 13, 15, 16],
  [14, 15, 13, 15, 14, 16, 15, 16, 15, 17, 16, 18],
  [2,  3,  2,  4,  3,  5,  4,  6,  5,  8,  7, 10],
];

function Sparkline({ points, color = ACCENT }: { points: number[]; color?: string }) {
  const VW = 100;
  const VH = 18;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * VW;
      const y = VH - ((p - min) / range) * (VH - 3) - 1.5;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg width="100%" height={VH} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" className="opacity-20">
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

export function MarketHeader() {
  const { totalTvl, totalActiveCredit, avgPrimeYield, activeVaults, isLoading } = useMarketStats();

  const stats = [
    {
      label: 'TVL',
      value: isLoading ? '—' : `$${formatUsdc(totalTvl, 0)}`,
      sub: 'Protocol-wide liquidity',
      subColor: 'text-white/25',
      sparkIdx: 0,
      sparkColor: '#10b981',
    },
    {
      label: 'Active Credit',
      value: isLoading ? '—' : `$${formatUsdc(totalActiveCredit, 0)}`,
      sub: 'Deployed capital',
      subColor: 'text-white/25',
      sparkIdx: 1,
      sparkColor: '#f59e0b',
    },
    {
      label: 'Prime APY',
      value: isLoading ? '—' : `${avgPrimeYield.toFixed(2)}%`,
      sub: 'Senior tranche yield',
      subColor: 'text-emerald-500/70',
      sparkIdx: 2,
      sparkColor: '#10b981',
    },
    {
      label: 'Vaults',
      value: isLoading ? '—' : activeVaults.toString(),
      sub: 'Verified credit pools',
      subColor: 'text-white/25',
      sparkIdx: 3,
      sparkColor: ACCENT,
    },
  ];

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {stats.map((m) => (
        <div
          key={m.label}
          className="flex flex-col gap-2 p-4 rounded-xl border border-white/[0.03] bg-white/[0.01] transition-all duration-200 hover:border-white/[0.06]"
        >
          <span className="font-mono text-[9px] text-white/35">{m.label}</span>
          <div className="font-mono text-lg font-medium leading-none text-white/80 tabular-nums">
            {m.value}
          </div>
          <div className="w-full">
            <Sparkline points={SPARKLINE_DATA[m.sparkIdx]} color={m.sparkColor} />
          </div>
          <span className={`font-mono text-[9px] leading-tight ${m.subColor}`}>{m.sub}</span>
        </div>
      ))}
    </div>
  );
}
