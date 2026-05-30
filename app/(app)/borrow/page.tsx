'use client';

import { useState } from 'react';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useRepayLoan } from '@/hooks/useRepayLoan';
import { BorrowerProvider } from '@/hooks/useBorrowerState';
import { formatUsdc } from '@/app/lib/format';
import { useLoans } from '@/hooks/useLoans';
import { useCollateralRecord, useLockCollateral, CHAIN_OPTIONS } from '@/hooks/useCollateralFlow';
import { VAULT_ID } from '@/app/lib/constants';
import {
  CheckCircle2,
  Clock,
  ArrowRight,
  Wallet,
  XCircle,
  Loader2,
  RefreshCcw,
  Lock,
  ShieldCheck,
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
    <div className="flex items-center gap-0 mb-8">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-mono text-[11px] font-bold uppercase tracking-widest transition-all ${
            current === s.n
              ? 'bg-white text-black'
              : current > s.n
              ? 'text-white/50'
              : 'text-white/20'
          }`}>
            {current > s.n
              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              : <span className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] border ${
                  current === s.n ? 'border-black bg-black text-white' : 'border-white/20 text-white/30'
                }`}>{s.n}</span>
            }
            {s.label}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-12 h-px mx-1 ${current > s.n ? 'bg-emerald-400/40' : 'bg-white/10'}`} />
          )}
        </div>
      ))}
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
      await submit({
        borrowerPubkey: address,
        requestedUSDC: usd,
        maturityDays: maturity,
        purpose,
        vaultId: VAULT_ID,
      });
      toast.success('Application submitted — admin will review shortly');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Amount */}
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-widest text-white/40 mb-2">
          Loan Amount (USDC)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-white/30 text-sm">$</span>
          <input
            type="number"
            min="100"
            max="500000"
            step="100"
            placeholder="10,000"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f0f] pl-8 pr-4 py-3 font-mono text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            required
          />
        </div>
        <div className="flex gap-2 mt-2">
          {[1000, 5000, 10000, 25000].map(v => (
            <button key={v} type="button" onClick={() => setAmount(String(v))}
              className="px-3 py-1 rounded-full border border-white/[0.06] font-mono text-[9px] text-white/30 hover:text-white/70 hover:border-white/20 transition-all">
              ${v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Maturity */}
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-widest text-white/40 mb-2">
          Loan Term
        </label>
        <div className="flex gap-2">
          {MATURITY_OPTIONS.map(d => (
            <button key={d} type="button" onClick={() => setMaturity(d)}
              className={`flex-1 py-2.5 rounded-xl border font-mono text-[11px] font-semibold transition-all ${
                maturity === d
                  ? 'border-white/30 bg-white/[0.08] text-white'
                  : 'border-white/[0.06] text-white/30 hover:text-white/60 hover:border-white/10'
              }`}>
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Purpose */}
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-widest text-white/40 mb-2">
          Purpose
        </label>
        <select
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
          className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f0f] px-4 py-3 font-mono text-sm text-white/70 focus:border-white/20 focus:outline-none"
        >
          {PURPOSE_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Submit */}
      <button type="submit" disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-50 transition-all">
        {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</> : <>Submit Application <ArrowRight className="h-4 w-4" /></>}
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
    <div className="space-y-4">
      {/* Status card */}
      <div className={`rounded-2xl border p-5 ${
        isPending  ? 'border-amber-500/20 bg-amber-500/[0.04]'
        : isApproved ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
        : 'border-rose-500/20 bg-rose-500/[0.04]'
      }`}>
        <div className="flex items-center gap-3 mb-4">
          {isPending  && <Clock className="h-5 w-5 text-amber-400" />}
          {isApproved && <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          {isRejected && <XCircle className="h-5 w-5 text-rose-400" />}
          <div>
            <p className={`font-sans text-base font-semibold ${
              isPending ? 'text-amber-300' : isApproved ? 'text-emerald-300' : 'text-rose-300'
            }`}>
              {isPending ? 'Under Review' : isApproved ? 'Approved' : 'Rejected'}
            </p>
            <p className="font-mono text-[10px] text-white/30 mt-0.5">
              {isPending ? 'Admin is reviewing your application'
              : isApproved ? 'Funds will be disbursed to your wallet'
              : 'Your application was not approved'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Amount', value: `$${app.requestedUSDC.toLocaleString()}` },
            { label: 'Term', value: `${app.maturityDays} days` },
            { label: 'Purpose', value: app.purpose },
            { label: 'APR', value: app.approvedAprBps ? `${(app.approvedAprBps / 100).toFixed(1)}%` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-black/20 px-3 py-2.5">
              <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">{label}</p>
              <p className="font-mono text-sm text-white/70 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {isApproved && (
        <div className="rounded-xl border border-white/[0.06] bg-[#0f0f0f] p-4">
          <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest">Next step</p>
          <p className="font-sans text-sm text-white/60 mt-1">
            The admin will disburse PTUSDC to your wallet. Once received, use the <strong className="text-white">Repay</strong> tab to return the funds.
          </p>
        </div>
      )}

      {isRejected && (
        <button onClick={onReset}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/[0.06] py-3 font-mono text-[11px] text-white/40 hover:text-white/70 hover:border-white/20 transition-all">
          <RefreshCcw className="h-3.5 w-3.5" /> Apply Again
        </button>
      )}
    </div>
  );
}

// ─── Step 3: Lock Collateral ──────────────────────────────────────────────────
function CollateralStep({ address, loanId }: { address: string; loanId: number }) {
  const { data: collateral, isLoading: collLoading } = useCollateralRecord(loanId);
  const lock = useLockCollateral();
  const [chainId, setChainId] = useState(3); // XLM default
  const [amount, setAmount]   = useState('');

  const isLocked = collateral?.status === 'Attached';

  async function handleLock(e: React.FormEvent) {
    e.preventDefault();
    const usdVal = parseFloat(amount);
    if (isNaN(usdVal) || usdVal <= 0) { toast.error('Enter a valid USD value'); return; }
    try {
      await lock.mutateAsync({ loanId, chainId, amountUsd: usdVal });
      toast.success('Collateral locked — admin can now disburse your loan');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Collateral lock failed');
    }
  }

  if (collLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-white/20" /></div>;

  if (isLocked) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 space-y-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="font-sans text-base font-semibold text-emerald-300">Collateral Locked</p>
            <p className="font-mono text-[10px] text-white/30">Oracle verified · admin can now disburse</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-2">
          <div className="rounded-lg bg-black/20 px-3 py-2.5">
            <p className="font-mono text-[9px] text-white/25 uppercase">Value (USD)</p>
            <p className="font-mono text-sm text-white/70">
              ${(Number(collateral.amountUsdMicro) / 1_000_000).toFixed(2)}
            </p>
          </div>
          <div className="rounded-lg bg-black/20 px-3 py-2.5">
            <p className="font-mono text-[9px] text-white/25 uppercase">Status</p>
            <p className="font-mono text-sm text-emerald-400">Attached</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleLock} className="space-y-5">
      <div className="rounded-xl border border-white/[0.06] bg-[#0f0f0f] p-4">
        <p className="font-mono text-[10px] text-white/30 mb-1">Why lock collateral?</p>
        <p className="font-sans text-sm text-white/50 leading-relaxed">
          Securing collateral is required before your loan is disbursed. The PRISM oracle verifies your collateral on-chain.
        </p>
      </div>

      {/* Chain */}
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-widest text-white/40 mb-2">Collateral Asset</label>
        <div className="grid grid-cols-2 gap-2">
          {CHAIN_OPTIONS.map(c => (
            <button key={c.id} type="button" onClick={() => setChainId(c.id)}
              className={`py-2.5 px-3 rounded-xl border text-left transition-all ${
                chainId === c.id
                  ? 'border-white/30 bg-white/[0.06] text-white'
                  : 'border-white/[0.06] text-white/30 hover:border-white/10 hover:text-white/60'
              }`}>
              <p className="font-mono text-[11px] font-semibold">{c.symbol}</p>
              <p className="font-mono text-[9px] text-white/30 mt-0.5">{c.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* USD value */}
      <div>
        <label className="block font-mono text-[10px] uppercase tracking-widest text-white/40 mb-2">
          Collateral Value (USD)
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-white/30 text-sm">$</span>
          <input
            type="number" min="0" step="any" placeholder="0.00"
            value={amount} onChange={e => setAmount(e.target.value)}
            className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f0f] pl-8 pr-4 py-3 font-mono text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            required
          />
        </div>
        <p className="mt-1 font-mono text-[9px] text-white/20">
          Minimum 120% of loan value (collateral ratio requirement)
        </p>
      </div>

      <button type="submit" disabled={lock.isPending}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-50 transition-all">
        {lock.isPending
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Locking Collateral…</>
          : <><Lock className="h-4 w-4" /> Lock Collateral</>}
      </button>
    </form>
  );
}

// ─── Step 4: Active (disbursed, waiting for repay) ────────────────────────────
function ActiveLoanNotice({ loanId }: { loanId: number }) {
  const { data: loans = [] } = useLoans();
  const loan = loans.find(l => l.id === loanId);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#4a9ec9]/20 bg-[#4a9ec9]/[0.04] p-5">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircle2 className="h-5 w-5 text-[#4a9ec9]" />
          <div>
            <p className="font-sans text-base font-semibold text-[#4a9ec9]">Funds Disbursed</p>
            <p className="font-mono text-[10px] text-white/30">PTUSDC sent to your wallet · Loan #{loanId} active</p>
          </div>
        </div>
        {loan && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Principal', value: `$${formatUsdc(loan.principal, 2)}` },
              { label: 'APR', value: `${(loan.aprBps / 100).toFixed(1)}%` },
              { label: 'Outstanding', value: `$${formatUsdc(loan.principal - loan.totalRepaid, 2)}` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-black/20 px-3 py-2.5">
                <p className="font-mono text-[9px] text-white/25 uppercase">{label}</p>
                <p className="font-mono text-sm text-white/70">{value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="text-center font-mono text-[10px] text-white/25">
        Move to the <strong className="text-white/50">Repay</strong> tab when ready →
      </p>
    </div>
  );
}

// ─── Step 5: Repay ────────────────────────────────────────────────────────────
function RepaySection({ address, loanId }: { address: string; loanId: number }) {
  const { data: loans = [] } = useLoans();
  const repay = useRepayLoan();
  const [amount, setAmount] = useState('');

  const loan = loans.find(l => l.id === loanId);
  const outstanding = loan ? loan.principal - loan.totalRepaid : 0n;

  async function handleRepay(e: React.FormEvent) {
    e.preventDefault();
    const usdFloat = parseFloat(amount);
    if (isNaN(usdFloat) || usdFloat <= 0) { toast.error('Enter a valid amount'); return; }
    try {
      await repay.mutateAsync({ vaultId: VAULT_ID, loanId, amountUsdc: usdFloat });
      setAmount('');
      toast.success('Repayment submitted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Repayment failed');
    }
  }

  return (
    <div className="space-y-4">
      {/* Loan summary */}
      {loan && (
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5">
          <p className="font-mono text-[10px] text-emerald-400/60 uppercase tracking-widest mb-3">Active Loan #{loanId}</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="font-mono text-[9px] text-white/25 uppercase">Principal</p>
              <p className="font-mono text-sm text-white/70">${formatUsdc(loan.principal, 2)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] text-white/25 uppercase">Repaid</p>
              <p className="font-mono text-sm text-emerald-400">${formatUsdc(loan.totalRepaid, 2)}</p>
            </div>
            <div>
              <p className="font-mono text-[9px] text-white/25 uppercase">Outstanding</p>
              <p className="font-mono text-sm text-white">${formatUsdc(outstanding, 2)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Repay form */}
      <form onSubmit={handleRepay} className="space-y-4">
        <div>
          <label className="block font-mono text-[10px] uppercase tracking-widest text-white/40 mb-2">
            Repay Amount (USDC)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-white/30 text-sm">$</span>
            <input
              type="number"
              min="0.0000001"
              step="any"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full rounded-xl border border-white/[0.06] bg-[#0f0f0f] pl-8 pr-4 py-3 font-mono text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
              required
            />
          </div>
          {outstanding > 0n && (
            <button type="button" onClick={() => setAmount(formatUsdc(outstanding, 2))}
              className="mt-2 font-mono text-[9px] text-[#e54b73] hover:underline">
              Repay full outstanding (${formatUsdc(outstanding, 2)})
            </button>
          )}
        </div>

        <button type="submit" disabled={repay.isPending}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-50 transition-all">
          {repay.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : <>Repay <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function BorrowPageInner() {
  const { address, connected, connect } = useStellarWallet();
  const { getByBorrower, isLoading } = useLoanApplications();
  const { data: loans = [] } = useLoans();
  const app = address ? getByBorrower(address) : undefined;

  const loanId   = app?.loanId;
  const onChainLoan = loanId != null ? loans.find(l => l.id === loanId) : undefined;
  const { data: collateral } = useCollateralRecord(loanId ?? undefined);

  // 5-step flow:
  // 1 = no application
  // 2 = pending/rejected
  // 3 = approved but collateral not locked yet
  // 4 = collateral locked (Attached) but loan not yet active on-chain
  // 5 = loan active on-chain → repay
  const step: 1 | 2 | 3 | 4 | 5 = (() => {
    if (!app) return 1;
    if (app.status === 'rejected' || app.status === 'pending') return 2;
    if (app.status === 'approved' && loanId != null) {
      if (onChainLoan?.state === 'Active' || onChainLoan?.state === 'Repaying') return 5;
      if (collateral?.status === 'Attached') return 4;
      return 3; // approved, collateral not yet locked
    }
    return 2;
  })();

  if (!connected || !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.06] bg-[#0f0f0f]">
          <Wallet className="h-6 w-6 text-white/30" />
        </div>
        <div className="text-center">
          <h2 className="font-sans text-xl font-semibold text-white mb-2">Connect your wallet</h2>
          <p className="font-mono text-sm text-white/40">Connect Freighter to apply for a credit facility</p>
        </div>
        <button onClick={() => connect()}
          className="flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 transition-all">
          Connect Wallet <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-sans text-2xl font-semibold text-white">Credit Facility</h1>
        <p className="font-mono text-[10px] text-white/30 mt-1 uppercase tracking-widest">
          Stellar Testnet · {address.slice(0, 6)}…{address.slice(-6)}
        </p>
      </div>

      {/* Step indicator */}
      <Steps current={step} />

      {/* Card */}
      <div className="rounded-2xl border border-white/[0.04] bg-[#0f0f0f] p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-white/20" />
          </div>
        ) : step === 1 ? (
          <>
            <h2 className="font-sans text-base font-semibold text-white mb-1">New Application</h2>
            <p className="font-mono text-[10px] text-white/30 mb-5">Up to $500,000 USDC · Institutional underwriting</p>
            <ApplyForm address={address} />
          </>
        ) : step === 2 ? (
          <>
            <h2 className="font-sans text-base font-semibold text-white mb-4">Application Status</h2>
            <ApplicationStatus app={app!} onReset={() => {}} />
          </>
        ) : step === 3 ? (
          <>
            <h2 className="font-sans text-base font-semibold text-white mb-1">Lock Collateral</h2>
            <p className="font-mono text-[10px] text-white/30 mb-5">Required before admin disburses funds</p>
            <CollateralStep address={address} loanId={loanId!} />
          </>
        ) : step === 4 ? (
          <>
            <h2 className="font-sans text-base font-semibold text-white mb-4">Awaiting Disbursal</h2>
            <ActiveLoanNotice loanId={loanId!} />
          </>
        ) : (
          <>
            <h2 className="font-sans text-base font-semibold text-white mb-4">Repay Loan</h2>
            <RepaySection address={address} loanId={loanId!} />
          </>
        )}
      </div>

      {/* Footer note */}
      <p className="mt-4 text-center font-mono text-[9px] text-white/15 uppercase tracking-widest">
        Powered by PRISM Protocol · Soroban Testnet
      </p>
    </div>
  );
}

export default function BorrowPage() {
  return (
    <BorrowerProvider>
      <div data-app-scroll className="relative flex-1 overflow-y-auto [overscroll-behavior:contain]">
        <BorrowPageInner />
      </div>
    </BorrowerProvider>
  );
}
