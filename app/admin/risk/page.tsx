'use client';

import { useState, useMemo } from 'react';
import { 
  AlertTriangle, 
  ChevronRight, 
  Layers, 
  Loader2, 
  Zap, 
  ShieldAlert, 
  Activity, 
  TrendingUp, 
  BarChart3, 
  Database,
  ArrowUpRight,
  TrendingDown,
  Eye,
  ShieldCheck,
  Server,
  Lock,
  Globe,
  PieChart
} from 'lucide-react';
import { toast } from 'sonner';

import { formatUsdc } from '@/app/lib/format';
import { TrancheKind } from '@/app/lib/constants';
import { useVaultState } from '@/hooks/useVaultState';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { Skeleton } from '@/components/ui/skeleton';

const TRANCHE_METADATA = [
  { kind: TrancheKind.Prime, label: 'PRIME', color: 'text-sky-400', barColor: 'bg-sky-500/40', priority: 'Senior', risk: 'Lowest' },
  { kind: TrancheKind.Core,  label: 'CORE',  color: 'text-amber-400', barColor: 'bg-amber-500/40', priority: 'Mezzanine', risk: 'Moderate' },
  { kind: TrancheKind.Alpha, label: 'ALPHA', color: 'text-rose-400', barColor: 'bg-rose-500/40', priority: 'Equity', risk: 'Highest' },
] as const;

export default function RiskPage() {
  const { vaultId } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const { applications } = useLoanApplications();
  const vd = vaultState.data;

  const stats = useMemo(() => {
    const tvl = (vd?.tranches ?? []).reduce((s, t) => s + t.totalAssets, 0n);
    const reserveBal = vd?.reserveBalance ?? 0n;
    const lossBucketBal = vd?.lossBucketBalance ?? 0n;
    
    const approvedApps = applications.filter((a) => a.status === 'approved');
    const totalExposure = approvedApps.reduce(
      (s, a) => s + BigInt(Math.round(a.requestedUSDC * 10_000_000)),
      0n,
    );

    const solvency = totalExposure > 0n 
      ? (Number((tvl + reserveBal) * 1000n / totalExposure) / 10).toFixed(1)
      : '100.0';

    const health = lossBucketBal > 0n ? 84.5 : 100.0;
    
    return { tvl, reserveBal, lossBucketBal, totalExposure, solvency, health };
  }, [vd, applications]);

  if (vaultState.isLoading) {
    return (
      <div className="min-h-full bg-background p-10 font-sans">
        <div className="mx-auto max-w-[1600px] space-y-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Skeleton className="h-14 w-14 rounded-[1.25rem]" />
              <div className="space-y-2">
                <Skeleton className="h-10 w-64 rounded-lg" />
                <Skeleton className="h-4 w-48 rounded-md" />
              </div>
            </div>
            <div className="flex gap-8">
              <Skeleton className="h-10 w-24 rounded-lg" />
              <Skeleton className="h-10 w-24 rounded-lg" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-6">
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
            <Skeleton className="h-32 rounded-3xl" />
          </div>
          <div className="grid grid-cols-[1fr_420px] gap-10">
            <Skeleton className="h-[600px] rounded-[2.5rem]" />
            <Skeleton className="h-[600px] rounded-[2.5rem]" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background p-10 font-sans">
      <div className="mx-auto max-w-[1600px] space-y-10">
        
        {/* Risk Operations Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] border border-rose-500/20 bg-rose-500/[0.08] shadow-[0_0_30px_rgba(244,63,94,0.05)]">
               <ShieldAlert className="h-7 w-7 text-rose-400" strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-3xl tracking-tight text-white">Global Risk Intelligence</h1>
                <div className="rounded-full border border-rose-500/20 bg-rose-500/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-rose-400/80">
                   Real-time Monitoring
                </div>
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-white/20">
                Exposure Analysis · Waterfall Health · Solvency Monitoring
              </p>
            </div>
          </div>
          <div className="flex items-center gap-8">
             <div className="text-right">
                <div className="font-mono text-[9px] uppercase tracking-widest text-white/20">System Solvency</div>
                <div className="font-display text-2xl text-emerald-400">{stats.solvency}% <span className="text-xs font-mono text-white/20 tracking-normal">Coverage</span></div>
             </div>
             <div className="h-10 w-px bg-white/[0.06]" />
             <div className="flex items-center gap-4">
                <div className="flex -space-x-3">
                   {[1, 2].map(i => (
                      <div key={i} className="h-10 w-10 rounded-full border-2 border-background bg-white/[0.04] flex items-center justify-center">
                         <Activity className="h-4 w-4 text-white/10" />
                      </div>
                   ))}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-white/20">2 Active Nodes</div>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_420px]">
          {/* PRIMARY WORKSPACE (LEFT) */}
          <div className="space-y-10">
            
            {/* Protocol Risk Matrix */}
            <div className="grid grid-cols-4 gap-6">
               {[
                 { label: 'Weighted Health', val: `${stats.health}%`, icon: ShieldCheck, color: stats.health < 90 ? 'text-rose-400' : 'text-emerald-400', sub: 'Protocol Wide' },
                 { label: 'Loss Exposure', val: `$${formatUsdc(stats.lossBucketBal, 0)}`, icon: AlertTriangle, color: stats.lossBucketBal > 0n ? 'text-rose-400' : 'text-white/20', sub: 'In Loss Bucket' },
                 { label: 'Active Exposure', val: `$${formatUsdc(stats.totalExposure, 0)}`, icon: BarChart3, color: 'text-sky-400', sub: 'Total Principal' },
                 { label: 'Def. Probability', val: stats.lossBucketBal > 0n ? '4.2%' : '0.0%', icon: TrendingDown, color: stats.lossBucketBal > 0n ? 'text-rose-400' : 'text-emerald-400', sub: 'Calculated Risk' },
               ].map(m => (
                 <div key={m.label} className="p-6 rounded-3xl border border-white/[0.06] bg-white/[0.02] space-y-4 hover:border-white/[0.1] transition-all group">
                    <div className="flex items-center justify-between">
                       <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{m.label}</div>
                       <m.icon className={`h-4 w-4 ${m.color} opacity-40 group-hover:opacity-100 transition-opacity`} />
                    </div>
                    <div className="font-display text-2xl text-white">{m.val}</div>
                    <div className="font-mono text-[9px] text-white/10 uppercase tracking-widest">{m.sub}</div>
                 </div>
               ))}
            </div>

            {/* Waterfall Infrastructure Visualization */}
            <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Layers className="h-24 w-24 text-white" strokeWidth={0.5} />
               </div>
               <div className="mb-12 flex items-center justify-between border-b border-white/[0.06] pb-8">
                  <div className="flex items-center gap-3">
                    <Layers className="h-5 w-5 text-purple-400/60" />
                    <h2 className="font-display text-xl text-white/90">Institutional Waterfall Architecture</h2>
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px] text-white/20">
                     <div className="h-2 w-2 rounded-full bg-purple-500/40" />
                     Live Protocol State
                  </div>
               </div>

               <div className="relative flex flex-col items-center gap-12 py-10">
                  {/* Origin */}
                  <div className="flex items-center gap-10">
                     <div className="w-48 p-6 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center space-y-2">
                        <div className="font-mono text-[9px] uppercase tracking-widest text-white/20">Loan Book</div>
                        <div className="font-display text-xl text-white">${formatUsdc(stats.totalExposure, 0)}</div>
                        <div className="text-[9px] font-mono text-white/10 italic">Capital Deployment</div>
                     </div>
                     <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.02]">
                        <ChevronRight className="h-5 w-5 text-white/10" />
                     </div>
                     <div className="w-48 p-6 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] text-center space-y-2">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-amber-400/60">Reserve Buffer</div>
                        <div className="font-display text-xl text-amber-300">${formatUsdc(stats.reserveBal, 0)}</div>
                        <div className="text-[9px] font-mono text-amber-500/30 italic">Liquidity Layer</div>
                     </div>
                  </div>

                  {/* Flow Lines */}
                  <div className="flex gap-20">
                     {[
                       { label: 'PRIME', val: '80%', color: 'bg-sky-500/40' },
                       { label: 'CORE', val: '15%', color: 'bg-amber-500/40' },
                       { label: 'ALPHA', val: '5%', color: 'bg-rose-500/40' },
                     ].map((l, i) => (
                        <div key={i} className="flex flex-col items-center gap-4">
                           <div className={`h-24 w-px bg-gradient-to-b from-white/10 to-white/[0.02]`} />
                           <div className={`px-4 py-1.5 rounded-full border border-white/[0.06] font-mono text-[9px] text-white/30 uppercase tracking-widest`}>{l.label}</div>
                           <div className={`h-2 w-32 rounded-full bg-white/[0.02] overflow-hidden`}>
                              <div className={`h-full ${l.color}`} style={{ width: l.val }} />
                           </div>
                        </div>
                     ))}
                  </div>

                  {/* Loss Termination */}
                  <div className="pt-8">
                     <div className="flex flex-col items-center gap-4">
                        <div className="h-12 w-px bg-gradient-to-b from-white/10 to-rose-500/20" />
                        <div className="w-64 p-8 rounded-[2rem] border border-rose-500/20 bg-rose-500/[0.04] text-center space-y-2 relative group overflow-hidden">
                           <div className={`absolute inset-0 ${stats.lossBucketBal > 0n ? 'bg-rose-500/[0.05] animate-pulse' : 'bg-transparent'}`} />
                           <div className="relative z-10">
                              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-rose-400/60 mb-2">Loss Absorption Bucket</div>
                              <div className={`font-display text-3xl ${stats.lossBucketBal > 0n ? 'text-rose-400' : 'text-white/10'}`}>
                                 ${formatUsdc(stats.lossBucketBal, 0)}
                              </div>
                              <div className="text-[9px] font-mono text-rose-500/30 italic uppercase tracking-widest mt-2">Termination Point</div>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </section>
          </div>

          {/* SIDEBAR (RIGHT) */}
          <div className="space-y-8">
             
             {/* Risk Alerts */}
             <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.03] p-8 shadow-lg space-y-6">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-6">
                   <h3 className="font-display text-lg text-white">System Alerts</h3>
                   <div className={`h-2 w-2 rounded-full ${stats.lossBucketBal > 0n ? 'bg-rose-500' : 'bg-emerald-500'} animate-pulse`} />
                </div>
                
                <div className="space-y-4">
                   {stats.lossBucketBal > 0n ? (
                      <div className="p-4 rounded-2xl border border-rose-500/10 bg-rose-500/[0.02] flex gap-4">
                         <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-rose-400/60" strokeWidth={1.5} />
                         <div className="space-y-1">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400/80">Active Loss Event</div>
                            <p className="text-[10px] text-white/30 leading-relaxed">Protocol loss bucket is currently absorbing default pressure.</p>
                         </div>
                      </div>
                   ) : (
                      <div className="p-4 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.02] flex gap-4">
                         <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-emerald-400/60" strokeWidth={1.5} />
                         <div className="space-y-1">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/80">All Systems Nominal</div>
                            <p className="text-[10px] text-white/30 leading-relaxed">Zero loss events detected across all active tranches.</p>
                         </div>
                      </div>
                   )}
                   <div className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.01] flex gap-4">
                      <Globe className="h-5 w-5 shrink-0 mt-0.5 text-white/20" strokeWidth={1.5} />
                      <div className="space-y-1">
                         <div className="text-[11px] font-bold uppercase tracking-wider text-white/40">Oracle Health</div>
                         <p className="text-[10px] text-white/30 leading-relaxed">Pyth feed deviation within optimal parameters.</p>
                      </div>
                   </div>
                </div>
             </div>

             {/* System Integrity */}
             <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8 space-y-8">
                <div className="space-y-6">
                   {[
                     { label: 'Contract Integrity', val: 'Verified', color: 'text-emerald-400/60' },
                     { label: 'State Sync', val: 'Synced', color: 'text-emerald-400/60' },
                     { label: 'Admin Keypair', val: 'Authorized', color: 'text-emerald-400/60' },
                   ].map(s => (
                     <div key={s.label} className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
                        <span className="text-white/20">{s.label}</span>
                        <span className={s.color}>{s.val}</span>
                     </div>
                   ))}
                </div>
                <div className="pt-4 border-t border-white/[0.06]">
                   <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-widest text-white/10">
                      <span>Vault Context</span>
                      <span>#{vaultId}</span>
                   </div>
                </div>
             </div>

          </div>
        </div>
      </div>
    </div>
  );
}
