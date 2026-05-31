'use client';

import { useState, useEffect } from 'react';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useRepayLoan } from '@/hooks/useRepayLoan';
import { BorrowerProvider } from '@/hooks/useBorrowerState';
import { formatUsdc } from '@/app/lib/format';
import { useLoans } from '@/hooks/useLoans';
import { useCollateralRecord } from '@/hooks/useCollateralFlow';
import { useVaultState } from '@/hooks/useVaultState';
import { getBalances } from '@/app/lib/horizon';
import { EVMCollateralStep } from '@/components/borrower/EVMCollateralStep';
import { VAULT_ID } from '@/app/lib/constants';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Lock,
  RefreshCcw,
  Shield,
  ShieldCheck,
  TrendingUp,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

const MATURITY_OPTIONS = [30, 60, 90, 180];
const PURPOSE_OPTIONS = [
  'Working capital',
  'Inventory purchase',
  'Equipment financing',
  'Trade finance',
  'Real estate bridge',
  'Other',
];
const DEFAULT_APR_BPS = 800;

// ─── Step indicator ───────────────────────────────────────────────────────────

function Steps({ current }: { current: 1 | 2 | 3 | 4 | 5 }) {
  const steps = [
    { n: 1, label: 'Apply' },
    { n: 2, label: 'Review' },
    { n: 3, label: 'Collateral' },
    { n: 4, label: 'Active' },
    { n: 5, label: 'Repay' },
  ];
  return (
    <div className="overflow-x-auto mb-6 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex items-center gap-0 min-w-max">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-mono text-[10px] font-bold uppercase tracking-widest transition-all ${
              current === s.n
                ? 'bg-white text-black'
                : current > s.n
                ? 'text-white/50'
                : 'text-white/20'
            }`}>
              {current > s.n
                ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                : <span className={`h-4 w-4 rounded-full flex items-center justify-center text-[9px] border ${
                    current === s.n ? 'border-black bg-black text-white' : 'border-white/20 text-white/30'
                  }`}>{s.n}</span>
              }
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px mx-0.5 shrink-0 ${current > s.n ? 'bg-emerald-400/40' : 'bg-white/[0.06]'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Step 1: Apply ────────────────────────────────────────────────────────────

function ApplyForm({ address }: { address: string }) {
  const { submit } = useLoanApplications();
  const [amount, setAmount] = useState('');
  const [maturity, setMaturity] = useState(90);
  const [purpose, setPurpose] = useState(PURPOSE_OPTIONS[0]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const usd = parseFloat(amount);
    if (isNaN(usd) || usd <= 0) { toast.error('Enter a valid amount'); return; }
    if (usd > 500_000) { toast.error('Max credit limit is $500,000'); return; }
    setLoading(true);
    try {
      await submit({ borrowerPubkey: address, requestedUSDC: usd, maturityDays: maturity, purpose, vaultId: VAULT_ID });
      toast.success('Application submitted — admin will review shortly');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">Loan Amount (USDC)</label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-white/25 text-sm">$</span>
          <input
            type="number" min="100" max="500000" step="100" placeholder="10,000"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full rounded-xl border border-white/[0.06] bg-black/30 pl-7 pr-4 py-2.5 font-mono text-sm text-white placeholder:text-white/15 focus:border-white/15 focus:outline-none"
            required
          />
        </div>
        <div className="flex gap-1.5 mt-2">
          {[1000, 5000, 10000, 25000].map(v => (
            <button key={v} type="button" onClick={() => setAmount(String(v))}
              className="px-2.5 py-1 rounded-full border border-white/[0.05] font-mono text-[9px] text-white/25 hover:text-white/60 hover:border-white/15 transition-all">
              ${v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">Loan Term</label>
        <div className="flex gap-2">
          {MATURITY_OPTIONS.map(d => (
            <button key={d} type="button" onClick={() => setMaturity(d)}
              className={`flex-1 py-2 rounded-xl border font-mono text-[10px] font-semibold transition-all ${
                maturity === d ? 'border-white/25 bg-white/[0.06] text-white' : 'border-white/[0.05] text-white/25 hover:text-white/50 hover:border-white/10'
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">Purpose</label>
        <select value={purpose} onChange={e => setPurpose(e.target.value)}
          className="w-full rounded-xl border border-white/[0.06] bg-black/30 px-3.5 py-2.5 font-mono text-sm text-white/60 focus:border-white/15 focus:outline-none">
          {PURPOSE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <button type="submit" disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-40 transition-all">
        {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</> : <>Submit Application <ArrowRight className="h-3.5 w-3.5" /></>}
      </button>
    </form>
  );
}

// ─── Step 2: Status ───────────────────────────────────────────────────────────

function ApplicationStatus({ app, onReset }: {
  app: { status: string; requestedUSDC: number; maturityDays: number; purpose: string; loanId?: number; approvedAprBps?: number };
  onReset: () => void;
}) {
  const isPending  = app.status === 'pending';
  const isApproved = app.status === 'approved';
  const isRejected = app.status === 'rejected';

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border p-4 ${
        isPending ? 'border-amber-500/20 bg-amber-500/[0.04]'
        : isApproved ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
        : 'border-rose-500/20 bg-rose-500/[0.04]'
      }`}>
        <div className="flex items-center gap-2.5 mb-3">
          {isPending  && <Clock className="h-4 w-4 text-amber-400" />}
          {isApproved && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
          {isRejected && <XCircle className="h-4 w-4 text-rose-400" />}
          <div>
            <p className={`font-sans text-sm font-semibold ${isPending ? 'text-amber-300' : isApproved ? 'text-emerald-300' : 'text-rose-300'}`}>
              {isPending ? 'Under Review' : isApproved ? 'Approved' : 'Rejected'}
            </p>
            <p className="font-mono text-[9px] text-white/25 mt-0.5">
              {isPending ? 'Admin is reviewing your application' : isApproved ? 'Funds will be disbursed to your wallet' : 'Your application was not approved'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Amount', value: `$${app.requestedUSDC.toLocaleString()}` },
            { label: 'Term',   value: `${app.maturityDays} days` },
            { label: 'Purpose', value: app.purpose },
            { label: 'APR', value: app.approvedAprBps ? `${(app.approvedAprBps / 100).toFixed(1)}%` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-black/20 px-3 py-2">
              <p className="font-mono text-[8px] text-white/20 uppercase tracking-widest">{label}</p>
              <p className="font-mono text-xs text-white/60 mt-0.5 truncate">{value}</p>
            </div>
          ))}
        </div>
      </div>
      {isRejected && (
        <button onClick={onReset}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/[0.05] py-2.5 font-mono text-[10px] text-white/35 hover:text-white/60 hover:border-white/15 transition-all">
          <RefreshCcw className="h-3 w-3" /> Apply Again
        </button>
      )}
    </div>
  );
}

// ─── Step 4: Active ───────────────────────────────────────────────────────────

function ActiveLoanNotice({ loanId }: { loanId: number }) {
  const { data: loans = [] } = useLoans();
  const loan = loans.find(l => l.id === loanId);
  const isDisbursed = loan?.state === 'Active' || loan?.state === 'Repaying';
  const outstanding = loan ? (loan.principal > loan.totalRepaid ? loan.principal - loan.totalRepaid : 0n) : 0n;

  if (!isDisbursed) {
    // Collateral locked, admin has not disbursed yet
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
          <div className="flex items-center gap-2.5 mb-3">
            <Clock className="h-4 w-4 text-amber-400" />
            <div>
              <p className="font-sans text-sm font-semibold text-amber-300">Waiting for Disbursal</p>
              <p className="font-mono text-[9px] text-white/25">Collateral verified · Admin will release TUSDC shortly</p>
            </div>
          </div>
          {loan && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Approved Amount', value: `$${formatUsdc(loan.principal, 2)}` },
                { label: 'APR',             value: `${(loan.aprBps / 100).toFixed(1)}%` },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-black/20 px-2.5 py-2">
                  <p className="font-mono text-[8px] text-white/20 uppercase">{label}</p>
                  <p className="font-mono text-xs text-white/60 mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-center font-mono text-[9px] text-white/20">
          The admin will send TUSDC to your wallet once they approve disbursal
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[#4a9ec9]/20 bg-[#4a9ec9]/[0.04] p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <CheckCircle2 className="h-4 w-4 text-[#4a9ec9]" />
          <div>
            <p className="font-sans text-sm font-semibold text-[#4a9ec9]">Funds Disbursed</p>
            <p className="font-mono text-[9px] text-white/25">PTUSDC sent · Loan #{loanId} active</p>
          </div>
        </div>
        {loan && (
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Principal',   value: `$${formatUsdc(loan.principal, 2)}` },
              { label: 'APR',         value: `${(loan.aprBps / 100).toFixed(1)}%` },
              { label: 'Outstanding', value: `$${formatUsdc(outstanding, 2)}` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-black/20 px-2.5 py-2">
                <p className="font-mono text-[8px] text-white/20 uppercase">{label}</p>
                <p className="font-mono text-xs text-white/60 mt-0.5">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-center font-mono text-[9px] text-white/20">Move to the <strong className="text-white/40">Repay</strong> tab when ready →</p>
    </div>
  );
}

// ─── Step 5: Repay ────────────────────────────────────────────────────────────

function RepaySection({ address, loanId }: { address: string; loanId: number }) {
  const { data: loans = [] } = useLoans();
  const repay = useRepayLoan();
  const [amount, setAmount] = useState('');
  const [ptBalance, setPtBalance] = useState<bigint | null>(null);
  const loan = loans.find(l => l.id === loanId);

  // Fetch PTUSDC balance so we can warn if the amount exceeds what the borrower holds
  useEffect(() => {
    if (!address) return;
    getBalances(address).then(bals => {
      const pt = bals.find(b =>
        'asset_code' in b && b.asset_code === 'PTUSDC'
      );
      if (pt && 'balance' in pt) {
        setPtBalance(BigInt(Math.round(parseFloat(pt.balance) * 10_000_000)));
      }
    }).catch(() => {});
  }, [address]);

  const accruedInterest = (() => {
    if (!loan || loan.totalRepaid >= loan.principal) return 0n;
    const nowSec = BigInt(Math.floor(Date.now() / 1000));
    const elapsedSec = nowSec > loan.originationTs ? nowSec - loan.originationTs : 0n;
    return (loan.principal * BigInt(loan.aprBps) * elapsedSec) / (10_000n * 365n * 86400n);
  })();

  const principalOutstanding = loan
    ? loan.principal > loan.totalRepaid ? loan.principal - loan.totalRepaid : 0n
    : 0n;
  const totalDue = principalOutstanding + accruedInterest;

  async function handleRepay(e: React.FormEvent) {
    e.preventDefault();
    const usdFloat = parseFloat(amount);
    if (isNaN(usdFloat) || usdFloat <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await repay.mutateAsync({ vaultId: VAULT_ID, loanId, amountUsdc: usdFloat });
      setAmount('');
      toast.success('Repayment submitted');

      // Only trigger collateral release if this repayment clears the full outstanding balance.
      // totalDue is in 7-decimal micro-USDC; usdFloat is in plain dollars.
      const isFullRepayment = BigInt(Math.round(usdFloat * 10_000_000)) >= totalDue;
      if (isFullRepayment) {
        fetch('/api/collateral/release', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loanId, borrowerAddress: address }),
        }).then(r => r.json()).then(d => {
          if (d.ok && !d.skipped) toast.success('Collateral released — returning to your EVM wallet');
        }).catch(() => {/* silent */});
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Repayment failed');
    }
  }

  return (
    <div className="space-y-3">
      {loan && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-4 space-y-3">
          <p className="font-mono text-[9px] text-emerald-400/50 uppercase tracking-widest">Loan #{loanId} · {loan.aprBps / 100}% APR</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Principal',        value: `$${formatUsdc(loan.principal, 2)}`,         color: 'text-white/60' },
              { label: 'Repaid',           value: `$${formatUsdc(loan.totalRepaid, 2)}`,        color: 'text-emerald-400' },
              { label: 'Principal left',   value: `$${formatUsdc(principalOutstanding, 2)}`,    color: 'text-white/60' },
              { label: 'Accrued interest', value: `$${formatUsdc(accruedInterest, 2)}`,          color: 'text-amber-400/80' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg bg-black/20 px-2.5 py-2">
                <p className="font-mono text-[8px] text-white/20 uppercase">{label}</p>
                <p className={`font-mono text-xs mt-0.5 ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.05] pt-2.5">
            <p className="font-mono text-[9px] text-white/30 uppercase tracking-widest">Total due</p>
            <p className="font-mono text-sm font-bold text-white">${formatUsdc(totalDue, 2)}</p>
          </div>
        </div>
      )}
      <form onSubmit={handleRepay} className="space-y-3">
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">Repay Amount (USDC)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-white/25 text-sm">$</span>
            <input type="number" min="0.0000001" step="any" placeholder="0.00"
              value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-black/30 pl-7 pr-4 py-2.5 font-mono text-sm text-white placeholder:text-white/15 focus:border-white/15 focus:outline-none"
              required />
          </div>
          {totalDue > 0n && (
            <button type="button" onClick={() => setAmount(formatUsdc(totalDue, 2))}
              className="mt-1.5 font-mono text-[9px] text-[#e54b73] hover:underline">
              Repay full amount with interest (${formatUsdc(totalDue, 2)})
            </button>
          )}
          {/* Warn if repayment amount exceeds PTUSDC balance */}
          {ptBalance !== null && amount && (() => {
            const amtMicro = BigInt(Math.round(parseFloat(amount) * 10_000_000));
            const shortfall = amtMicro - ptBalance;
            if (shortfall > 0n) return (
              <div className="mt-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2">
                <p className="font-mono text-[9px] text-amber-300">
                  Your PTUSDC balance (${formatUsdc(ptBalance, 2)}) is ${formatUsdc(shortfall, 4)} short.
                  Ask the admin to mint extra PTUSDC to your wallet to cover the interest.
                </p>
              </div>
            );
          })()}
        </div>
        <button type="submit" disabled={repay.isPending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-40 transition-all">
          {repay.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…</> : <>Repay <ArrowRight className="h-3.5 w-3.5" /></>}
        </button>
      </form>
      <p className="font-mono text-[9px] text-white/15 text-center">Simple APR from origination date · contract closes on full repayment</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function BorrowPageInner() {
  const { address, connected, connect } = useStellarWallet();
  const { getByBorrower, isLoading, clearAll } = useLoanApplications();
  const { data: loans = [] } = useLoans();
  const vaultState = useVaultState(VAULT_ID);
  const app = address ? getByBorrower(address) : undefined;

  const loanId      = app?.loanId;
  const onChainLoan = loanId != null ? loans.find(l => l.id === loanId) : undefined;
  const { data: collateral } = useCollateralRecord(loanId ?? undefined);

  const reserve    = vaultState.data?.reserveBalance ?? 0n;
  const activeLoans = loans.filter(l => l.state === 'Active' || l.state === 'Repaying').length;
  const utilization = vaultState.data?.vault
    ? (() => {
        const v = vaultState.data.vault as { total_assets?: bigint };
        const total = BigInt(String(v.total_assets ?? 0n));
        return total > 0n ? Math.round(Number((reserve * 100n) / total)) : 0;
      })()
    : 0;

  const isComplete = onChainLoan?.state === 'Repaid' || onChainLoan?.state === 'Defaulted';

  const step: 1 | 2 | 3 | 4 | 5 = (() => {
    if (!app || isComplete) return 1;
    if (app.status === 'rejected' || app.status === 'pending') return 2;
    if (app.status === 'approved' && loanId != null) {
      if (onChainLoan?.state === 'Active' || onChainLoan?.state === 'Repaying') return 5;
      if (collateral?.status === 'Attached') return 4;
      return 3;
    }
    return 2;
  })();

  // ── Not connected ────────────────────────────────────────────────────────────

  if (!connected || !address) {
    return (
      <div className="w-full max-w-[1800px] mx-auto space-y-5 pb-10">
        {/* Hero */}
        <section className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden">
          <div className="px-8 py-8">
            <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">PRISM Protocol · Credit</p>
            <h1 className="mt-1 font-sans text-3xl font-semibold tracking-tight text-white">Credit Facility</h1>
            <p className="mt-2 font-sans text-sm text-white/40 max-w-md leading-relaxed">
              Institutional-grade undercollateralised lending on Stellar Soroban. Lock cross-chain collateral on Ethereum, receive USDC on Stellar.
            </p>
          </div>
        </section>

        {/* Market stats */}
        <MarketStats reserve={reserve} activeLoans={activeLoans} />

        {/* Protocol info grid */}
        <ProtocolInfoGrid />
      </div>
    );
  }

  // ── Connected ────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-5 pb-10">

      {/* ── Hero header ──────────────────────────────────────────── */}
      <section className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden">
        <div className="px-8 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">PRISM Protocol · Credit Facility</p>
            <h1 className="mt-0.5 font-sans text-2xl font-semibold tracking-tight text-white">Borrow</h1>
            <p className="mt-1 font-mono text-[10px] text-white/30">
              {address.slice(0, 8)}…{address.slice(-6)} · Stellar Testnet
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.03] bg-white/[0.01]">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[9px] text-white/30">Live · Soroban Testnet</span>
            </div>
            {app && !isComplete && (
              <div className={`px-3 py-1.5 rounded-full border font-mono text-[9px] ${
                step === 5 ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300'
                : step === 4 ? 'border-[#4a9ec9]/20 bg-[#4a9ec9]/[0.06] text-[#4a9ec9]'
                : step >= 2 ? 'border-amber-500/20 bg-amber-500/[0.06] text-amber-300'
                : 'border-white/[0.03] text-white/30'
              }`}>
                {step === 5 ? 'Active Loan' : step === 4 ? 'Awaiting Disbursal' : step === 3 ? 'Collateral Required' : step === 2 ? 'Under Review' : 'No Active Loan'}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Market stats ─────────────────────────────────────────── */}
      <MarketStats reserve={reserve} activeLoans={activeLoans} />

      {/* ── Main two-column layout ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">

        {/* Left: Protocol info */}
        <div className="space-y-5">
          <ProtocolInfoGrid />

          {/* How collateral works */}
          <section className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] p-6">
            <p className="font-mono text-[9px] text-white/25 mb-1">Cross-Chain</p>
            <h2 className="font-sans text-base font-semibold text-white mb-5">How Collateral Works</h2>
            <div className="space-y-4">
              {[
                { n: '01', icon: Lock,      title: 'Lock on Ethereum',    desc: 'Connect MetaMask and lock ETH, USDC, or wETH in the PRISM vault contract on Ethereum Sepolia.' },
                { n: '02', icon: Activity,  title: 'Oracle Detects',      desc: 'The PRISM Collateral Oracle watches the vault contract and detects your lock within 3 block confirmations.' },
                { n: '03', icon: ShieldCheck, title: 'Stellar Attestation', desc: 'Oracle signs a 73-byte Ed25519 message and submits it to Soroban — collateral status flips to Attached.' },
                { n: '04', icon: Zap,       title: 'Funds Disbursed',     desc: 'Admin disburses TUSDC from the vault to your Stellar wallet. Repay principal + accrued interest to close.' },
              ].map(({ n, icon: Icon, title, desc }) => (
                <div key={n} className="flex gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.05] bg-white/[0.02]">
                    <Icon className="h-3.5 w-3.5 text-white/30" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-[9px] text-white/20">{n}</span>
                      <p className="font-sans text-sm font-medium text-white/80">{title}</p>
                    </div>
                    <p className="font-mono text-[10px] text-white/35 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Supported collateral */}
          <section className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] p-6">
            <p className="font-mono text-[9px] text-white/25 mb-1">Testnet</p>
            <h2 className="font-sans text-base font-semibold text-white mb-4">Accepted Collateral</h2>
            <div className="space-y-2">
              {[
                { symbol: 'ETH',  name: 'Ethereum',      chain: 'Ethereum Sepolia', color: '#627EEA', note: 'Native — no approval needed' },
                { symbol: 'USDC', name: 'Mock USDC',      chain: 'Ethereum Sepolia', color: '#2775CA', note: '6 decimals · ERC-20' },
                { symbol: 'wETH', name: 'Mock wETH',      chain: 'Ethereum Sepolia', color: '#7B3FE4', note: '18 decimals · ERC-20' },
              ].map(({ symbol, name, chain, color, note }) => (
                <div key={symbol} className="flex items-center justify-between rounded-xl border border-white/[0.03] bg-white/[0.01] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-[10px] font-bold font-mono text-white shrink-0"
                      style={{ backgroundColor: `${color}20`, border: `1px solid ${color}30` }}>
                      {symbol.slice(0, 1)}
                    </div>
                    <div>
                      <p className="font-sans text-sm font-medium text-white/80">{symbol}</p>
                      <p className="font-mono text-[9px] text-white/25">{name} · {chain}</p>
                    </div>
                  </div>
                  <span className="font-mono text-[9px] text-white/20">{note}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 font-mono text-[9px] text-white/20">
              Mainnet: ETH, USDC, USDT, wETH, wBTC on Base · Arbitrum · Ethereum
            </p>
          </section>
        </div>

        {/* Right: Application flow */}
        <div className="space-y-4">

          {/* Loan complete */}
          {isComplete && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="font-sans text-base font-semibold text-emerald-300">
                    {onChainLoan?.state === 'Defaulted' ? 'Loan Defaulted' : 'Loan Fully Repaid'}
                  </p>
                  <p className="font-mono text-[9px] text-white/25 mt-0.5">Loan #{loanId} · {onChainLoan?.state} on Stellar</p>
                </div>
              </div>
              {onChainLoan && (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Principal',    value: `$${formatUsdc(onChainLoan.principal, 2)}` },
                    { label: 'Total Repaid', value: `$${formatUsdc(onChainLoan.totalRepaid, 2)}` },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-lg bg-black/20 px-3 py-2.5">
                      <p className="font-mono text-[9px] text-white/20 uppercase">{label}</p>
                      <p className="font-mono text-sm text-white/55 mt-0.5">{value}</p>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={async () => { await clearAll('approved'); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-black hover:bg-white/90 transition-all">
                Start New Application <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Step flow card */}
          {!isComplete && (
            <div className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] p-6">
              <Steps current={step} />

              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-white/20" />
                </div>
              ) : step === 1 ? (
                <>
                  <p className="font-mono text-[9px] text-white/25 mb-1 uppercase tracking-widest">New Application</p>
                  <h2 className="font-sans text-base font-semibold text-white mb-4">Request a Credit Facility</h2>
                  <ApplyForm address={address} />
                </>
              ) : step === 2 ? (
                <>
                  <h2 className="font-sans text-base font-semibold text-white mb-3">Application Status</h2>
                  <ApplicationStatus app={app!} onReset={() => {}} />
                </>
              ) : step === 3 ? (
                <>
                  <p className="font-mono text-[9px] text-white/25 mb-1 uppercase tracking-widest">Ethereum Sepolia</p>
                  <h2 className="font-sans text-base font-semibold text-white mb-4">Lock Collateral</h2>
                  <EVMCollateralStep
                    stellarAddress={address}
                    loanId={loanId!}
                    requestedUSDC={app!.requestedUSDC}
                    collateralStatus={collateral?.status}
                  />
                </>
              ) : step === 4 ? (
                <>
                  <h2 className="font-sans text-base font-semibold text-white mb-3">Awaiting Disbursal</h2>
                  <ActiveLoanNotice loanId={loanId!} />
                </>
              ) : (
                <>
                  <h2 className="font-sans text-base font-semibold text-white mb-3">Repay Loan</h2>
                  <RepaySection address={address} loanId={loanId!} />
                </>
              )}
            </div>
          )}

          {/* Risk disclosure */}
          <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] px-4 py-3">
            <p className="font-mono text-[9px] text-white/20 leading-relaxed">
              Credit facilities are issued on Stellar Soroban testnet. Collateral is held in an immutable Ethereum escrow contract. Liquidation requires 2-of-3 Gnosis Safe approval. Not financial advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Market Stats Strip ───────────────────────────────────────────────────────

function MarketStats({ reserve, activeLoans }: { reserve: bigint; activeLoans: number }) {
  const stats = [
    { label: 'Available Credit',  value: `$${formatUsdc(reserve, 0)}`,           icon: TrendingUp,  color: 'text-emerald-400' },
    { label: 'Current APR',       value: `${DEFAULT_APR_BPS / 100}%`,             icon: Activity,    color: 'text-[#e54b73]'   },
    { label: 'Min Collateral',    value: '120%',                                   icon: Shield,      color: 'text-amber-400'   },
    { label: 'Active Loans',      value: String(activeLoans),                      icon: Layers,      color: 'text-[#4a9ec9]'   },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] px-5 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`h-3.5 w-3.5 ${color}`} />
            <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">{label}</p>
          </div>
          <p className={`font-sans text-2xl font-semibold tracking-tight ${color}`}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Protocol Info Grid ───────────────────────────────────────────────────────

function ProtocolInfoGrid() {
  return (
    <section className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="font-mono text-[9px] text-white/25">PRISM Credit · Parameters</p>
          <h2 className="mt-0.5 font-sans text-base font-semibold tracking-tight text-white">Protocol Terms</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[9px] text-emerald-400/55">Live</span>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Max Loan Size',       value: '$500,000',    sub: 'USDC per facility'        },
          { label: 'Interest Rate',        value: '8.0% APR',   sub: 'Simple, accrues per second'},
          { label: 'Min Collateral Ratio', value: '120%',        sub: 'Of loan principal'        },
          { label: 'Loan Terms',           value: '30–180 days', sub: 'Flexible maturity'        },
          { label: 'Collateral Chains',    value: 'Ethereum',    sub: 'Base · Arbitrum (soon)'   },
          { label: 'Settlement',           value: 'Stellar',     sub: 'Soroban smart contract'   },
        ].map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl border border-white/[0.03] bg-white/[0.01] px-4 py-3.5">
            <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest mb-1">{label}</p>
            <p className="font-sans text-sm font-semibold text-white/80">{value}</p>
            <p className="font-mono text-[9px] text-white/20 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Page wrapper ─────────────────────────────────────────────────────────────

export default function BorrowPage() {
  return (
    <BorrowerProvider>
      <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain] px-4 pt-7 pb-4">
        <BorrowPageInner />
      </div>
    </BorrowerProvider>
  );
}
