'use client';

import { useWallet } from '@/components/providers/stellar-wallet-context';
import { useWalletModal } from '@/components/providers/stellar-wallet-context';
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

import { KPIStrip } from '@/components/dashboard/KPIStrip';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { LoansSection } from '@/components/dashboard/LoansSection';

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
  const totalBorrowed = sum(activeLoans.map(a => BigInt(Math.round(a.requestedUSDC * 10_000_000))));

  const netWorth = totalSupplied > totalBorrowed ? totalSupplied - totalBorrowed : 0n;

  // Weighted average APY — use targetApyBps from chain if available, else
  // fall back to known deployment values (Prime 500, Core 800, Alpha 1500 bps).
  const APY_BPS_FALLBACK: Record<number, number> = {
    [TrancheKind.Prime]: 500,
    [TrancheKind.Core]:  800,
    [TrancheKind.Alpha]: 1500,
  };
  const totalTrancheAssets = sum(tranches.map(t => t.totalAssets));
  const weightedApyBps = totalTrancheAssets > 0n
    ? tranches.reduce((s, t) => {
        const bps = Number((raw?.tranches.find(r => r.kind === t.kind) as any)?.targetApyBps ?? APY_BPS_FALLBACK[t.kind] ?? 800);
        const weight = Number(t.totalAssets * 10_000n / totalTrancheAssets) / 10_000;
        const contrib = (isNaN(bps) || isNaN(weight)) ? 0 : bps * weight;
        return s + contrib;
      }, 0)
    : 800;
  const safeApyBps = isNaN(weightedApyBps) || weightedApyBps <= 0 ? 800 : weightedApyBps;
  const avgApyDecimal = safeApyBps / 10000;
  const dailyYield = totalSupplied > 0n
    ? (totalSupplied * BigInt(Math.round(avgApyDecimal * 10000))) / (10000n * 365n)
    : 0n;

  // Health factor: ratio of supplied to borrowed (∞ if no borrows)
  const healthFactor = totalBorrowed > 0n
    ? Math.round((Number(totalSupplied) / Number(totalBorrowed)) * 100) / 100
    : '∞';

  // Borrowing capacity: based on actual vault reserve
  const borrowingCapacity = trancheAssets > totalBorrowed
    ? (trancheAssets - totalBorrowed) * 80n / 100n  // 80% LTV
    : 0n;

  // Real exposure: based on user's actual positions per tranche
  const userTrancheValues = TRANCHE_ORDER.map(kind => {
    const pos = userPositions?.find(p => p.kind === kind);
    const t = tranches.find(tr => tr.kind === kind);
    return t && pos ? Number((pos.balance * t.navPerShareQ) / Q64_ONE) : 0;
  });
  const totalUserValue = userTrancheValues.reduce((s, v) => s + v, 0);
  const exposure = [
    { label: 'Prime', value: totalUserValue > 0 ? Math.round((userTrancheValues[0] / totalUserValue) * 100) : 60, color: '#80b3d6' },
    { label: 'Core',  value: totalUserValue > 0 ? Math.round((userTrancheValues[1] / totalUserValue) * 100) : 30, color: '#e2ba7d' },
    { label: 'Alpha', value: totalUserValue > 0 ? Math.round((userTrancheValues[2] / totalUserValue) * 100) : 10, color: '#e98e94' },
  ];

  // Dynamic insights from real data
  const insights: Array<{ text: string; type: 'info' | 'warning' | 'alert' }> = [];
  if (totalLoss > 0n) {
    insights.push({ text: `Active loss event — $${(Number(totalLoss) / 1e7).toFixed(2)} in loss bucket.`, type: 'alert' });
  }
  if (totalBorrowed > 0n && typeof healthFactor === 'number' && healthFactor < 1.5) {
    insights.push({ text: 'Borrowing health weakening. Consider repaying or adding collateral.', type: 'alert' });
  }
  if (totalSupplied > 0n) {
    insights.push({ text: `Earning ~${(avgApyDecimal * 100).toFixed(1)}% weighted APY across ${tranches.filter(t => t.totalAssets > 0n).length} active tranches.`, type: 'info' });
  }
  if (insights.length === 0) {
    insights.push({ text: 'No active positions. Deposit PTUSDC to start earning.', type: 'info' });
  }

  // Loans with real on-chain APR
  const loans = activeLoans.map(a => ({
    id: a.id,
    collateral: 'Stellar SAC',
    borrowed: BigInt(Math.round(a.requestedUSDC * 10_000_000)),
    apr: (a.approvedAprBps ?? 800) / 100,
    healthFactor: totalBorrowed > 0n && typeof healthFactor === 'number' ? healthFactor : 999,
    status: a.status,
    loanId: a.loanId,
  }));

  return {
    connected,
    publicKey,
    walletLabel: connected && publicKey ? shortKey(publicKey) : 'Not connected',
    vaultLabel: raw ? shortKey(raw.vaultPda) : 'Vault #0',
    vaultPda: raw?.vaultPda ,
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
    <div className="relative overflow-hidden rounded-2xl border border-transparent bg-[#0c0c0f] transition-all duration-300">
      <div className="relative flex flex-col gap-6 px-8 py-5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: branding + title */}
        <div>
          <h1 className="font-sans text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-none">
            Portfolio Overview
          </h1>
          <p className="mt-1 font-mono text-[10px] text-white/35">
            {roleLabel !== 'Protocol Admin' && `${roleLabel} · `}5s chain refresh
          </p>
        </div>

        {/* Right: protocol stats + identity */}
        <div className="flex flex-wrap items-center gap-6 sm:gap-5 lg:gap-6 justify-between sm:justify-end">
          <div className="text-right">
            <div className="font-mono text-[9px] uppercase tracking-wider text-white/25 mb-1 font-semibold">
              Vault Capital
            </div>
            <div className="font-mono text-xl font-medium text-white/80 tabular-nums">
              ${formatUsdc(data.vaultCapital, 2)}
            </div>
          </div>
          <div className="hidden sm:block w-px h-8 bg-white/[0.04]" />
          <div className="text-right">
            <div className="font-mono text-[9px] uppercase tracking-wider text-white/25 mb-1 font-semibold">
              Yield Out
            </div>
            <div className="font-mono text-xl font-medium text-white/50 tabular-nums">
              ${formatUsdc(data.yieldDistributed, 2)}
            </div>
          </div>
          <div className="hidden lg:block w-px h-8 bg-white/[0.04]" />

          {/* Identity badges */}
          <div className="flex flex-row gap-2 items-center justify-end">
            {roleLabel !== 'Protocol Admin' && (
              <div className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.005] px-3.5 py-1.5 transition-all duration-200 hover:bg-white/[0.015] hover:border-white/[0.08]">
                <span
                  className="h-1.5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: '#e54b73' }}
                />
                <span className="font-mono text-xs text-white/60">{roleLabel}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom line */}
      <div className="h-px w-full bg-white/[0.03]" />
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
  'Deposit':       { dot: 'bg-blue-500',   text: 'text-blue-400/80' },
  'Withdraw':      { dot: 'bg-white/20',   text: 'text-white/30' },
  'Yield Accrual': { dot: 'bg-amber-500',  text: 'text-amber-400/80' },
  'Credit Event':  { dot: 'bg-rose-500',   text: 'text-rose-400/80' },
  'Disbursement':  { dot: 'bg-emerald-500',text: 'text-emerald-400/80' },
  'Repayment':     { dot: 'bg-teal-500',   text: 'text-teal-400/80' },
  'Loan Created':  { dot: 'bg-indigo-500', text: 'text-indigo-400/80' },
  'AMM Swap':      { dot: 'bg-[#e54b73]',  text: 'text-[#e54b73]/80' },
  'Add Liquidity': { dot: 'bg-cyan-500',   text: 'text-cyan-400/80' },
  'Transaction':   { dot: 'bg-white/10',   text: 'text-white/25' },
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
  const { entries: logEntries } = useSimulationLog();

  const duneList = Array.isArray(duneEvents) ? duneEvents : (duneEvents as any)?.events ?? [];
  const hasDuneData = duneList.length > 0;
  const localEvents: ProtocolEvent[] = logEntries.slice(0, 20).map((e) => ({
    signature: e.id,
    timestamp: Math.floor(new Date(e.timestamp).getTime() / 1000),
    success: e.status !== 'error',
    eventType: e.action,
    signer: e.role,
  }));

  const events = hasDuneData ? duneList.slice(0, 20) : localEvents;
  const isLocal = !hasDuneData;

  if (events.length === 0) {
    return (
      <section className="overflow-hidden rounded-2xl border border-white/[0.03] bg-[#0c0c0f]">
        <div className="flex items-center gap-4 px-6 py-3">
          <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-white/20">Live Events</span>
          <div className="h-px flex-1 bg-white/[0.02]" />
          <span className="font-mono text-[10px] text-white/30">
            {isFetching ? 'Fetching activity…' : 'No events yet'}
          </span>
          {isFetching && <RefreshCw className="h-3 w-3 animate-spin text-white/20" />}
        </div>
      </section>
    );
  }

  const doubled = [...events, ...events];

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.03] bg-[#0c0c0f]">
      <div className="flex items-center gap-3 border-b border-white/[0.03] px-6 py-2">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-white/20">Live Events</span>
        <div className="h-px flex-1 bg-white/[0.02]" />
        <div className="flex items-center gap-1.5">
          {isFetching && <RefreshCw className="h-2.5 w-2.5 animate-spin text-white/20" />}
          <span className="font-mono text-[9px] text-white/20">{isLocal ? 'devnet' : 'dune'}</span>
        </div>
      </div>

      <div className="relative overflow-hidden py-2.5">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-black/40 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-black/40 to-transparent" />

        <div className="flex whitespace-nowrap marquee-ticker">
          {doubled.map((event, i) => {
            const style = getTickerStyle(event.eventType);
            const sig = event.signature.length > 10
              ? `${event.signature.slice(0, 6)}…${event.signature.slice(-4)}`
              : event.signature;
            return (
              <span key={`${event.signature}-${i}`} className="mx-5 inline-flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
                <span className={`font-mono text-[10px] ${style.text}`}>{event.eventType}</span>
                <span className="font-mono text-[9px] text-white/30">{sig}</span>
                <span className="font-mono text-[9px] text-white/20">{relTime(event.timestamp)}</span>
                <span className="ml-3 text-white/[0.04]">·</span>
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
  const { setVisible } = useWalletModal();

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-8 pb-16 animate-fade-in transition-all duration-500">
      <PageHeader data={data} />
      <DataState data={data} />

      {!connected ? (
        <div className="relative overflow-hidden rounded-[24px] border border-white/[0.06] bg-white/[0.015] py-24 px-8 text-center backdrop-blur-xl transition-all duration-300">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.01] to-transparent pointer-events-none" />
          <div className="relative z-10 max-w-xl mx-auto space-y-8">
            <div className="flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-pink-500/10 blur-[80px] rounded-full" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl">
                  <Activity className="h-10 w-10 text-[#eca8d6]/60 animate-pulse" strokeWidth={1.5} />
                </div>
              </div>
            </div>
            
            <div>
              <h2 className="font-display text-4xl text-white tracking-tight mb-4">Initialize Terminal</h2>
              <p className="text-white/40 leading-relaxed font-mono text-xs uppercase tracking-widest max-w-md mx-auto">
                Connect your wallet to synchronize your portfolio exposure, track vault positions, and manage institutional credit facilities.
              </p>
            </div>

            <button
              onClick={() => setVisible(true)}
              className="rounded-xl bg-gradient-to-r from-white to-white/95 px-10 py-4 font-mono text-[13px] font-bold uppercase tracking-widest text-black transition-all duration-300 hover:opacity-90 hover:scale-[1.01] active:scale-[0.99] shadow-[0_12px_40px_rgba(255,255,255,0.08)]"
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

          <div className="space-y-8">
            <DashboardHero
              tranches={data.tranches}
              userPositions={data.userPositions}
              exposure={data.exposure}
              isLoading={data.isLoading}
            />
            <LoansSection
              loans={data.loans}
              borrowingCapacity={data.borrowingCapacity}
            />
          </div>

          {/* Centered Version details footer */}
          <div className="pt-8 pb-4 text-center">
            <p className="font-mono text-[8px] uppercase tracking-widest text-white/10 leading-relaxed font-semibold">
              PRISM INTEL SYSTEM V4.1.2<br />
              ENCRYPTED SESSION ACTIVE<br />
              LAST ENGINE SYNC: {new Date().toLocaleTimeString()}
            </p>
          </div>
        </>
      )}

    </div>
  );
}
