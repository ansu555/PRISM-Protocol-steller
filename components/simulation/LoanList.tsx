'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

import { formatUsdc, shortKey } from '@/app/lib/format';
import { useActiveLoans, type LoanRecord } from '@/hooks/useActiveLoans';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function aprLabel(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

const STATE_STYLE: Record<string, { dot: string; text: string; label: string }> = {
  Originated:  { dot: 'bg-blue-400',     text: 'text-blue-300',    label: 'Originated' },
  Active:      { dot: 'bg-emerald-400',  text: 'text-emerald-300', label: 'Active' },
  Repaying:    { dot: 'bg-yellow-400',   text: 'text-yellow-300',  label: 'Repaying' },
  Repaid:      { dot: 'bg-white/40',     text: 'text-white/40',    label: 'Repaid' },
  Defaulted:   { dot: 'bg-red-400',      text: 'text-red-300',     label: 'Defaulted' },
  Resolved:    { dot: 'bg-white/25',     text: 'text-white/30',    label: 'Resolved' },
};

function StateBadge({ state }: { state: string }) {
  const s = STATE_STYLE[state] ?? { dot: 'bg-white/20', text: 'text-white/30', label: state };
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${s.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function progress(loan: LoanRecord): number {
  if (loan.principal === 0n) return 0;
  const pct = Number(loan.totalRepaid * 100n / loan.principal);
  return Math.min(100, pct);
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function LoanRow({ loan, isLast }: { loan: LoanRecord; isLast: boolean }) {
  const pct = progress(loan);
  const outstanding = loan.principal > loan.totalRepaid
    ? loan.principal - loan.totalRepaid
    : 0n;

  return (
    <div className={`grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-3 px-5 py-3.5 ${!isLast ? 'border-b border-white/[0.05]' : ''}`}>

      {/* ID + state */}
      <div>
        <div className="font-mono text-sm text-white">Loan #{loan.id}</div>
        <div className="mt-1"><StateBadge state={loan.state} /></div>
      </div>

      {/* Borrower */}
      <div>
        <div className="font-mono text-[11px] text-white/50">{shortKey(loan.borrower)}</div>
        <div className="mt-0.5 font-mono text-[10px] text-white/20">{loan.contractRef.slice(0, 12)}…</div>
      </div>

      {/* Principal */}
      <div>
        <div className="font-mono text-sm text-white">${formatUsdc(loan.principal, 2)}</div>
        <div className="mt-0.5 font-mono text-[11px] text-white/30">principal</div>
      </div>

      {/* Outstanding */}
      <div>
        <div className={`font-mono text-sm ${outstanding > 0n ? 'text-yellow-300/80' : 'text-white/30'}`}>
          ${formatUsdc(outstanding, 2)}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-white/30">outstanding</div>
      </div>

      {/* APR */}
      <div className="font-mono text-sm text-white/70">{aprLabel(loan.aprBps)}</div>

      {/* Maturity */}
      <div>
        <div className="font-mono text-[11px] text-white/60">{formatDate(loan.maturityTs)}</div>
        <div className="mt-0.5 font-mono text-[10px] text-white/25">
          originated {formatDate(loan.originationTs)}
        </div>
      </div>

      {/* Repayment progress */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[10px] text-white/30">Repaid</span>
          <span className="font-mono text-[10px] text-white/50">{pct.toFixed(0)}%</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-emerald-500/60 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-0.5 font-mono text-[10px] text-white/25">
          ${formatUsdc(loan.totalRepaid, 2)} of ${formatUsdc(loan.principal, 2)}
        </div>
      </div>
    </div>
  );
}

// ─── LoanList ─────────────────────────────────────────────────────────────────

export function LoanList() {
  const { data: loans, isLoading, error } = useActiveLoans();

  return (
    <section className="rounded-lg border border-white/10 bg-black/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-emerald-400/70" />
          <span className="text-sm font-semibold text-white">Active Loans</span>
        </div>
        <span className="font-mono text-[11px] text-white/30">
          {isLoading ? '…' : `${loans?.length ?? 0} loan${loans?.length === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 px-5 py-5 text-xs text-white/35">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Scanning on-chain loan accounts…
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 px-5 py-4 text-xs text-red-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {(error as Error).message}
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && (!loans || loans.length === 0) && (
        <div className="px-5 py-8 text-center font-mono text-xs text-white/20">
          No loan accounts found. Initialize a loan to get started.
        </div>
      )}

      {/* Column headers */}
      {loans && loans.length > 0 && (
        <>
          <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1fr)] gap-3 border-b border-white/[0.05] px-5 py-2">
            {['Loan', 'Borrower', 'Principal', 'Outstanding', 'APR', 'Maturity', 'Repayment'].map((h) => (
              <div key={h} className="font-mono text-[10px] uppercase tracking-wider text-white/25">{h}</div>
            ))}
          </div>
          {loans.map((loan, i) => (
            <LoanRow key={loan.id} loan={loan} isLast={i === loans.length - 1} />
          ))}
        </>
      )}
    </section>
  );
}
