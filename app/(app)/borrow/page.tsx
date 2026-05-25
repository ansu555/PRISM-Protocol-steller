'use client';

import { useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { BorrowerProvider } from '@/hooks/useBorrowerState';
import { BorrowingWorkflow } from '@/components/borrower/BorrowingWorkflow';
import { LoanIntelligencePanel } from '@/components/borrower/LoanIntelligencePanel';
import { useAllVaults } from '@/hooks/useAllVaults';
import { cn } from '@/lib/utils';
import { INSTITUTIONAL_CREDIT_LIMIT_USD } from '@/app/lib/constants';
import {
  Activity,
  AlertTriangle,
  Wallet,
  TrendingUp,
  Layers,
  CreditCard,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

// ─── Page Header (Dashboard-style hero) ───────────────────────────────────────
function PageHeader() {
  const { connected, publicKey } = useWallet();
  const { clearApplications, getByBorrower } = useLoanApplications();
  const existingApp = publicKey ? getByBorrower(publicKey.toBase58()) : undefined;

  const statusLabel =
    !existingApp ? 'Ready'
    : existingApp.status === 'pending' ? 'Under Review'
    : existingApp.status === 'approved' ? 'Approved'
    : 'Rejected';

  const statusColor =
    !existingApp ? 'text-emerald-400'
    : existingApp.status === 'pending' ? 'text-amber-400'
    : existingApp.status === 'approved' ? 'text-emerald-400'
    : 'text-rose-400';

  const statusDot =
    !existingApp ? 'bg-emerald-400'
    : existingApp.status === 'pending' ? 'bg-amber-400 animate-pulse'
    : existingApp.status === 'approved' ? 'bg-emerald-400'
    : 'bg-rose-400';

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04] mb-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 100% 0%, rgba(232,121,160,0.10) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 0% 100%, rgba(168,85,247,0.08) 0%, transparent 50%)',
        }}
      />
      <div className="relative flex flex-col gap-6 px-8 py-7 sm:flex-row sm:items-center sm:justify-between">
        {/* Left — Identity & Title */}
        <div className="flex items-start gap-4 min-w-0">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] shadow-[0_0_24px_rgba(16,185,129,0.10)]">
            <CreditCard className="h-5 w-5 text-emerald-400/90" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
                Structured Credit Terminal
              </span>
              <span className="h-1 w-1 rounded-full bg-white/20" />
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">
                IKA Collateral
              </span>
              <span className="ml-1 flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-0.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', statusDot)} />
                <span className={cn('font-mono text-[10px] font-bold uppercase tracking-widest', statusColor)}>
                  {statusLabel}
                </span>
              </span>
            </div>
            <h1 className="font-display text-4xl leading-none tracking-tight text-white truncate">
              Credit Facility Application
            </h1>
            <p className="mt-3 font-mono text-xs text-white/40">
              Institutional underwriting · Threshold custody · On-chain execution
            </p>
          </div>
        </div>

        {/* Right — Stats + Reset */}
        <div className="flex items-center gap-6 shrink-0">
          <div className="hidden md:block text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 mb-1">Credit Capacity</div>
            <div className="font-mono text-2xl font-medium text-white/85 tabular-nums">
              {connected ? `$${(INSTITUTIONAL_CREDIT_LIMIT_USD / 1000).toFixed(0)}K` : '—'}
            </div>
          </div>
          <div className="hidden md:block w-px h-12 bg-white/[0.06]" />
          <button
            onClick={() => {
              if (confirm('Clear application history and reset session?')) {
                clearApplications();
                window.location.reload();
              }
            }}
            className="flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.02] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 hover:border-white/25 hover:bg-white/[0.05] hover:text-white/80 transition-all"
          >
            <RefreshCcw className="h-3 w-3" />
            Reset Session
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Status KPI Strip ─────────────────────────────────────────────────────────
function StatusBar() {
  const { publicKey, connected } = useWallet();
  const { getByBorrower } = useLoanApplications();
  const allVaults = useAllVaults();

  const existingApp = publicKey ? getByBorrower(publicKey.toBase58()) : undefined;
  const vaultList = allVaults.data ?? [];
  const totalMarkets = vaultList.length;
  // Healthy when every initialized vault is in Active state
  const isHealthy = vaultList.length === 0
    || vaultList.every(v => Object.keys(v.state ?? {})[0] === 'active');

  const walletShort = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : 'Disconnected';

  const stats = [
    {
      label: 'Identity',
      value: walletShort,
      icon: Wallet,
      iconColor: connected ? 'text-emerald-400/80' : 'text-rose-400/70',
      iconBg: connected ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-rose-500/[0.06] border-rose-500/20',
      sub: connected ? 'Authenticated session' : 'Connect wallet',
      subColor: connected ? 'text-white/30' : 'text-rose-400/70',
    },
    {
      label: 'Credit Capacity',
      value: connected ? `$${INSTITUTIONAL_CREDIT_LIMIT_USD.toLocaleString()}` : '—',
      icon: TrendingUp,
      iconColor: 'text-sky-400/80',
      iconBg: 'bg-sky-500/[0.06] border-sky-500/20',
      sub: 'USDC underwriting limit',
      subColor: 'text-white/30',
    },
    {
      label: 'Active Markets',
      value: `${totalMarkets}`,
      icon: Layers,
      iconColor: 'text-violet-400/80',
      iconBg: 'bg-violet-500/[0.06] border-violet-500/20',
      sub: `${totalMarkets} live credit pools`,
      subColor: 'text-white/30',
    },
    {
      label: 'Protocol Status',
      value: isHealthy ? 'Operational' : 'Maintenance',
      icon: Activity,
      iconColor: isHealthy ? 'text-emerald-400/80' : 'text-amber-400/80',
      iconBg: isHealthy ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-amber-500/[0.06] border-amber-500/20',
      sub: isHealthy ? 'All systems nominal' : 'Limited capacity',
      subColor: isHealthy ? 'text-emerald-400/70' : 'text-amber-400/70',
      pulseDot: true,
    },
    ...(existingApp
      ? [{
          label: 'Application',
          value: existingApp.status === 'pending' ? 'In Review' : existingApp.status === 'approved' ? 'Approved' : 'Rejected',
          icon: existingApp.status === 'approved' ? ShieldCheck : AlertTriangle,
          iconColor:
            existingApp.status === 'approved' ? 'text-emerald-400/80'
            : existingApp.status === 'pending' ? 'text-amber-400/80'
            : 'text-rose-400/80',
          iconBg:
            existingApp.status === 'approved' ? 'bg-emerald-500/[0.06] border-emerald-500/20'
            : existingApp.status === 'pending' ? 'bg-amber-500/[0.06] border-amber-500/20'
            : 'bg-rose-500/[0.06] border-rose-500/20',
          sub: `App ID: ${existingApp.id.slice(0, 8)}…`,
          subColor: 'text-white/30',
          pulseDot: existingApp.status === 'pending',
        }]
      : []),
  ];

  const cols = stats.length;

  return (
    <div className={cn(
      'grid grid-cols-2 sm:grid-cols-4 overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.03] divide-x divide-white/[0.08] mb-5',
      cols === 5 && 'xl:grid-cols-5',
    )}>
      {stats.map((s) => {
        const Icon = s.icon;
        return (
          <div key={s.label} className="group flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-white/[0.03]">
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border', s.iconBg)}>
              <Icon className={cn('h-4 w-4', s.iconColor)} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/30">{s.label}</span>
                {s.pulseDot && <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />}
              </div>
              <div className="mt-1 font-mono text-base font-medium text-white tabular-nums truncate">
                {s.value}
              </div>
              <div className={cn('mt-0.5 font-mono text-[10px] uppercase tracking-widest truncate', s.subColor)}>
                {s.sub}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Inner Layout ─────────────────────────────────────────────────────────────
function BorrowerPageInner() {
  const { publicKey } = useWallet();
  const { getByBorrower } = useLoanApplications();
  const existingApp = publicKey ? getByBorrower(publicKey.toBase58()) : undefined;

  useEffect(() => {
    if (existingApp?.status === 'approved' && existingApp.loanId !== undefined) {
      document.title = 'Repayment Center | PRISM Protocol';
    } else {
      document.title = 'Borrower Facility | PRISM Protocol';
    }
  }, [existingApp]);

  return (
    <div data-app-scroll className="relative flex-1 overflow-y-auto px-4 pt-7 pb-4 [overscroll-behavior:contain]">
      <div className="mx-auto w-full max-w-[1800px]">
        <PageHeader />
        <StatusBar />

        {/* Main 70/30 Layout */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {/* Left — Workflow */}
          <div className="min-w-0">
            <BorrowingWorkflow />
          </div>

          {/* Right — Intelligence Panel */}
          <aside className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/[0.06]">
                <Sparkles className="h-3.5 w-3.5 text-amber-400/80" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-400/70">
                  Live Intelligence
                </div>
                <div className="font-mono text-[10px] text-white/30 mt-0.5">
                  Real-time underwriting signals
                </div>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-0.5">
                <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-400/80">Live</span>
              </div>
            </div>
            <LoanIntelligencePanel />
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────
export default function BorrowerPage() {
  return (
    <BorrowerProvider>
      <BorrowerPageInner />
    </BorrowerProvider>
  );
}
