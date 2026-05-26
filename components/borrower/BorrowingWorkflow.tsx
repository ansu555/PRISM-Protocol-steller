'use client';

import { useState, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import {
  ShieldCheck,
  Building2,
  CreditCard,
  Lock,
  BarChart,
  FileCheck,
  Activity,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  TrendingUp,
  Zap,
  ChevronRight,
  Circle,
  Wallet,
  BadgeCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useBorrowerState, type BorrowPurpose } from '@/hooks/useBorrowerState';
import { CollateralOnboarding } from './CollateralOnboarding';
import { formatUsdc } from '@/app/lib/format';
import { useAllVaults } from '@/hooks/useAllVaults';
import { useVaultState } from '@/hooks/useVaultState';
import { useIkaCollateralAccount, useLoanAccount } from '@/hooks/useIkaCollateral';
import { getVaultPda, getLoanPda } from '@/app/lib/pda';
import { LoanRepayment } from './LoanRepayment';
import {
  POOL_NAMES,
  PROTOCOL_DEFAULT_APR_PCT,
  INSTITUTIONAL_CREDIT_LIMIT_USD,
  INDIVIDUAL_CREDIT_LIMIT_USD,
} from '@/app/lib/constants';

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEPS: { id: Step; label: string; icon: React.ElementType; sublabel: string }[] = [
  { id: 1, label: 'Profile',     icon: ShieldCheck,  sublabel: 'Identity' },
  { id: 2, label: 'Pool',        icon: Building2,    sublabel: 'Market' },
  { id: 3, label: 'Structure',   icon: CreditCard,   sublabel: 'Instrument' },
  { id: 4, label: 'Collateral',  icon: Lock,         sublabel: 'Security' },
  { id: 5, label: 'Risk',        icon: BarChart,    sublabel: 'Review' },
  { id: 6, label: 'Execute',     icon: FileCheck,    sublabel: 'Sign' },
  { id: 7, label: 'Track',       icon: Activity,     sublabel: 'Status' },
];

const PURPOSES: { value: BorrowPurpose; label: string; description: string }[] = [
  { value: 'working-capital',       label: 'Working Capital',        description: 'Operational liquidity and short-term funding' },
  { value: 'inventory-purchase',    label: 'Inventory Purchase',     description: 'Stock acquisition and supply chain financing' },
  { value: 'equipment-financing',   label: 'Equipment Financing',    description: 'Capital assets and infrastructure' },
  { value: 'trade-finance',         label: 'Trade Finance',          description: 'Import / export and cross-border transactions' },
  { value: 'treasury-operations',   label: 'Treasury Operations',    description: 'Balance sheet management and liquidity' },
  { value: 'acquisition-financing', label: 'Acquisition Financing',  description: 'Strategic growth and M&A activity' },
];

const DURATION_OPTIONS = [
  { days: 30,  label: '30D',  term: 'Short-term' },
  { days: 60,  label: '60D',  term: 'Short-term' },
  { days: 90,  label: '90D',  term: 'Standard' },
  { days: 180, label: '180D', term: 'Extended' },
  { days: 365, label: '365D', term: 'Annual' },
];

// --- FIELD LABEL ---
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-xs uppercase tracking-[0.22em] text-white/25 mb-2">
      {children}
    </div>
  );
}

// --- SECTION HEADER ---
function StepHeader({ step, title, subtitle }: { step: number; title: string; subtitle: string }) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-3 mb-4">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-emerald-500/60 font-bold">
          Step {step} of 7
        </span>
        <div className="h-[1px] flex-1 bg-gradient-to-r from-emerald-500/20 to-transparent" />
      </div>
      <h2 className="font-display text-4xl text-white leading-none tracking-tight">{title}</h2>
      <p className="mt-3 text-sm text-white/40 max-w-xl leading-relaxed">{subtitle}</p>
    </div>
  );
}

// --- VAULT CARD for pool selection ---
function VaultCard({
  vaultId,
  isSelected,
  onSelect,
}: {
  vaultId: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const vaultState = useVaultState(vaultId);
  const data = vaultState.data;

  const tvl = (data?.tranches ?? []).reduce((s, t) => s + t.totalAssets, 0n);
  const liquidity = (data?.tranches ?? []).reduce((s, t) => s + t.ammQuoteBalance, 0n);
  const utilization = tvl > 0n ? Number(((tvl - liquidity) * 100n) / tvl) : 0;
  const isHealthy = (data?.lossBucketBalance ?? 0n) === 0n;

  const poolName = POOL_NAMES[vaultId] ?? `Structured Credit Pool #${vaultId}`;

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group w-full rounded-sm border p-6 text-left transition-all duration-300',
        isSelected
          ? 'border-white/30 bg-white/[0.08] shadow-xl shadow-black/40 translate-x-1'
          : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
      )}
    >
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <div className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border transition-all duration-300',
            isSelected ? 'border-white/30 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/20',
          )}>
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn(
              'text-lg font-semibold leading-none transition-colors',
              isSelected ? 'text-white' : 'text-white/60 group-hover:text-white/80',
            )}>
              {poolName}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-widest text-white/30">
                Market ID: {vaultId.toString().padStart(3, '0')}
              </span>
              <div className="h-1 w-1 rounded-full bg-white/10" />
              <div className="flex items-center gap-1.5">
                <div className={cn('h-1 w-1 rounded-full', isHealthy ? 'bg-emerald-500' : 'bg-rose-500')} />
                <span className={cn('font-mono text-xs uppercase tracking-widest', isHealthy ? 'text-emerald-500/70' : 'text-rose-500/70')}>
                  {isHealthy ? 'Operational' : 'Risk Active'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className={cn(
            'font-mono text-xl font-bold tracking-tight',
            isSelected ? 'text-white' : 'text-white/40',
          )}>
            {PROTOCOL_DEFAULT_APR_PCT.toFixed(2)}% APR
          </div>
          <div className="mt-1 font-mono text-xs uppercase tracking-widest text-white/20">
            Base Interest Rate
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-6 border-t border-white/[0.04] pt-6">
        {[
          { label: 'Available Liquidity', value: `$${formatUsdc(liquidity, 0)}`, icon: Zap },
          { label: 'Total Pool Depth',    value: `$${formatUsdc(tvl, 0)}`,       icon: Layers },
          { label: 'Current Utilization', value: `${utilization.toFixed(1)}%`,    icon: Activity },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Icon className="h-3 w-3 text-white/20" />
              <div className="font-mono text-xs uppercase tracking-[0.2em] text-white/25">{label}</div>
            </div>
            <div className={cn(
              'font-mono text-sm font-medium',
              isSelected ? 'text-white/80' : 'text-white/40',
            )}>{value}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

// ─── STEP 1: Borrower Profile ───────────────────────────────────────────────
function StepProfile({
  publicKey,
  borrowerType,
  setBorrowerType,
}: {
  publicKey: string;
  borrowerType: 'individual' | 'institutional';
  setBorrowerType: (v: 'individual' | 'institutional') => void;
}) {
  const walletShort = publicKey ? `${publicKey.slice(0, 8)}…${publicKey.slice(-8)}` : 'Not connected';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <StepHeader 
        step={1} 
        title="Borrower Identity" 
        subtitle="Verify your institutional standing and protocol eligibility before configuring your credit facility." 
      />

      {/* Wallet Identity Card */}
      <div className="rounded-sm border border-white/[0.08] bg-white/[0.02] p-6">
        <FieldLabel>Authenticated Entity</FieldLabel>
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-white/[0.1] bg-white/[0.05]">
            <Wallet className="h-5 w-5 text-white/40" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-lg font-medium text-white tracking-tight truncate">{walletShort}</div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-mono text-xs uppercase tracking-[0.15em] text-white/30">
                Authorized Session · Network: Stellar Testnet
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="rounded-sm border border-emerald-500/20 bg-emerald-500/[0.05] px-2.5 py-1 font-mono text-xs uppercase tracking-widest text-emerald-400">
              Verified
            </span>
          </div>
        </div>
      </div>

      {/* Borrower Classification */}
      <div>
        <FieldLabel>Credit Classification</FieldLabel>
        <div className="grid grid-cols-2 gap-4">
          {( [
            {
              value: 'institutional' as const,
              label: 'Institutional',
              description: 'Corporate treasury, credit fund, or registered professional entity.',
              limit: `$${INSTITUTIONAL_CREDIT_LIMIT_USD.toLocaleString()} Capacity`,
              tier: 'Tier 1',
              icon: Building2,
            },
            {
              value: 'individual' as const,
              label: 'Private Entity',
              description: 'Individual professional borrower or sole proprietor classification.',
              limit: `$${INDIVIDUAL_CREDIT_LIMIT_USD.toLocaleString()} Capacity`,
              tier: 'Tier 2',
              icon: ShieldCheck,
            },
          ] as const).map(({ value, label, description, limit, tier, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setBorrowerType(value)}
              className={cn(
                'group relative overflow-hidden rounded-sm border p-6 text-left transition-all duration-300',
                borrowerType === value
                  ? 'border-white/30 bg-white/[0.07] shadow-lg shadow-black/20'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
              )}
            >
              {borrowerType === value && (
                <div className="absolute right-0 top-0 h-16 w-16 -translate-y-1/2 translate-x-1/2 rounded-full bg-white/5 blur-2xl" />
              )}
              <div className="flex items-center justify-between mb-4">
                <div className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-sm border transition-colors',
                  borrowerType === value ? 'border-white/20 bg-white/10 text-white' : 'border-white/10 bg-white/5 text-white/20',
                )}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn(
                  'rounded-sm px-2 py-0.5 font-mono text-xs uppercase tracking-[0.2em] border transition-colors',
                  borrowerType === value ? 'border-white/20 text-white/60' : 'border-white/5 text-white/20',
                )}>
                  {tier}
                </span>
              </div>
              <div className={cn(
                'text-sm font-semibold transition-colors',
                borrowerType === value ? 'text-white' : 'text-white/40',
              )}>
                {label}
              </div>
              <div className={cn(
                'mt-2 text-sm leading-relaxed transition-colors',
                borrowerType === value ? 'text-white/50' : 'text-white/25',
              )}>
                {description}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className={cn(
                  'font-mono text-xs font-bold uppercase tracking-widest transition-colors',
                  borrowerType === value ? 'text-emerald-400/80' : 'text-white/15',
                )}>
                  {limit}
                </div>
                {borrowerType === value && <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Compliance Notice */}
      <div className="rounded-sm border border-white/[0.04] bg-white/[0.01] p-5">
        <div className="flex items-start gap-4">
          <BadgeCheck className="mt-1 h-5 w-5 text-white/20" />
          <div>
            <div className="text-sm font-medium text-white/60">Compliance & Eligibility</div>
            <p className="mt-1.5 text-sm leading-relaxed text-white/30 max-w-lg">
              Your profile has been pre-cleared for Tier 1 institutional access based on your on-chain history. 
              Further KYC documentation may be required for facilities exceeding $1M USDC.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 2: Select Credit Pool ─────────────────────────────────────────────
function StepPoolSelection({
  selectedVaultId,
  setSelectedVaultId,
}: {
  selectedVaultId: number | null;
  setSelectedVaultId: (v: number | null) => void;
}) {
  const allVaults = useAllVaults();
  const vaults = allVaults.data ?? [];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <StepHeader
        step={2}
        title="Select Credit Market"
        subtitle="Each pool represents a distinct institutional lending environment with localized liquidity and risk parameters."
      />

      {allVaults.isLoading ? (
        <div className="flex flex-col items-center justify-center rounded-sm border border-white/[0.06] bg-white/[0.01] p-12 text-center">
          <div className="h-6 w-6 rounded-full border-2 border-white/10 border-t-white/40 animate-spin mb-4" />
          <span className="font-mono text-xs uppercase tracking-widest text-white/30">
            Querying Protocol Credit Markets…
          </span>
        </div>
      ) : vaults.length === 0 ? (
        <div className="rounded-sm border border-dashed border-white/[0.1] bg-white/[0.01] p-12 text-center">
          <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-amber-500/30" />
          <div className="font-mono text-sm font-bold uppercase tracking-widest text-white/40">
            No Active Markets Detected
          </div>
          <div className="mt-2 text-sm text-white/20 max-w-xs mx-auto">
            Deployment of institutional credit pools is managed via the PRISM Governance Terminal.
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {vaults.map((vault) => (
            <VaultCard
              key={vault.id}
              vaultId={vault.id}
              isSelected={selectedVaultId === vault.id}
              onSelect={() => setSelectedVaultId(vault.id)}
            />
          ))}
        </div>
      )}

      {selectedVaultId !== null && (
        <div className="flex items-center gap-4 rounded-sm border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-emerald-500/10">
            <CheckCircle2 className="h-4 w-4 text-emerald-500/60" />
          </div>
          <div className="flex-1">
            <div className="font-mono text-xs font-bold uppercase tracking-widest text-white/80">
              Market Selection Locked
            </div>
            <div className="mt-0.5 text-sm text-white/40">
              Proceeding with Pool #{selectedVaultId}. All facility parameters will be calculated against this reserve.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STEP 3: Loan Structuring ────────────────────────────────────────────────
function StepLoanStructuring({
  amount, setAmount,
  duration, setDuration,
  purpose, setPurpose,
  collateralUsd, setCollateralUsd,
  poolLiquidity,
}: {
  amount: string;
  setAmount: (v: string) => void;
  duration: number;
  setDuration: (v: number) => void;
  purpose: BorrowPurpose;
  setPurpose: (v: BorrowPurpose) => void;
  collateralUsd: string;
  setCollateralUsd: (v: string) => void;
  poolLiquidity: bigint;
}) {
  const numAmount = Number(amount) || 0;
  const numCollateral = Number(collateralUsd) || 0;
  const ltv = numCollateral > 0 ? (numAmount / numCollateral) * 100 : 0;
  const apr = PROTOCOL_DEFAULT_APR_PCT;
  const interest = numAmount * apr / 100 * (duration / 365);
  const total = numAmount + interest;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <StepHeader 
        step={3} 
        title="Facility Structuring" 
        subtitle="Configure the financial parameters of your credit facility. All terms are subject to protocol risk modeling." 
      />

      <div className="grid grid-cols-12 gap-10">
        {/* Left Column: Inputs */}
        <div className="col-span-7 space-y-8">
          {/* Principal */}
          <div>
            <FieldLabel>Principal Request (USDC)</FieldLabel>
            <div className="group relative">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                <span className="font-mono text-xl text-white/20 group-focus-within:text-emerald-500/40 transition-colors">$</span>
              </div>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-sm border border-white/[0.08] bg-white/[0.02] py-6 pl-12 pr-6 font-mono text-3xl text-white placeholder-white/10 focus:border-white/30 focus:bg-white/[0.04] focus:outline-none transition-all"
                placeholder="0.00"
              />
              <div className="mt-3 flex justify-between items-center px-1">
                <div className="flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-white/20" />
                  <span className="font-mono text-xs uppercase tracking-widest text-white/30">
                    Pool Depth: ${formatUsdc(poolLiquidity, 0)}
                  </span>
                </div>
                <div className="font-mono text-xs uppercase tracking-widest text-white/20">
                  Max Institutional Limit: $1,000,000.00
                </div>
              </div>
            </div>
          </div>

          {/* Duration */}
          <div>
            <FieldLabel>Facility Tenure</FieldLabel>
            <div className="grid grid-cols-5 gap-3">
              {DURATION_OPTIONS.map(({ days, label, term }) => (
                <button
                  key={days}
                  onClick={() => setDuration(days)}
                  className={cn(
                    'group relative flex flex-col items-center rounded-sm border py-4 transition-all duration-300',
                    duration === days
                      ? 'border-white/30 bg-white/[0.08] shadow-lg shadow-black/20'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                  )}
                >
                  <div className={cn(
                    'font-mono text-sm font-bold transition-colors',
                    duration === days ? 'text-white' : 'text-white/40 group-hover:text-white/60',
                  )}>{label}</div>
                  <div className={cn(
                    'mt-1 font-mono text-xs uppercase tracking-widest transition-colors',
                    duration === days ? 'text-emerald-500/80' : 'text-white/15',
                  )}>{term}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Purpose */}
          <div>
            <FieldLabel>Utilization Strategy</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              {PURPOSES.map(({ value, label, description }) => (
                <button
                  key={value}
                  onClick={() => setPurpose(value)}
                  className={cn(
                    'group rounded-sm border p-4 text-left transition-all duration-300',
                    purpose === value
                      ? 'border-white/30 bg-white/[0.08]'
                      : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]',
                  )}
                >
                  <div className={cn(
                    'text-xs font-semibold transition-colors',
                    purpose === value ? 'text-white' : 'text-white/40',
                  )}>{label}</div>
                  <div className={cn(
                    'mt-1 text-xs leading-relaxed transition-colors',
                    purpose === value ? 'text-white/50' : 'text-white/20',
                  )}>{description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Projections & Real-time Metrics */}
        <div className="col-span-5 space-y-6">
          <div className="rounded-sm border border-white/[0.08] bg-white/[0.03] overflow-hidden sticky top-0">
            <div className="border-b border-white/[0.08] bg-white/[0.02] px-6 py-4">
              <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-white/60">Facility Projection</h3>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="font-mono text-xs uppercase tracking-widest text-white/30">Total Interest</span>
                  <span className="font-mono text-lg text-white">${interest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="font-mono text-xs uppercase tracking-widest text-white/30">Origination Fee</span>
                  <span className="font-mono text-lg text-white">$0.00</span>
                </div>
                <div className="h-px bg-white/[0.08]" />
                <div className="flex justify-between items-end pt-2">
                  <span className="font-mono text-xs uppercase tracking-widest text-emerald-500/60 font-bold">Maturity Repayment</span>
                  <span className="font-mono text-2xl font-bold text-white">${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div className="rounded-sm bg-black/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-white/20" />
                  <span className="font-mono text-xs uppercase tracking-widest text-white/40">Repayment Schedule</span>
                </div>
                <div className="text-sm text-white/60 leading-relaxed">
                  Bullet repayment of <span className="text-white font-semibold">${total.toLocaleString()}</span> due in <span className="text-white font-semibold">{duration} days</span> from origination.
                </div>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs uppercase tracking-widest text-white/30">Borrower Credit Utilization</span>
                  <span className="font-mono text-xs text-white/40">{(numAmount / 1000000 * 100).toFixed(1)}%</span>
                </div>
                <div className="h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500/40 transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min(numAmount / 1000000 * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-emerald-500/10 bg-emerald-500/[0.02] p-5">
            <div className="flex gap-3">
              <TrendingUp className="h-5 w-5 text-emerald-500/40 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-white/70">Institutional APR: {apr.toFixed(2)}%</div>
                <p className="mt-1.5 text-xs leading-relaxed text-white/30">
                  Fixed rate locked for {duration} days. No prepayment penalties apply for institutional facilities.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 4: Collateral Verification ─────────────────────────────────────────
function StepCollateral({
  amount,
}: {
  amount: string;
}) {
  const numAmount = Number(amount) || 0;
  const minCollateral = numAmount * 1.2;

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <StepHeader
        step={4}
        title="Security & Collateral"
        subtitle="Review collateral requirements. You will attach BTC or ETH collateral via IKA dWallet after your application is approved."
      />

      {/* Institutional Risk Tiers */}
      <div className="grid grid-cols-3 gap-6">
        {[
          {
            label: 'Accepted Collateral',
            value: 'BTC · ETH',
            color: 'text-white/70',
            desc: 'Via IKA dWallet (cross-chain)'
          },
          {
            label: 'Min. Coverage Required',
            value: numAmount > 0 ? `$${minCollateral.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '120%',
            color: 'text-emerald-400',
            desc: '120% of principal at origination'
          },
          {
            label: 'Liquidation Trigger',
            value: '100% Ratio',
            color: 'text-white/40',
            desc: 'Auto-liquidation threshold'
          },
        ].map(({ label, value, color, desc }) => (
          <div key={label} className="rounded-sm border border-white/[0.08] bg-white/[0.02] p-5">
            <FieldLabel>{label}</FieldLabel>
            <div className={cn('font-mono text-xl font-bold tracking-tight mb-1', color)}>{value}</div>
            <div className="text-xs text-white/20 uppercase tracking-widest">{desc}</div>
          </div>
        ))}
      </div>

      {/* Collateral Requirements Info */}
      <div className="rounded-sm border border-white/[0.08] bg-white/[0.02] overflow-hidden">
        <div className="border-b border-white/[0.08] bg-white/[0.03] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-white/40" />
            <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-white/60">Collateral Requirements</h3>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex items-start gap-4 p-4 rounded-sm bg-white/[0.03] border border-white/[0.05]">
            <div className="h-10 w-10 shrink-0 flex items-center justify-center rounded-sm border border-white/10 bg-white/5">
              <Lock className="h-5 w-5 text-white/30" />
            </div>
            <div>
              <div className="text-sm font-medium text-white/80">Collateral Locked After Approval</div>
              <p className="mt-1 text-sm leading-relaxed text-white/30">
                Once your application is approved and originated on-chain, you will attach BTC or ETH via IKA dWallet. The protocol holds these funds in a programmatic escrow — only accessible in the event of a margin call or maturity default.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-sm border border-white/[0.05] bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="h-3.5 w-3.5 text-white/20" />
                <span className="font-mono text-xs uppercase tracking-widest text-white/40">Oracle Valuation</span>
              </div>
              <div className="font-mono text-sm text-white/60">Real-time</div>
              <div className="mt-1 font-mono text-xs uppercase tracking-widest text-white/15">IKA Network Attestation</div>
            </div>
            <div className="p-4 rounded-sm border border-white/[0.05] bg-white/[0.01]">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-3.5 w-3.5 text-white/20" />
                <span className="font-mono text-xs uppercase tracking-widest text-white/40">Min. Collateral</span>
              </div>
              <div className="font-mono text-sm text-emerald-500/60">
                {numAmount > 0 ? `$${minCollateral.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '120% of loan'}
              </div>
              <div className="mt-1 font-mono text-xs uppercase tracking-widest text-white/15">Required at disbursement</div>
            </div>
          </div>

          <div className="rounded-sm border border-amber-500/10 bg-amber-500/[0.03] p-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-500/40 mt-0.5 shrink-0" />
            <p className="text-xs leading-relaxed text-white/30">
              Collateral attachment is only enabled after admin approval and on-chain loan origination. Submit your application first — you will be guided through the IKA dWallet setup once approved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STEP 5: Risk & Terms Review ─────────────────────────────────────────────
function StepRiskReview({
  amount, duration, collateralUsd,
}: {
  amount: string; duration: number; collateralUsd: string;
}) {
  const numAmount = Number(amount) || 0;
  const numCollateral = Number(collateralUsd) || 0;
  const apr = PROTOCOL_DEFAULT_APR_PCT;
  const interest = numAmount * apr / 100 * (duration / 365);
  const total = numAmount + interest;
  const ltv = numCollateral > 0 ? (numAmount / numCollateral) * 100 : 0;
  const healthFactor = ltv > 0 ? 1.2 / (ltv / 100) : 0;

  const scenarios = [
    { label: 'Market -10%', collateralPost: numCollateral * 0.9, outcome: 'Safe' },
    { label: 'Market -25%', collateralPost: numCollateral * 0.75, outcome: numCollateral * 0.75 / numAmount > 1.2 ? 'Safe' : 'Warning' },
    { label: 'Market -40%', collateralPost: numCollateral * 0.6, outcome: 'Liquidation Risk' },
    { label: 'Market -60%', collateralPost: numCollateral * 0.4, outcome: 'Liquidation' },
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <StepHeader 
        step={5} 
        title="Underwriting & Risk Review" 
        subtitle="Review your facility's economic structure and understand how protocol tranches secure your debt." 
      />

      <div className="grid grid-cols-12 gap-10">
        <div className="col-span-7 space-y-8">
          {/* Tranche Education */}
          <div>
            <FieldLabel>Capital Structure & Backing</FieldLabel>
            <div className="space-y-3">
              {[
                { 
                  name: 'Senior Tranche (Prime)', 
                  desc: 'Insured by Alpha/Core capital. Priority repayment status.', 
                  rate: 'Low Yield', 
                  risk: 'Protected',
                  color: 'bg-emerald-500/20 text-emerald-400'
                },
                { 
                  name: 'Mezzanine Tranche (Core)', 
                  desc: 'Balanced risk/reward. Provides first-loss protection to Prime.', 
                  rate: 'Mid Yield', 
                  risk: 'Moderate',
                  color: 'bg-amber-500/20 text-amber-400'
                },
                { 
                  name: 'Junior Tranche (Alpha)', 
                  desc: 'High-risk capital. Absorbs initial losses to secure the facility.', 
                  rate: 'High Yield', 
                  risk: 'First Loss',
                  color: 'bg-rose-500/20 text-rose-400'
                },
              ].map((t) => (
                <div key={t.name} className="flex items-center gap-4 rounded-sm border border-white/[0.06] bg-white/[0.01] p-4 transition-all hover:bg-white/[0.03]">
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-bold', t.color)}>
                    {t.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-white/80">{t.name}</div>
                    <div className="text-xs text-white/30 mt-0.5">{t.desc}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs uppercase tracking-widest text-white/40">{t.risk}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scenario Stress Test */}
          <div>
            <FieldLabel>Stress Scenario Analysis</FieldLabel>
            <div className="rounded-sm border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-white/[0.04] text-white/25 uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 font-medium">Scenario</th>
                    <th className="px-4 py-3 font-medium">Collateral Value</th>
                    <th className="px-4 py-3 font-medium">LTV Post</th>
                    <th className="px-4 py-3 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {scenarios.map((s) => {
                    const ltvPost = (numAmount / s.collateralPost) * 100;
                    return (
                      <tr key={s.label} className="hover:bg-white/[0.01] transition-colors">
                        <td className="px-4 py-3 text-white/60">{s.label}</td>
                        <td className="px-4 py-3 text-white/40">${s.collateralPost.toLocaleString()}</td>
                        <td className="px-4 py-3 text-white/40">{ltvPost.toFixed(1)}%</td>
                        <td className={cn(
                          'px-4 py-3 text-right font-bold tracking-widest uppercase',
                          s.outcome === 'Safe' ? 'text-emerald-500/60' : s.outcome === 'Warning' ? 'text-amber-500/60' : 'text-rose-500/60'
                        )}>
                          {s.outcome}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-span-5 space-y-6">
          <div className="rounded-sm border border-white/[0.1] bg-white/[0.03] p-6 space-y-6">
            <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-white/60 mb-2">Final Terms</h3>
            
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-white/30">Facility Size</span>
                <span className="font-mono text-sm text-white">${numAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/30">Maturity Date</span>
                <span className="font-mono text-sm text-white">{new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-white/30">Initial LTV</span>
                <span className={cn('font-mono text-sm', ltv > 80 ? 'text-rose-400' : 'text-emerald-400')}>{ltv.toFixed(1)}%</span>
              </div>
              <div className="h-px bg-white/[0.08]" />
              <div className="flex justify-between items-end pt-2">
                <span className="text-sm font-bold text-white/60">Interest APR</span>
                <span className="font-mono text-xl font-bold text-emerald-400">{apr.toFixed(2)}%</span>
              </div>
            </div>

            <div className="p-4 rounded-sm bg-rose-500/5 border border-rose-500/10">
              <div className="flex gap-3">
                <AlertTriangle className="h-4 w-4 text-rose-500/40 shrink-0" />
                <div className="text-xs leading-relaxed text-white/30">
                  By submitting this application, you acknowledge that failure to maintain a Health Factor {'>'} 1.0 will trigger immediate liquidation of locked collateral.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-white/[0.05] bg-white/[0.01] p-5">
            <div className="flex items-center gap-3">
              <FileCheck className="h-5 w-5 text-white/20" />
              <div>
                <div className="text-xs font-semibold text-white/70">Institutional Attestation</div>
                <p className="mt-1 text-xs leading-relaxed text-white/25">
                  Your facility structure has been verified against protocol risk parameters. Approval is expected within 12 seconds of submission.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── STEP 6: Final Submission ─────────────────────────────────────────────────
function StepSubmission({
  publicKey,
  amount, duration, purpose,
  selectedVaultId,
  onSubmit,
  isSubmitting,
}: {
  publicKey: string;
  amount: string;
  duration: number;
  purpose: BorrowPurpose;
  selectedVaultId: number | null;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const numAmount = Number(amount) || 0;
  const apr = PROTOCOL_DEFAULT_APR_PCT;
  const interest = numAmount * apr / 100 * (duration / 365);
  const total = numAmount + interest;
  const purposeLabel = PURPOSES.find((p) => p.value === purpose)?.label ?? purpose;

  return (
    <div className="space-y-6">
      <StepHeader step={6} title="Final Submission" subtitle="Formal execution · Loan instrument issuance · Electronic signature" />

      {/* Contract Summary */}
      <div className="rounded-sm border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-white/25 mb-4">
          Loan Instrument Summary
        </div>
        <div className="space-y-2.5">
          {[
            { label: 'Credit Pool',        value: selectedVaultId !== null ? `Pool #${selectedVaultId}` : 'Unselected' },
            { label: 'Principal',          value: `$${numAmount.toLocaleString()} USDC` },
            { label: 'Facility Duration',  value: `${duration} days` },
            { label: 'Interest Rate',      value: `${apr}% APR (estimated)` },
            { label: 'Total Repayment',    value: `$${total.toFixed(2)} USDC` },
            { label: 'Use of Proceeds',    value: purposeLabel },
            { label: 'Collateral Type',    value: 'BTC / ETH via IKA dWallet' },
            { label: 'Liquidation Trigger', value: '120% collateral ratio' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center gap-4 py-1.5 border-b border-white/[0.03] last:border-0">
              <span className="text-sm text-white/35">{label}</span>
              <span className="font-mono text-sm text-white/70 text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Borrower Obligations */}
      <div className="rounded-sm border border-white/[0.05] bg-white/[0.01] p-4">
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-white/25 mb-3">
          Borrower Obligations
        </div>
        <div className="space-y-2">
          {[
            'Lock sufficient BTC/ETH collateral through IKA dWallet within 48 hours of approval',
            'Maintain collateral ratio above 120% throughout the facility term',
            'Repay principal and interest in full by the maturity date',
            'Acknowledge that collateral liquidation is automated and irreversible below threshold',
          ].map((obligation, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <div className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/20" />
              <p className="text-xs leading-relaxed text-white/35">{obligation}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Acknowledgement */}
      <button
        onClick={() => setAcknowledged(!acknowledged)}
        className={cn(
          'flex w-full items-start gap-3 rounded-sm border p-4 text-left transition-all duration-150',
          acknowledged ? 'border-white/15 bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.01] hover:border-white/10',
        )}
      >
        <div className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-all',
          acknowledged ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/20 bg-white/[0.02]',
        )}>
          {acknowledged && <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />}
        </div>
        <p className="text-xs leading-relaxed text-white/40">
          I have read and understand all terms, obligations, and liquidation conditions. I authorize the PRISM Protocol to proceed with formal underwriting review and, upon approval, to lock my provided collateral.
        </p>
      </button>

      {/* Submit */}
      <div className="space-y-3">
        <button
          onClick={onSubmit}
          disabled={!acknowledged || isSubmitting || selectedVaultId === null}
          className={cn(
            'flex w-full items-center justify-center gap-3 rounded-sm py-4 font-mono text-sm font-bold uppercase tracking-[0.2em] transition-all duration-200',
            acknowledged && !isSubmitting && selectedVaultId !== null
              ? 'bg-white text-black hover:bg-white/90 active:scale-[0.99]'
              : 'bg-white/[0.05] text-white/20 cursor-not-allowed',
          )}
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 rounded-full border border-current border-t-transparent animate-spin" />
              Submitting…
            </>
          ) : (
            <>
              <FileCheck className="h-4 w-4" />
              Sign & Submit Application
            </>
          )}
        </button>
        {publicKey && (
          <p className="text-center font-mono text-xs uppercase tracking-[0.25em] text-white/15">
            Electronic signature bound to {publicKey.slice(0, 8)}…{publicKey.slice(-8)}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── STEP 7: Approval Tracking ────────────────────────────────────────────────
function StepTracking({
  existingApp,
  onAttachCollateral,
}: {
  existingApp: import('@/hooks/useLoanApplications').LoanApplication | undefined;
  onAttachCollateral: () => void;
}) {
  const trackingStages = [
    { label: 'Submitted',       done: true,                                         active: false },
    { label: 'Under Review',    done: existingApp?.status === 'approved',           active: existingApp?.status === 'pending' },
    { label: 'Risk Evaluated',  done: existingApp?.status === 'approved',           active: false },
    { label: 'Approved',        done: existingApp?.status === 'approved',           active: false },
    { label: 'Collateral Lock', done: !!existingApp?.loanId && existingApp.status === 'approved', active: existingApp?.status === 'approved' && !existingApp.loanId },
    { label: 'Funded',          done: false,                                        active: false },
    { label: 'Active Loan',     done: false,                                        active: false },
  ];

  const doneCount = trackingStages.filter((s) => s.done).length;
  const progress = (doneCount / trackingStages.length) * 100;

  return (
    <div className="space-y-6">
      <StepHeader step={7} title="Approval Tracking" subtitle="Operational status · Lifecycle monitoring · Funding pipeline" />

      {/* Progress */}
      <div className="rounded-sm border border-white/[0.06] bg-white/[0.01] p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-xs uppercase tracking-widest text-white/25">Workflow Progress</span>
          <span className="font-mono text-xs text-white/40">{doneCount}/{trackingStages.length} stages</span>
        </div>
        <div className="h-0.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className="h-full bg-white/30 rounded-full transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stage Pipeline */}
      <div className="space-y-1">
        {trackingStages.map((stage, idx) => (
          <div
            key={idx}
            className={cn(
              'flex items-center gap-4 rounded-sm border px-4 py-3 transition-all',
              stage.done   ? 'border-white/10 bg-white/[0.03]' :
              stage.active ? 'border-white/10 bg-white/[0.02]' :
                             'border-white/[0.04] bg-transparent',
            )}
          >
            <div className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all',
              stage.done   ? 'border-emerald-500/40 bg-emerald-500/10' :
              stage.active ? 'border-white/20 bg-white/[0.03] animate-pulse' :
                             'border-white/[0.08] bg-transparent',
            )}>
              {stage.done ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
              ) : stage.active ? (
                <div className="h-1.5 w-1.5 rounded-full bg-white/40 animate-pulse" />
              ) : (
                <Circle className="h-3 w-3 text-white/10" />
              )}
            </div>

            <span className={cn(
              'flex-1 text-sm font-medium',
              stage.done   ? 'text-white/70' :
              stage.active ? 'text-white/60' :
                             'text-white/20',
            )}>
              {stage.label}
            </span>

            <span className={cn(
              'font-mono text-xs uppercase tracking-wider',
              stage.done   ? 'text-emerald-400/60' :
              stage.active ? 'text-white/30' :
                             'text-white/12',
            )}>
              {stage.done ? 'Complete' : stage.active ? 'In Progress' : 'Pending'}
            </span>
          </div>
        ))}
      </div>

      {/* Status Detail */}
      <div className={cn(
        'rounded-sm border p-5',
        existingApp?.status === 'approved'
          ? 'border-emerald-500/15 bg-emerald-500/[0.03]'
          : 'border-white/[0.06] bg-white/[0.01]',
      )}>
        {!existingApp ? (
          <p className="text-center font-mono text-xs uppercase tracking-widest text-white/20">
            No active application on record
          </p>
        ) : existingApp.status === 'pending' ? (
          <div className="flex items-center gap-4">
            <Clock className="h-5 w-5 text-amber-500/50 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-white/70">Underwriting in Progress</div>
              <p className="mt-1 font-mono text-xs uppercase tracking-widest text-white/30">
                Estimated completion: 2–4 business hours · On-chain processing
              </p>
              <p className="mt-2 font-mono text-xs text-white/20">
                Application ID: {existingApp.id.slice(0, 12)}…
              </p>
            </div>
          </div>
        ) : existingApp.status === 'approved' ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">Credit Facility Approved</div>
                <p className="mt-1 font-mono text-xs uppercase tracking-widest text-emerald-400/60">
                  {existingApp.loanId !== undefined
                    ? `Loan ID: #${existingApp.loanId} · APR: ${((existingApp.approvedAprBps ?? 850) / 100).toFixed(2)}%`
                    : 'Awaiting on-chain origination'}
                </p>
              </div>
            </div>
            {existingApp.loanId !== undefined && (
              <button
                onClick={onAttachCollateral}
                className="shrink-0 rounded-sm border border-white/15 bg-white/[0.05] px-4 py-2 font-mono text-xs uppercase tracking-widest text-white/60 hover:bg-white/[0.08] hover:text-white/80 transition-all"
              >
                Attach Collateral →
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <AlertTriangle className="h-5 w-5 text-rose-400/60 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-rose-300/70">Application Rejected</div>
              <p className="mt-1 font-mono text-xs text-white/30">
                Please review your collateral and resubmit.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN WORKFLOW ────────────────────────────────────────────────────────────
export function BorrowingWorkflow() {
  const { publicKey, connected } = useWallet();
  const { submit, getByBorrower } = useLoanApplications();
  const {
    amount, setAmount,
    duration, setDuration,
    purpose, setPurpose,
    borrowerType, setBorrowerType,
    collateralUsd, setCollateralUsd,
    selectedVaultId, setSelectedVaultId,
    currentStep, setCurrentStep,
  } = useBorrowerState();

  const existingApp = publicKey ? getByBorrower(publicKey.toBase58()) : undefined;

  useEffect(() => {
    if (existingApp && selectedVaultId === null) {
      setSelectedVaultId(existingApp.vaultId ?? 1);
    }
  }, [existingApp, selectedVaultId]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const vaultState = useVaultState(selectedVaultId ?? 0);
  const poolLiquidity = (vaultState.data?.tranches ?? []).reduce((s, t) => s + t.ammQuoteBalance, 0n);

  const [vaultPda] = getVaultPda(existingApp?.vaultId ?? 0);
  const [loanPda] = getLoanPda(vaultPda, existingApp?.loanId ?? 0);
  const { data: collateral } = useIkaCollateralAccount(existingApp?.loanId != null ? loanPda : null);
  const { data: loanAccount } = useLoanAccount(existingApp?.loanId != null ? loanPda : null);
  const isLocked = collateral?.status === 'Locked';
  const loanIsActive = loanAccount?.state != null && 'active' in (loanAccount.state as object);
  const loanIsRepaid = loanAccount?.state != null && 'repaid' in (loanAccount.state as object);

  const next = () => setCurrentStep(Math.min(currentStep + 1, 7));
  const back = () => setCurrentStep(Math.max(currentStep - 1, 1));

  const canAdvance = (() => {
    if (currentStep === 2 && selectedVaultId === null) return false;
    return true;
  })();

  function handleSubmit() {
    if (!publicKey || isSubmitting) return;
    setIsSubmitting(true);
    submit({
      borrowerPubkey: publicKey.toBase58(),
      requestedUSDC: Number(amount),
      maturityDays: duration,
      purpose: PURPOSES.find((p) => p.value === purpose)?.label ?? purpose,
      vaultId: selectedVaultId!,
    });
    setIsSubmitting(false);
    setCurrentStep(7);
  }

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-sm border border-dashed border-white/[0.08] bg-black/30 p-20 text-center">
        <Lock className="mb-5 h-8 w-8 text-white/[0.08]" />
        <h3 className="font-display text-xl text-white">Wallet Connection Required</h3>
        <p className="mt-2 text-sm text-white/30 max-w-sm leading-relaxed">
          Connect your institutional wallet to access the structured credit underwriting terminal.
        </p>
      </div>
    );
  }

  // ── Active-application view: action-first, no scroll hunting ────────────────
  if (existingApp) {
    const isApproved        = existingApp.status === 'approved';
    const isPending         = existingApp.status === 'pending';
    const hasOnChainLoan    = existingApp.loanId !== undefined;
    const isCollateralStage = isApproved && hasOnChainLoan;
    const isAwaitingOrigin  = isApproved && !hasOnChainLoan;
    const minCollateral     = Math.ceil(existingApp.requestedUSDC * 1.2);

    // Compact 6-step horizontal strip
    const hStages = [
      { label: 'Submitted',  done: true,              active: false },
      { label: 'Review',     done: isApproved,        active: isPending },
      { label: 'Approved',   done: isApproved,        active: isAwaitingOrigin },
      { label: 'Secured',    done: isLocked,          active: isCollateralStage && !isLocked },
      { label: 'Active',     done: loanIsRepaid,      active: loanIsActive },
      { label: 'Repaid',     done: loanIsRepaid,      active: false },
    ];

    return (
      <div className="space-y-4">

        {/* ── Persistent Action Header ─────────────────────────────────────── */}
        <div className={cn(
          'rounded-sm border px-5 py-4 flex items-center justify-between gap-4',
          loanIsRepaid ? 'border-blue-500/20 bg-blue-500/[0.04]'
          : loanIsActive ? 'border-amber-500/25 bg-amber-500/[0.05]'
          : isLocked ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
          : isCollateralStage ? 'border-purple-500/25 bg-purple-500/[0.06]'
          : isAwaitingOrigin ? 'border-amber-500/20 bg-amber-500/[0.04]'
          : 'border-white/[0.08] bg-white/[0.02]',
        )}>
          <div className="flex items-center gap-4 min-w-0">
            <div className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border',
              loanIsRepaid ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
              : loanIsActive ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              : isLocked ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : isCollateralStage ? 'border-purple-500/30 bg-purple-500/10 text-purple-400'
              : isAwaitingOrigin ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
              : isApproved ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-white/10 bg-white/[0.03] text-white/30',
            )}>
              {loanIsRepaid ? <CheckCircle2 className="h-4 w-4" />
               : loanIsActive ? <CreditCard className="h-4 w-4" />
               : isLocked ? <BadgeCheck className="h-4 w-4" />
               : isCollateralStage ? <Lock className="h-4 w-4" />
               : isApproved ? <CheckCircle2 className="h-4 w-4" />
               : <Clock className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex flex-col gap-1">
              <div className="font-mono text-xs uppercase tracking-[0.25em] text-white/25">Current Required Action</div>
              <div className={cn(
                'text-sm font-bold leading-snug',
                loanIsRepaid ? 'text-blue-400'
                : loanIsActive ? 'text-amber-200'
                : isLocked ? 'text-emerald-400'
                : isCollateralStage ? 'text-white'
                : isAwaitingOrigin ? 'text-amber-200/80'
                : isApproved ? 'text-emerald-300'
                : 'text-white/70',
              )}>
                {loanIsRepaid ? 'Loan Fully Repaid'
                 : loanIsActive ? 'Repayment Due'
                 : isLocked ? 'Collateral Secured'
                 : isCollateralStage ? 'Register IKA Collateral'
                 : isAwaitingOrigin ? 'Awaiting On-Chain Origination'
                 : 'Application Under Review'}
              </div>
              <div className="font-mono text-xs text-white/25 truncate">
                {loanIsRepaid
                  ? 'Facility closed · release IKA collateral when ready'
                  : loanIsActive
                  ? 'USDC disbursed to your wallet · repay via USDC or Dodo (UPI/Cards)'
                  : isLocked
                  ? 'Facility fully secured · awaiting protocol-side USDC disbursement'
                  : isCollateralStage
                  ? `Lock BTC or ETH · min $${minCollateral.toLocaleString()} · activates disbursement`
                  : isAwaitingOrigin
                  ? 'Admin is recording your loan on-chain · collateral unlocks after confirmation'
                  : 'Underwriting review in progress · est. 2–4 business hours'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <div className="font-display text-xl text-white">${existingApp.requestedUSDC.toLocaleString()}</div>
              <div className="font-mono text-xs uppercase tracking-widest text-white/20">{existingApp.maturityDays}d facility</div>
            </div>
            <div className={cn(
              'flex items-center gap-1.5 rounded-sm border px-2.5 py-1 font-mono text-xs uppercase tracking-[0.15em]',
              loanIsRepaid ? 'border-blue-500/20 text-blue-400/70'
              : loanIsActive ? 'border-amber-500/20 text-amber-400/70'
              : isCollateralStage ? 'border-purple-500/20 text-purple-400/70'
              : isApproved ? 'border-emerald-500/20 text-emerald-400/70'
              : 'border-amber-500/20 text-amber-400/70',
            )}>
              <div className={cn(
                'h-1 w-1 rounded-full animate-pulse',
                loanIsRepaid ? 'bg-blue-400' : loanIsActive ? 'bg-amber-400' : isCollateralStage ? 'bg-purple-400' : isApproved ? 'bg-emerald-400' : 'bg-amber-400',
              )} />
              {loanIsRepaid ? 'Closed' : loanIsActive ? 'Repayment Due' : isCollateralStage ? 'Action Required' : isApproved ? 'Approved' : 'In Review'}
            </div>
          </div>
        </div>

        {/* ── Compact Horizontal Progress Strip ────────────────────────────── */}
        <div className="flex items-center rounded-sm border border-white/[0.05] bg-white/[0.01] px-5 py-2.5">
          {hStages.map((stage, idx) => (
            <div key={idx} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className={cn(
                  'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-all',
                  stage.done   ? 'border-emerald-500/50 bg-emerald-500/15'
                  : stage.active ? 'border-white/40 bg-white/[0.06]'
                  :                'border-white/[0.1] bg-transparent',
                )}>
                  {stage.done ? (
                    <CheckCircle2 className="h-2 w-2 text-emerald-400" />
                  ) : stage.active ? (
                    <div className="h-1 w-1 rounded-full bg-white/70 animate-pulse" />
                  ) : (
                    <div className="h-0.5 w-0.5 rounded-full bg-white/15" />
                  )}
                </div>
                <span className={cn(
                  'font-mono text-xs uppercase tracking-wider hidden sm:block',
                  stage.done ? 'text-emerald-400/50' : stage.active ? 'text-white/50' : 'text-white/15',
                )}>
                  {stage.label}
                </span>
              </div>
              {idx < hStages.length - 1 && (
                <div className={cn(
                  'flex-1 mx-2 h-px min-w-[8px]',
                  stage.done ? 'bg-emerald-500/15' : 'bg-white/[0.05]',
                )} />
              )}
            </div>
          ))}
        </div>

        {/* ── Primary Action Zone — drives the rest of the page ────────────── */}

        {/* COLLATERAL STAGE: dominant two-column layout */}
        {isCollateralStage && (
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">

            {/* Left — CollateralOnboarding elevated as primary workspace */}
            <CollateralOnboarding
              vaultId={existingApp.vaultId}
              loanId={existingApp.loanId!}
              defaultCollateralUsd={minCollateral}
            />

            {/* Right — context intelligence panel */}
            <div className="space-y-3">

              <div className="rounded-sm border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-white/20 pb-2 border-b border-white/[0.05]">Facility Summary</div>
                {[
                  { label: 'Principal',  value: `$${existingApp.requestedUSDC.toLocaleString()}` },
                  { label: 'APR',        value: `${((existingApp.approvedAprBps ?? 850) / 100).toFixed(2)}%` },
                  { label: 'Maturity',   value: `${existingApp.maturityDays} days` },
                  { label: 'Loan ID',    value: `#${existingApp.loanId}` },
                  { label: 'Pool',       value: `#${existingApp.vaultId}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="font-mono text-xs uppercase tracking-widest text-white/20">{label}</span>
                    <span className="font-mono text-xs text-white/60">{value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-sm border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-white/20 pb-2 border-b border-white/[0.05]">Collateral Requirements</div>
                {[
                  { label: 'Min. Collateral', value: `$${minCollateral.toLocaleString()}`, accent: true },
                  { label: 'Coverage Ratio',  value: '≥ 120%' },
                  { label: 'Liquidation',     value: 'Below 100%' },
                  { label: 'Accepted Assets', value: 'BTC · ETH' },
                  { label: 'Custody',         value: 'IKA dWallet' },
                ].map(({ label, value, accent }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="font-mono text-xs uppercase tracking-widest text-white/20">{label}</span>
                    <span className={cn('font-mono text-xs', accent ? 'text-emerald-400/80 font-bold' : 'text-white/60')}>{value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-sm border border-purple-500/10 bg-purple-500/[0.03] p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-mono text-xs uppercase tracking-widest text-white/30">Oracle Status</span>
                </div>
                <div className="font-mono text-xs text-white/50">IKA Network · Live attestation ready</div>
                <div className="font-mono text-xs text-white/30">Disbursement unlocks after collateral lock confirmation</div>
              </div>

              <div className="rounded-sm border border-rose-500/10 bg-rose-500/[0.02] p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-rose-400/40 shrink-0 mt-0.5" />
                  <div className="font-mono text-xs text-white/25 leading-relaxed">
                    Collateral below 100% ratio triggers automatic liquidation. Monitor health factor after funding.
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ACTIVE LOAN: disbursed — show repayment with USDC + Dodo */}
        {loanIsActive && existingApp.loanId !== undefined && (
          <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
            <LoanRepayment loanId={existingApp.loanId} vaultId={existingApp.vaultId} />

            <div className="space-y-3">
              <div className="rounded-sm border border-white/[0.08] bg-white/[0.02] p-5 space-y-3">
                <div className="font-mono text-xs uppercase tracking-[0.25em] text-white/20 pb-2 border-b border-white/[0.05]">Outstanding Balance</div>
                {[
                  { label: 'Principal',   value: `$${existingApp.requestedUSDC.toLocaleString()}` },
                  { label: 'APR',         value: `${((existingApp.approvedAprBps ?? 850) / 100).toFixed(2)}%` },
                  { label: 'Maturity',    value: `${existingApp.maturityDays} days` },
                  { label: 'Loan ID',     value: `#${existingApp.loanId}` },
                  { label: 'Pool',        value: `#${existingApp.vaultId}` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="font-mono text-xs uppercase tracking-widest text-white/20">{label}</span>
                    <span className="font-mono text-xs text-white/60">{value}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-sm border border-amber-500/10 bg-amber-500/[0.03] p-4">
                <div className="flex items-start gap-2">
                  <CreditCard className="h-3.5 w-3.5 text-amber-400/50 shrink-0 mt-0.5" />
                  <div className="font-mono text-xs text-white/30 leading-relaxed">
                    Pay via USDC wallet or Dodo Payments (UPI · Cards · 220+ countries). Fiat is bridged to USDC server-side before on-chain settlement.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AWAITING ORIGINATION: admin hasn't run initialize_loan yet */}
        {isAwaitingOrigin && (
          <div className="rounded-sm border border-amber-500/15 bg-amber-500/[0.03] p-8 flex items-start gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-amber-500/20 bg-amber-500/[0.07]">
              <Clock className="h-6 w-6 text-amber-400/70" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white/80">Loan Origination Pending</div>
              <p className="mt-2 text-sm leading-relaxed text-white/40 max-w-lg">
                Your application is approved. The admin is recording your loan on-chain via <span className="font-mono text-white/50">initialize_loan</span>. Collateral registration will surface automatically once the transaction is confirmed.
              </p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'App ID',    value: existingApp.id.slice(0, 8) + '…' },
                  { label: 'Pool',      value: `#${existingApp.vaultId}` },
                  { label: 'Principal', value: `$${existingApp.requestedUSDC.toLocaleString()}` },
                  { label: 'Term',      value: `${existingApp.maturityDays}d` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-sm border border-white/[0.05] bg-white/[0.01] px-3 py-2">
                    <div className="font-mono text-xs uppercase tracking-widest text-white/20">{label}</div>
                    <div className="font-mono text-xs text-white/50 mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PENDING REVIEW: submitted, awaiting admin decision */}
        {isPending && (
          <div className="rounded-sm border border-white/[0.06] bg-white/[0.01] p-8 flex items-start gap-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-white/[0.03]">
              <Activity className="h-6 w-6 text-white/20" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white/60">Underwriting In Progress</div>
              <p className="mt-2 text-sm leading-relaxed text-white/30 max-w-lg">
                Your credit facility is being evaluated against protocol risk parameters. The underwriting team reviews collateral eligibility, principal sizing, and market conditions before origination.
              </p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'App ID',    value: existingApp.id.slice(0, 8) + '…' },
                  { label: 'Pool',      value: `#${existingApp.vaultId}` },
                  { label: 'Principal', value: `$${existingApp.requestedUSDC.toLocaleString()}` },
                  { label: 'Term',      value: `${existingApp.maturityDays}d` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-sm border border-white/[0.04] bg-white/[0.01] px-3 py-2">
                    <div className="font-mono text-xs uppercase tracking-widest text-white/20">{label}</div>
                    <div className="font-mono text-xs text-white/45 mt-0.5">{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  return (
    <div className="space-y-0">
      {/* Step Navigation Rail */}
      <nav className="mb-6 flex items-center gap-0 rounded-sm border border-white/[0.06] bg-black/30 overflow-hidden">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = currentStep > step.id;
          const isActive = currentStep === step.id;

          return (
            <button
              key={step.id}
              onClick={() => setCurrentStep(step.id)}
              className={cn(
                'group relative flex flex-1 items-center gap-2.5 border-r border-white/[0.04] px-3 py-3 text-left transition-all duration-150 last:border-r-0',
                isActive
                  ? 'bg-white/[0.06]'
                  : isCompleted
                    ? 'hover:bg-white/[0.03]'
                    : 'hover:bg-white/[0.02]',
              )}
            >
              <div className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-all',
                isActive    ? 'border-white/30 bg-white/10 text-white' :
                isCompleted ? 'border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-400' :
                              'border-white/[0.08] bg-white/[0.02] text-white/20',
              )}>
                {isCompleted ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
              </div>
              <div className="hidden min-[900px]:block">
                <div className={cn(
                  'font-mono text-xs font-semibold uppercase tracking-wider leading-none',
                  isActive ? 'text-white' : isCompleted ? 'text-white/40' : 'text-white/20',
                )}>
                  {step.label}
                </div>
                <div className={cn(
                  'mt-0.5 font-mono text-xs uppercase tracking-wider',
                  isActive ? 'text-white/40' : 'text-white/15',
                )}>
                  {step.sublabel}
                </div>
              </div>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-px bg-white/30" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Selected Pool Persistent Bar */}
      {selectedVaultId !== null && currentStep > 2 && (
        <div className="mb-4 flex items-center gap-3 rounded-sm border border-white/[0.06] bg-white/[0.01] px-4 py-2.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-white/25">Selected Market</span>
          <div className="h-3 w-px bg-white/[0.08]" />
          <span className="font-mono text-xs uppercase tracking-wider text-white/55">
            {{
              0: 'Institutional Stablecoin Credit',
              1: 'BTC Treasury Lending',
              2: 'Real Estate Credit Pool',
              3: 'Growth Capital Market',
            }[selectedVaultId] ?? `Credit Pool`} · Pool #{selectedVaultId}
          </span>
          <button
            onClick={() => setCurrentStep(2)}
            className="ml-auto font-mono text-xs uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Step Content */}
      <div className="animate-in fade-in slide-in-from-bottom-1 duration-300" key={currentStep}>
        {currentStep === 1 && (
          <StepProfile
            publicKey={publicKey?.toBase58() ?? ''}
            borrowerType={borrowerType}
            setBorrowerType={setBorrowerType}
          />
        )}
        {currentStep === 2 && (
          <StepPoolSelection
            selectedVaultId={selectedVaultId}
            setSelectedVaultId={setSelectedVaultId}
          />
        )}
        {currentStep === 3 && (
          <StepLoanStructuring
            amount={amount} setAmount={setAmount}
            duration={duration} setDuration={setDuration}
            purpose={purpose} setPurpose={setPurpose}
            collateralUsd={collateralUsd} setCollateralUsd={setCollateralUsd}
            poolLiquidity={poolLiquidity}
          />
        )}
        {currentStep === 4 && (
          <StepCollateral amount={amount} />
        )}
        {currentStep === 5 && (
          <StepRiskReview
            amount={amount}
            duration={duration}
            collateralUsd={collateralUsd}
          />
        )}
        {currentStep === 6 && (
          <StepSubmission
            publicKey={publicKey?.toBase58() ?? ''}
            amount={amount}
            duration={duration}
            purpose={purpose}
            selectedVaultId={selectedVaultId}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
          />
        )}
        {currentStep === 7 && (
          <StepTracking
            existingApp={existingApp}
            onAttachCollateral={() => setCurrentStep(4)}
          />
        )}
      </div>

      {/* Navigation Footer */}
      {currentStep < 7 && (
        <div className="mt-8 flex items-center justify-between pt-6 border-t border-white/[0.04]">
          <button
            onClick={back}
            disabled={currentStep === 1}
            className={cn(
              'flex items-center gap-2 font-mono text-xs uppercase tracking-widest transition-all',
              currentStep === 1 ? 'invisible' : 'text-white/25 hover:text-white/50',
            )}
          >
            <ArrowLeft className="h-3 w-3" />
            Back
          </button>

          {currentStep < 6 && (
            <button
              onClick={next}
              disabled={!canAdvance}
              className={cn(
                'flex items-center gap-2 rounded-sm border px-5 py-2 font-mono text-xs uppercase tracking-widest transition-all duration-150',
                canAdvance
                  ? 'border-white/15 bg-white/[0.04] text-white/60 hover:border-white/25 hover:bg-white/[0.07] hover:text-white/80'
                  : 'border-white/[0.04] bg-white/[0.01] text-white/20 cursor-not-allowed',
              )}
            >
              Continue
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
