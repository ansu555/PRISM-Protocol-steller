'use client';

interface TrancheData {
  kind: any;
  totalAssets: any;
  targetApyBps: number;
}

interface TrancheVisualProps {
  tranches: TrancheData[];
  totalDeposits: any;
}

const TRANCHE_META = [
  { label: 'Senior',      color: '#647b8c', bg: 'rgba(100,123,140,0.05)', border: 'rgba(100,123,140,0.14)' },
  { label: 'Core',        color: '#b29b70', bg: 'rgba(178,155,112,0.05)', border: 'rgba(178,155,112,0.14)' },
  { label: 'Alpha',       color: '#b07073', bg: 'rgba(176,112,115,0.05)', border: 'rgba(176,112,115,0.14)' },
];

const WIDTHS = ['100%', '84%', '66%'];

export function TrancheVisual({ tranches, totalDeposits }: TrancheVisualProps) {
  const total = Number(totalDeposits);

  return (
    <div className="space-y-1">
      {tranches.map((t, idx) => {
        const meta = TRANCHE_META[idx] ?? TRANCHE_META[2];
        const assets = Number(t.totalAssets);
        const pct = total > 0 ? ((assets / total) * 100).toFixed(0) : (40 - idx * 10).toString();
        const apy = (t.targetApyBps / 100).toFixed(1);

        return (
          <div
            key={idx}
            className="flex items-center justify-between rounded px-3 py-1.5"
            style={{
              width: WIDTHS[idx],
              backgroundColor: meta.bg,
              border: `1px solid ${meta.border}`,
            }}
          >
            <span className="font-mono text-[10px]" style={{ color: meta.color }}>
              {meta.label} <span style={{ opacity: 0.5 }}>· {pct}%</span>
            </span>
            <span className="font-mono text-[10px] tabular-nums" style={{ color: meta.color, opacity: 0.6 }}>
              {apy}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
