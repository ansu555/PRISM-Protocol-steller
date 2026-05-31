'use client';

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Database,
  KeyRound,
  Landmark,
  Loader2,
  RefreshCw,
  RotateCcw,
  Shield,
  Terminal,
  Wallet,
  Coins,
} from 'lucide-react';
import { toast } from 'sonner';

import { ACTIVE_CONTRACTS, CONTRACTS } from '@/app/lib/addresses';
import { formatUsdc, shortKey } from '@/app/lib/format';
import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  USDC_ASSET_CODE,
  USDC_ASSET_ISSUER,
} from '@/app/lib/constants';
import { getRpcServer } from '@/app/lib/stellar';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
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

  const [initStep,    setInitStep]    = useState<StepState>(INIT_STEP);
  const [fundStep,    setFundStep]    = useState<StepState>(INIT_STEP);
  const [poolsStep,   setPoolsStep]   = useState<StepState>(INIT_STEP);
  const [oracleStep,  setOracleStep]  = useState<StepState>(INIT_STEP);

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

  const busy = initStep.status === 'pending' || fundStep.status === 'pending' || poolsStep.status === 'pending' || oracleStep.status === 'pending';

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

  async function runAddCollateralOracle() {
    setOracleStep({ status: 'pending', message: 'Adding collateral oracle pubkey to on-chain allowlist…' });
    try {
      const res  = await fetch('/api/simulation/admin-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_collateral_oracle' }),
      });
      const json = await res.json();
      // OracleAlreadyAllowlisted (#36) is fine — treat as success
      if (!res.ok && !String(json.error).includes('#36') && !String(json.error).includes('OracleAlreadyAllowlisted')) {
        throw new Error(json.error ?? 'add_collateral_oracle failed');
      }
      const msg = String(json.error ?? '').includes('#36')
        ? 'Collateral oracle already in allowlist.'
        : `Collateral oracle added — pubkey ${String(json.oraclePubkeyHex ?? '').slice(0, 12)}…`;
      setOracleStep({ status: 'success', message: msg });
      addLog(`Oracle allowlist: ${msg}`);
      toast.success('Collateral oracle registered on-chain');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOracleStep({ status: 'error', message: msg });
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
            <SetupStep
              number={4}
              icon={<KeyRound className="h-4 w-4" />}
              title="Register Collateral Oracle"
              description="Derives the PRISM collateral oracle Ed25519 pubkey from COLLATERAL_ORACLE_SEED and adds it to the on-chain allowlist. Required before any borrower can lock collateral."
              state={oracleStep}
              busy={busy}
              onRun={runAddCollateralOracle}
              buttonLabel="Add Oracle to Allowlist"
            />
          </div>
        </section>

        {/* Mint TUSDC */}
        <MintTusdc />

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

// ── Mint TUSDC ────────────────────────────────────────────────────────────────

function MintTusdc() {
  const wallet = useStellarWallet();
  const [to, setTo]         = useState('');
  const [amount, setAmount] = useState('10000');
  const [minting, setMinting]     = useState(false);
  const [addingTrust, setAddingTrust] = useState(false);

  async function handleAddTrustline() {
    if (!wallet.connected || !wallet.address) {
      toast.error('Connect your Freighter wallet first');
      return;
    }
    setAddingTrust(true);
    try {
      const { Asset, TransactionBuilder: TB, Operation, Account: StellarAccount } = await import('@stellar/stellar-sdk');

      const horizonRes = await fetch(`${HORIZON_URL}/accounts/${wallet.address}`);
      if (!horizonRes.ok) throw new Error('Account not found on Horizon — fund it with Friendbot first');
      const accountData = await horizonRes.json();
      const account = new StellarAccount(wallet.address, accountData.sequence);

      // Check which trustlines are already present
      const existingCodes = new Set(
        (accountData.balances ?? []).map((b: { asset_code?: string }) => b.asset_code).filter(Boolean)
      );

      const allAssets = [
        new Asset(USDC_ASSET_CODE, USDC_ASSET_ISSUER),   // PTUSDC
        new Asset('PPRIME',  USDC_ASSET_ISSUER),
        new Asset('PCORE',   USDC_ASSET_ISSUER),
        new Asset('PALPHA',  USDC_ASSET_ISSUER),
      ];
      const missing = allAssets.filter(a => !existingCodes.has(a.code));

      if (missing.length === 0) {
        toast.success('All trustlines already set up!');
        return;
      }

      const builder = new TB(account, { fee: '100', networkPassphrase: NETWORK_PASSPHRASE });
      for (const asset of missing) builder.addOperation(Operation.changeTrust({ asset }));
      const tx = builder.setTimeout(30).build();

      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const { TransactionBuilder: TB2 } = await import('@stellar/stellar-sdk');
      const signed = TB2.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ tx: signed.toXDR() }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(submitData.extras?.result_codes?.operations?.[0] ?? submitData.title ?? 'Trustline failed');
      }
      toast.success(`Trustlines added: ${missing.map(a => a.code).join(', ')}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Trustline failed');
    } finally {
      setAddingTrust(false);
    }
  }

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim()) return;
    setMinting(true);
    try {
      const amountMicro = BigInt(Math.round(parseFloat(amount) * 10_000_000));
      const res  = await fetch('/api/admin/mint-usdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: to.trim(), amount: amountMicro.toString() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Mint failed');
      toast.success(`Minted ${amount} TUSDC to ${to.trim().slice(0, 8)}… · tx ${json.hash?.slice(0, 8)}…`);
      setTo('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Mint failed');
    } finally {
      setMinting(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-white/[0.08] bg-white/[0.02] p-8 space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Coins className="h-4 w-4 text-white/30" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/35">Mint TUSDC</h2>
        </div>
        <p className="text-xs text-white/35">
          Step 1: add a trustline (wallet must opt-in). Step 2: mint tokens to the address.
        </p>
      </div>

      {/* Step 1 — Add trustline via Freighter */}
      <div className="rounded-xl border border-white/[0.06] bg-black/20 p-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">Step 1 — Add Trustline</p>
          <p className="text-xs text-white/30 mt-0.5">
            {wallet.address ? `Connected: ${wallet.address.slice(0, 8)}…` : 'Connect Freighter wallet above'}
          </p>
        </div>
        <button
          onClick={handleAddTrustline}
          disabled={addingTrust || !wallet.connected}
          className="flex items-center gap-2 rounded-xl border border-white/[0.08] px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-white/60 hover:text-white hover:border-white/20 disabled:opacity-40 transition-all whitespace-nowrap"
        >
          {addingTrust ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
          Add Trustline via Freighter
        </button>
      </div>

      {/* Step 2 — Mint */}
      <form onSubmit={handleMint} className="space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-white/40">Step 2 — Mint Tokens</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="G… destination address"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="flex-1 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-2.5 font-mono text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            required
          />
          <input
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            min="1"
            step="any"
            className="w-32 rounded-xl border border-white/[0.06] bg-black/20 px-4 py-2.5 font-mono text-sm text-white placeholder:text-white/20 focus:border-white/20 focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={minting}
            className="flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-40 transition-all"
          >
            {minting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Coins className="h-3.5 w-3.5" />}
            Mint
          </button>
        </div>
      </form>
    </section>
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
