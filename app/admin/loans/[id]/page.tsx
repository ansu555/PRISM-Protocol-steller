'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowUpRight, CheckCircle2, FileText, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

import { formatUsdc } from '@/app/lib/format';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useVaultState } from '@/hooks/useVaultState';

const DEFAULT_APR_BPS = 800;

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { applications, approve, reject } = useLoanApplications();
  const app = applications.find((candidate) => candidate.id === id);
  const vaultState = useVaultState(app?.vaultId ?? 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (app) document.title = `Loan #${app.loanId ?? app.id.slice(0, 8)} | PRISM Protocol`;
  }, [app]);

  if (!app) {
    return (
      <div className="flex h-[80vh] items-center justify-center bg-background">
        <div className="text-center">
          <FileText className="mx-auto mb-5 h-12 w-12 text-white/15" />
          <p className="font-display text-2xl text-white">Application not found</p>
          <button onClick={() => router.back()} className="mt-6 rounded-xl border border-white/[0.08] px-6 py-2.5 font-mono text-[10px] uppercase tracking-widest text-white/45 hover:text-white">
            Return
          </button>
        </div>
      </div>
    );
  }

  async function handleApprove() {
    setBusy(true);
    try {
      const loanId = app!.loanId ?? (Math.floor(Date.now() / 1000) >>> 0);
      approve(id, loanId, DEFAULT_APR_BPS);
      toast.success('Loan approved for Stellar origination');
      router.push('/admin/loans');
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
    } finally {
      setBusy(false);
    }
  }

  async function recordLiquidation() {
    setBusy(true);
    try {
      toast.info('Collateral liquidation requires the Stellar collateral oracle signer. No mainnet transaction was sent.');
    } finally {
      setBusy(false);
    }
  }

  const reserve = vaultState.data?.reserveBalance ?? 0n;
  const requested = BigInt(Math.round(app.requestedUSDC * 10_000_000));
  const hasReserve = reserve >= requested;

  return (
    <div className="min-h-full space-y-10 bg-background p-10">
      <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="font-display text-4xl tracking-tight text-white">Credit Instrument Review</h1>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-white/40">
              {app.status}
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/20">
            Application {app.id.slice(0, 8)} · Loan #{app.loanId ?? 'unassigned'} · Vault #{app.vaultId}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {app.status === 'pending' ? (
            <>
              <button onClick={handleReject} disabled={busy} className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-rose-200 disabled:opacity-40">
                {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 inline h-4 w-4" />} Reject
              </button>
              <button onClick={handleApprove} disabled={busy} className="rounded-2xl bg-emerald-400 px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-widest text-black disabled:opacity-40">
                {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 inline h-4 w-4" />} Approve
              </button>
            </>
          ) : app.status === 'approved' ? (
            <button onClick={recordLiquidation} disabled={busy} className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-rose-200 disabled:opacity-40">
              {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 inline h-4 w-4" />} Record Liquidation
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 md:grid-cols-4">
        {[
          { label: 'Requested', value: `$${app.requestedUSDC.toLocaleString()}`, ok: true },
          { label: 'APR', value: `${(app.approvedAprBps ?? DEFAULT_APR_BPS) / 100}%`, ok: true },
          { label: 'Maturity', value: `${app.maturityDays}d`, ok: true },
          { label: 'Reserve Check', value: hasReserve ? 'Pass' : 'Watch', ok: hasReserve },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
            <CheckCircle2 className={`mb-5 h-5 w-5 ${item.ok ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{item.label}</div>
            <div className="mt-2 font-display text-2xl text-white">{item.value}</div>
          </div>
        ))}
      </div>

      <section className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8">
          <h2 className="font-display text-2xl text-white">Borrower Narrative</h2>
          <p className="mt-4 text-sm leading-7 text-white/45">{app.purpose || 'No borrower purpose was supplied.'}</p>
          <div className="mt-8 rounded-2xl border border-white/[0.06] bg-black/20 p-5 font-mono text-xs text-white/40">
            Borrower {app.borrowerPubkey}
          </div>
        </div>
        <aside className="rounded-[2rem] border border-white/[0.08] bg-black/30 p-6">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">Stellar Readiness</h3>
          <div className="mt-5 space-y-3 text-sm text-white/45">
            <p>Vault reserve: ${formatUsdc(reserve, 2)}</p>
            <p>Collateral oracle: PRISM-hosted Ed25519 signer</p>
            <p>Disbursement: Soroban admin-signed testnet invocation</p>
          </div>
          <a href="https://stellar.expert/explorer/testnet" target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-300/70 hover:text-emerald-200">
            Stellar Expert <ArrowUpRight className="h-3 w-3" />
          </a>
        </aside>
      </section>
    </div>
  );
}
