'use client';

// Real Stellar borrow flow — admin originates + disburses, borrower repays.
//
// This replaces the IKA-centric BorrowingWorkflow component on the Stellar
// build. Everything here writes to the deployed prism-core contract; you can
// see state change live on https://stellar.expert.
//
// Three sections (all collapsible by role):
//   1. ORIGINATE — admin creates a Loan record (state=Originated)
//   2. DISBURSE  — admin moves USDC from vault reserve to borrower
//   3. REPAY     — borrower pays USDC back; state walks Repaying → Repaid
//
// Live state of loan_id=1 (default) shown at the bottom.

import { useState } from 'react';
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  CircleAlert,
  Coins,
  FileSignature,
  HandCoins,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { formatUsdc, shortKey } from '@/app/lib/format';
import { useDisburseLoan } from '@/hooks/useDisburseLoan';
import { useOriginateLoan } from '@/hooks/useOriginateLoan';
import { useRepayLoan } from '@/hooks/useRepayLoan';
import { useStellarWallet } from '@/components/providers/stellar-wallet-context';
import { useVaultState } from '@/hooks/useVaultState';
import { useIdentity } from '@/hooks/useIdentity';
import { useActiveLoans } from '@/hooks/useActiveLoans';

const DEFAULT_LOAN_ID = 1;
const ONE_MONTH_SECONDS = 30 * 24 * 60 * 60;

function loanStateLabel(state: Record<string, unknown> | string | null | undefined): string {
  if (!state) return 'None';
  if (typeof state === 'string') return state;
  return Object.keys(state)[0] ?? 'Unknown';
}

function loanStateColor(state: string): { dot: string; text: string; border: string } {
  switch (state.toLowerCase()) {
    case 'originated':
      return { dot: 'bg-sky-400', text: 'text-sky-300', border: 'border-sky-500/30' };
    case 'active':
      return { dot: 'bg-emerald-400 animate-pulse', text: 'text-emerald-300', border: 'border-emerald-500/30' };
    case 'repaying':
      return { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-300', border: 'border-amber-500/30' };
    case 'repaid':
      return { dot: 'bg-emerald-400', text: 'text-emerald-300', border: 'border-emerald-500/30' };
    case 'defaulted':
      return { dot: 'bg-rose-400', text: 'text-rose-300', border: 'border-rose-500/30' };
    default:
      return { dot: 'bg-white/40', text: 'text-white/60', border: 'border-white/20' };
  }
}

export function StellarBorrowForm() {
  const wallet = useStellarWallet();
  const { address: adminAddress } = useIdentity();
  const isAdmin = wallet.connected && wallet.address === adminAddress;

  const vault = useVaultState();
  const activeLoans = useActiveLoans();
  const originate = useOriginateLoan();
  const disburse = useDisburseLoan();
  const repay = useRepayLoan();

  // ── Originate form state ────────────────────────────────────────────────
  const [loanId, setLoanId] = useState<number>(DEFAULT_LOAN_ID);
  const [borrowerAddr, setBorrowerAddr] = useState<string>(wallet.address ?? '');
  const [principal, setPrincipal] = useState<number>(10);
  const [aprBps, setAprBps] = useState<number>(800); // 8%
  const [maturityDays, setMaturityDays] = useState<number>(30);

  // ── Repay form state ────────────────────────────────────────────────────
  const [repayAmount, setRepayAmount] = useState<number>(5);
  const [repayLoanId, setRepayLoanId] = useState<number>(DEFAULT_LOAN_ID);

  // The "currently focused" loan we show live state for.
  const focusedLoanIdRaw = activeLoans.data?.[activeLoans.data.length - 1]?.id;
  const focusedLoanId = focusedLoanIdRaw ?? loanId ?? DEFAULT_LOAN_ID;
  const focusedLoan = activeLoans.data?.find((l) => l.id === focusedLoanId);

  const reserveUsdc = vault.data?.reserveBalance ?? 0n;

  return (
    <div className="space-y-5">
      {/* ── ROLE BANNER ──────────────────────────────────────────────────── */}
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border px-4 py-3 backdrop-blur-md',
          isAdmin
            ? 'border-emerald-500/25 bg-emerald-500/[0.04]'
            : 'border-amber-500/25 bg-amber-500/[0.04]',
        )}
      >
        <div
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg border',
            isAdmin
              ? 'border-emerald-500/30 bg-emerald-500/10'
              : 'border-amber-500/30 bg-amber-500/10',
          )}
        >
          {isAdmin ? (
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
          ) : (
            <CircleAlert className="h-4 w-4 text-amber-300" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            {isAdmin ? 'Admin session' : 'Borrower session'}
          </div>
          <div className="text-sm text-white/80 mt-0.5">
            {isAdmin
              ? 'You can originate, disburse, and trigger admin actions.'
              : `Connected as ${wallet.address ? shortKey(wallet.address) : '—'}. Originate/disburse require the admin wallet.`}
          </div>
        </div>
        <div className="hidden md:block text-right">
          <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">Vault reserve</div>
          <div className="font-mono text-base font-medium text-white tabular-nums">
            ${formatUsdc(reserveUsdc)}
          </div>
        </div>
      </div>

      {/* ── ORIGINATE ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10">
            <FileSignature className="h-4 w-4 text-sky-300" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-300/80">Step 1 · Originate</div>
            <div className="text-sm text-white/80">Admin creates a loan record on-chain</div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
            {isAdmin ? 'admin gated' : 'admin only'}
          </span>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Loan id (u32)</Label>
            <Input
              type="number"
              value={loanId}
              onChange={(e) => setLoanId(Number(e.target.value || 0))}
              className="font-mono"
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Borrower address (G…)</Label>
            <Input
              type="text"
              value={borrowerAddr}
              onChange={(e) => setBorrowerAddr(e.target.value.trim())}
              placeholder={wallet.address ?? 'GXXX…'}
              className="font-mono text-xs"
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Principal (USDC)</Label>
            <Input
              type="number"
              step="0.1"
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value || 0))}
              className="font-mono"
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-white/40">APR (bps · 800 = 8%)</Label>
            <Input
              type="number"
              value={aprBps}
              onChange={(e) => setAprBps(Number(e.target.value || 0))}
              className="font-mono"
              disabled={!isAdmin}
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-white/40">
              Maturity (days from now · {maturityDays * ONE_MONTH_SECONDS / 30 + ' s'})
            </Label>
            <Input
              type="number"
              value={maturityDays}
              onChange={(e) => setMaturityDays(Number(e.target.value || 0))}
              className="font-mono"
              disabled={!isAdmin}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.01] px-5 py-3">
          <div className="font-mono text-[10px] text-white/30">
            Calls <span className="text-white/60">prism_core::init_loan</span> as admin.
          </div>
          <Button
            disabled={!isAdmin || originate.isPending || !borrowerAddr}
            onClick={() => {
              const maturityTs = Math.floor(Date.now() / 1000) + maturityDays * 24 * 60 * 60;
              originate.mutate({
                loanId,
                borrower: borrowerAddr,
                principalUsdc: principal,
                aprBps,
                maturityTs,
              });
            }}
            className="bg-sky-500/15 border border-sky-500/30 text-sky-200 hover:bg-sky-500/25"
          >
            {originate.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSignature className="mr-2 h-4 w-4" />
            )}
            Originate loan #{loanId}
          </Button>
        </div>
      </div>

      {/* ── DISBURSE ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <Banknote className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">Step 2 · Disburse</div>
            <div className="text-sm text-white/80">Move USDC from vault reserve to borrower</div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">
            {isAdmin ? 'admin gated' : 'admin only'}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4 p-5">
          <div className="text-sm text-white/60">
            Disburses the most recently originated loan
            {focusedLoan ? (
              <span className="ml-2 font-mono text-xs text-white/80">
                #{focusedLoan.id} · {formatUsdc(focusedLoan.principal)} USDC · {focusedLoan.state}
              </span>
            ) : (
              <span className="ml-2 font-mono text-xs text-white/40">no loan selected</span>
            )}
          </div>
          <Button
            disabled={
              !isAdmin ||
              disburse.isPending ||
              !focusedLoan ||
              focusedLoan.state.toLowerCase() !== 'originated'
            }
            onClick={() => focusedLoan && disburse.mutate({ loanId: focusedLoan.id })}
            className="bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25"
          >
            {disburse.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Banknote className="mr-2 h-4 w-4" />
            )}
            Disburse loan #{focusedLoan?.id ?? '—'}
          </Button>
        </div>
      </div>

      {/* ── REPAY ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
            <HandCoins className="h-4 w-4 text-amber-300" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-300/80">Step 3 · Repay</div>
            <div className="text-sm text-white/80">Borrower transfers USDC back to the vault</div>
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">borrower wallet</span>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Loan id</Label>
            <Input
              type="number"
              value={repayLoanId}
              onChange={(e) => setRepayLoanId(Number(e.target.value || 0))}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Amount (USDC)</Label>
            <Input
              type="number"
              step="0.1"
              value={repayAmount}
              onChange={(e) => setRepayAmount(Number(e.target.value || 0))}
              className="font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] bg-white/[0.01] px-5 py-3">
          <div className="font-mono text-[10px] text-white/30">
            Calls <span className="text-white/60">prism_core::repay_loan</span> as the connected wallet.
            Requires a USDC trustline + balance.
          </div>
          <Button
            disabled={!wallet.connected || repay.isPending || repayAmount <= 0}
            onClick={() =>
              repay.mutate({
                vaultId: 0,
                loanId: repayLoanId,
                amountUsdc: repayAmount,
              })
            }
            className="bg-amber-500/15 border border-amber-500/30 text-amber-200 hover:bg-amber-500/25"
          >
            {repay.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <HandCoins className="mr-2 h-4 w-4" />
            )}
            Repay {repayAmount} USDC
          </Button>
        </div>
      </div>

      {/* ── LIVE LOAN STATE ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/[0.08] bg-black/40 backdrop-blur-md overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/[0.04]">
            <Coins className="h-4 w-4 text-white/70" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">Live loans on chain</div>
            <div className="text-sm text-white/70">
              Reading <span className="font-mono text-white/50">get_loan</span> every 8s from the deployed prism_core
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/[0.05]">
          {(activeLoans.data ?? []).length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-white/40">
              {activeLoans.isLoading
                ? 'Loading…'
                : 'No loans yet. Originate one above.'}
            </div>
          ) : (
            (activeLoans.data ?? []).map((loan) => {
              const stateLabel = loanStateLabel(loan.state as Record<string, unknown>);
              const c = loanStateColor(stateLabel);
              return (
                <div key={loan.id} className="grid grid-cols-2 md:grid-cols-5 gap-3 px-5 py-3">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">id</div>
                    <div className="font-mono text-sm text-white">#{loan.id}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">borrower</div>
                    <div className="font-mono text-xs text-white/80">{shortKey(loan.borrower)}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">principal</div>
                    <div className="font-mono text-sm text-white tabular-nums">
                      ${formatUsdc(loan.principal)}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">repaid</div>
                    <div className="font-mono text-sm text-white/80 tabular-nums">
                      ${formatUsdc(loan.totalRepaid)}
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">state</div>
                    <div
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-xs',
                        c.text,
                        c.border,
                      )}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
                      {stateLabel}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── FLOW LEGEND ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-5 py-3">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-white/40">
          <span>flow:</span>
          <span className="rounded-full border border-sky-500/30 px-2 py-0.5 text-sky-300">Originated</span>
          <ArrowRight className="h-3 w-3" />
          <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-emerald-300">Active</span>
          <ArrowRight className="h-3 w-3" />
          <span className="rounded-full border border-amber-500/30 px-2 py-0.5 text-amber-300">Repaying</span>
          <ArrowRight className="h-3 w-3" />
          <span className="rounded-full border border-emerald-500/30 px-2 py-0.5 text-emerald-300">
            <CheckCircle2 className="h-3 w-3 inline -mt-0.5 mr-1" />
            Repaid
          </span>
          <span className="mx-2 text-white/20">or</span>
          <span className="rounded-full border border-rose-500/30 px-2 py-0.5 text-rose-300">Defaulted</span>
        </div>
      </div>
    </div>
  );
}
