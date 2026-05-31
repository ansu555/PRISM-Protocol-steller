'use client';

import Link from 'next/link';
import { CheckCircle2, Clock, FileText, Loader2, ShieldCheck, Trash2, TrendingUp, XCircle, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { formatUsdc } from '@/app/lib/format';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { useLoanApplications, type LoanApplication } from '@/hooks/useLoanApplications';
import { useVaultState } from '@/hooks/useVaultState';

const DEFAULT_APR_BPS = 800;

function statusStyles(status: LoanApplication['status']) {
  if (status === 'approved') return 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300';
  if (status === 'rejected') return 'border-rose-400/20 bg-rose-400/[0.07] text-rose-300';
  return 'border-amber-400/20 bg-amber-400/[0.07] text-amber-300';
}

export default function LoansAdminPage() {
  const wallet = useStellarWallet();
  const { vaultId, addLog } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const { applications, approve, reject, clearAll } = useLoanApplications();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const pending = applications.filter((app) => app.status === 'pending');
  const approved = applications.filter((app) => app.status === 'approved');
  const totalRequested = applications.reduce((sum, app) => sum + BigInt(Math.round(app.requestedUSDC * 10_000_000)), 0n);

  async function approveApplication(app: LoanApplication) {
    setBusyId(app.id);
    try {
      const principalMicro = BigInt(Math.round(app.requestedUSDC * 10_000_000));
      const res = await fetch('/api/simulation/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'init_loan',
          borrower: app.borrowerPubkey,
          principal: principalMicro.toString(),
          aprBps: DEFAULT_APR_BPS,
          maturityDays: app.maturityDays,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'init_loan failed');
      await approve(app.id, data.loanId, DEFAULT_APR_BPS);
      addLog(`Loan #${data.loanId} originated on Stellar for ${app.borrowerPubkey.slice(0, 8)}…`);
      toast.success(`Loan #${data.loanId} originated on Stellar`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleClearAll() {
    if (!confirm('Delete all loan applications? This cannot be undone.')) return;
    setClearing(true);
    try {
      await clearAll('all');
      toast.success('All loan applications cleared');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setClearing(false);
    }
  }

  async function rejectApplication(app: LoanApplication) {
    setBusyId(app.id);
    try {
      reject(app.id);
      addLog(`Loan application ${app.id.slice(0, 8)} rejected.`);
      toast.success('Application rejected');
    } finally {
      setBusyId(null);
    }
  }

  async function recordDisbursement(app: LoanApplication) {
    setBusyId(app.id);
    try {
      if (!wallet.address) throw new Error('Connect the Stellar admin wallet first');
      addLog(`Disbursement requested for loan #${app.loanId ?? 'unassigned'} (${app.requestedUSDC} USDC). Submit with the Soroban admin signer on testnet.`);
      toast.info('Disbursement recorded locally. No mainnet transaction was sent.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-full bg-background p-10">
      <div className="mx-auto max-w-[1500px] space-y-10">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-4xl text-white">Loan Operations</h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.28em] text-white/25">
              Borrower queue · Collateral attestations · Vault #{vaultId}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {applications.length > 0 && (
              <button
                onClick={handleClearAll}
                disabled={clearing}
                className="flex items-center gap-1.5 rounded-full border border-rose-500/20 bg-rose-500/[0.06] px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-rose-300 hover:bg-rose-500/[0.12] disabled:opacity-40 transition-all"
              >
                {clearing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                Clear All
              </button>
            )}
            <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/35">
              {wallet.address ? `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}` : 'Admin wallet disconnected'}
            </div>
          </div>
        </header>

        <div className="grid gap-5 md:grid-cols-4">
          {[
            { label: 'Pending', value: String(pending.length), icon: Clock },
            { label: 'Approved', value: String(approved.length), icon: ShieldCheck },
            { label: 'Requested', value: `$${formatUsdc(totalRequested, 0)}`, icon: TrendingUp },
            { label: 'Reserve', value: `$${formatUsdc(vaultState.data?.reserveBalance ?? 0n, 0)}`, icon: CheckCircle2 },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
              <item.icon className="mb-5 h-5 w-5 text-white/30" />
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{item.label}</div>
              <div className="mt-2 font-display text-2xl text-white">{item.value}</div>
            </div>
          ))}
        </div>

        <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-6">
          <div className="space-y-3">
            {applications.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/[0.08] p-16 text-center">
                <FileText className="mb-4 h-10 w-10 text-white/15" />
                <h2 className="font-display text-2xl text-white">No applications yet</h2>
                <p className="mt-2 max-w-md text-sm text-white/40">Borrower submissions from the Stellar flow will appear here for review.</p>
              </div>
            ) : applications.map((app) => (
              <div key={app.id} className="grid gap-4 rounded-3xl border border-white/[0.06] bg-black/25 p-5 lg:grid-cols-[1fr_180px_260px] lg:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Link href={`/admin/loans/${app.id}`} className="font-display text-xl text-white hover:text-emerald-200">
                      {app.purpose || 'Credit facility'}
                    </Link>
                    <span className={`rounded-full border px-3 py-1 font-mono text-[9px] uppercase tracking-[0.18em] ${statusStyles(app.status)}`}>
                      {app.status}
                    </span>
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-white/35">
                    Borrower {app.borrowerPubkey.slice(0, 8)}... · Loan #{app.loanId ?? 'unassigned'} · {app.maturityDays}d
                  </p>
                </div>
                <div className="font-display text-2xl text-white">${app.requestedUSDC.toLocaleString()}</div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {app.status === 'pending' ? (
                    <>
                      <button onClick={() => rejectApplication(app)} disabled={busyId === app.id} className="rounded-xl border border-rose-400/20 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-rose-200 disabled:opacity-40">
                        <XCircle className="mr-1 inline h-3 w-3" /> Reject
                      </button>
                      <button onClick={() => approveApplication(app)} disabled={busyId === app.id} className="rounded-xl bg-emerald-400 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-black disabled:opacity-40">
                        {busyId === app.id ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 inline h-3 w-3" />} Approve
                      </button>
                    </>
                  ) : app.status === 'approved' ? (
                    <button onClick={() => recordDisbursement(app)} disabled={busyId === app.id} className="rounded-xl bg-white px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-black disabled:opacity-40">
                      <Zap className="mr-1 inline h-3 w-3" /> Record Disbursement
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
