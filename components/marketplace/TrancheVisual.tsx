'use client';

import { stateName } from '@/app/lib/format';

interface TrancheData {
  kind: any;
  totalAssets: any;
  targetApyBps: number;
}

interface TrancheVisualProps {
  tranches: TrancheData[];
  totalDeposits: any;
}

const TRANCHE_STYLES = [
  {
    bg: 'bg-[#1a3d2e]',
    border: 'border-emerald-800/50',
    text: 'text-emerald-400',
    subtext: 'text-emerald-600',
  },
  {
    bg: 'bg-[#3b2c08]',
    border: 'border-amber-800/50',
    text: 'text-amber-400',
    subtext: 'text-amber-700',
  },
  {
    bg: 'bg-[#3d1208]',
    border: 'border-red-900/50',
    text: 'text-red-400',
    subtext: 'text-red-800',
  },
];

const WIDTHS = ['w-full', 'w-[80%]', 'w-[62%]'];

export function TrancheVisual({ tranches, totalDeposits }: TrancheVisualProps) {
  const total = Number(totalDeposits);

  return (
    <div className="space-y-1.5">
      {tranches.map((t, idx) => {
        const kindStr = stateName(t.kind);
        const assets = Number(t.totalAssets);
        const pct = total > 0 ? ((assets / total) * 100).toFixed(0) : (33 - idx * 7).toString();
        const style = TRANCHE_STYLES[idx] ?? TRANCHE_STYLES[2];
        const apy = (t.targetApyBps / 100).toFixed(2);

        return (
          <div
            key={kindStr}
            className={`${WIDTHS[idx]} ${style.bg} border ${style.border} rounded px-4 py-2.5 flex items-center justify-between`}
          >
            <span className={`font-mono text-[11px] font-bold uppercase tracking-wider ${style.text}`}>
              {kindStr} · {pct}%
            </span>
            <span className={`font-mono text-[11px] font-bold ${style.text} opacity-70`}>
              {apy}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
