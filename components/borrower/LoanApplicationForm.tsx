'use client';

import { useState } from 'react';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { toast } from 'sonner';
import { useLoanApplications, type LoanApplication } from '@/hooks/useLoanApplications';

interface Props {
  onSubmitted?: () => void;
}

const MATURITY_OPTIONS = [
  { label: '30 days', value: 30 },
  { label: '60 days', value: 60 },
  { label: '90 days', value: 90 },
  { label: '180 days', value: 180 },
];

const PURPOSE_OPTIONS = [
  'Working capital',
  'Inventory purchase',
  'Equipment financing',
  'Trade finance',
  'Real estate bridge',
  'Other',
];

const STATUS_UI: Record<LoanApplication['status'], { label: string; cls: string }> = {
  pending:  { label: 'Under Review', cls: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  approved: { label: 'Approved',     cls: 'bg-green-50 text-green-800 border-green-200' },
  rejected: { label: 'Rejected',     cls: 'bg-red-50 text-red-800 border-red-200' },
};

export function LoanApplicationForm({ onSubmitted }: Props) {
  const { address: publicKey, connected } = useStellarWallet();
  const { submit, getByBorrower } = useLoanApplications();

  const existing = publicKey ? getByBorrower(publicKey) : undefined;

  const [amount, setAmount] = useState('10000');
  const [maturityDays, setMaturityDays] = useState(90);
  const [purpose, setPurpose] = useState('Working capital');
  const [submitting, setSubmitting] = useState(false);

  if (!connected || !publicKey) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-black/35 p-8 text-center">
        <p className="text-sm text-white/40">
          Connect your Phantom wallet to apply for a loan.
        </p>
      </div>
    );
  }

  if (existing) {
    const ui = STATUS_UI[existing.status];
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">Loan Application</h3>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-wider ${ui.cls.replace('bg-yellow-50', 'bg-yellow-500/10').replace('text-yellow-800', 'text-yellow-400').replace('border-yellow-200', 'border-yellow-500/30').replace('bg-green-50', 'bg-green-500/10').replace('text-green-800', 'text-green-400').replace('border-green-200', 'border-green-500/30').replace('bg-red-50', 'bg-red-500/10').replace('text-red-800', 'text-red-400').replace('border-red-200', 'border-red-500/30')}`}>
            {ui.label}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Requested</div>
            <div className="text-xl font-display text-white">${Number(existing.requestedUSDC).toLocaleString()} <span className="text-sm text-white/40 font-sans">USDC</span></div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Maturity</div>
            <div className="text-lg text-white/90">{existing.maturityDays} <span className="text-sm text-white/40">days</span></div>
          </div>

          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Purpose</div>
            <div className="text-sm text-white/70">{existing.purpose}</div>
          </div>

          {existing.approvedAprBps !== undefined && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-white/40">APR</div>
              <div className="text-lg font-medium text-green-400">{(existing.approvedAprBps / 100).toFixed(2)}%</div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-white/5 space-y-3">
          {existing.loanId !== undefined && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-white/40">Loan ID</span>
              <span className="font-mono text-white/60">{existing.loanId}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-white/40">Submitted</span>
            <span className="text-white/30">{new Date(existing.submittedAt).toLocaleString()}</span>
          </div>
        </div>

        {existing.status === 'pending' && (
          <div className="rounded-lg bg-white/[0.04] border border-white/5 p-4 flex gap-3">
            <div className="h-2 w-2 rounded-full bg-yellow-400 mt-1 animate-pulse" />
            <p className="text-xs text-white/50 leading-5">
              Your application is under review. The admin will originate the loan on-chain once approved.
              Come back to attach IKA collateral after approval.
            </p>
          </div>
        )}

        {existing.status === 'approved' && existing.loanId !== undefined && (
          <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 flex gap-3">
            <div className="h-2 w-2 rounded-full bg-green-400 mt-1" />
            <p className="text-xs text-green-400/80 leading-5">
              Loan originated on-chain. Scroll down to attach IKA collateral to unlock disbursement.
            </p>
          </div>
        )}

        {existing.status === 'rejected' && (
          <button
            onClick={() => window.location.reload()}
            className="text-xs text-white/40 hover:text-white underline transition-colors"
          >
            Apply again
          </button>
        )}
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const usd = parseFloat(amount);
    if (isNaN(usd) || usd < 1000) {
      toast.error('Minimum loan amount is $1,000 USDC');
      return;
    }
    setSubmitting(true);
    try {
      submit({
        borrowerPubkey: publicKey!,
        requestedUSDC: usd,
        maturityDays,
        purpose,
        vaultId: 0,
      });
      toast.success('Application submitted! The admin will review shortly.');
      onSubmitted?.();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] backdrop-blur-sm p-6 space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-white">Apply for a Loan</h3>
        <p className="mt-2 text-xs text-white/50 leading-relaxed">
          Submit your loan request. The admin reviews and originates on-chain.
          You will need to back it with IKA dWallet collateral before disbursement.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-wider font-medium text-white/40">
            Loan Amount (USDC)
          </label>
          <div className="group relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-white/20 transition-colors group-focus-within:text-purple-400">$</span>
            <input
              type="number"
              min="1000"
              step="1000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] pl-8 pr-4 py-3 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:bg-white/[0.05]"
              required
            />
          </div>
          <p className="text-[10px] text-white/30 px-1">Min $1,000 — Max $500,000 USDC</p>
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-wider font-medium text-white/40">Loan Duration</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {MATURITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMaturityDays(opt.value)}
                className={`rounded-lg border py-2.5 text-xs font-medium transition-all ${
                  maturityDays === opt.value
                    ? 'border-purple-500/50 bg-purple-500/10 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                    : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/10 hover:text-white/60'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[10px] uppercase tracking-wider font-medium text-white/40">Purpose</label>
          <select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white appearance-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          >
            {PURPOSE_OPTIONS.map((p) => (
              <option key={p} value={p} className="bg-[#0a0a0a] text-white">{p}</option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-purple-500/[0.03] border border-purple-500/10 p-4 space-y-2">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-purple-400/80">
            <div className="h-1 w-1 rounded-full bg-purple-400" />
            Collateral requirement
          </div>
          <p className="text-xs text-white/50 leading-5">
            You will need to back this loan with BTC or ETH locked in an IKA dWallet (≥ 150% LTV).
            The IKA oracle will verify the lock before the admin can disburse.
          </p>
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-[10px] uppercase tracking-widest text-white/20">Applying as</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          
          <div className="flex flex-col items-center gap-1.5">
            <div className="font-mono text-[11px] text-white/40 bg-white/[0.03] px-3 py-1 rounded-full border border-white/5">
              {publicKey.slice(0, 12)}…{publicKey.slice(-12)}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-purple-600 px-4 py-4 text-sm font-semibold text-white shadow-lg shadow-purple-900/20 hover:bg-purple-500 hover:shadow-purple-900/40 active:scale-[0.98] transition-all disabled:opacity-50 disabled:active:scale-100"
        >
          {submitting ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>Submitting Application…</span>
            </div>
          ) : (
            'Submit Loan Application'
          )}
        </button>
      </form>
    </div>
  );
}
