'use client';

import { useState, useMemo } from 'react';
import { 
  Coins, 
  Droplets, 
  Layers, 
  TrendingUp, 
  ArrowDownToLine, 
  Activity, 
  ArrowUpRight, 
  ShieldCheck, 
  BarChart3, 
  Database,
  RefreshCw,
  Zap,
  Globe,
  Lock,
  Search,
  Server,
  Loader2
} from 'lucide-react';
import { useWallet, useConnection } from '@/components/providers/stellar-wallet-context';
import { toast } from 'sonner';

import { formatUsdc } from '@/app/lib/format';
import { useVaultState } from '@/hooks/useVaultState';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { Skeleton } from '@/components/ui/skeleton';

export default function CapitalPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { vaultId, addLog } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const { applications } = useLoanApplications();

  const [localLog, setLocalLog] = useState<string[]>([]);
  const [faucetAmount, setFaucetAmount] = useState('100000');
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const vd = vaultState.data;
    const tvl = (vd?.tranches ?? []).reduce((s, t) => s + t.totalAssets, 0n);
    const reserveBal = vd?.reserveBalance ?? 0n;
    
    const approvedApps = applications.filter((a) => a.status === 'approved');
    const totalExposure = approvedApps.reduce(
      (s, a) => s + BigInt(Math.round(a.requestedUSDC * 1_000_000)),
      0n,
    );

    const utilization = (tvl + reserveBal) > 0n 
      ? (Number(totalExposure * 10000n / (tvl + reserveBal)) / 100).toFixed(1)
      : '0.0';

    const accruedYield = (vd?.tranches ?? []).reduce((s, t) => s + t.cumulativeYield, 0n);

    return { tvl, reserveBal, totalExposure, utilization, accruedYield };
  }, [vaultState.data, applications]);

  if (vaultState.isLoading) {
    return (
      <div className="min-h-full bg-background p-10 font-sans">
        <div className="mx-auto max-w-[1600px] space-y-10">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-10 w-64 rounded-lg" />
              <Skeleton className="h-4 w-48 rounded-md" />
            </div>
            <div className="flex gap-8">
              <Skeleton className="h-10 w-32 rounded-lg" />
              <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
          </div>
          <Skeleton className="h-96 rounded-[2.5rem]" />
          <div className="grid grid-cols-2 gap-10">
            <Skeleton className="h-80 rounded-[2.5rem]" />
            <Skeleton className="h-80 rounded-[2.5rem]" />
          </div>
        </div>
      </div>
    );
  }

  function log(msg: string) {
    const ts = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLocalLog((p) => [ts, ...p].slice(0, 20));
    addLog(msg);
  }

  async function mintFaucet() {
    if (!wallet.connected) { toast.error('Connect wallet'); return; }
    setBusy(true);
    try {
      throw new Error('Not yet migrated to Stellar — use the simulation panel instead.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ Injection Failure: ${msg}`);
      toast.error(`Mint failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-background p-10 font-sans">
      <div className="mx-auto max-w-[1600px] space-y-10">
        
        {/* Operations Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-3xl tracking-tight text-white">Global Capital Operations</h1>
                <div className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400/80">
                   Active Mint Authority
                </div>
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-white/20">
                Liquidity Injection · Treasury Management · Flow Optimization
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
             <div className="text-right">
                <div className="font-mono text-[9px] uppercase tracking-widest text-white/20">Protocol Liquidity</div>
                <div className="font-display text-2xl text-white">${formatUsdc(stats.tvl, 0)}</div>
             </div>
             <div className="h-10 w-px bg-white/[0.06]" />
             <div className="flex items-center gap-3">
                <button 
                  onClick={() => vaultState.refetch()}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.02] text-white/20 hover:text-white/50 transition-all"
                >
                   <RefreshCw className={`h-4 w-4 ${vaultState.isFetching ? 'animate-spin' : ''}`} />
                </button>
                <button className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-all">
                   <ArrowUpRight className="h-3.5 w-3.5" />
                   Explorer
                </button>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_400px]">
          {/* PRIMARY WORKSPACE (LEFT) */}
          <div className="space-y-10">
            
            {/* System-Wide Liquidity Flow */}
            <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <TrendingUp className="h-24 w-24 text-white" strokeWidth={0.5} />
               </div>
               <div className="mb-10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-purple-400/60" />
                    <h2 className="font-display text-xl text-white/90">System-Wide Liquidity Flow</h2>
                  </div>
               </div>

               <div className="grid grid-cols-3 gap-8">
                  {[
                    { label: 'Active Exposure', value: `$${formatUsdc(stats.totalExposure, 0)}`, sub: 'Current Debt', color: 'text-white' },
                    { label: 'Utilization', value: `${stats.utilization}%`, sub: 'Capital Efficiency', color: 'text-sky-400' },
                    { label: 'Accrued Yield', value: `$${formatUsdc(stats.accruedYield, 0)}`, sub: 'Protocol Total', color: 'text-emerald-400' },
                  ].map(m => (
                    <div key={m.label} className="p-8 rounded-3xl border border-white/[0.04] bg-white/[0.01] space-y-4">
                       <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">{m.label}</div>
                       <div className={`font-display text-4xl ${m.color}`}>{m.value}</div>
                       <div className="font-mono text-[9px] uppercase tracking-widest text-white/10">{m.sub}</div>
                    </div>
                  ))}
               </div>
            </section>

            {/* Capital Injection Module */}
            <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10 shadow-sm">
               <div className="mb-10 flex items-center justify-between border-b border-white/[0.06] pb-8">
                  <div className="flex items-center gap-3">
                    <Droplets className="h-5 w-5 text-sky-400/60" />
                    <h2 className="font-display text-xl text-white/90">Capital Injection Module</h2>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/[0.05] border border-amber-500/10 font-mono text-[9px] uppercase tracking-widest text-amber-500/60">
                     <Lock className="h-3 w-3" />
                     Authorized Sequence Only
                  </div>
               </div>

               <div className="flex items-stretch gap-10">
                  <div className="flex-1 space-y-8">
                     <div className="space-y-3">
                        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20 pl-1">Injection Magnitude (USDC)</label>
                        <div className="relative group">
                           <input
                             type="text"
                             value={faucetAmount}
                             onChange={(e) => setFaucetAmount(e.target.value)}
                             className="w-full rounded-2xl border border-white/[0.1] bg-white/[0.03] px-6 py-5 font-mono text-3xl text-white transition-all focus:border-emerald-500/40 focus:bg-white/[0.05] focus:outline-none placeholder:text-white/5"
                             placeholder="0.00"
                           />
                           <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-20 group-focus-within:opacity-100 transition-opacity">
                              <span className="font-mono text-xs text-white">USDC</span>
                              <div className="h-6 w-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                 <Coins className="h-3 w-3 text-emerald-400" />
                              </div>
                           </div>
                        </div>
                     </div>
                     <p className="text-[11px] text-white/20 italic leading-relaxed">
                        This operation invokes the on-chain mint authority to inject liquidity into the administrative controller wallet for devnet testing and seed deployment.
                     </p>
                  </div>
                  <div className="w-px bg-white/[0.06]" />
                  <div className="flex flex-col justify-center gap-4 w-64">
                     <button
                       onClick={mintFaucet}
                       disabled={busy || !wallet.connected}
                       className="group relative flex items-center justify-center gap-3 rounded-2xl bg-white px-6 py-5 text-sm font-bold text-black transition-all hover:bg-white/90 disabled:opacity-20 shadow-[0_0_40px_rgba(255,255,255,0.05)]"
                     >
                       {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                       <span className="uppercase tracking-[0.1em]">Authorize Mint</span>
                     </button>
                  </div>
               </div>
            </section>
          </div>

          {/* OPERATIONAL LOGS (RIGHT) */}
          <aside className="flex flex-col rounded-[2.5rem] border border-white/[0.08] bg-white/[0.03] p-8 shadow-lg overflow-hidden h-[740px]">
             <div className="mb-6 flex items-center justify-between border-b border-white/[0.06] pb-6">
                <h3 className="font-display text-lg text-white">Operational Ledger</h3>
                <Server className="h-4 w-4 text-white/10" />
             </div>
             
             <div className="flex-1 overflow-y-auto" data-app-scroll="true">
                {localLog.length === 0 ? (
                   <div className="h-full flex flex-col items-center justify-center text-center opacity-10 py-20">
                      <Database className="h-10 w-10 mb-4" strokeWidth={1} />
                      <div className="font-mono text-[9px] uppercase tracking-widest">Awaiting Sequence</div>
                   </div>
                ) : (
                   <div className="space-y-4 font-mono text-[10px]">
                      {localLog.map((l, i) => (
                        <div key={i} className="flex gap-3 text-white/40 leading-relaxed border-l border-white/[0.06] pl-4">
                           <span className="shrink-0 text-white/10">{localLog.length - i}</span>
                           <span className="break-all">{l}</span>
                        </div>
                      ))}
                   </div>
                )}
             </div>

             <div className="mt-8 pt-8 border-t border-white/[0.06]">
                <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-4">
                   <div className="flex items-center gap-3 mb-3">
                      <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-mono text-[9px] uppercase tracking-widest text-white/30">Admin Connectivity</span>
                   </div>
                   <div className="font-mono text-[10px] text-white/20 break-all">
                      {wallet.publicKey?.toBase58() || 'Disconnected'}
                   </div>
                </div>
             </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
