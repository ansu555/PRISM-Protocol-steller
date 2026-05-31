'use client';

import { useEffect } from 'react';
import { useVaultState } from '@/hooks/useVaultState';
import { usePrismData } from '@/hooks/usePrismData';
import { VAULT_ID, TrancheKind } from '@/app/lib/constants';
import { formatUsdc, formatNavQ } from '@/app/lib/format';
import { EventTickerPanel } from '@/components/simulation/EventTickerPanel';
import { SimulationConsole } from '@/components/simulation/SimulationConsole';
import { 
  Activity, 
  BarChart3, 
  Database, 
  ShieldCheck, 
  Zap, 
  ArrowUpRight, 
  Layers3, 
  TrendingUp,
  Cpu
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SimulationPage() {
  useEffect(() => {
    document.title = 'Protocol Simulation | PRISM Protocol';
  }, []);
  const vaultState = useVaultState(VAULT_ID);
  const prismData = usePrismData(VAULT_ID);

  const stats = [
    { label: 'Total Vault TVL', value: formatUsdc(vaultState.data?.reserveBalance ?? 0n), icon: Database, color: 'text-blue-400' },
    { label: 'Protocol Liquidity', value: formatUsdc(prismData.poolLiquidity), icon: Zap, color: 'text-amber-400' },
    { label: 'Total Yield Distributed', value: formatUsdc(prismData.yieldDistributed), icon: TrendingUp, color: 'text-emerald-400' },
    { label: 'Vault Capital Ratio', value: '112.4%', icon: ShieldCheck, color: 'text-purple-400' },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-[#050505] p-6 lg:p-10 scrollbar-hide">
      <div className="mx-auto max-w-[1440px] space-y-10">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-8 border-b border-white/10 pb-10">
          <div className="relative">
            <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.4em] text-white/30">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Node Status: SOROBAN-RPC-PRISM-01
            </div>
            <h1 className="font-display text-6xl tracking-tight text-white italic drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
               PRISM <span className="text-white/20">/</span> LIVE
            </h1>
            <p className="mt-4 font-mono text-sm uppercase tracking-widest text-white/40">
               Institutional Risk & Liquidity Simulation Terminal
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-3">
             <div className="flex gap-4">
                <div className="rounded-sm border border-emerald-500/20 bg-emerald-500/5 px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400 backdrop-blur-md">
                  System: Operational
                </div>
                <div className="rounded-sm border border-white/10 bg-white/5 px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-white/40 backdrop-blur-md">
                  Epoch: 421.08
                </div>
             </div>
             <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/10">
                Last Heartbeat: {new Date().toLocaleTimeString()}
             </div>
          </div>
        </header>

        {/* Top Metrics Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="group relative overflow-hidden rounded-md border border-white/10 bg-white/[0.02] p-7 transition-all hover:bg-white/[0.04] hover:border-white/20">
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className={cn("rounded-full p-2 bg-white/5", stat.color)}>
                     <stat.icon className="h-5 w-5" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-white/10 group-hover:text-white/40 transition-colors" />
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">{stat.label}</div>
                  <div className="mt-1 font-mono text-3xl font-bold text-white tracking-tighter italic">{stat.value}</div>
                </div>
              </div>
              <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-white/[0.01] blur-2xl transition-transform group-hover:scale-150" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_440px]">
          <div className="space-y-12">
            {/* Soroban flow charts */}
            <section className="space-y-6">
               <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                     <BarChart3 className="h-4 w-4 text-pink-500/50" />
                     Real-Time Capital Flows (7D)
                  </div>
                  <div className="flex gap-4 font-mono text-[9px] uppercase text-white/20">
                     <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Inflow</span>
                     <span className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-pink-500" /> Yield</span>
                  </div>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="rounded-md border border-white/10 bg-white/[0.01] p-8 space-y-8 backdrop-blur-sm">
                     <div className="flex justify-between items-end">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">Lp Yield Velocity</div>
                        <div className="font-mono text-xl text-emerald-400 font-bold tracking-tight">+18.4%</div>
                     </div>
                     <div className="h-32 w-full flex items-end gap-1.5 px-1">
                        {[30, 45, 20, 60, 35, 75, 40, 90, 55, 30, 80, 50, 65, 45, 95, 70, 40, 60, 30, 85].map((h, i) => (
                           <div 
                             key={i} 
                             className="flex-1 bg-gradient-to-t from-blue-500/40 to-blue-500/10 rounded-t-[1px] transition-all hover:from-blue-400"
                             style={{ height: `${h}%` }}
                           />
                        ))}
                     </div>
                  </div>
                  <div className="rounded-md border border-white/10 bg-white/[0.01] p-8 space-y-8 backdrop-blur-sm">
                     <div className="flex justify-between items-end">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">Borrower Utilization</div>
                        <div className="font-mono text-xl text-pink-400 font-bold tracking-tight">84.2%</div>
                     </div>
                     <div className="h-32 w-full flex items-end gap-1.5 px-1">
                        {[60, 70, 85, 40, 65, 90, 50, 75, 45, 60, 35, 80, 55, 40, 70, 85, 50, 95, 60, 40].map((h, i) => (
                           <div 
                             key={i} 
                             className="flex-1 bg-gradient-to-t from-pink-500/40 to-pink-500/10 rounded-t-[1px] transition-all hover:from-pink-400"
                             style={{ height: `${h}%` }}
                           />
                        ))}
                     </div>
                  </div>
               </div>
            </section>

            {/* Tranche Matrix */}
            <section className="space-y-6">
              <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                <Layers3 className="h-4 w-4 text-emerald-500/50" />
                Capital Structure Matrix
              </div>
              <div className="overflow-hidden rounded-md border border-white/10 bg-white/[0.01] backdrop-blur-md">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="border-b border-white/10 bg-white/[0.03] text-white/30">
                    <tr>
                      <th className="px-8 py-5 font-medium uppercase tracking-[0.2em]">Tranche Node</th>
                      <th className="px-8 py-5 font-medium uppercase tracking-[0.2em]">NAV/Share</th>
                      <th className="px-8 py-5 font-medium uppercase tracking-[0.2em]">Utilization</th>
                      <th className="px-8 py-5 font-medium uppercase tracking-[0.2em]">Total Assets</th>
                      <th className="px-8 py-5 font-medium uppercase tracking-[0.2em] text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-white/70">
                    {vaultState.isLoading ? (
                      [...Array(3)].map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={5} className="px-8 py-6 h-20 bg-white/[0.01]" />
                        </tr>
                      ))
                    ) : vaultState.data?.tranches.map((tranche) => (
                      <tr key={tranche.kind} className="group hover:bg-white/[0.02] transition-all">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className={cn(
                              "h-2 w-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)]",
                              tranche.kind === TrancheKind.Prime ? "bg-blue-400" :
                              tranche.kind === TrancheKind.Core ? "bg-amber-400" : "bg-red-400 shadow-red-500/50"
                            )} />
                            <span className="font-bold uppercase tracking-widest text-white group-hover:text-pink-400 transition-colors">{tranche.label}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 tabular-nums">{formatNavQ(tranche.navPerShareQ)}</td>
                        <td className="px-8 py-6">
                           <div className="flex items-center gap-3">
                             <div className="h-1.5 w-20 bg-white/5 rounded-full overflow-hidden">
                               <div className="h-full bg-white/20 transition-all duration-1000" style={{ width: `${Math.min(Number(tranche.totalAssets) / 1000000, 100)}%` }} />
                             </div>
                             <span className="text-[10px] text-white/40">{(Number(tranche.totalAssets) / 10000).toFixed(1)}%</span>
                           </div>
                        </td>
                        <td className="px-8 py-6 tabular-nums font-bold text-white/90">{formatUsdc(tranche.totalAssets)}</td>
                        <td className="px-8 py-6 text-right">
                          <span className="rounded-sm bg-emerald-500/10 px-3 py-1 text-[9px] uppercase tracking-widest text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            Nominal
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Simulation Log / Console */}
            <div className="space-y-6">
               <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
                  <Activity className="h-4 w-4 text-blue-500/50" />
                  Kernel Audit Trace
               </div>
               <SimulationConsole />
            </div>
          </div>

          <aside className="space-y-10">
            {/* Live Event Ticker */}
            <div className="sticky top-10 space-y-10">
               <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-b from-pink-500/20 to-blue-500/20 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000" />
                  <EventTickerPanel />
               </div>
               
               <div className="rounded-md border border-white/10 bg-white/[0.01] p-10 space-y-8 backdrop-blur-xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4">
                    <Database className="h-10 w-10 text-white/[0.02]" />
                 </div>
                 
                 <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30 border-b border-white/5 pb-4">Network Environment</div>
                 
                 <div className="space-y-6">
                    <div className="flex justify-between items-end group">
                       <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest group-hover:text-white/40 transition-colors">DKG SYNC</span>
                       <span className="font-mono text-[10px] text-emerald-400 font-bold tracking-widest">SYNCHRONIZED</span>
                    </div>
                    <div className="flex justify-between items-end group">
                       <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest group-hover:text-white/40 transition-colors">ORACLE FEED</span>
                       <span className="font-mono text-[10px] text-emerald-400 font-bold tracking-widest">ACTIVE</span>
                    </div>
                    <div className="flex justify-between items-end group">
                       <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest group-hover:text-white/40 transition-colors">MEMPOOL LOAD</span>
                       <span className="font-mono text-[10px] text-white/40 tracking-widest uppercase">LOW (12 TPS)</span>
                    </div>
                    <div className="flex justify-between items-end group">
                       <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest group-hover:text-white/40 transition-colors">KERNEL VERSION</span>
                       <span className="font-mono text-[10px] text-pink-500/50 tracking-widest uppercase">v2.4.1-BETA</span>
                    </div>
                 </div>

                 <div className="pt-10">
                    <div className="p-4 rounded-sm bg-white/[0.03] border border-white/5">
                       <p className="font-mono text-[9px] uppercase leading-relaxed text-white/30 italic tracking-tight">
                         PRISM-SIM-ENGINE: Cryptographically verified telemetry stream. All figures represent live on-chain state derivatives.
                       </p>
                    </div>
                 </div>
               </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
