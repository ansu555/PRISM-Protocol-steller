'use client';

import { BarChart, TrendingUp, Calendar } from 'lucide-react';

export function PerformanceAnalytics() {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'];
  const values = [4.2, 5.1, 4.8, 6.2, 5.8, 7.1];
  const max = Math.max(...values);

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart className="h-4 w-4 text-white/40" />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">Historical Performance</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Chart Card */}
        <div className="lg:col-span-8 p-8 rounded-xl border border-white/[0.08] bg-white/[0.03]">
           <div className="flex items-center justify-between mb-12">
              <div>
                 <div className="font-mono text-[9px] uppercase tracking-widest text-white/20 mb-1">Trailing 6M Returns</div>
                 <div className="font-mono text-xl text-white/90">Institutional Yield Index</div>
              </div>
              <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-400 opacity-60" />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">Prime</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-400 opacity-60" />
                    <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">Core</span>
                 </div>
              </div>
           </div>

           <div className="flex items-end justify-between h-48 gap-4 px-4">
              {values.map((v, i) => (
                <div key={months[i]} className="flex-1 flex flex-col items-center gap-4 group">
                  <div className="relative w-full flex flex-col justify-end h-full">
                     <div 
                        className="w-full bg-gradient-to-t from-white/[0.02] to-white/[0.10] rounded-t-lg transition-all duration-700 group-hover:to-white/20" 
                        style={{ height: `${(v / max) * 100}%` }}
                     />
                     <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity font-mono text-[10px] text-white">
                        {v}%
                     </div>
                  </div>
                  <span className="font-mono text-[9px] text-white/20 tracking-widest">{months[i]}</span>
                </div>
              ))}
           </div>
        </div>

        {/* Analytics Breakdown */}
        <div className="lg:col-span-4 space-y-6">
           <div className="p-6 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <Calendar className="h-4 w-4 text-white/20" />
                 <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Track Record</span>
              </div>
              <span className="font-mono text-[11px] text-white/80 uppercase">182 Days</span>
           </div>

           <div className="p-8 rounded-xl border border-white/[0.08] bg-white/[0.03] flex-1">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20 mb-6">Efficiency metrics</div>
              <div className="space-y-6">
                 <div className="flex justify-between items-end border-b border-white/[0.04] pb-4">
                    <span className="font-mono text-[10px] uppercase text-white/40">Sharpe Ratio</span>
                    <span className="font-mono text-lg text-white">2.4</span>
                 </div>
                 <div className="flex justify-between items-end border-b border-white/[0.04] pb-4">
                    <span className="font-mono text-[10px] uppercase text-white/40">Max Drawdown</span>
                    <span className="font-mono text-lg text-emerald-400">0.8%</span>
                 </div>
                 <div className="flex justify-between items-end">
                    <span className="font-mono text-[10px] uppercase text-white/40">Recovery Time</span>
                    <span className="font-mono text-lg text-white">2 Epochs</span>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </section>
  );
}
