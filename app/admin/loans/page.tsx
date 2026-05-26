'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { 
  Activity, 
  ArrowRight, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  Database, 
  FileText, 
  Filter, 
  Search, 
  ShieldCheck, 
  TrendingUp, 
  Zap, 
  ArrowUpRight,
  Loader2,
  Globe,
  AlertTriangle,
  Coins,
  RefreshCw
} from 'lucide-react';
import { PublicKey, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { BN } from '@coral-xyz/anchor';
import adminSecret from '@/contracts/keys/admin.json';
import { toast } from 'sonner';

import { buildPrograms } from '@/app/lib/program';
import { formatUsdc } from '@/app/lib/format';
import { PRISM_CORE_PROGRAM_ID, USDC_MINT, TrancheKind } from '@/app/lib/constants';
import {
  getConfigPda,
  getVaultPda,
  getTranchePda,
  getVaultReservePda,
  getLossBucketPda,
  getLoanPda,
  getIkaCollateralPda,
} from '@/app/lib/pda';
import { useVaultState } from '@/hooks/useVaultState';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoansPage() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { vaultId, addLog } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const { applications } = useLoanApplications();

  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [disbursingId, setDisbursingId] = useState<string | null>(null);

  const filteredApps = useMemo(() => {
    return applications.filter((a) => a.status === activeTab);
  }, [applications, activeTab]);


  async function handleDisburse(app: any) {
    if (!wallet) return toast.error('Connect wallet');
    if (app.loanId === undefined || app.loanId === null) {
      return toast.error('Loan not originated on-chain. Re-approve from the loan detail page with the vault running.');
    }
    setDisbursingId(app.id);
    try {
      const adminKp = Keypair.fromSecretKey(Uint8Array.from(adminSecret as number[]));
      const { core } = buildPrograms(connection, adminKp);
      const admin = adminKp.publicKey;
      const [config] = getConfigPda();
      const [vault] = getVaultPda(app.vaultId ?? vaultId);

      const vaultAccountInfo = await connection.getAccountInfo(vault);
      if (!vaultAccountInfo) {
        throw new Error('Vault not initialized — run Protocol Setup first');
      }

      const principalMicro = BigInt(Math.round(app.requestedUSDC * 1_000_000));
      const [reservePda] = getVaultReservePda(vault);
      const reserveAcc = await connection.getTokenAccountBalance(reservePda);
      const reserveBalance = BigInt(reserveAcc.value.amount);

      if (reserveBalance < principalMicro) {
        throw new Error(`Insufficient Vault Reserves: ${formatUsdc(reserveBalance, 2)} available, ${app.requestedUSDC.toLocaleString()} required.`);
      }

      const [loanPda] = getLoanPda(vault, Number(app.loanId));
      const borrower = new PublicKey(app.borrowerPubkey);

      const [ikaCollateralPda] = getIkaCollateralPda(loanPda);
      const ikaAcc = await (core as any).account.ikaCollateral.fetchNullable(ikaCollateralPda);

      const tokenAccounts = await connection.getTokenAccountsByOwner(borrower, { mint: USDC_MINT });
      if (tokenAccounts.value.length === 0) {
        throw new Error('Borrower has no USDC token account');
      }

      await (core as any).methods
        .disburseLoan()
        .accounts({
          admin, config, vault, loan: loanPda, vaultUsdcReserve: reservePda,
          borrowerUsdcAta: tokenAccounts.value[0].pubkey,
          tokenProgram: TOKEN_PROGRAM_ID, ikaCollateral: ikaAcc ? ikaCollateralPda : null,
        })
        .rpc({ commitment: 'confirmed' });

      addLog(`✓ Capital Disbursed: $${app.requestedUSDC.toLocaleString()} transmitted to borrower.`);
      toast.success(`Loan #${app.loanId} disbursed`);
      vaultState.refetch();
    } catch (e: any) {
      addLog(`✗ Disbursement Error: ${e.message}`);
      toast.error(`Disburse failed: ${e.message}`);
    } finally {
      setDisbursingId(null);
    }
  }

  if (vaultState.isLoading) {
    return (
      <div className="flex flex-col h-full bg-background overflow-hidden font-sans">
        <div className="shrink-0 border-b border-white/[0.06] bg-white/[0.01] px-10 py-8">
           <div className="flex items-center justify-between">
              <div className="space-y-3">
                 <Skeleton className="h-10 w-64 rounded-lg" />
                 <Skeleton className="h-4 w-48 rounded-md" />
              </div>
              <Skeleton className="h-12 w-48 rounded-2xl" />
           </div>
        </div>
        <div className="flex-1 p-10 space-y-10">
           <div className="grid grid-cols-3 gap-6">
              <Skeleton className="h-32 rounded-3xl" />
              <Skeleton className="h-32 rounded-3xl" />
              <Skeleton className="h-32 rounded-3xl" />
           </div>
           <div className="space-y-4">
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden font-sans">
      
      {/* Institutional Header */}
      <div className="shrink-0 border-b border-white/[0.06] bg-white/[0.01] px-10 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/[0.08] shadow-[0_0_30px_rgba(168,85,247,0.05)]">
               <ShieldCheck className="h-6 w-6 text-purple-400" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="font-display text-2xl tracking-tight text-white">Credit Operations Desk</h1>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.3em] text-white/20">
                Institutional Underwriting · Origination Queue · Capital Disbursement
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
             <div className="flex items-center gap-4 border-r border-white/5 pr-6">
                <div>
                   <div className="font-mono text-[9px] uppercase tracking-widest text-white/20">Vault Reserve</div>
                   <div className="font-mono text-sm text-emerald-400/80">${formatUsdc(vaultState.data?.reserveBalance ?? 0n, 0)}</div>
                </div>
             </div>
             <button 
               onClick={() => vaultState.refetch()}
               className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] text-white/30 hover:text-white transition-all"
             >
                <RefreshCw className={`h-5 w-5 ${vaultState.isFetching ? 'animate-spin' : ''}`} />
             </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 py-10" data-app-scroll="true">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
          
          {/* PRIMARY WORKSPACE */}
          <div className="space-y-10">
            
            {/* Live Portfolio Metrics */}
            <div className="grid grid-cols-3 gap-6">
               {[
                 { label: 'Underwriting Queue', value: applications.filter(a => a.status === 'pending').length, icon: Activity, color: 'text-purple-400', sub: 'Pending Review' },
                 { label: 'Originated Debt', value: applications.filter(a => a.status === 'approved').length, icon: ShieldCheck, color: 'text-emerald-400', sub: 'Active Loans' },
                 { label: 'Vault Exposure', value: `$${formatUsdc(vaultState.data?.tranches.reduce((s,t) => s+t.totalAssets, 0n) ?? 0n, 0)}`, icon: TrendingUp, color: 'text-sky-400', sub: 'Market TVL' },
               ].map((m, i) => (
                 <div key={i} className="p-8 rounded-3xl border border-white/[0.06] bg-white/[0.02] space-y-4">
                    <div className="flex items-center justify-between">
                       <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{m.label}</div>
                       <m.icon className={`h-4 w-4 ${m.color} opacity-40`} />
                    </div>
                    <div className="font-display text-4xl text-white">{m.value}</div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-white/10">{m.sub}</div>
                 </div>
               ))}
            </div>

            {/* Application Filters & Tabs */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
               <div className="flex gap-8">
                  {[
                    { id: 'pending', label: 'Underwriting Queue', count: applications.filter(a => a.status === 'pending').length },
                    { id: 'approved', label: 'Originated Debt', count: applications.filter(a => a.status === 'approved').length },
                  ].map(tab => (
                    <button 
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`relative pb-4 px-1 font-display text-lg transition-all ${activeTab === tab.id ? 'text-white' : 'text-white/20 hover:text-white/40'}`}
                    >
                      {tab.label}
                      <span className="ml-3 font-mono text-[10px] opacity-40">[{tab.count}]</span>
                      {activeTab === tab.id && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]" />}
                    </button>
                  ))}
               </div>
            </div>

            {/* Loan Ledger */}
            <div className="space-y-4 pb-20">
              {filteredApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-32 rounded-3xl border border-dashed border-white/[0.06] bg-white/[0.01]">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/[0.02] mb-6">
                     <Activity className="h-10 w-10 text-white/5" strokeWidth={1} />
                  </div>
                  <div className="text-center">
                     <h3 className="font-display text-xl text-white/40">No Operational Data</h3>
                     <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/10">Underwriting queue is currently synchronized</p>
                  </div>
                </div>
              ) : (
                filteredApps.map((app) => {
                  return (
                    <div key={app.id} className="group overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.01] transition-all hover:border-white/[0.12] hover:bg-white/[0.03]">
                      <div className="p-8">
                        <div className="flex items-center justify-between">
                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <div className="flex items-center gap-2">
                                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-white/40">
                                  ID: {app.id ? app.id.slice(0, 8) : 'N/A'}
                                </div>
                                <div className="rounded-xl border border-white/[0.06] bg-emerald-500/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400/60">
                                  Vault: #{app.vaultId}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" />
                                <span className="font-mono text-[10px] uppercase tracking-widest text-amber-500/60">{app.status}</span>
                              </div>
                            </div>
                            <div className="flex items-baseline gap-4">
                              <div className="font-display text-4xl text-white">${app.requestedUSDC.toLocaleString()}</div>
                              <div className="font-mono text-xs text-white/20 uppercase tracking-[0.2em]">
                                at {app.approvedAprBps ? app.approvedAprBps / 100 : 8}% fixed apr
                              </div>
                            </div>
                            <div className="flex items-center gap-6 text-[11px] font-mono uppercase tracking-widest text-white/20">
                              <div className="flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5" />
                                {app.maturityDays} Days
                              </div>
                              <div className="h-4 w-px bg-white/5" />
                              <div className="flex items-center gap-2">
                                <Database className="h-3.5 w-3.5" />
                                Borrower: {app.borrowerPubkey ? `${app.borrowerPubkey.slice(0, 4)}...${app.borrowerPubkey.slice(-4)}` : 'UNKNOWN'}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-3 min-w-[240px]">
                            <Link 
                              href={`/admin/loans/${app.id}`}
                              className="flex items-center justify-between rounded-2xl bg-white px-6 py-4 text-xs font-bold text-black hover:bg-white/90 transition-all shadow-lg shadow-white/5"
                            >
                              {app.status === 'pending' ? 'Review Application' : 'View Details'}
                              <ArrowRight className="h-4 w-4" />
                            </Link>

                            {app.status === 'approved' && (
                              <LoanActions 
                                app={app} 
                                onDisburse={handleDisburse} 
                                isDisbursing={disbursingId === app.id} 
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* SIDEBAR (RIGHT) */}
          <aside className="space-y-8">
             
             {/* Operational Context */}
             <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-8 space-y-6">
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-6">
                   <h3 className="font-display text-lg text-white">Underwriting Context</h3>
                   <Clock className="h-4 w-4 text-white/10" />
                </div>
                
                <div className="space-y-4">
                   {[
                     { label: 'Authorized Admin', val: wallet?.publicKey.toBase58().slice(0, 8) + '...' },
                     { label: 'Network State', val: 'Mainnet-Beta Simulation' },
                     { label: 'Vault ID', val: `#${vaultId}` },
                   ].map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest">
                         <span className="text-white/20">{item.label}</span>
                         <span className="text-white/60">{item.val}</span>
                      </div>
                   ))}
                </div>
             </div>

             {/* Credit Guidelines */}
             <div className="rounded-3xl border border-white/[0.08] bg-white/[0.02] p-8 space-y-6">
                <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/20">Operational Guidelines</h3>
                <div className="space-y-4">
                   <p className="text-[11px] text-white/30 leading-relaxed italic border-l border-purple-500/30 pl-4">
                      Approval of a loan application transitions the debt into the origination queue. Only originated debt can be disbursed from the vault reserves.
                   </p>
                </div>
             </div>

          </aside>
        </div>
      </div>
    </div>
  );
}

function LoanActions({ app, onDisburse, isDisbursing }: { app: any, onDisburse: (app: any) => void, isDisbursing: boolean }) {
  const { connection } = useConnection();
  const [onChainLoan, setOnChainLoan] = useState<any>(null);
  const [collateralLocked, setCollateralLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function fetchState() {
      if (!app.loanId) {
        if (mounted) setLoading(false);
        return;
      }
      try {
        const [vault] = getVaultPda(app.vaultId ?? 0);
        const [loanPda] = getLoanPda(vault, Number(app.loanId));
        const { core } = buildPrograms(connection);
        const [acc, ikaAcc] = await Promise.all([
          (core as any).account.loan.fetchNullable(loanPda),
          (core as any).account.ikaCollateral.fetchNullable(getIkaCollateralPda(loanPda)[0]),
        ]);
        if (mounted) {
          setOnChainLoan(acc);
          const status = ikaAcc ? Object.keys(ikaAcc.status)[0] : null;
          setCollateralLocked(status === 'locked');
        }
      } catch (e) {
        console.error('Failed to fetch loan state:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchState();
    const timer = setInterval(fetchState, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [app.loanId, app.vaultId, connection]);

  if (loading) return <Skeleton className="h-14 w-full rounded-2xl bg-white/[0.02]" />;

  if (!app.loanId) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-6 py-4">
        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
        <div>
          <div className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Origination Pending</div>
          <div className="mt-0.5 text-[9px] text-white/30 font-mono">Open loan detail and re-approve with vault running</div>
        </div>
      </div>
    );
  }

  const state = onChainLoan ? Object.keys(onChainLoan.state)[0].toLowerCase() : 'unknown';

  if (state === 'active') {
    const principal = onChainLoan.principal.toNumber();
    const repaid = onChainLoan.totalRepaid.toNumber();
    const percent = Math.min(100, Math.round((repaid / principal) * 100));
    
    return (
      <div className="space-y-3 animate-in fade-in duration-500">
        <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 px-6 py-4">
           <CheckCircle2 className="h-4 w-4 text-emerald-400" />
           <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Capital Disbursed</span>
        </div>
        
        <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3">
           <div className="flex justify-between items-center text-[9px] font-mono uppercase tracking-[0.2em]">
              <span className="text-white/20">Amortization</span>
              <span className="text-emerald-400/60 font-bold">{percent}%</span>
           </div>
           <div className="h-1 w-full bg-white/[0.04] rounded-full overflow-hidden">
              <div 
                className="h-full bg-emerald-500/30 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.2)] transition-all duration-1000" 
                style={{ width: `${percent}%` }} 
              />
           </div>
           <div className="flex justify-between text-[8px] font-mono text-white/15 uppercase tracking-widest leading-none">
              <span>${(repaid/1e6).toLocaleString()} paid</span>
              <span>${(principal/1e6).toLocaleString()} principal</span>
           </div>
        </div>
      </div>
    );
  }

  if (!collateralLocked) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-4">
        <Clock className="h-4 w-4 text-white/20 shrink-0" />
        <div>
          <div className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Awaiting Collateral</div>
          <div className="mt-0.5 text-[9px] text-white/20 font-mono">Borrower must attach &amp; lock IKA collateral first</div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => onDisburse(app)}
      disabled={isDisbursing}
      className={`flex items-center justify-center gap-3 rounded-2xl px-6 py-4 text-xs font-bold transition-all ${
        isDisbursing
          ? 'bg-emerald-500/20 text-emerald-400 cursor-not-allowed'
          : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 shadow-lg shadow-emerald-500/5'
      }`}
    >
      {isDisbursing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
      {isDisbursing ? 'Executing Tx...' : 'Authorize Disbursement'}
    </button>
  );
}
