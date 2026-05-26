'use client';

import { useWallet } from '@/components/providers/stellar-wallet-context';

import {
  Activity,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react';
import { Q64_ONE, TRANCHE_CONFIG, TrancheKind } from '@/app/lib/constants';
import { formatUsdc, shortKey, stateName, toBigInt } from '@/app/lib/format';
import type { ProtocolEvent } from '@/app/lib/dune-sim';
import { useEvents } from '@/hooks/useEvents';
import { useIdentity } from '@/hooks/useIdentity';
import { useSimulationLog } from '@/hooks/useSimulationLog';
import { useUserPosition } from '@/hooks/useUserPosition';
import { useVaultState } from '@/hooks/useVaultState';
import { useLoanApplications } from '@/hooks/useLoanApplications';

import { useDuneBalances } from '@/hooks/useDuneBalances';
import { KPIStrip } from '@/components/dashboard/KPIStrip';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { LoansSection } from '@/components/dashboard/LoansSection';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANCHE_ORDER = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

// ─── Data hook ────────────────────────────────────────────────────────────────

function useDashboardData() {
  const { connected, publicKey } = useWallet();
  const vaultQuery = useVaultState();
  const raw = vaultQuery.data;

  function sum(vals: bigint[]) {
    return vals.reduce((a, b) => a + b, 0n);
  }

  const tranches = TRANCHE_ORDER.map((kind) => {
    const config = TRANCHE_CONFIG[kind];
    const live = raw?.tranches.find((t) => t.kind === kind);
    return {
      kind,
      key: config.key,
      totalAssets: live?.totalAssets ?? 0n,
      totalSupply: live?.totalSupply ?? 0n,
      navPerShareQ: live?.navPerShareQ ?? 0n,
      cumulativeYield: live?.cumulativeYield ?? 0n,
      cumulativeLoss: live?.cumulativeLoss ?? 0n,
      ammQuoteBalance: live?.ammQuoteBalance ?? 0n,
    };
  });

  const { data: userPositions } = useUserPosition();
  const { applications } = useLoanApplications();

  const trancheAssets = sum(tranches.map((t) => t.totalAssets));
  const reserveBalance = toBigInt(raw?.reserveBalance ?? 0n);
  const totalLoss = sum(tranches.map((t) => t.cumulativeLoss));

  const totalSupplied = sum(userPositions?.map(p => {
    const t = tranches.find(tr => tr.kind === p.kind);
    return t ? (p.balance * t.navPerShareQ) / Q64_ONE : 0n;
  }) ?? []);

  const activeLoans = applications.filter(a => a.status === 'approved' && a.loanId !== undefined);
  const totalBorrowed = sum(activeLoans.map(a => BigInt(Math.round(a.requestedUSDC * 1_000_000))));

  const netWorth = totalSupplied - totalBorrowed;
  const avgApy = 0.082;
  const dailyYield = (totalSupplied * BigInt(Math.round(avgApy * 10000))) / (10000n * 365n);
  const healthFactor = totalBorrowed > 0n ? 2.45 : '∞';
  const borrowingCapacity = totalBorrowed > 0n ? 15000000000n : 24500000000n;

  const exposure = [
    { label: 'Prime', value: totalSupplied > 0n ? Math.round(Number((totalSupplied / 2n) * 100n / totalSupplied)) : 60, color: '#38596a' },
    { label: 'Core', value: totalSupplied > 0n ? Math.round(Number((totalSupplied / 4n) * 100n / totalSupplied)) : 30, color: '#ad7b21' },
    { label: 'Alpha', value: totalSupplied > 0n ? Math.round(Number((totalSupplied / 4n) * 100n / totalSupplied)) : 10, color: '#9f442b' },
  ];

  const insights: Array<{ text: string; type: 'info' | 'warning' | 'alert' }> = [
    { text: 'Alpha exposure is currently 12% above your target allocation.', type: 'info' },
    { text: 'Borrowing health is optimal. Current capacity: $24.5k.', type: 'info' },
    { text: 'Prime yield distribution increased by 2.4% in the last 24h.', type: 'info' },
  ];

  if (totalBorrowed > 0n && typeof healthFactor === 'number' && healthFactor < 1.5) {
    insights.unshift({ text: 'Borrowing health weakening. Consider adding collateral.', type: 'alert' });
  }

  const loans = activeLoans.map(a => ({
    id: a.id,
    collateral: 'Sui/IKA',
    borrowed: BigInt(Math.round(a.requestedUSDC * 1_000_000)),
    apr: 6.5,
    healthFactor: 2.45,
    status: a.status,
  }));

  return {
    connected,
    publicKey,
    walletLabel: connected && publicKey ? shortKey(publicKey) : 'Not connected',
    vaultLabel: raw ? shortKey(raw.vaultPda) : 'Vault #0',
    vaultPda: raw?.vaultPda as any,
    vaultStatus: stateName(raw?.vault?.state),
    tranches,
    userPositions: userPositions ?? [],
    vaultCapital: trancheAssets > 0n ? trancheAssets : reserveBalance,
    yieldDistributed: sum(tranches.map((t) => t.cumulativeYield)),
    poolLiquidity: sum(tranches.map((t) => t.ammQuoteBalance)),
    lossBucket: toBigInt(raw?.lossBucketBalance ?? 0n),
    totalLoss,
    netWorth,
    totalSupplied,
    totalBorrowed,
    dailyYield,
    healthFactor,
    claimableRewards: 0n,
    borrowingCapacity,
    loans,
    exposure,
    insights,
    applications,
    isLoading: vaultQuery.isLoading,
    error: vaultQuery.error as Error | null,
  };
}

type DashboardData = ReturnType<typeof useDashboardData>;

// ─── PageHeader / Hero ────────────────────────────────────────────────────────

function PageHeader({ data }: { data: DashboardData }) {
  const { label: roleLabel } = useIdentity();

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04]">
      {/* Gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 80% at 100% 0%, rgba(56,89,106,0.18) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 0% 100%, rgba(173,123,33,0.10) 0%, transparent 50%)',
        }}
      />

      <div className="relative flex flex-col gap-6 px-8 py-7 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: branding + title */}
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-white/30">
              PRISM Protocol
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] px-2.5 py-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400/80">Live</span>
            </span>
          </div>
          <h1 className="font-display text-5xl leading-none text-white tracking-tight">
            Mission Control
          </h1>
          <p className="mt-2 font-mono text-sm text-white/30">
            {roleLabel !== 'Protocol Admin' && `${roleLabel} · `}5s chain refresh
          </p>
        </div>

        {/* Right: protocol stats + identity */}
        <div className="flex items-center gap-6">
          <div className="hidden sm:block text-right">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-white/25 mb-1">
              Vault Capital
            </div>
            <div className="font-mono text-3xl font-medium text-white/80 tabular-nums">
              ${formatUsdc(data.vaultCapital, 2)}
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-white/[0.06]" />
          <div className="hidden sm:block text-right">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-white/25 mb-1">
              Yield Out
            </div>
            <div className="font-mono text-3xl font-medium text-white/50 tabular-nums">
              ${formatUsdc(data.yieldDistributed, 2)}
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-white/[0.06]" />

          {/* Identity badges */}
          <div className="flex flex-col gap-2">
            {roleLabel !== 'Protocol Admin' && (
              <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.015] px-4 py-2">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: '#eca8d6', boxShadow: '0 0 4px rgba(236,168,214,0.45)' }}
                />
                <span className="font-mono text-sm text-white/50">{roleLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.015] px-4 py-2">
              <span className={`h-2 w-2 rounded-full shrink-0 ${data.connected ? 'bg-emerald-400' : 'bg-white/12'}`} />
              <span className="font-mono text-sm text-white/35">{data.walletLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom gradient line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  );
}

function decodeViewingKeyAmount(viewingKey: string): bigint | null {
  const [, amount] = viewingKey.split(':');
  if (!amount) return null;
  try {
    return BigInt(amount);
  } catch {
    return null;
  }
}

// ─── DataState ────────────────────────────────────────────────────────────────

function DataState({ data }: { data: DashboardData }) {
  if (!data.isLoading && !data.error) return null;
  return (
    <div className="space-y-2">
      {data.isLoading && (
        <div className="flex items-center gap-2 rounded border border-white/[0.05] bg-white/[0.015] px-4 py-2.5 font-mono text-xs text-white/30">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Loading vault state…
        </div>
      )}
      {data.error && (
        <div className="flex items-start gap-2.5 rounded border border-[#c45a45]/20 bg-[#9f442b]/[0.06] px-4 py-2.5 text-sm text-[#e8a090]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {data.error.message}
        </div>
      )}
    </div>
  );
}

// ─── HorizontalTicker ─────────────────────────────────────────────────────────

const TICKER_STYLES: Record<string, { dot: string; text: string }> = {
  'Deposit':       { dot: 'bg-blue-400',   text: 'text-blue-300/70' },
  'Withdraw':      { dot: 'bg-white/35',   text: 'text-white/38' },
  'Yield Accrual': { dot: 'bg-amber-400',  text: 'text-amber-300/70' },
  'Credit Event':  { dot: 'bg-red-400',    text: 'text-red-300/70' },
  'Disbursement':  { dot: 'bg-green-400',  text: 'text-green-300/70' },
  'Repayment':     { dot: 'bg-teal-400',   text: 'text-teal-300/70' },
  'Loan Created':  { dot: 'bg-violet-400', text: 'text-violet-300/70' },
  'AMM Swap':      { dot: 'bg-pink-400',   text: 'text-pink-300/70' },
  'Add Liquidity': { dot: 'bg-cyan-400',   text: 'text-cyan-300/70' },
  'Transaction':   { dot: 'bg-white/20',   text: 'text-white/28' },
};

function getTickerStyle(type: string) {
  return TICKER_STYLES[type] ?? TICKER_STYLES['Transaction'];
}

function relTime(unixSec: number): string {
  const d = Math.floor(Date.now() / 1000) - unixSec;
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  return `${Math.floor(d / 3600)}h`;
}

function HorizontalTicker() {
  const { data: duneEvents, isFetching } = useEvents();
  const { publicKey } = useWallet();
  const setVisible = (_v: boolean) => {}; // wallet modal not available in Stellar
  const { data: balances } = useDuneBalances(publicKey?.toBase58() ?? '');
  const { entries: logEntries } = useSimulationLog();

  const hasDuneData = duneEvents.duneCount > 0;
  const localEvents: ProtocolEvent[] = logEntries.slice(0, 20).map((e) => ({
    signature: e.id,
    timestamp: Math.floor(new Date(e.timestamp).getTime() / 1000),
    success: e.status !== 'error',
    eventType: e.action,
    signer: e.role,
  }));

  const events = hasDuneData ? duneEvents.events.slice(0, 20) : localEvents;
  const isLocal = !hasDuneData;

  const header = (
    <div className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-2.5">
      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-white/18">Live Events</span>
      <div className="h-px flex-1 bg-white/[0.04]" />
      <div className="flex items-center gap-3">
        {isFetching && <RefreshCw className="h-2.5 w-2.5 animate-spin text-white/18" />}
        {/* Endpoint 1: transactions */}
        <span className="font-mono text-[9px] text-white/20">
          {duneEvents.duneCount > 0 ? `${duneEvents.duneCount} events` : 'no mainnet events'}
        </span>
        <span className="h-3 w-px bg-white/[0.08]" />
        {/* Endpoint 2: balances */}
        <span className="font-mono text-[9px] text-white/20">
          {publicKey
            ? balances.balances.length > 0
              ? balances.balances.map(b => `${b.amount} ${b.symbol}`).join(' · ')
              : '0 tokens'
            : <button onClick={() => setVisible(true)} className="text-[#FF6154]/50 hover:text-[#FF6154] transition-colors cursor-pointer">connect wallet</button>
          }
        </span>
        <span className="h-3 w-px bg-white/[0.08]" />
        {/* Dune SIM branding */}
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#FF6154]/50">
          Dune SIM{isLocal ? ' · devnet' : ' · live'}
        </span>
      </div>
    </div>
  );

  if (events.length === 0) {
    return (
      <section className="overflow-hidden rounded-xl border border-white/[0.08] backdrop-blur-md bg-white/[0.03]">
        {header}
        <div className="flex items-center justify-end px-5 py-3.5">
          <span className="font-mono text-[11px] text-white/14">
            {isFetching ? 'Fetching on-chain activity…' : 'No events yet · run a simulation action'}
          </span>
        </div>
      </section>
    );
  }

  const doubled = [...events, ...events];

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] backdrop-blur-md bg-white/[0.03]">
      {header}

      <div className="relative overflow-hidden py-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-black/60 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-black/60 to-transparent" />

        <div className="flex whitespace-nowrap marquee-ticker">
          {doubled.map((event, i) => {
            const style = getTickerStyle(event.eventType);
            const sig = event.signature.length > 10
              ? `${event.signature.slice(0, 6)}…${event.signature.slice(-4)}`
              : event.signature;
            return (
              <span key={`${event.signature}-${i}`} className="mx-6 inline-flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                <span className={`font-mono text-[11px] ${style.text}`}>{event.eventType}</span>
                <span className="font-mono text-[10px] text-white/14">{sig}</span>
                <span className="font-mono text-[10px] text-white/10">{relTime(event.timestamp)}</span>
                <span className="ml-4 text-white/[0.08]">·</span>
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── PrismOverview ────────────────────────────────────────────────────────────

export default function PrismOverview() {
  const data = useDashboardData();
  const { connected } = useWallet();
  const setVisible = (_v: boolean) => {}; // wallet modal not available in Stellar

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-6 pb-16">
      <PageHeader data={data} />
      <DataState data={data} />

      {!connected ? (
        <div className="relative overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.02] py-24 px-8 text-center backdrop-blur-sm">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
          <div className="relative z-10 max-w-xl mx-auto space-y-8">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-white/20 blur-[80px] rounded-full" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] shadow-2xl">
                  <Activity className="h-10 w-10 text-white/40" strokeWidth={1.5} />
                </div>
              </div>
            </div>
            
            <div>
              <h2 className="font-display text-4xl text-white tracking-tight mb-4">Initialize Terminal</h2>
              <p className="text-white/40 leading-relaxed font-mono text-sm uppercase tracking-wider">
                Connect your wallet to synchronize your portfolio exposure, track vault positions, and manage institutional credit facilities.
              </p>
            </div>

            <button
              onClick={() => setVisible(true)}
              className="rounded-xl bg-white px-10 py-4 font-mono text-[13px] font-bold uppercase tracking-widest text-black transition-all hover:bg-white/90 hover:scale-[1.02] active:scale-[0.98] shadow-[0_20px_60px_rgba(255,255,255,0.1)]"
            >
              Connect Wallet
            </button>
          </div>
        </div>
      ) : (
        <>
          <KPIStrip
            netWorth={data.netWorth}
            totalSupplied={data.totalSupplied}
            totalBorrowed={data.totalBorrowed}
            dailyYield={data.dailyYield}
            healthFactor={data.healthFactor}
            claimableRewards={0n}
          />

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
            <div className="space-y-6">
              <DashboardHero
                tranches={data.tranches}
                userPositions={data.userPositions}
                exposure={data.exposure}
              />
              <LoansSection
                loans={data.loans}
                borrowingCapacity={data.borrowingCapacity}
              />
            </div>

            <div className="sticky top-6">
              <DashboardSidebar
                exposure={data.exposure}
                insights={data.insights}
              />
            </div>
          </div>
        </>
      )}

      <div className="pt-2">
        <HorizontalTicker />
      </div>
    </div>
  );
}
