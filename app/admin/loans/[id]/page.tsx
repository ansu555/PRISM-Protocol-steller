'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  CheckCircle2, 
  Clock, 
  FileText, 
  History, 
  Info, 
  ShieldAlert, 
  ShieldCheck, 
  TrendingUp,
  Zap,
  Activity,
  ArrowUpRight,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { useWallet, useConnection } from '@/components/providers/stellar-wallet-context';
import { toast } from 'sonner';

import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useVaultState } from '@/hooks/useVaultState';
import { VAULT_ID } from '@/app/lib/constants';

const DEFAULT_APR_BPS = 800;

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const wallet = useWallet();
  const { connection } = useConnection();
  const { applications, approve, reject, updateStatus } = useLoanApplications();

  const app = applications.find(a => a.id === id);

  useEffect(() => {
    if (app) {
      const displayId = app.loanId ?? id.slice(0, 8);
      document.title = `Loan #${displayId} | PRISM Protocol`;
    }
  }, [app, id]);
  const vaultId = VAULT_ID;
  const vaultState = useVaultState(vaultId);

  const [busy, setBusy] = useState(false);

  if (!app) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-background">
        <div className="text-center space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white/[0.03]">
             <FileText className="h-10 w-10 text-white/10" strokeWidth={1} />
          </div>
          <div>
            <p className="font-display text-2xl text-white">Application Ledger Not Found</p>
            <p className="mt-2 text-sm text-white/30">The requested record does not exist in the protocol state.</p>
          </div>
          <button
            onClick={() => router.back()}
            className="rounded-xl border border-white/[0.08] px-6 py-2.5 font-mono text-[10px] uppercase tracking-widest text-purple-400/80 transition-all hover:bg-white/[0.04]"
          >
            Return to Ledger
          </button>
        </div>
      </div>
    );
  }

  async function handleApprove() {
    setBusy(true);
    try {
      // On-chain origination not yet migrated to Stellar
      const loanId = Math.floor(Date.now() / 1000) >>> 0;
      approve(id, loanId, DEFAULT_APR_BPS);
      toast.success('Loan approval recorded (on-chain origination pending Stellar migration)');
      router.push('/admin/loans');
    } catch (e: any) {
      toast.error(`Approval failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      reject(id);
      toast.success('Loan application rejected');
      router.push('/admin/loans');
    } catch (e: any) {
      toast.error('Rejection failed');
    } finally {
      setBusy(false);
    }
  }

  async function liquidate() {
    if (!wallet.connected || app?.loanId === undefined) return;
    setBusy(true);
    try {
      throw new Error('Not yet migrated to Stellar — use the simulation panel instead.');
    } catch (e: any) {
      toast.error(`Liquidation failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-12 p-12 bg-background min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <div className="flex items-center gap-4">
              <h1 className="font-display text-4xl tracking-tight text-white">Protocol Instrument Analysis</h1>
              <span className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${
                app.status === 'approved' 
                  ? 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400'
                  : app.status === 'rejected'
                    ? 'border-rose-500/20 bg-rose-500/[0.05] text-rose-400'
                    : 'border-amber-500/20 bg-amber-500/[0.05] text-amber-400'
              }`}>
                {app.status}
              </span>
            </div>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/20">
              Identity Ledger: #{app.id.slice(0, 8)} · Protocol ID: {app.loanId ?? 'UNASSIGNED'}
            </p>
          </div>
        </div>

        <div className="flex gap-3">
           {app.status === 'pending' ? (
             <>
               <button 
                 onClick={handleReject}
                 disabled={busy}
                 className="flex items-center gap-2.5 rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-rose-200 transition-all hover:bg-rose-500/[0.14] disabled:opacity-40"
               >
                 {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
                 Reject Application
               </button>
               <button 
                 onClick={handleApprove}
                 disabled={busy}
                 className="flex items-center gap-2.5 rounded-2xl bg-emerald-500 px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-black font-bold transition-all hover:bg-emerald-400 disabled:opacity-40 shadow-lg shadow-emerald-500/20"
               >
                 {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                 Approve for Origination
               </button>
             </>
           ) : app.status === 'approved' ? (
             <>
               {app.loanId === undefined && (
                 <button
                   onClick={handleApprove}
                   disabled={busy}
                   className="flex items-center gap-2.5 rounded-2xl bg-emerald-500 px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-black font-bold transition-all hover:bg-emerald-400 disabled:opacity-40 shadow-lg shadow-emerald-500/20"
                 >
                   {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                   Originate On-Chain
                 </button>
               )}
               <button
                 onClick={liquidate}
                 disabled={busy || app.loanId === undefined}
                 className="flex items-center gap-2.5 rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-rose-200 transition-all hover:bg-rose-500/[0.14] disabled:opacity-40 shadow-lg shadow-rose-500/5"
               >
                 {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                 Force Protocol Liquidation
               </button>
             </>
           ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        {/* Core Stats */}
        <div className="col-span-1 space-y-10 lg:col-span-2">
          <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-8 shadow-sm">
            <div className="mb-10 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-display text-xl text-white">Underwriting Parameters</h3>
                <p className="text-xs text-white/20 font-mono uppercase tracking-widest">Capital Deployment Framework</p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400/80">
                <TrendingUp className="h-3 w-3" />
                Yield Accrual Active
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
              {[
                { label: 'Total Principal', value: `$${app.requestedUSDC.toLocaleString()}`, sub: 'USDC Stable Capital' },
                { label: 'Assigned Yield', value: `${app.approvedAprBps ? app.approvedAprBps / 100 : 8}% APR`, sub: 'Fixed Rate Return' },
                { label: 'Maturity Span', value: `${app.maturityDays} Days`, sub: 'Duration Framework' },
              ].map((stat) => (
                <div key={stat.label} className="space-y-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15">{stat.label}</div>
                  <div className="font-display text-4xl tracking-tight text-white">{stat.value}</div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-white/10">{stat.sub}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-10 shadow-sm relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 transition-opacity group-hover:opacity-20">
               <ShieldCheck className="h-32 w-32 text-emerald-500" strokeWidth={1} />
            </div>
            
            <div className="mb-10 flex items-center gap-3">
               <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.03]">
                  <Activity className="h-5 w-5 text-purple-400/60" />
               </div>
               <div>
                  <h3 className="font-display text-xl text-white">Health Monitoring</h3>
                  <p className="text-xs text-white/20 font-mono uppercase tracking-widest">IKA Shield Network Integration</p>
               </div>
            </div>
            
            <div className="flex flex-col items-center gap-8 py-10 text-center relative z-10">
               <div className="relative">
                 <div className="absolute inset-0 animate-pulse rounded-full bg-emerald-500/10 blur-3xl" />
                 <div className="relative flex h-32 w-32 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] shadow-[0_0_50px_rgba(16,185,129,0.1)]">
                    <Zap className="h-12 w-12 text-emerald-400" />
                 </div>
               </div>
               <div className="space-y-4">
                  <div className="font-display text-2xl text-white">Cross-Chain Collateral Secured</div>
                  <p className="mx-auto max-w-md text-sm text-white/40 leading-relaxed">
                    Protocol is actively verifying the economic solvency of this instrument. 
                    Shielded IKA validators are monitoring the liquidity waterfall for BTC/ETH reserve parity.
                  </p>
                  <div className="inline-flex items-center gap-3 rounded-full border border-white/[0.06] bg-white/[0.03] px-5 py-2">
                     <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                     <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/60">Live Oracle Feed Synchronized</span>
                  </div>
               </div>
            </div>
          </section>
        </div>

        {/* Sidebar Context */}
        <div className="space-y-8">
           <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-7 shadow-sm">
             <div className="mb-6 flex items-center gap-3">
               <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
                  <Info className="h-4 w-4 text-white/30" />
               </div>
               <span className="text-[11px] font-medium text-white/60 uppercase tracking-[0.2em] font-mono">Counterparty Identity</span>
             </div>
             <div className="space-y-5">
                <div className="group flex cursor-pointer items-center justify-between transition-all">
                  <span className="text-xs text-white/20 uppercase tracking-widest font-mono">Identity</span>
                  <span className="flex items-center gap-2 font-mono text-xs text-white/60 group-hover:text-purple-400 transition-colors">
                    {app.borrowerPubkey.slice(0, 14)}… <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/20 uppercase tracking-widest font-mono">Protocol Tier</span>
                  <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-white/60">Institutional (A+)</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-xs text-white/20 uppercase tracking-widest font-mono shrink-0">Capital Intent</span>
                  <span className="text-xs text-white/60 text-right leading-relaxed pl-4 line-clamp-2 italic">"{app.purpose || 'Capital Deployment'}"</span>
                </div>
             </div>
           </section>

           <section className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-7 shadow-sm">
             <div className="mb-6 flex items-center gap-3">
               <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.03]">
                  <History className="h-4 w-4 text-white/30" />
               </div>
               <span className="text-[11px] font-medium text-white/60 uppercase tracking-[0.2em] font-mono">Immutable Audit Ledger</span>
             </div>
             <div className="space-y-5">
                {[
                  { time: '2 hours ago', event: 'Oracle Health Verification', status: 'pass' },
                  { time: '1 day ago', event: 'Instrument Disbursement', status: 'success' },
                  { time: '2 days ago', event: 'Protocol Underwriting Approval', status: 'success' },
                  { time: '2 days ago', event: 'Digital Application Filed', status: 'success' },
                ].map((e, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/20" />
                    <div className="space-y-1">
                      <div className="text-xs text-white/60">{e.event}</div>
                      <div className="font-mono text-[9px] text-white/15 uppercase tracking-widest">{e.time}</div>
                    </div>
                  </div>
                ))}
             </div>
           </section>
        </div>
      </div>
    </div>
  );
}
