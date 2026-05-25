'use client';

import {
  ShieldCheck,
  Zap,
  Lightbulb,
  ArrowRight,
  TrendingDown,
  AlertTriangle,
} from 'lucide-react';

interface DashboardSidebarProps {
  exposure: Array<{ label: string; value: number; color: string }>;
  insights: Array<{ text: string; type: 'info' | 'warning' | 'alert' }>;
}

export function DashboardSidebar({ insights = [] }: DashboardSidebarProps) {
  return (
    <aside className="space-y-2">
      <div className="rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04] divide-y divide-white/[0.06]">

        {/* Insights */}
        <section className="p-6 bg-white/[0.02]">
          <div className="flex items-center gap-2.5 mb-6">
            <Lightbulb className="h-4 w-4 text-amber-400/50" />
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Risk Engine Insights</h2>
          </div>

          <div className="space-y-3">
            {insights?.map((insight, i) => (
              <div
                key={i}
                className="flex gap-4 p-4 rounded-lg border border-white/[0.08] bg-white/[0.03] transition-all hover:bg-white/[0.025] cursor-pointer group"
              >
                <div className="mt-0.5 shrink-0">
                  {insight.type === 'info' && <Zap className="h-4 w-4 text-blue-400/50" />}
                  {insight.type === 'warning' && <TrendingDown className="h-4 w-4 text-amber-400/50" />}
                  {insight.type === 'alert' && <AlertTriangle className="h-4 w-4 text-red-400/50" />}
                </div>
                <p className="text-sm leading-relaxed text-white/45 group-hover:text-white/75 transition-colors">
                  {insight.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Commands */}

        <section className="p-6">
          <div className="flex items-center gap-2.5 mb-6">
            <ShieldCheck className="h-4 w-4 text-white/35" />
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Quick Commands</h2>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {[
              { label: 'Rebalance Allocation', href: '/earn' },
              { label: 'Access Credit Line',   href: '/borrow' },
              { label: 'Export Risk Report',   href: '#' },
            ].map((action) => (
              <button
                key={action.label}
                className="w-full flex items-center justify-between p-4 rounded-lg border border-white/[0.06] hover:bg-white/5 transition-colors group"
              >
                <span className="font-mono text-sm text-white/55 uppercase tracking-wide group-hover:text-white/85">
                  {action.label}
                </span>
                <ArrowRight className="h-4 w-4 text-white/15 group-hover:text-white/45 transition-colors group-hover:translate-x-0.5" />
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="px-4 py-5 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/12 leading-relaxed">
          PRISM INTEL SYSTEM V4.1.2<br />
          ENCRYPTED SESSION ACTIVE<br />
          LAST ENGINE SYNC: {new Date().toLocaleTimeString()}
        </p>
      </div>
    </aside>
  );
}
