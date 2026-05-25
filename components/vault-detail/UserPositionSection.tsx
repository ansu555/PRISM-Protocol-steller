'use client';

import { Wallet, TrendingUp, PieChart, ArrowUpRight } from 'lucide-react';
import { formatUsdc } from '@/app/lib/format';
import { TrancheKind } from '@/app/lib/constants';

interface UserPositionSectionProps {
  positions: {
    kind: TrancheKind;
    label: string;
    balance: bigint;
    valueUsdc: bigint;
    yieldAccrued: bigint;
    color: string;
  }[];
}

export function UserPositionSection({ positions }: UserPositionSectionProps) {
  const totalValue = positions.reduce((acc, p) => acc + p.valueUsdc, 0n);
  const totalYield = positions.reduce((acc, p) => acc + p.yieldAccrued, 0n);

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-4 w-4 text-white/40" />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">My Allocation Strategy</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Overall Summary */}
        <div className="lg:col-span-4 p-8 rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-md relative overflow-hidden group">
           <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
           
           <div className="relative space-y-8">
              <div>
                 <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/20 mb-1">Total Position Value</div>
                 <div className="font-mono text-4xl font-bold text-white tracking-tighter tabular-nums">
                   ${formatUsdc(totalValue, 2)}
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-white/20 mb-1">Total Yield</div>
                    <div className="font-mono text-xl text-emerald-400 font-medium">+${formatUsdc(totalYield, 2)}</div>
                 </div>
                 <div>
                    <div className="font-mono text-[9px] uppercase tracking-widest text-white/20 mb-1">Unrealized PnL</div>
                    <div className="font-mono text-xl text-white/60 font-medium">1.2%</div>
                 </div>
              </div>

              <button className="w-full flex items-center justify-between px-5 py-4 rounded-xl bg-white/[0.05] border border-white/[0.10] font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/[0.08] transition-all group">
                 Manage Portfolio
                 <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
           </div>
        </div>

        {/* Tranche Breakdown */}
        <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
           {positions.map((p) => (
             <div key={p.kind} className="p-6 rounded-xl border border-white/[0.08] bg-white/[0.02] flex flex-col justify-between hover:bg-white/[0.03] transition-colors">
                <div>
                   <div className="flex items-center gap-2 mb-4">
                      <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">{p.label}</span>
                   </div>
                   <div className="font-mono text-xl text-white/90 tabular-nums">
                     {p.valueUsdc > 0n ? `$${formatUsdc(p.valueUsdc, 2)}` : '—'}
                   </div>
                   <div className="mt-1 font-mono text-[9px] uppercase tracking-widest text-white/20">
                     {formatUsdc(p.balance, 2)} Shares
                   </div>
                </div>

                <div className="mt-6 pt-4 border-t border-white/[0.04] flex items-center justify-between">
                   <div className="font-mono text-[9px] uppercase text-white/20">Accrued</div>
                   <div className="font-mono text-[11px] text-emerald-400/80">+${formatUsdc(p.yieldAccrued, 2)}</div>
                </div>
             </div>
           ))}
        </div>
      </div>
    </section>
  );
}
