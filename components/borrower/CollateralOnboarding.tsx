'use client';

/**
 * IKA Cross-Chain Collateral Onboarding
 *
 * Guides the borrower through:
 *   Step 1 — Choose BTC or ETH and create an IKA dWallet
 *   Step 2 — Send funds to the deposit address (QR + copy)
 *   Step 3 — Wait for on-chain confirmation, then request IKA attestation
 *   Step 4 — Submit attach_collateral + verify_collateral to prism-core
 *
 * Zero contract changes required: IKA's oracle pubkey is already supported by
 * prism-core's oracle_allowlist — register it once via oracle-allowlist.sh.
 */

import { useState, useCallback } from 'react';
import {
  Bitcoin,
  CheckCircle2,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  Wallet,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useIkaCollateralFlow } from '@/hooks/useCollateralFlow';
import type { IkaChain } from '@/app/lib/ika';

interface Props {
  vaultId: number;
  loanId: number;
  defaultCollateralUsd?: number;
}

const CHAIN_OPTIONS: { chain: IkaChain; label: string; icon: string; color: string; border: string; bg: string }[] = [
  {
    chain: 'BTC',
    label: 'Bitcoin',
    icon: '₿',
    color: 'text-orange-300',
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/10',
  },
  {
    chain: 'ETH',
    label: 'Ethereum',
    icon: 'Ξ',
    color: 'text-indigo-300',
    border: 'border-indigo-500/30',
    bg: 'bg-indigo-500/10',
  },
];

const STEP_LABELS = ['Choose chain', 'Deposit', 'Confirm & attest', 'Done'];

function StepDot({ step, current }: { step: number; current: number }) {
  const done = step < current;
  const active = step === current;
  return (
    <div
      className={cn(
        'flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-mono font-bold transition-colors',
        done
          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
          : active
          ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
          : 'border-white/10 bg-white/[0.03] text-white/30',
      )}
    >
      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : step + 1}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-white/40 hover:bg-white/[0.05] hover:text-white/70 transition-colors"
    >
      {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      {copied ? 'copied' : 'copy'}
    </button>
  );
}

export function CollateralOnboarding({ vaultId: _vaultId, loanId, defaultCollateralUsd = 100 }: Props) {
  const [selectedChain, setSelectedChain] = useState<IkaChain | null>(null);
  const [uiStep, setUiStep] = useState(0); // 0=chain select, 1=deposit, 2=attesting, 3=done

  const flow = useIkaCollateralFlow(loanId);

  async function handleCreateDWallet() {
    if (!selectedChain) return;
    try {
      await flow.createDWallet(selectedChain);
      setUiStep(1);
    } catch {
      // error surfaced via toast inside the hook
    }
  }

  async function handlePollAndAttest() {
    try {
      await flow.pollAndAttest(defaultCollateralUsd);
      setUiStep(3);
    } catch {
      // error surfaced via toast
    }
  }

  const dWallet = flow.dWallet;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md overflow-hidden">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10">
          <Shield className="h-5 w-5 text-sky-300" />
        </div>
        <div className="flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-sky-300/80">
            IKA Cross-Chain Collateral
          </div>
          <div className="text-sm text-white/80">
            Lock BTC or ETH via IKA dWallet — no bridge, no wrapping
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-1">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-300/80">
            MPC · Ed25519
          </span>
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-white/[0.04] px-5 py-3">
        {STEP_LABELS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="h-3 w-3 text-white/20 shrink-0" />}
            <div className="flex items-center gap-1.5">
              <StepDot step={i} current={uiStep} />
              <span
                className={cn(
                  'hidden sm:block font-mono text-[10px] uppercase tracking-widest',
                  i === uiStep ? 'text-white/70' : i < uiStep ? 'text-emerald-300/60' : 'text-white/25',
                )}
              >
                {label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Step 0: Choose chain ──────────────────────────────────────────── */}
      {uiStep === 0 && (
        <div className="p-5 space-y-4">
          <p className="text-sm text-white/60">
            Select which asset you want to lock as collateral for loan #{loanId}.
            IKA will provision an MPC-secured dWallet and give you a deposit address.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {CHAIN_OPTIONS.map(({ chain, label, icon, color, border, bg }) => (
              <button
                key={chain}
                onClick={() => setSelectedChain(chain)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border px-4 py-5 transition-all',
                  selectedChain === chain
                    ? `${border} ${bg} ring-1 ring-inset ring-white/10`
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                )}
              >
                <span className={cn('text-2xl font-bold', color)}>{icon}</span>
                <span className="font-mono text-xs uppercase tracking-widest text-white/70">{label}</span>
                {selectedChain === chain && (
                  <CheckCircle2 className={cn('h-4 w-4', color)} />
                )}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-4 py-3 space-y-1.5">
            <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">How it works</div>
            <div className="grid gap-1.5 text-xs text-white/50">
              {[
                ['IKA creates a dWallet', 'MPC-secured, no single key holder'],
                ['You deposit BTC / ETH', 'Real on-chain balance, no wrapping'],
                ["IKA signs an Ed25519 attestation", "Same format as PRISM's own oracle"],
                ['prism-core verifies it', 'Zero contract changes needed'],
              ].map(([title, desc]) => (
                <div key={title} className="flex items-start gap-2">
                  <Zap className="mt-0.5 h-3 w-3 shrink-0 text-sky-400/60" />
                  <span><span className="text-white/70">{title}</span> — {desc}</span>
                </div>
              ))}
            </div>
          </div>

          <Button
            disabled={!selectedChain || flow.isCreating}
            onClick={handleCreateDWallet}
            className="w-full bg-sky-500/15 border border-sky-500/30 text-sky-200 hover:bg-sky-500/25"
          >
            {flow.isCreating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wallet className="mr-2 h-4 w-4" />
            )}
            {flow.isCreating ? 'Creating dWallet…' : `Create ${selectedChain ?? 'BTC'} dWallet`}
          </Button>
        </div>
      )}

      {/* ── Step 1: Deposit ───────────────────────────────────────────────── */}
      {uiStep === 1 && dWallet && (
        <div className="p-5 space-y-4">
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] px-4 py-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-amber-300/70 mb-1">
              {dWallet.chain} deposit address
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="font-mono text-sm break-all text-white/90">{dWallet.depositAddress}</span>
              <CopyButton text={dWallet.depositAddress} />
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-4 py-3 space-y-1">
            <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">
              Suggested amount
            </div>
            <div className="font-mono text-base text-white tabular-nums">
              ≈ ${defaultCollateralUsd.toLocaleString()} USD
            </div>
            <div className="text-xs text-white/40">
              Send at least this much to the deposit address above. IKA polls for confirmations automatically.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs text-white/50">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-3 py-2.5 space-y-0.5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">dWallet ID</div>
              <div className="font-mono text-[11px] break-all text-white/70">{dWallet.dwalletId.slice(0, 20)}…</div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.01] px-3 py-2.5 space-y-0.5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">Status</div>
              <div className={cn('font-mono text-[11px]', dWallet.funded ? 'text-emerald-300' : 'text-amber-300')}>
                {dWallet.funded ? 'Funded' : 'Awaiting deposit…'}
              </div>
            </div>
          </div>

          <p className="text-xs text-white/40">
            Once your transaction is confirmed on {dWallet.chain === 'BTC' ? 'Bitcoin' : 'Ethereum'},
            click below to request the IKA oracle attestation and submit it to prism-core.
          </p>

          <div className="flex gap-3">
            <Button
              variant="ghost"
              onClick={() => { setUiStep(0); flow.reset(); }}
              className="flex-1 border border-white/10 text-white/50 hover:text-white/80"
            >
              Back
            </Button>
            <Button
              onClick={handlePollAndAttest}
              disabled={flow.isAttesting}
              className="flex-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/25"
            >
              {flow.isAttesting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {flow.isAttesting ? 'Attesting…' : 'Check & attest'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Attesting (in-flight) ─────────────────────────────────── */}
      {uiStep === 2 && (
        <div className="flex flex-col items-center gap-4 px-5 py-10">
          <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
          <p className="text-sm text-white/60 text-center max-w-xs">
            IKA oracle is signing the attestation and PRISM is submitting it to prism-core…
          </p>
        </div>
      )}

      {/* ── Step 3: Done ─────────────────────────────────────────────────── */}
      {uiStep === 3 && (
        <div className="flex flex-col items-center gap-4 px-5 py-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10">
            <ShieldCheck className="h-8 w-8 text-emerald-300" />
          </div>
          <div className="text-center space-y-1">
            <div className="text-base font-medium text-white">Collateral attached</div>
            <p className="text-sm text-white/50 max-w-xs">
              IKA's attestation was verified on-chain. Loan #{loanId} is now backed by
              real {selectedChain} collateral — no bridge, no custodian.
            </p>
          </div>
          <a
            href="https://explorer.ika.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-emerald-300/70 hover:text-emerald-300 transition-colors"
          >
            View on IKA explorer <ExternalLink className="h-3 w-3" />
          </a>
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1">
            <Bitcoin className="h-3 w-3 text-orange-300/70" />
            <span className="font-mono text-[10px] text-white/40">
              MPC · Ed25519 · Zero bridge risk
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
