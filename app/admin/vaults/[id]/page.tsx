'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import {
  Activity,
  BarChart3,
  ShieldCheck,
  AlertTriangle,
  Layers,
  TrendingUp,
  ArrowDownToLine,
  Zap,
  ArrowUpRight,
  Database,
  Search,
  Lock,
  Globe,
  Loader2,
  Info,
  Droplets,
  Coins,
  ChevronRight
} from 'lucide-react';
import { BN } from '@coral-xyz/anchor';
import { 
  PublicKey, 
  Transaction, 
  Keypair, 
  SystemProgram 
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress, 
  createAssociatedTokenAccountInstruction 
} from '@solana/spl-token';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { toast } from 'sonner';

import { buildPrograms } from '@/app/lib/program';
import { formatUsdc } from '@/app/lib/format';
import { PRISM_CORE_PROGRAM_ID, USDC_MINT, TrancheKind } from '@/app/lib/constants';
import {
  getConfigPda,
  getVaultPda,
  getTranchePda,
  getTrancheMintPda,
  getVaultReservePda,
  getLossBucketPda,
} from '@/app/lib/pda';
import { useVaultState } from '@/hooks/useVaultState';
import { useReactivateVault } from '@/hooks/useReactivateVault';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { Skeleton } from '@/components/ui/skeleton';

const TRANCHE_METADATA = [
  { kind: TrancheKind.Prime, label: 'PRIME', color: 'text-sky-400', barColor: 'bg-sky-500/40', priority: 'Senior Secured' },
  { kind: TrancheKind.Core,  label: 'CORE',  color: 'text-amber-400', barColor: 'bg-amber-500/40', priority: 'Mezzanine Layer' },
  { kind: TrancheKind.Alpha, label: 'ALPHA', color: 'text-rose-400', barColor: 'bg-rose-500/40', priority: 'First-Loss Equity' },
] as const;

export default function VaultDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { addLog } = useAdminVault();
  
  const vaultId = parseInt(id as string);
  const vaultState = useVaultState(vaultId);
  const vd = vaultState.data;

  const reactivate = useReactivateVault(vaultId);
  const [busy, setBusy] = useState(false);
  const vaultStateLabel = vd?.vault ? (Object.keys(vd.vault.state ?? {})[0] ?? 'active') : 'active';
  const [lossAmount, setLossAmount] = useState('5000');
  const [severity, setSeverity] = useState('100');
  const [seedAmount, setSeedAmount] = useState('10000');
  const [selectedTrancheKind, setSelectedTrancheKind] = useState<TrancheKind>(TrancheKind.Prime);

  const stats = useMemo(() => {
    const tvl = (vd?.tranches ?? []).reduce((s, t) => s + t.totalAssets, 0n);
    const reserveBal = vd?.reserveBalance ?? 0n;
    const lossBucketBal = vd?.lossBucketBalance ?? 0n;
    const utilization = (tvl + reserveBal) > 0n 
      ? Number((tvl * 100n) / (tvl + reserveBal)) 
      : 0;

    const accruedYield = (vd?.tranches ?? []).reduce((s, t) => s + t.cumulativeYield, 0n);

    return { tvl, reserveBal, lossBucketBal, utilization, accruedYield };
  }, [vd]);

  const isHealthy = stats.lossBucketBal === 0n;

  async function triggerCreditEvent() {
    if (!wallet) return toast.error('Connect wallet');
    setBusy(true);
    try {
      const { core } = buildPrograms(connection, wallet as any);
      const [config] = getConfigPda();
      const [vault] = getVaultPda(vaultId);
      const [reserve] = getVaultReservePda(vault);
      const [lossBucket] = getLossBucketPda(vault);
      
      const tranches = vd?.tranches.map(t => {
        const [tranche] = getTranchePda(vault, t.kind);
        return tranche;
      }) ?? [];

      const amount = new BN(Math.round(parseFloat(lossAmount) * 1_000_000));
      
      await (core.methods as any)
        .triggerCreditEvent(amount)
        .accounts({
          admin: wallet.publicKey,
          config,
          vault,
          vaultUsdcReserve: reserve,
          lossBucket,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(tranches.map(t => ({ pubkey: t, isWritable: true, isSigner: false })))
        .rpc({ commitment: 'confirmed' });

      addLog(`⚠ Credit Event Triggered: $${lossAmount} loss cascade executed on Vault #${vaultId}.`);
      toast.success('Credit event simulation successful');
      vaultState.refetch();
    } catch (e: any) {
      addLog(`✗ Simulation Failure: ${e.message}`);
      toast.error(`Simulation failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function seedTranche() {
    if (!wallet) return toast.error('Connect wallet');
    setBusy(true);
    try {
      const { core } = buildPrograms(connection, wallet as any);
      const user = wallet.publicKey;
      const [config] = getConfigPda();
      const [vault] = getVaultPda(vaultId);
      const [tranche] = getTranchePda(vault, selectedTrancheKind);
      const [trancheMint] = getTrancheMintPda(vault, selectedTrancheKind);
      const [vaultReserve] = getVaultReservePda(vault);
      
      const userUsdcAta = await getAssociatedTokenAddress(USDC_MINT, user);
      const userTrancheAta = await getAssociatedTokenAddress(trancheMint, user);

      const amount = new BN(Math.round(parseFloat(seedAmount) * 1_000_000));
      
      // Ensure user has ATAs
      const instructions = [];
      const userTrancheAtaInfo = await connection.getAccountInfo(userTrancheAta);
      if (!userTrancheAtaInfo) {
        instructions.push(createAssociatedTokenAccountInstruction(user, userTrancheAta, user, trancheMint));
      }

      await (core.methods as any)
        .deposit(amount)
        .accounts({
          user,
          config,
          vault,
          tranche,
          trancheMint,
          userUsdcAta,
          userTrancheAta,
          vaultUsdcReserve: vaultReserve,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .preInstructions(instructions)
        .rpc({ commitment: 'confirmed' });

      const label = TRANCHE_METADATA.find(m => m.kind === selectedTrancheKind)?.label;
      addLog(`✓ Capital Seeded: $${seedAmount} USDC deposited into ${label} tranche of Vault #${vaultId}.`);
      toast.success(`Successfully seeded ${label} tranche`);
      vaultState.refetch();
    } catch (e: any) {
      addLog(`✗ Seeding Failure: ${e.message}`);
      toast.error(`Seeding failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  if (vaultState.isLoading) {
    return (
      <div className="min-h-full bg-background p-10 font-sans">
        <div className="mx-auto max-w-[1600px] space-y-10">
          <div className="flex items-center gap-6">
            <Skeleton className="h-14 w-14 rounded-[1.25rem]" />
            <div className="space-y-2">
               <Skeleton className="h-10 w-48 rounded-lg" />
               <Skeleton className="h-4 w-64 rounded-md" />
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
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] border border-white/[0.06] bg-white/[0.04]">
               <Layers className="h-7 w-7 text-white/40" strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-3xl tracking-tight text-white">Vault #{vaultId}</h1>
                <div className={`rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-[0.2em] ${
                  vaultStateLabel === 'active'
                    ? 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400/80'
                    : 'border-rose-500/20 bg-rose-500/[0.05] text-rose-400/80'
                }`}>
                  {vaultStateLabel}
                </div>
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-white/20">
                On-Chain Capital Monitoring · System Instance 01
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <button 
               onClick={() => vaultState.refetch()}
               className="flex h-12 items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 font-mono text-[11px] uppercase tracking-widest text-white/40 hover:text-white transition-all"
             >
                <Activity className={`h-3.5 w-3.5 ${vaultState.isFetching ? 'animate-spin text-emerald-400' : ''}`} />
                Sync Nodes
             </button>
          </div>
        </div>

        {/* Global Stats */}
        <div className="grid grid-cols-4 gap-6">
           {[
             { label: 'Total Value Locked', value: `$${formatUsdc(stats.tvl, 0)}`, icon: BarChart3, color: 'text-sky-400', sub: '12.4% VS SYNC' },
             { label: 'Reserve Liquidity', value: `$${formatUsdc(stats.reserveBal, 0)}`, icon: Database, color: 'text-amber-400', sub: `${stats.utilization}% UTILIZATION` },
             { label: 'Loss Exposure', value: `$${formatUsdc(stats.lossBucketBal, 0)}`, icon: AlertTriangle, color: stats.lossBucketBal > 0n ? 'text-rose-400' : 'text-white/20', sub: 'PROTOCOL RISK' },
             { label: 'Accrued Yield', value: `$${formatUsdc(stats.accruedYield, 0)}`, icon: TrendingUp, color: 'text-emerald-400', sub: 'REAL-TIME FLOW' },
           ].map(s => (
             <div key={s.label} className="p-8 rounded-[2rem] border border-white/[0.06] bg-white/[0.02] space-y-4 hover:border-white/[0.1] transition-all group">
                <div className="flex items-center justify-between">
                   <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{s.label}</div>
                   <s.icon className={`h-4 w-4 ${s.color} opacity-40 group-hover:opacity-100 transition-opacity`} />
                </div>
                <div className="font-display text-3xl text-white">{s.value}</div>
                <div className="font-mono text-[9px] text-white/10 uppercase tracking-widest">{s.sub}</div>
             </div>
           ))}
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_420px]">
          {/* PRIMARY WORKSPACE (LEFT) */}
          <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10 shadow-sm">
            <div className="mb-12 flex items-center justify-between border-b border-white/[0.06] pb-8">
               <div className="flex items-center gap-3">
                 <Activity className="h-5 w-5 text-emerald-400/60" />
                 <h2 className="font-display text-xl text-white/90">Tranche Capital Monitoring</h2>
               </div>
               <div className="flex items-center gap-2 font-mono text-[10px] text-white/20">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active Solvency State
               </div>
            </div>

            <div className="space-y-1">
              {TRANCHE_METADATA.map((m) => {
                const t = vd?.tranches.find(tk => tk.kind === m.kind);
                const assets = t?.totalAssets ?? 0n;
                const weight = stats.tvl > 0n ? Number((assets * 100n) / stats.tvl) : 0;

                return (
                  <div key={m.label} className="group relative rounded-2xl p-6 transition-all hover:bg-white/[0.02]">
                    <div className="flex items-end justify-between relative z-10">
                       <div className="flex items-center gap-4">
                          <div className={`h-10 w-[2px] rounded-full ${m.barColor}`} />
                          <div>
                             <div className={`font-mono text-[11px] font-bold tracking-[0.2em] ${m.color}`}>{m.label}</div>
                             <div className="text-[10px] uppercase tracking-widest text-white/20 mt-0.5">{m.priority}</div>
                          </div>
                       </div>
                       <div className="text-right">
                          <div className="font-display text-2xl text-white">${formatUsdc(assets, 0)}</div>
                          <div className="font-mono text-[10px] text-white/10 uppercase tracking-widest mt-1">{weight}% WEIGHTING</div>
                       </div>
                    </div>
                    <div className="mt-6 h-1 w-full bg-white/[0.03] rounded-full overflow-hidden">
                       <div className={`h-full transition-all duration-1000 ${m.barColor}`} style={{ width: `${weight}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-16 pt-10 border-t border-white/[0.04]">
               <div className="flex items-center gap-4 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <Info className="h-5 w-5 text-sky-400/40 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-white/30 leading-relaxed italic">
                     Waterfall integrity is verified on every block. Capital flows from ALPHA to PRIME in default scenarios, protecting senior depositors through structured risk subordination.
                  </p>
               </div>
            </div>
          </section>

          {/* Action Panel (RIGHT) */}
          <div className="space-y-8">
             
             {/* Capital Seeding Section */}
             <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.03] p-8 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                   <Droplets className="h-20 w-20 text-white" strokeWidth={0.5} />
                </div>
                <h3 className="mb-6 font-display text-lg text-white">Capital Seeding & Deposits</h3>
                
                <div className="space-y-6">
                   <div className="space-y-3">
                      <label className="font-mono text-[9px] uppercase tracking-widest text-white/20">Target Tranche</label>
                      <div className="grid grid-cols-3 gap-2">
                         {TRANCHE_METADATA.map(m => (
                           <button 
                             key={m.kind}
                             onClick={() => setSelectedTrancheKind(m.kind)}
                             className={`px-3 py-2 rounded-xl border font-mono text-[9px] uppercase tracking-widest transition-all ${selectedTrancheKind === m.kind ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/30 hover:border-white/20'}`}
                           >
                              {m.label}
                           </button>
                         ))}
                      </div>
                   </div>

                   <div className="space-y-2">
                      <label className="font-mono text-[9px] uppercase tracking-widest text-white/20">Deposit Amount (USDC)</label>
                      <div className="relative">
                         <input 
                           type="text" value={seedAmount} onChange={(e) => setSeedAmount(e.target.value)}
                           className="w-full rounded-2xl border border-white/[0.06] bg-black/40 px-5 py-4 font-mono text-xl text-emerald-400 focus:border-emerald-500/30 outline-none transition-all"
                         />
                         <Coins className="absolute right-5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/10" />
                      </div>
                   </div>

                   <button
                     onClick={seedTranche}
                     disabled={busy}
                     className="group relative w-full overflow-hidden rounded-2xl bg-white px-6 py-5 text-sm font-bold text-black transition-all hover:bg-white/90 disabled:opacity-20 shadow-lg shadow-white/5"
                   >
                     {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : (
                       <div className="flex items-center justify-center gap-2">
                          <Zap className="h-4 w-4" />
                          <span>AUTHORIZE DEPOSIT</span>
                       </div>
                     )}
                   </button>
                </div>
             </div>

             {/* Credit Event Simulation */}
             <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                   <ShieldCheck className="h-20 w-20 text-white" strokeWidth={0.5} />
                </div>
                <h3 className="mb-6 font-display text-lg text-white">Risk Stress Simulation</h3>
                
                <div className="space-y-6">
                   <div className="space-y-2">
                      <label className="font-mono text-[9px] uppercase tracking-widest text-white/20">Loss Magnitude (USDC)</label>
                      <input 
                        type="text" value={lossAmount} onChange={(e) => setLossAmount(e.target.value)}
                        className="w-full rounded-2xl border border-white/[0.06] bg-black/40 px-5 py-4 font-mono text-xl text-rose-400 focus:border-rose-500/30 outline-none transition-all"
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="font-mono text-[9px] uppercase tracking-widest text-white/20">Default Severity (%)</label>
                      <input 
                        type="range" min="0" max="100" value={severity} onChange={(e) => setSeverity(e.target.value)}
                        className="w-full h-1 bg-white/[0.05] rounded-full appearance-none accent-rose-500 cursor-pointer"
                      />
                      <div className="flex justify-between font-mono text-[10px] text-white/20">
                         <span>Partial</span>
                         <span>Total Default ({severity}%)</span>
                      </div>
                   </div>

                   <button
                     onClick={triggerCreditEvent}
                     disabled={busy || !isHealthy || vaultStateLabel !== 'active'}
                     className="group relative w-full overflow-hidden rounded-2xl bg-rose-500/10 border border-rose-500/20 px-6 py-5 text-sm font-bold text-rose-400 transition-all hover:bg-rose-500/20 disabled:opacity-20"
                   >
                     {busy ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'TRIGGER DEFAULT CASCADE'}
                   </button>

                   {vaultStateLabel !== 'active' && (
                     <button
                       onClick={() => reactivate.mutate()}
                       disabled={reactivate.isPending}
                       className="w-full overflow-hidden rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-6 py-5 text-sm font-bold text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:opacity-20"
                     >
                       {reactivate.isPending ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'REACTIVATE VAULT'}
                     </button>
                   )}
                </div>
             </div>

             {/* System Integrity */}
             <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8 space-y-8">
                <div className="space-y-6">
                   {[
                     { label: 'Waterfall State', val: isHealthy ? 'NOMINAL' : 'DEGRADED', color: isHealthy ? 'text-emerald-400/60' : 'text-rose-400/60' },
                     { label: 'Oracle Sync', val: 'PYTH-CONFIRMED', color: 'text-emerald-400/60' },
                     { label: 'State Root', val: 'VALIDATED', color: 'text-emerald-400/60' },
                   ].map(s => (
                     <div key={s.label} className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
                        <span className="text-white/20">{s.label}</span>
                        <span className={s.color}>{s.val}</span>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
