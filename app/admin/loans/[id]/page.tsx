'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, ExternalLink,
  FileText, Layers, Loader2, Send, ShieldAlert, ShieldCheck,
  Skull, XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

import { formatUsdc } from '@/app/lib/format';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useCollateralRecord } from '@/hooks/useCollateralFlow';
import { useLoans } from '@/hooks/useLoans';
import { useVaultState } from '@/hooks/useVaultState';

const DEFAULT_APR_BPS = 800;
const IS_MAINNET   = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet';
const EVM_EXPLORER = process.env.NEXT_PUBLIC_EVM_EXPLORER_URL
  ?? (IS_MAINNET ? 'https://polygonscan.com' : 'https://sepolia.etherscan.io');
const EVM_CHAIN_LABEL = IS_MAINNET ? 'Polygon (chain_id=137)' : 'ETH (chain_id=1)';

// ─── EVM lock state hook ──────────────────────────────────────────────────────

type LockState = 'Empty' | 'Locked' | 'Released' | 'Liquidated';
interface EVMLock {
  borrower: string; token: string; amount: bigint;
  state: LockState; lockedAt: bigint; stellarBorrower: string;
}

function useEvmLock(loanId: number | undefined) {
  return useQuery({
    queryKey: ['evm-lock', loanId],
    enabled: loanId != null,
    refetchInterval: 10_000,
    queryFn: async () => {
      const res = await fetch(`/api/collateral/evm-lock?loanId=${loanId}`);
      // The API stringifies bigint fields (amount, lockedAt) for JSON — coerce back.
      const d = await res.json() as {
        ok: boolean;
        lock: (Omit<EVMLock, 'amount' | 'lockedAt'> & { amount: string; lockedAt: string }) | null;
      };
      if (!d.lock) return null;
      return { ...d.lock, amount: BigInt(d.lock.amount), lockedAt: BigInt(d.lock.lockedAt) } as EVMLock;
    },
  });
}

// ─── EVM Collateral Card ──────────────────────────────────────────────────────

function EVMCollateralCard({ loanId, borrowerPubkey }: { loanId: number; borrowerPubkey: string }) {
  const { data: lock, isLoading, refetch } = useEvmLock(loanId);
  const [reattesting, setReattesting] = useState(false);

  const stateColor: Record<LockState, string> = {
    Empty:      'text-white/30',
    Locked:     'text-emerald-400',
    Released:   'text-[#4a9ec9]',
    Liquidated: 'text-rose-400',
  };

  const TOKEN_SYMBOLS: Record<string, string> = {
    '0x0000000000000000000000000000000000000000': 'ETH',
    '0x12a70376258f53bbad1d7387bcba4084df4b4211': 'MockUSDC',
    '0xc426c75d79d833e9924de6ca26378fdcf49e912c': 'MockWETH',
  };

  const tokenSymbol = lock?.token
    ? TOKEN_SYMBOLS[lock.token.toLowerCase()] ?? `${lock.token.slice(0, 8)}…`
    : '—';

  return (
    <div className="rounded-[2rem] border border-white/[0.08] bg-black/30 p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-white/30" />
        <h3 className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">EVM Collateral</h3>
        <span className="ml-auto font-mono text-[9px] text-white/20">Ethereum</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-white/20" />
          <span className="font-mono text-[10px] text-white/25">Fetching from chain…</span>
        </div>
      ) : !lock || lock.state === 'Empty' ? (
        <p className="font-mono text-[10px] text-white/25">No collateral locked on EVM for this loan</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'State',   value: lock.state,    color: stateColor[lock.state] },
              { label: 'Token',   value: tokenSymbol,   color: 'text-white/60' },
              { label: 'Amount',  value: lock.amount > 0n ? lock.amount.toString() : '—', color: 'text-white/60' },
              { label: 'Locked',  value: lock.lockedAt > 0n ? new Date(Number(lock.lockedAt) * 1000).toLocaleDateString() : '—', color: 'text-white/40' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl bg-black/20 px-3 py-2.5">
                <p className="font-mono text-[9px] text-white/20 uppercase">{label}</p>
                <p className={`font-mono text-sm mt-0.5 ${color}`}>{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl bg-black/20 px-3 py-2.5 font-mono text-[10px] text-white/30 break-all">
            Borrower EVM: {lock.borrower}
          </div>
          <div className="flex items-center justify-between">
            <a
              href={`${EVM_EXPLORER}/address/${process.env.NEXT_PUBLIC_EVM_VAULT_ADDRESS ?? '0xd0130A053820F292B1807C246a1074443E491fcb'}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[9px] text-white/25 hover:text-white/50 transition-colors"
            >
              View vault on {IS_MAINNET ? 'Polygonscan' : 'Etherscan'} <ExternalLink className="h-3 w-3" />
            </a>

            {/* Re-attest button — shown when EVM is Locked but Stellar hasn't confirmed yet */}
            {lock?.state === 'Locked' && (
              <button
                onClick={async () => {
                  setReattesting(true);
                  try {
                    const res = await fetch('/api/collateral/reattest', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ loanId, borrowerAddress: borrowerPubkey }),
                    });
                    const d = await res.json();
                    if (d.ok) {
                      toast.success(d.skipped ? 'Already attested on Stellar' : `Loan #${loanId} attested to Stellar ✓`);
                      void refetch();
                    } else {
                      toast.error(d.error ?? 'Re-attest failed');
                    }
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Re-attest failed');
                  } finally {
                    setReattesting(false);
                  }
                }}
                disabled={reattesting}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-1.5 font-mono text-[9px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-40 transition-all"
              >
                {reattesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                {reattesting ? 'Attesting…' : 'Re-attest to Stellar'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Liquidation Modal ────────────────────────────────────────────────────────

function LiquidationPanel({
  loanId, principalMicro, onDone,
}: {
  loanId: number; principalMicro: bigint; onDone: () => void;
}) {
  const [lossUsd, setLossUsd] = useState(
    (Number(principalMicro) / 10_000_000).toFixed(2)
  );
  const [severityBps, setSeverityBps] = useState(8000);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ stellarHash?: string; evmManual?: { call: string; safeUrl: string | null; vault: string } } | null>(null);

  async function handleLiquidate() {
    const lossAmt = BigInt(Math.round(parseFloat(lossUsd) * 10_000_000));
    setBusy(true);
    try {
      const res = await fetch('/api/admin/liquidate-collateral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId, lossAmount: lossAmt.toString(), severityBps }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Liquidation failed');
      setResult({ stellarHash: data.stellarHash, evmManual: data.evmManual });
      toast.success(`Loan #${loanId} — Stellar liquidated ✓  Now execute EVM via Safe`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Liquidation failed');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Skull className="h-5 w-5 text-rose-400" />
          <p className="font-sans text-base font-semibold text-rose-300">Stellar Liquidation Complete</p>
        </div>
        <div className="space-y-2 font-mono text-[10px]">
          {result.stellarHash && (
            <p className="text-white/40">Stellar tx: {result.stellarHash.slice(0, 16)}…</p>
          )}
        </div>

        {/* EVM manual step */}
        {result.evmManual && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 space-y-3">
            <p className="font-mono text-[10px] text-amber-300 font-semibold uppercase tracking-widest">
              Step 2 — Execute EVM Collateral Seizure via Safe
            </p>
            <div className="space-y-1.5 font-mono text-[9px] text-white/40">
              <p>Vault: {result.evmManual.vault}</p>
              <p>Call: <span className="text-amber-300/70">{result.evmManual.call}</span></p>
            </div>
            {result.evmManual.safeUrl ? (
              <a href={result.evmManual.safeUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] text-amber-300 hover:bg-amber-500/20 transition-all">
                Open Gnosis Safe Transaction Builder <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <p className="font-mono text-[9px] text-white/30">
                Set EVM_SAFE_ADDRESS env var to enable direct Safe link
              </p>
            )}
          </div>
        )}

        <button onClick={onDone}
          className="w-full rounded-xl border border-white/[0.06] py-2.5 font-mono text-[10px] text-white/40 hover:text-white/60 transition-all">
          Close
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-5 space-y-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 text-rose-400" />
        <div>
          <p className="font-sans text-base font-semibold text-rose-300">Propose Liquidation</p>
          <p className="font-mono text-[9px] text-white/30 mt-0.5">Fires loss cascade on Stellar · releases collateral to treasury on EVM</p>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">Loss Amount (USD)</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-white/25 text-sm">$</span>
            <input
              type="number" min="0" step="0.01"
              value={lossUsd} onChange={e => setLossUsd(e.target.value)}
              className="w-full rounded-xl border border-rose-500/20 bg-black/30 pl-7 pr-4 py-2.5 font-mono text-sm text-white focus:outline-none focus:border-rose-500/40"
            />
          </div>
          <p className="mt-1 font-mono text-[9px] text-white/20">Amount absorbed by tranches (Alpha first, then Prime)</p>
        </div>

        <div>
          <label className="block font-mono text-[9px] uppercase tracking-widest text-white/30 mb-2">
            Severity — {(severityBps / 100).toFixed(0)}%
          </label>
          <input type="range" min="0" max="10000" step="100"
            value={severityBps} onChange={e => setSeverityBps(Number(e.target.value))}
            className="w-full accent-rose-500" />
          <div className="flex justify-between font-mono text-[8px] text-white/20 mt-1">
            <span>0% (min)</span>
            <span>100% (total wipeout)</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Loss Amount',  value: `$${parseFloat(lossUsd || '0').toLocaleString()}` },
            { label: 'Severity',     value: `${(severityBps / 100).toFixed(0)}%` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-black/20 px-3 py-2">
              <p className="font-mono text-[8px] text-white/20 uppercase">{label}</p>
              <p className="font-mono text-sm text-rose-300/70 mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={onDone} disabled={busy}
          className="flex-1 rounded-xl border border-white/[0.06] py-2.5 font-mono text-[10px] text-white/35 hover:text-white/60 transition-all disabled:opacity-40">
          Cancel
        </button>
        <button onClick={handleLiquidate} disabled={busy}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-500 py-2.5 font-mono text-[10px] font-bold text-white hover:bg-rose-400 disabled:opacity-40 transition-all">
          {busy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Liquidating…</> : <><Skull className="h-3.5 w-3.5" /> Confirm Liquidation</>}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = use(params);
  const { applications, approve, reject } = useLoanApplications();
  const app = applications.find((candidate) => candidate.id === id);
  const vaultState = useVaultState(app?.vaultId ?? 0);
  const { data: collateral } = useCollateralRecord(app?.loanId);
  const { data: onChainLoans = [] } = useLoans();
  const onChainLoan = app?.loanId != null ? onChainLoans.find(l => l.id === app.loanId) : undefined;
  const isDisbursed = ['Active', 'Repaying', 'Repaid', 'Defaulted'].includes(onChainLoan?.state ?? '');
  const isDefaulted = onChainLoan?.state === 'Defaulted' || onChainLoan?.state === 'Repaid';
  const [busy, setBusy] = useState(false);
  const [showLiquidation, setShowLiquidation] = useState(false);

  useEffect(() => {
    if (app) document.title = `Loan #${app.loanId ?? app.id.slice(0, 8)} | PRISM Admin`;
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
      const principalMicro = BigInt(Math.round(app!.requestedUSDC * 10_000_000));
      const res = await fetch('/api/simulation/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'init_loan',
          borrower: app!.borrowerPubkey,
          principal: principalMicro.toString(),
          aprBps: DEFAULT_APR_BPS,
          maturityDays: app!.maturityDays,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'init_loan failed');
      await approve(id, data.loanId, DEFAULT_APR_BPS);
      toast.success(`Loan #${data.loanId} originated on Stellar · tx ${data.hash?.slice(0, 8)}…`);
      router.push('/admin/loans');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Approval failed');
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

  async function handleDisburse() {
    if (app?.loanId == null) { toast.error('No on-chain loan ID — approve first'); return; }
    const principal = BigInt(Math.round(app.requestedUSDC * 10_000_000));
    if (reserve < principal) {
      toast.error(`Vault reserve $${(Number(reserve) / 10_000_000).toFixed(2)} — need $${app.requestedUSDC}. Deposit more TUSDC into tranches first.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/simulation/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disburse_loan', loanId: app.loanId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'disburse_loan failed');
      toast.success(`Loan #${app.loanId} disbursed · tx ${data.hash?.slice(0, 8)}…`);
      void vaultState.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('#10') || msg.includes('Arithmetic overflow')) {
        toast.error('Vault has insufficient USDC. Deposit more TUSDC into tranches first.');
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  const reserve   = vaultState.data?.reserveBalance ?? 0n;
  const requested = BigInt(Math.round(app.requestedUSDC * 10_000_000));
  const hasReserve = reserve >= requested;

  return (
    <div className="min-h-full space-y-8 bg-background p-10">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="font-display text-4xl tracking-tight text-white">Credit Instrument Review</h1>
            <span className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${
              isDisbursed
                ? 'border-emerald-500/30 bg-emerald-500/[0.08] text-emerald-300'
                : 'border-white/[0.08] bg-white/[0.03] text-white/40'
            }`}>
              {isDisbursed ? (onChainLoan?.state ?? 'Active') : app.status}
            </span>
          </div>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em] text-white/20">
            Application {app.id.slice(0, 8)} · Loan #{app.loanId ?? 'unassigned'} · Vault #{app.vaultId}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {app.status === 'pending' && (
            <>
              <button onClick={handleReject} disabled={busy}
                className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-rose-200 disabled:opacity-40">
                {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 inline h-4 w-4" />} Reject
              </button>
              <button onClick={handleApprove} disabled={busy}
                className="rounded-2xl bg-emerald-400 px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-widest text-black disabled:opacity-40">
                {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 inline h-4 w-4" />} Approve
              </button>
            </>
          )}

          {app.status === 'approved' && (
            <>
              {isDisbursed ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.08] px-6 py-3 font-mono text-[11px] text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  Disbursed · {onChainLoan?.state}
                </div>
              ) : (
                (() => {
                  const collateralReady = collateral?.status === 'Attached';
                  const reserveOk = reserve >= requested;
                  const canDisburse = collateralReady && reserveOk;
                  const label = !collateralReady
                    ? `Collateral: ${collateral?.status ?? 'Not locked'}`
                    : !reserveOk
                    ? `Reserve too low ($${(Number(reserve)/10_000_000).toFixed(0)} of $${app.requestedUSDC})`
                    : 'Disburse Loan';
                  return (
                    <button onClick={handleDisburse} disabled={busy || !canDisburse} title={!canDisburse ? label : ''}
                      className={`rounded-2xl px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-widest disabled:opacity-40 ${
                        canDisburse ? 'bg-emerald-400 text-black' : 'border border-amber-500/30 bg-amber-500/10 text-amber-300'
                      }`}>
                      {busy ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Send className="mr-2 inline h-4 w-4" />}
                      {label}
                    </button>
                  );
                })()
              )}

              {/* Liquidate button — shown when loan is disbursed and not already liquidated */}
              {isDisbursed && onChainLoan?.state !== 'Liquidated' && (
                <button onClick={() => setShowLiquidation(true)} disabled={busy}
                  className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-rose-200 disabled:opacity-40 hover:bg-rose-500/[0.12] transition-all">
                  <AlertTriangle className="mr-2 inline h-4 w-4" /> Liquidate
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* ── Metric cards ───────────────────────────────────────────── */}
      <div className="grid gap-5 md:grid-cols-4">
        {[
          { label: 'Requested',     value: `$${app.requestedUSDC.toLocaleString()}`, ok: true },
          { label: 'APR',           value: `${(app.approvedAprBps ?? DEFAULT_APR_BPS) / 100}%`, ok: true },
          { label: 'Maturity',      value: `${app.maturityDays}d`, ok: true },
          { label: 'Reserve Check', value: hasReserve ? 'Pass' : 'Watch', ok: hasReserve },
        ].map((item) => (
          <div key={item.label} className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
            <CheckCircle2 className={`mb-5 h-5 w-5 ${item.ok ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{item.label}</div>
            <div className="mt-2 font-display text-2xl text-white">{item.value}</div>
          </div>
        ))}
      </div>

      {/* ── Liquidation panel (shown inline when triggered) ─────────── */}
      {showLiquidation && app.loanId != null && (
        <LiquidationPanel
          loanId={app.loanId}
          principalMicro={BigInt(Math.round(app.requestedUSDC * 10_000_000))}
          onDone={() => setShowLiquidation(false)}
        />
      )}

      {/* ── Main two-column section ─────────────────────────────────── */}
      <section className="grid gap-8 lg:grid-cols-[1fr_380px]">

        {/* Left: borrower narrative */}
        <div className="space-y-6">
          <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8">
            <h2 className="font-display text-2xl text-white">Borrower Narrative</h2>
            <p className="mt-4 text-sm leading-7 text-white/45">{app.purpose || 'No borrower purpose was supplied.'}</p>
            <div className="mt-8 rounded-2xl border border-white/[0.06] bg-black/20 p-5 font-mono text-xs text-white/40 break-all">
              Stellar: {app.borrowerPubkey}
            </div>
          </div>

          {/* Collateral status (Stellar) */}
          {collateral && (
            <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.02] p-6">
              <h3 className="font-display text-xl text-white mb-4">Stellar Collateral</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Status',       value: collateral.status },
                  { label: 'USD Value',    value: `$${(Number(collateral.amountUsdMicro) / 1_000_000).toFixed(2)}` },
                  { label: 'Chain',        value: EVM_CHAIN_LABEL },
                  { label: 'Valued At',    value: collateral.valuedAtTs > 0n ? new Date(Number(collateral.valuedAtTs) * 1000).toLocaleDateString() : '—' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-black/20 px-4 py-3">
                    <p className="font-mono text-[9px] text-white/20 uppercase">{label}</p>
                    <p className={`font-mono text-sm mt-1 ${
                      value === 'Attached' ? 'text-emerald-400'
                      : value === 'Liquidated' ? 'text-rose-400'
                      : value === 'Released' ? 'text-[#4a9ec9]'
                      : 'text-white/60'
                    }`}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: sidebar */}
        <div className="space-y-4">

          {/* Stellar readiness */}
          <aside className="rounded-[2rem] border border-white/[0.08] bg-black/30 p-6">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">Stellar Readiness</h3>
            <div className="mt-5 space-y-3 text-sm text-white/45">
              <div className="flex items-center justify-between">
                <span>Vault reserve</span>
                <span className={`font-mono text-[11px] ${hasReserve ? 'text-emerald-400' : 'text-amber-400'}`}>
                  ${formatUsdc(reserve, 2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Collateral oracle</span>
                <span className="font-mono text-[10px] text-white/40">PRISM Ed25519</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Stellar loan state</span>
                <span className={`font-mono text-[10px] ${
                  onChainLoan?.state === 'Active' ? 'text-emerald-400'
                  : onChainLoan?.state === 'Defaulted' ? 'text-rose-400'
                  : 'text-white/40'
                }`}>
                  {onChainLoan?.state ?? 'Not originated'}
                </span>
              </div>
            </div>
            <a href={`https://stellar.expert/explorer/${IS_MAINNET ? 'public' : 'testnet'}`} target="_blank" rel="noreferrer"
              className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-300/70 hover:text-emerald-200">
              Stellar Expert <ArrowUpRight className="h-3 w-3" />
            </a>
          </aside>

          {/* EVM collateral */}
          {app.loanId != null && <EVMCollateralCard loanId={app.loanId} borrowerPubkey={app.borrowerPubkey} />}

        </div>
      </section>
    </div>
  );
}
