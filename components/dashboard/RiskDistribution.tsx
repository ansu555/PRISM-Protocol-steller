'use client';

import { Target } from 'lucide-react';

interface RiskDistributionProps {
  exposure: Array<{ label: string; value: number; color: string }>;
}

export function RiskDistribution({ exposure = [] }: RiskDistributionProps) {
  // Compute diversity score from actual exposure distribution
  const total = exposure.reduce((s, e) => s + e.value, 0);
  const diversityScore = total > 0
    ? (() => {
        const ideal = 100 / Math.max(exposure.length, 1);
        const variance = exposure.reduce((s, e) => s + Math.abs(e.value - ideal), 0) / Math.max(exposure.length, 1);
        const score = Math.max(1, Math.min(10, 10 - (variance / ideal) * 5));
        return score.toFixed(1);
      })()
    : '—';
  const scoreLabel = diversityScore === '—' ? '—'
    : Number(diversityScore) >= 8 ? `OPTIMAL (${diversityScore}/10)`
    : Number(diversityScore) >= 5 ? `FAIR (${diversityScore}/10)`
    : `IMBALANCED (${diversityScore}/10)`;
  const scoreColor = diversityScore === '—' ? 'text-white/30'
    : Number(diversityScore) >= 8 ? 'text-emerald-400'
    : Number(diversityScore) >= 5 ? 'text-amber-400'
    : 'text-rose-400';

  return (
    <div className="rounded-xl border border-white/[0.03] bg-[#0c0c0f] p-6">
      <div className="flex items-center gap-2.5 mb-6">
        <Target className="h-4 w-4 text-white/35" />
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Risk Distribution</h2>
      </div>

      <div className="space-y-5">
        {exposure.map((item) => (
          <div key={item.label} className="group cursor-default">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-xs text-white/40 uppercase tracking-widest">
                {item.label} Concentration
              </span>
              <span className="font-mono text-sm text-white/65 font-medium">{item.value}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${item.value}%`, backgroundColor: item.color }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-7 pt-5 border-t border-white/[0.04] flex items-center justify-between">
        <span className="font-mono text-xs text-white/20 uppercase tracking-widest">Diversification Score</span>
        <span className={`font-mono text-sm font-bold tracking-tighter ${scoreColor}`}>{scoreLabel}</span>
      </div>
    </div>
  );
}
