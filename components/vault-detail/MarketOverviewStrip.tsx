'use client';

import { Shield, TrendingUp, BarChart, Activity, HeartPulse } from 'lucide-react';
import { formatUsdc } from '@/app/lib/format';

interface MarketOverviewStripProps {
  totalCapital: bigint;
  activeCredit: bigint;
  yieldDistributed: bigint;
  utilization: number;
  health: number;
}

export function MarketOverviewStrip({ 
  totalCapital, 
  activeCredit, 
  yieldDistributed, 
  utilization,
  health
}: MarketOverviewStripProps) {
  const stats = [
    {
      label: 'Market Liquidity',
      value: `$${formatUsdc(totalCapital, 0)}`,
      icon: Shield,
      color: 'text-emerald-400'
    },
    {
      label: 'Active Credit',
      value: `$${formatUsdc(activeCredit, 0)}`,
      icon: BarChart,
      color: 'text-amber-400'
    },
    {
      label: 'Structural Utilization',
      value: `${utilization.toFixed(2)}%`,
      icon: Activity,
      color: 'text-blue-400'
    },
    {
      label: 'Repayment Health',
      value: `${health.toFixed(1)}%`,
      icon: HeartPulse,
      color: 'text-emerald-400'
    },
    {
      label: 'Yield Distributed',
      value: `$${formatUsdc(yieldDistributed, 0)}`,
      icon: TrendingUp,
      color: 'text-purple-400'
    }
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 overflow-hidden rounded-xl border border-white/[0.08] backdrop-blur-md bg-white/[0.03] divide-x divide-white/[0.06]">
      {stats.map((stat) => (
        <div key={stat.label} className="group px-6 py-5 transition-colors hover:bg-white/[0.02]">
          <div className="flex items-center gap-2 mb-2">
            <stat.icon className={`h-3 w-3 ${stat.color} opacity-40 group-hover:opacity-100 transition-opacity`} />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">{stat.label}</span>
          </div>
          <div className="font-mono text-xl font-medium text-white/90 tabular-nums">
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
