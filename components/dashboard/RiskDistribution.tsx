'use client';

import { Target } from 'lucide-react';

interface RiskDistributionProps {
  exposure: Array<{ label: string; value: number; color: string }>;
}

export function RiskDistribution({ exposure = [] }: RiskDistributionProps) {
  return (
    <div className="rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04] p-6">
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
        <span className="font-mono text-sm text-emerald-400 font-bold tracking-tighter">OPTIMAL (9.2/10)</span>
      </div>
    </div>
  );
}
