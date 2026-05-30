'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Database,
  Landmark,
  Loader2,
  RefreshCw,
  RotateCcw,
  Shield,
  Terminal,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

import { ACTIVE_CONTRACTS, CONTRACTS } from '@/app/lib/addresses';
import { formatUsdc, shortKey } from '@/app/lib/format';
import {
  HORIZON_URL,
  USDC_ASSET_CODE,
  USDC_ASSET_ISSUER,
} from '@/app/lib/constants';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useIdentity } from '@/hooks/useIdentity';
import { useVaultState } from '@/hooks/useVaultState';

type StepStatus = 'idle' | 'pending' | 'success' | 'error';

interface StepState {
  status: StepStatus;
  message: string;
}

const INIT_STEP: StepState = { status: 'idle', message: '' };

export default function ProtocolPage() {
  const { vaultId, addLog } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const identity = useIdentity();

  const [initStep,   setInitStep]   = useState<StepState>(INIT_STEP);
  const [fundStep,   setFundStep]   = useState<StepState>(INIT_STEP);
  const [poolsStep,  setPoolsStep]  = useState<StepState>(INIT_STEP);

  // Step 1: mark as done as soon as vaultState confirms config + vault exist on-chain.
  useEffect(() => {
    if (vaultState.isLoading || vaultState.data == null) return;
    if (vaultState.data.config && vaultState.data.vault) {
      setInitStep((prev) =>
        prev.status === 'idle'
          ? { status: 'success', message: 'Already initialized on-chain.' }
          : prev,
      );
    }
  }, [vaultState.isLoading, vaultState.data]);

  // Step 2: check if the current session's Senior wallet already has PTUSDC on Horizon.
  useEffect(() => {
    const address = identity.identities.senior.keypair.publicKey();
    fetch(`${HORIZON_URL}/accounts/${address}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        const balance = (data.balances ?? []).find(
          (b: { asset_code?: string; asset_issuer?: string }) =>
            b.asset_code === USDC_ASSET_CODE && b.asset_issuer === USDC_ASSET_ISSUER,
        );
        if (balance && parseFloat(balance.balance) > 0) {
          setFundStep((prev) =>
            prev.status === 'idle'
              ? { status: 'success', message: 'Wallets already funded with PTUSDC.' }
              : prev,
          );
        }
      })
      .catch(() => {});
  }, [identity.identities.senior.keypair]);

  const busy = initStep.status === 'pending' || fundStep.status === 'pending' || poolsStep.status === 'pending';

  async function runInitialize() {
    setInitStep({ status: 'pending', message: 'Initializing vault on-chain…' });
    try {
      const borrowerAddress = identity.identities.borrower.keypair.publicKey();
      const res  = await fetch('/api/admin/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ borrowerAddress }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Initialize failed');

      const msg = json.alreadyInitialized
        ? 'Already initialized — nothing to do.'
        : `Done: ${json.steps.join(', ')}`;

      setInitStep({ status: 'success', message: msg });
      addLog(`Initialize: ${msg}`);
      toast.success('Vault scaffold initialized');
      void vaultState.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setInitStep({ status: 'error', message: msg });
      toast.error(msg);
    }
  }

  async function runFundIdentities() {
    setFundStep({ status: 'pending', message: 'Funding wallets, setting up trustlines, and minting TUSDC…' });
    try {
      // Send secrets to the server so it can handle friendbot + changeTrust + mint
      // in one place with no CORS or timing issues. Testnet only — no real value at risk.
      const wallets = [
        { label: 'Senior',   secret: identity.identities.senior.keypair.secret() },
        { label: 'Junior',   secret: identity.identities.junior.keypair.secret() },
        { label: 'Borrower', secret: identity.identities.borrower.keypair.secret() },
      ];

      const res  = await fetch('/api/admin/fund-identities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallets }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Fund identities failed');

      const summary = (json.results as { label: string; hash: string }[])
        .map((r) => `${r.label}: ${r.hash.slice(0, 8)}`)
        .join(' | ');

      const msg = `10,000 TUSDC minted to Senior, Junior, Borrower — ${summary}`;
      setFundStep({ status: 'success', message: msg });
      addLog(`Fund identities: ${msg}`);
      toast.success('Identities funded with TUSDC');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setFundStep({ status: 'error', message: msg });
      toast.error(msg);
    }
  }

  async function runSeedPools() {
    setPoolsStep({ status: 'pending', message: 'Seeding Prime / Core / Alpha pools on Soroswap…' });
    try {
      const res  = await fetch('/api/admin/seed-pools', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Seed pools failed');

      const msg = `Pools seeded: ${Object.keys(json.results).join(', ') || 'already existed'}`;
      setPoolsStep({ status: 'success', message: msg });
      addLog(`Seed pools: ${json.steps.slice(-3).join(' | ')}`);
      toast.success('AMM pools seeded on Soroswap');
      void vaultState.refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPoolsStep({ status: 'error', message: msg });
      toast.error(msg);
    }
  }

  const rows = [
    { label: 'prism_core',      value: ACTIVE_CONTRACTS.prismCore       || 'not deployed' },
    { label: 'USDC SAC',        value: ACTIVE_CONTRACTS.usdc            || 'not configured' },
    { label: 'Soroswap router', value: ACTIVE_CONTRACTS.soroswapRouter  || 'not configured' },
    { label: 'Reflector',       value: ACTIVE_CONTRACTS.reflector       || 'not configured' },
    { label: 'Soroban RPC',     value: ACTIVE_CONTRACTS.rpcUrl },
  ];

  if (vaultState.isLoading) {
    return (
      <div className="space-y-8 p-10">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-96 rounded-[2rem]" />
      </div>
    );
  }

  const tvl = (vaultState.data?.tranches ?? []).reduce((sum, t) => sum + t.totalAssets, 0n);

  return (
    <div className="min-h-full bg-background p-10">
      <div className="mx-auto max-w-[1100px] space-y-10">

        {/* Header */}
        <header>
          <h1 className="font-display text-3xl text-white">Protocol Setup</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.28em] text-white/25">
            One-time initialization · Vault #{vaultId}
          </p>
        </header>

        {/* Status cards */}
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { label: 'Config',    value: vaultState.data?.config ? 'Initialized' : 'Pending', icon: Shield },
            { label: 'Vault',     value: vaultState.data?.vault  ? 'Readable'    : 'Missing',  icon: Database },
            { label: 'TVL',       value: `$${formatUsdc(tvl, 0)}`,                              icon: CheckCircle2 },
            { label: 'Network',   value: CONTRACTS.testnet.passphrase.includes('Test') ? 'Testnet' : 'Mainnet', icon: Terminal },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-5">
              <Icon className="mb-4 h-4 w-4 text-white/30" />
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{label}</div>
              <div className="mt-1.5 font-display text-xl text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* 3-step setup */}
        <section className="rounded-[2rem] border border-white/[0.08] bg-white/[0.02] p-8">
          <h2 className="mb-6 font-mono text-[11px] uppercase tracking-[0.24em] text-white/35">
            Initialization Sequence
          </h2>
          <p className="mb-8 text-sm text-white/40 leading-relaxed">
            Run these three steps in order on a fresh testnet deployment. Each step is
            idempotent — re-running skips work that&apos;s already been done on-chain.
          </p>

          <div className="space-y-4">
            <SetupStep
              number={1}
              icon={<RotateCcw className="h-4 w-4" />}
              title="Initialize Vault Scaffold"
              description="Runs init_config, init_vault, init_tranche × 3, and init_loan on-chain. Safe to re-run — skips any steps already completed."
              state={initStep}
              busy={busy}
              onRun={runInitialize}
              buttonLabel="Initialize Vault"
            />
            <SetupStep
              number={2}
              icon={<Wallet className="h-4 w-4" />}
              title="Fund Simulation Identities"
              description="Mints 10,000 TUSDC to the Senior, Junior, and Borrower simulation wallets so they can deposit and repay in the demo."
              state={fundStep}
              busy={busy}
              onRun={runFundIdentities}
              buttonLabel="Fund Identities"
            />
            <SetupStep
              number={3}
              icon={<Landmark className="h-4 w-4" />}
              title="Seed AMM Pools"
              description="Deposits 100 USDC per tranche, transfers the pTokens to the contract, then calls seed_pool_liquidity to create Prime/USDC, Core/USDC, and Alpha/USDC pools on Soroswap."
              state={poolsStep}
              busy={busy}
              onRun={runSeedPools}
              buttonLabel="Seed AMM Pools"
            />
          </div>
        </section>

        {/* Contract registry */}
        <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/35">
              Contract Registry
            </h2>
            <button onClick={() => vaultState.refetch()} className="text-white/35 hover:text-white">
              <RefreshCw className={`h-4 w-4 ${vaultState.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-4 md:grid-cols-[180px_1fr]"
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">{row.label}</div>
                <div className="truncate font-mono text-xs text-white/60">
                  {row.value ? shortKey(row.value) : row.value}
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

interface SetupStepProps {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  state: StepState;
  busy: boolean;
  onRun: () => void;
  buttonLabel: string;
}

function SetupStep({ number, icon, title, description, state, busy, onRun, buttonLabel }: SetupStepProps) {
  const isPending = state.status === 'pending';
  const isSuccess = state.status === 'success';
  const isError   = state.status === 'error';

  return (
    <div className={`rounded-2xl border p-5 transition-colors ${
      isSuccess ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
      : isError  ? 'border-rose-500/20 bg-rose-500/[0.04]'
      : 'border-white/[0.06] bg-black/20'
    }`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] font-bold ${
            isSuccess ? 'border-emerald-500/40 text-emerald-400'
            : isError  ? 'border-rose-500/40 text-rose-400'
            : 'border-white/10 text-white/30'
          }`}>
            {isSuccess ? <CheckCircle2 className="h-4 w-4" /> : number}
          </div>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium text-white/80">
              {icon}
              {title}
            </div>
            <p className="mt-1 text-xs text-white/35 leading-relaxed">{description}</p>
            {state.message ? (
              <p className={`mt-2 font-mono text-[10px] leading-relaxed ${
                isSuccess ? 'text-emerald-400/70' : isError ? 'text-rose-400/70' : 'text-white/40'
              }`}>
                {state.message}
              </p>
            ) : null}
          </div>
        </div>

        <button
          disabled={busy}
          onClick={onRun}
          className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-all disabled:opacity-40 ${
            isSuccess
              ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              : isError
              ? 'border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20'
              : 'bg-white text-black hover:bg-white/90'
          }`}
        >
          {isPending ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
          ) : isSuccess ? (
            <><RefreshCw className="h-3 w-3" /> Re-run</>
          ) : (
            <><ChevronRight className="h-3 w-3" /> {buttonLabel}</>
          )}
        </button>
      </div>
    </div>
  );
}
