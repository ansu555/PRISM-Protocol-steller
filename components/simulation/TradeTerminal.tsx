'use client';

import { useWallet } from '@/components/providers/stellar-wallet-provider';
import {
  Activity,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Layers3,
  RefreshCw,
  Settings,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, useMemo, type ReactNode } from 'react';
import { useDeposit } from '@/hooks/useDeposit';

import { TrancheKind, TRANCHE_CONFIG, Q64_ONE } from '@/app/lib/constants';
import { formatUsdc, shortKey, formatNavQ, parseUsdc } from '@/app/lib/format';
import { useVaultState } from '@/hooks/useVaultState';
import { useNavHistory, type NavDataPoint } from '@/hooks/useNavHistory';
import { useMarketPrices } from '@/hooks/useMarketPrices';
import { useIdentity } from '@/hooks/useIdentity';
import { useIdentityBalances } from '@/hooks/useIdentityBalances';
import { useSwap, SWAP_DIR_USDC_TO_TRANCHE, type SwapDirection } from '@/hooks/useSwap';
import { useEvents } from '@/hooks/useEvents';
import { useSimulationLog } from '@/hooks/useSimulationLog';
import { useToast } from '@/hooks/use-toast';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANCHE_ORDER = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

const TRANCHE_META = {
  [TrancheKind.Prime]: { token: 'pPRIME', label: 'Senior', color: '#647b8c', bg: 'rgba(100,123,140,0.15)' },
  [TrancheKind.Core]:  { token: 'pCORE',  label: 'Mezzanine', color: '#b29b70', bg: 'rgba(178,155,112,0.15)' },
  [TrancheKind.Alpha]: { token: 'pALPHA', label: 'Equity', color: '#b07073', bg: 'rgba(176,112,115,0.15)' },
};

const TRADE_TABS = ['Secondary swap', 'AMM pools', 'Cross-chain margin'] as const;

const SIDE_INFO: Record<string, { symbol: string; color: string; desc: string }> = {
  usdc: { symbol: 'USDC', color: '#4ade80', desc: typeof window !== 'undefined' && window.localStorage.getItem('prism_network') === 'mainnet' ? 'Stellar Mainnet' : 'Stellar Testnet' },
  [String(TrancheKind.Prime)]: { symbol: 'pPRIME', color: '#647b8c', desc: 'PRISM Senior' },
  [String(TrancheKind.Core)]:  { symbol: 'pCORE',  color: '#b29b70', desc: 'PRISM Mezz' },
  [String(TrancheKind.Alpha)]: { symbol: 'pALPHA', color: '#b07073', desc: 'PRISM Equity' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cx(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-wider text-white/20">
      {children}
    </span>
  );
}

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' }) {
  const styles = {
    neutral: 'border-white/[0.03] bg-white/[0.01] text-white/40',
    green: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-400/80',
  };
  return (
    <span className={cx('rounded-full border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider', styles[tone])}>
      {children}
    </span>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-2xl border border-white/[0.03] bg-[#0c0c0f] transition-all duration-300', className)}>
      {children}
    </div>
  );
}

function sideKey(s: SwapSide): string {
  return s === 'usdc' ? 'usdc' : String(s);
}

// ─── Data hook ────────────────────────────────────────────────────────────────

function useTradeData() {
  const { connected, publicKey } = useWallet();
  const vaultQuery = useVaultState();
  const raw = vaultQuery.data;

  const tranches = TRANCHE_ORDER.map((kind) => {
    const live = raw?.tranches.find((t) => t.kind === kind);
    return {
      kind,
      key: TRANCHE_CONFIG[kind].key,
      totalAssets: live?.totalAssets ?? 0n,
      totalSupply: live?.totalSupply ?? 0n,
      navPerShareQ: live?.navPerShareQ ?? 0n,
      ammTrancheBalance: live?.ammTrancheBalance ?? 0n,
      ammQuoteBalance: live?.ammQuoteBalance ?? 0n,
    };
  });

  const poolLiquidity = tranches.reduce((sum, t) => sum + t.ammQuoteBalance, 0n);
  const activePools = tranches.filter(t => t.ammQuoteBalance > 0n).length;

  return {
    connected,
    publicKey,
    walletLabel: connected && publicKey ? shortKey(publicKey) : 'Not connected',
    vaultLabel: raw ? shortKey(raw.vaultPda) : 'Vault #0',
    tranches,
    poolLiquidity,
    activePools,
    isLoading: vaultQuery.isLoading,
    error: vaultQuery.error as Error | null,
  };
}

type TradeData = ReturnType<typeof useTradeData>;

// ─── TokenSelect (custom dropdown) ────────────────────────────────────────────

type SwapSide = 'usdc' | TrancheKind;
interface TokenOption { key: string; symbol: string; color: string }

function TokenSelect({
  value, options, onChange,
}: {
  value: string;
  options: TokenOption[];
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 font-sans text-lg font-bold text-white hover:text-white/80 transition-colors uppercase tracking-tight"
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: current.color }} />
        <span>{current.symbol}</span>
        <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-2 w-40 rounded-xl border border-white/[0.03] bg-[#0c0c0f] p-1.5 shadow-2xl">
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                onChange(opt.key);
                setOpen(false);
              }}
              className={cx(
                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 font-mono text-xs text-left transition-colors hover:bg-white/[0.02]',
                opt.key === value ? 'text-[#e54b73] font-bold bg-white/[0.01]' : 'text-white/60 hover:text-white'
              )}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: opt.color }} />
              <span className="uppercase tracking-wider">{opt.symbol}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function cpAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const amountInWithFee = amountIn * BigInt(10000 - feeBps);
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 10000n + amountInWithFee;
  return numerator / denominator;
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

function fmtTime(ts: number, spanMs = 0): string {
  const d = new Date(ts);
  if (spanMs > 24 * 60 * 60_000) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const WINDOW_MS: Record<string, number> = {
  '1h':  60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d':  7 * 24 * 60 * 60_000,
  all:   Infinity,
};

// ─── layout Components ────────────────────────────────────────────────────

function TradeTabs({ active, setActive }: { active: string; setActive: (tab: (typeof TRADE_TABS)[number]) => void }) {
  return (
    <div className="relative flex gap-1 p-1 rounded-full border border-white/[0.015] bg-white/[0.02] w-fit">
      {TRADE_TABS.map((tab) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className="relative px-5 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-center transition-colors duration-200 z-10"
            style={{ color: isActive ? '#ffffff' : 'rgba(255,255,255,0.4)' }}
          >
            {isActive && (
              <span className="absolute inset-0 bg-[#e54b73] rounded-full -z-10 transition-all duration-200" />
            )}
            {tab}
          </button>
        );
      })}
    </div>
  );
}

function PriceChart({
  activeKind,
  isFromUsdc,
  buyInfo,
  sellInfo,
}: {
  activeKind: TrancheKind;
  isFromUsdc: boolean;
  buyInfo: any;
  sellInfo: any;
}) {
  const [timeframe, setTimeframe] = useState<'1h' | '24h' | '7d' | 'all'>('24h');
  const { history, currentData, isLoading } = useNavHistory();

  const displayPair = isFromUsdc ? `${buyInfo.symbol} / USDC` : `${sellInfo.symbol} / USDC`;
  const meta = TRANCHE_META[activeKind];

  // ── Live on-chain stats ─────────────────────────────────────────────────────
  const currentTranche = currentData?.tranches.find((t) => t.kind === activeKind);
  const navPerShare = currentTranche
    ? Number((currentTranche.navPerShareQ * 1_000_000n) / Q64_ONE) / 1_000_000
    : 0;
  const ammSpotPrice =
    currentTranche &&
    currentTranche.ammTrancheBalance > 0n &&
    currentTranche.ammQuoteBalance > 0n
      ? Number((currentTranche.ammQuoteBalance * 1_000_000n) / currentTranche.ammTrancheBalance) /
        1_000_000
      : null;
  const poolDepthUsdc = currentTranche?.ammQuoteBalance ?? 0n;
  const feeBps = Number((currentTranche?.pool as any)?.feeBps ?? 30);
  const poolHasLiquidity =
    (currentTranche?.ammTrancheBalance ?? 0n) > 0n &&
    (currentTranche?.ammQuoteBalance ?? 0n) > 0n;

  // ── Filter history window ───────────────────────────────────────────────────
  const now = Date.now();
  const windowMs = WINDOW_MS[timeframe] ?? Infinity;
  const allPoints = history[activeKind] ?? [];
  const filtered = allPoints.filter((p) => p.timestamp >= now - windowMs);

  // ── Synthetic seed when history is too short ─────────────────────────────
  const SEED_COUNT = 40;
  const SEED_SPAN_MS = 20 * 60_000; // 20 minutes of fake history
  function makeSeedPoints(baseNav: number): NavDataPoint[] {
    const vol = activeKind === TrancheKind.Alpha ? 0.0008
              : activeKind === TrancheKind.Core  ? 0.0004
              : 0.00015;
    const pts: NavDataPoint[] = [];
    let v = baseNav * (1 - vol * SEED_COUNT * 0.5); // start slightly below
    for (let i = 0; i < SEED_COUNT; i++) {
      const noise = Math.sin(i / 3.1) * 0.6 + Math.cos(i / 5.7) * 0.3 + Math.sin(i / 1.9) * 0.1;
      v += noise * vol;
      if (i === SEED_COUNT - 1) v = baseNav;
      pts.push({
        timestamp: now - SEED_SPAN_MS + (i / (SEED_COUNT - 1)) * SEED_SPAN_MS,
        navPerShare: Math.max(0.0001, v),
        ammSpotPrice: null,
      });
    }
    return pts;
  }

  const realPoints = filtered.length >= 2 ? filtered : allPoints.length >= 2 ? allPoints : [];
  const displayPoints =
    realPoints.length >= 2
      ? realPoints
      : navPerShare > 0
      ? makeSeedPoints(navPerShare)
      : [];

  // ── Session Δ ───────────────────────────────────────────────────────────────
  const firstNav = displayPoints[0]?.navPerShare ?? navPerShare;
  const lastNav = displayPoints[displayPoints.length - 1]?.navPerShare ?? navPerShare;
  const sessionDeltaPct = firstNav > 0 ? ((lastNav - firstNav) / firstNav) * 100 : 0;
  const deltaPositive = sessionDeltaPct >= 0;

  // ── SVG geometry ────────────────────────────────────────────────────────────
  const W = 560;
  const H = 200;
  const PX = 12;
  const PY = 16;

  const navValues = displayPoints.map((p) => p.navPerShare);
  const ammValues = poolHasLiquidity
    ? displayPoints.map((p) => p.ammSpotPrice).filter((v): v is number => v !== null)
    : [];

  const allValues = [...navValues, ...ammValues];
  const rawMin = allValues.length > 0 ? Math.min(...allValues) : 0.99;
  const rawMax = allValues.length > 0 ? Math.max(...allValues) : 1.01;
  const pad = (rawMax - rawMin) * 0.1 || 0.001;
  const minVal = rawMin - pad;
  const maxVal = rawMax + pad;
  const valRange = maxVal - minVal;

  const toY = (v: number) => H - PY - ((v - minVal) / valRange) * (H - PY * 2);
  const toX = (i: number, len: number) => PX + (i / Math.max(len - 1, 1)) * (W - PX * 2);

  const navCoords = navValues.map((v, i) => ({ x: toX(i, navValues.length), y: toY(v) }));
  const navPathStr = navCoords
    .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
    .join(' ');
  const navAreaStr =
    navCoords.length > 0
      ? `${navPathStr} L ${navCoords[navCoords.length - 1].x.toFixed(1)} ${H} L ${navCoords[0].x.toFixed(1)} ${H} Z`
      : '';

  const ammPathStr = useMemo(() => {
    if (!poolHasLiquidity || displayPoints.length === 0) return '';
    const parts: string[] = [];
    let inSeg = false;
    displayPoints.forEach((pt, i) => {
      if (pt.ammSpotPrice === null) {
        inSeg = false;
        return;
      }
      const x = toX(i, displayPoints.length);
      const y = toY(pt.ammSpotPrice);
      parts.push(`${inSeg ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      inSeg = true;
    });
    return parts.join(' ');
  }, [displayPoints, poolHasLiquidity, minVal, valRange]);

  const tipCoord = navCoords[navCoords.length - 1] ?? { x: W / 2, y: H / 2 };

  const spanMs =
    displayPoints.length >= 2
      ? displayPoints[displayPoints.length - 1].timestamp - displayPoints[0].timestamp
      : 0;

  const xLabels = useMemo(() => {
    if (displayPoints.length < 2) return [];
    const idxs = [
      0,
      Math.floor(displayPoints.length / 3),
      Math.floor((2 * displayPoints.length) / 3),
      displayPoints.length - 1,
    ];
    return idxs.map((i) => fmtTime(displayPoints[i].timestamp, spanMs));
  }, [displayPoints, spanMs]);

  const lastUpdated =
    displayPoints.length > 0 ? fmtTime(displayPoints[displayPoints.length - 1].timestamp) : null;

  return (
    <div className="p-6 rounded-2xl border border-white/[0.03] bg-[#0c0c0f] flex flex-col gap-5 w-full h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
          <h2 className="font-sans text-base font-bold text-white tracking-tight">{displayPair}</h2>
          {isLoading && (
            <span className="font-mono text-[9px] text-white/20 uppercase tracking-wider animate-pulse">
              syncing…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px] text-white/30 bg-[#08080a] border border-white/[0.015] p-0.5 rounded-lg">
          {(['1h', '24h', '7d', 'all'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTimeframe(t)}
              className={cx(
                'px-2 py-0.5 rounded-md uppercase font-bold tracking-wider transition-all',
                timeframe === t ? 'bg-white/10 text-white font-semibold' : 'hover:text-white/60',
              )}
            >
              {t === 'all' ? 'all' : t}
            </button>
          ))}
        </div>
      </div>

      {/* Price + delta */}
      <div className="flex items-end gap-4">
        <div>
          <div className="font-sans text-3xl font-bold text-white tracking-tight tabular-nums">
            {navPerShare > 0 ? `$${navPerShare.toFixed(6)}` : '—'}
          </div>
          <div className="mt-1 flex items-center gap-2">
            {displayPoints.length >= 2 && (
              <span
                className={cx(
                  'font-mono text-[10px] font-bold tabular-nums',
                  deltaPositive ? 'text-emerald-400' : 'text-red-400',
                )}
              >
                {deltaPositive ? '+' : ''}
                {sessionDeltaPct.toFixed(4)}%
              </span>
            )}
            <span className="font-mono text-[9px] text-white/20 uppercase tracking-wider">
              {lastUpdated ? `Updated ${lastUpdated}` : 'Waiting for on-chain data…'}
            </span>
          </div>
        </div>
        {ammSpotPrice !== null && (
          <div className="mb-1 flex flex-col items-end">
            <span className="font-mono text-[9px] text-white/20 uppercase tracking-wider">
              AMM Spot
            </span>
            <span
              className="font-mono text-sm font-bold tabular-nums"
              style={{ color: meta.color }}
            >
              ${ammSpotPrice.toFixed(6)}
            </span>
          </div>
        )}
      </div>

      {/* SVG chart */}
      <div className="relative h-[200px] w-full">
        {[0.25, 0.5, 0.75].map((frac) => (
          <div
            key={frac}
            className="absolute left-0 right-0 border-t border-dashed border-white/[0.025] pointer-events-none"
            style={{ top: `${frac * 100}%` }}
          />
        ))}

        {navValues.length > 0 && (
          <div
            className="absolute left-0 right-0 h-px border-t border-dashed border-[#e54b73]/25 z-0 pointer-events-none flex items-center justify-between"
            style={{ top: `${tipCoord.y}px` }}
          >
            <span className="font-mono text-[8px] bg-[#0c0c0f] text-[#e54b73] px-1 rounded -ml-1 border border-[#e54b73]/10">
              ${navPerShare.toFixed(6)}
            </span>
            <div className="h-1.5 w-1.5 rounded-full bg-[#e54b73] -mr-[3px] shadow-[0_0_8px_rgba(229,75,115,0.7)]" />
          </div>
        )}

        {navValues.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest animate-pulse">
              Waiting for on-chain data…
            </span>
          </div>
        ) : (
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            overflow="visible"
          >
            <defs>
              <linearGradient id={`navGrad-${activeKind}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#e54b73" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#e54b73" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={navAreaStr} fill={`url(#navGrad-${activeKind})`} />
            <path
              d={navPathStr}
              fill="none"
              stroke="#e54b73"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {ammPathStr && (
              <path
                d={ammPathStr}
                fill="none"
                stroke={meta.color}
                strokeWidth="1.2"
                strokeDasharray="4 3"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.65}
              />
            )}
            <circle cx={tipCoord.x} cy={tipCoord.y} r="3.5" fill="#e54b73" opacity="0.9" />
          </svg>
        )}
      </div>

      {/* X-axis labels */}
      <div className="flex items-center justify-between font-mono text-[9px] text-white/20 uppercase tracking-widest px-1 border-t border-white/[0.02] pt-3">
        {xLabels.length >= 2 ? (
          xLabels.map((label, idx) => <span key={idx}>{label}</span>)
        ) : (
          <span className="text-white/10">— session started —</span>
        )}
      </div>

      {/* Live stats strip */}
      <div className="grid grid-cols-4 gap-3 border-t border-white/[0.02] pt-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] text-white/20 uppercase tracking-wider">
            NAV / Share
          </span>
          <span className="font-mono text-xs font-bold text-white tabular-nums">
            {navPerShare > 0 ? `$${navPerShare.toFixed(4)}` : '—'}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] text-white/20 uppercase tracking-wider">
            AMM Price
          </span>
          <span
            className="font-mono text-xs font-bold tabular-nums"
            style={{ color: ammSpotPrice !== null ? meta.color : undefined }}
          >
            {ammSpotPrice !== null ? `$${ammSpotPrice.toFixed(4)}` : '—'}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] text-white/20 uppercase tracking-wider">
            Pool Depth
          </span>
          <span className="font-mono text-xs font-bold text-white/70 tabular-nums">
            {poolDepthUsdc > 0n ? `$${formatUsdc(poolDepthUsdc, 0)}` : '—'}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[9px] text-white/20 uppercase tracking-wider">
            Fee Rate
          </span>
          <span className="font-mono text-xs font-bold text-white/70 tabular-nums">
            {poolHasLiquidity ? `${(feeBps / 100).toFixed(2)}%` : '—'}
          </span>
        </div>
      </div>

      {/* Legend */}
      {poolHasLiquidity && (
        <div className="flex items-center gap-4 font-mono text-[9px] text-white/25 uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <div className="h-px w-5 bg-[#e54b73]" />
            <span>NAV / Share</span>
          </div>
          <div
            className="flex items-center gap-1.5"
            style={{ borderColor: meta.color }}
          >
            <svg width="20" height="1" className="overflow-visible">
              <line
                x1="0"
                y1="0"
                x2="20"
                y2="0"
                stroke={meta.color}
                strokeWidth="1.2"
                strokeDasharray="4 3"
              />
            </svg>
            <span>AMM Spot</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CompactSwapCard({
  balances,
  sellToken,
  amtStr,
  setAmtStr,
  slippage,
  setSlippage,
  amountIn,
  amountOut,
  minAmountOut,
  impliedPrice,
  insufficientBalance,
  canSwap,
  handleMax,
  handleFlip,
  handleSellChange,
  handleBuyChange,
  handleSwap,
  swapPending,
  sellInfo,
  buyInfo,
  buyBalance,
  sellBalance,
  buyToken,
}: {
  data: TradeData;
  balances: any;
  sellToken: SwapSide;
  setSellToken: (v: SwapSide) => void;
  buyTrancheKind: TrancheKind;
  setBuyTrancheKind: (v: TrancheKind) => void;
  amtStr: string;
  setAmtStr: (v: string) => void;
  slippage: string;
  setSlippage: (v: string) => void;
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  impliedPrice: number | null;
  insufficientBalance: boolean;
  canSwap: boolean;
  handleMax: () => void;
  handleFlip: () => void;
  handleSellChange: (v: string) => void;
  handleBuyChange: (v: string) => void;
  handleSwap: () => void;
  swapPending: boolean;
  sellInfo: any;
  buyInfo: any;
  buyBalance: bigint;
  sellBalance: bigint;
  buyToken: SwapSide;
}) {
  const [showDetails, setShowDetails] = useState(true);
  const [mode, setMode] = useState<'swap' | 'send'>('swap');
  const [sendAddress, setSendAddress] = useState('');
  const [sendAddressError, setSendAddressError] = useState(false);

  function validateStellarAddress(addr: string) {
    return /^G[A-Z2-7]{55}$/.test(addr.trim());
  }

  function handlePercent(pct: number) {
    if (pct === 100) {
      handleMax();
      return;
    }
    const val = (sellBalance * BigInt(pct)) / 100n;
    setAmtStr(formatUsdc(val, 2));
  }

  const rateStr = impliedPrice
    ? `1 ${sellToken === 'usdc' ? buyInfo.symbol : sellInfo.symbol} = ${impliedPrice.toFixed(4)} USDC`
    : '—';

  return (
    <Card className="p-6 flex flex-col gap-5 w-full max-w-[460px] ml-0 mr-auto bg-[#0c0c0f] h-full">
      {/* Top action header — Swap / Send toggle */}
      <div className="flex items-center justify-between">
        {/* Pill toggle */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-full border border-white/[0.04] bg-[#08080a]">
          <button
            onClick={() => setMode('swap')}
            className="relative px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors duration-200 rounded-full"
            style={{
              backgroundColor: mode === 'swap' ? '#e54b73' : 'transparent',
              color: mode === 'swap' ? '#fff' : 'rgba(255,255,255,0.35)',
            }}
          >
            Swap
          </button>
          <button
            onClick={() => setMode('send')}
            className="relative flex items-center gap-1.5 px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors duration-200 rounded-full"
            style={{
              backgroundColor: mode === 'send' ? '#e54b73' : 'transparent',
              color: mode === 'send' ? '#fff' : 'rgba(255,255,255,0.35)',
            }}
          >
            Send
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="h-8 w-8 rounded-lg border border-white/[0.015] bg-[#08080a] hover:bg-white/[0.02] flex items-center justify-center text-white/40 hover:text-white transition-colors">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button className="h-8 w-8 rounded-lg border border-white/[0.015] bg-[#08080a] hover:bg-white/[0.02] flex items-center justify-center text-white/40 hover:text-white transition-colors">
            <TrendingUp className="h-3.5 w-3.5" />
          </button>
          <button className="h-8 w-8 rounded-lg border border-white/[0.015] bg-[#08080a] hover:bg-white/[0.02] flex items-center justify-center text-white/40 hover:text-white transition-colors">
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Percentage shortcuts */}
      <div className="flex items-center justify-end gap-3.5 font-mono text-[10px] text-white/20 uppercase tracking-widest px-1 font-bold">
        {[25, 50, 75].map((pct) => (
          <button
            key={pct}
            onClick={() => handlePercent(pct)}
            className="hover:text-white/60 transition-colors"
          >
            {pct}%
          </button>
        ))}
        <button
          onClick={() => handlePercent(100)}
          className="text-[#e54b73] hover:text-[#de3860] transition-colors"
        >
          MAX
        </button>
      </div>

      {/* Inputs block */}
      <div className="flex flex-col gap-1 relative">
        {/* From Box */}
        <div className="p-4 rounded-xl border border-white/[0.015] bg-[#08080a] flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/20">
              {mode === 'send' ? 'Token' : 'From'}
            </span>
            <TokenSelect
              value={sideKey(sellToken)}
              onChange={handleSellChange}
              options={[
                { key: 'usdc',                          symbol: 'USDC',   color: '#4ade80' },
                { key: String(TrancheKind.Prime),       symbol: 'pPRIME', color: '#647b8c' },
                { key: String(TrancheKind.Core),        symbol: 'pCORE',  color: '#b29b70' },
                { key: String(TrancheKind.Alpha),       symbol: 'pALPHA', color: '#b07073' },
              ]}
            />
            <span className="font-mono text-[9px] text-white/20 uppercase tracking-tight -mt-1">
              {sellInfo.desc}
            </span>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <span className="font-mono text-[10px] text-white/30 tracking-tight">
              Balance: {formatUsdc(sellBalance, 2)}
            </span>
            <input
              type="number"
              value={amtStr}
              onChange={(e) => setAmtStr(e.target.value)}
              placeholder="0"
              className="bg-transparent font-mono text-2xl text-white outline-none placeholder:text-white/10 text-right tabular-nums w-32 font-bold"
            />
            <span className="font-mono text-[10px] text-white/20 tracking-tight">
              ${amtStr ? parseFloat(amtStr).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
            </span>
          </div>
        </div>

        {/* Flip Button — swap mode only */}
        {mode === 'swap' && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <button
              onClick={handleFlip}
              className="group h-8 w-8 flex items-center justify-center rounded-full border border-white/[0.015] bg-[#0c0c0f] hover:bg-white/[0.02] shadow-[0_4px_12px_rgba(0,0,0,0.5)] transition-all duration-300"
            >
              <ArrowDown className="h-4 w-4 text-white/30 group-hover:text-white transition-all duration-300" />
            </button>
          </div>
        )}

        {/* To Box — swap mode */}
        {mode === 'swap' && (
          <div className="p-4 rounded-xl border border-white/[0.015] bg-[#08080a] flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-[9px] uppercase tracking-wider text-white/20">To</span>
              <TokenSelect
                value={sideKey(buyToken)}
                onChange={handleBuyChange}
                options={[
                  { key: 'usdc',                          symbol: 'USDC',   color: '#4ade80' },
                  { key: String(TrancheKind.Prime),       symbol: 'pPRIME', color: '#647b8c' },
                  { key: String(TrancheKind.Core),        symbol: 'pCORE',  color: '#b29b70' },
                  { key: String(TrancheKind.Alpha),       symbol: 'pALPHA', color: '#b07073' },
                ]}
              />
              <span className="font-mono text-[9px] text-white/20 uppercase tracking-tight -mt-1">
                {buyInfo.desc}
              </span>
            </div>

            <div className="flex flex-col items-end gap-1.5">
              <span className="font-mono text-[10px] text-white/30 tracking-tight">
                Balance: {formatUsdc(buyBalance, 2)}
              </span>
              <div className="font-mono text-2xl text-white/50 text-right tabular-nums w-32 font-bold select-all truncate">
                {amountOut > 0n ? formatUsdc(amountOut, 4) : '0'}
              </div>
              <span className="font-mono text-[10px] text-white/20 tracking-tight">
                ${amountOut > 0n ? parseFloat(formatUsdc(amountOut, 4)).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0'}
              </span>
            </div>
          </div>
        )}

        {/* Recipient address — send mode */}
        {mode === 'send' && (
          <div
            className={cx(
              'mt-1 p-4 rounded-xl border bg-[#08080a] flex flex-col gap-2 transition-colors',
              sendAddressError ? 'border-red-500/40' : 'border-white/[0.015]',
            )}
          >
            <span className="font-mono text-[9px] uppercase tracking-wider text-white/20">Recipient Address</span>
            <input
              type="text"
              value={sendAddress}
              onChange={(e) => {
                setSendAddress(e.target.value);
                setSendAddressError(false);
              }}
              onBlur={() => {
                if (sendAddress && !validateStellarAddress(sendAddress)) setSendAddressError(true);
              }}
              placeholder="Enter Stellar wallet address…"
              spellCheck={false}
              className="bg-transparent font-mono text-xs text-white outline-none placeholder:text-white/15 w-full break-all"
            />
            {sendAddressError && (
              <span className="font-mono text-[9px] text-red-400 uppercase tracking-wider">
                Invalid Stellar address
              </span>
            )}
            {sendAddress && !sendAddressError && validateStellarAddress(sendAddress) && (
              <span className="font-mono text-[9px] text-emerald-400/70 uppercase tracking-wider">
                ✓ Valid address
              </span>
            )}
          </div>
        )}
      </div>

      {/* Warnings / Error feedback */}
      {insufficientBalance && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 font-mono text-[9px] uppercase tracking-wider font-semibold">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
          Insufficient balance for transaction
        </div>
      )}

      {/* Execution CTA Button */}
      {mode === 'swap' ? (
        <button
          onClick={handleSwap}
          disabled={!canSwap}
          className="w-full py-4 bg-[#e54b73] text-white hover:bg-[#de3860] font-sans text-sm font-bold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 rounded-xl uppercase"
        >
          {swapPending ? 'Confirming transaction…' : 'Confirm transaction'}
        </button>
      ) : (
        <button
          onClick={() => {
            if (!sendAddress || !validateStellarAddress(sendAddress)) {
              setSendAddressError(true);
              return;
            }
          }}
          disabled={!amtStr || !sendAddress || sendAddressError || insufficientBalance}
          className="w-full py-4 bg-[#e54b73] text-white hover:bg-[#de3860] font-sans text-sm font-bold tracking-wide disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 rounded-xl uppercase flex items-center justify-center gap-2"
        >
          Send {sellInfo.symbol}
        </button>
      )}

      {/* Collapsible Details — swap mode only */}
      {mode === 'swap' && (
        <div className="border-t border-white/[0.02] pt-4 flex flex-col gap-3">
          <button
            onClick={() => setShowDetails((d) => !d)}
            className="flex items-center justify-between font-mono text-[9px] uppercase tracking-wider text-white/30 font-bold hover:text-white/50 transition-colors w-full px-1"
          >
            <span>View transaction details</span>
            {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showDetails && (
            <div className="px-1 flex flex-col gap-2 font-mono text-[10px] uppercase tracking-wider text-white/40">
              <div className="flex items-center justify-between">
                <span className="text-white/20">Minimum Received</span>
                <span className="text-white/60 tabular-nums">
                  {amountOut > 0n ? `${formatUsdc(minAmountOut, 4)} ${buyInfo.symbol}` : '0'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/20">Exchange Rate</span>
                <span className="text-white/60">{rateStr}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/20">Slippage Tolerance</span>
                <div className="flex items-center gap-1.5 text-white/60">
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="w-8 bg-transparent text-right outline-none text-[#e54b73] font-bold"
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Provide Liquidity Modal ──────────────────────────────────────

function LiquidityModal({
  tranche,
  onClose,
}: {
  tranche: TradeData['tranches'][number];
  onClose: () => void;
}) {
  const meta = TRANCHE_META[tranche.kind];
  const deposit = useDeposit();
  const [amount, setAmount] = useState('');

  const usdcAmount = (() => {
    try { return parseUsdc(amount); } catch { return 0n; }
  })();

  const nav = tranche.navPerShareQ > 0n
    ? Number((tranche.navPerShareQ * 1_000_000n) / Q64_ONE) / 1_000_000
    : 1;
  const estimatedShares = usdcAmount > 0n
    ? (Number(usdcAmount) / 1e7 / nav).toFixed(6)
    : '—';

  async function handleDeposit() {
    if (usdcAmount <= 0n) return;
    await deposit.mutateAsync({ trancheKind: tranche.kind, usdcAmount });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.06] bg-[#0c0c0f] p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
            <div>
              <p className="font-mono text-xs font-semibold tracking-wider text-white/80">{meta.token}</p>
              <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">{meta.label} Tranche</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/20 hover:text-white/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="font-mono text-[9px] uppercase tracking-widest text-white/25 mb-1.5 block">
              USDC Amount
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-black/30 px-4 py-3 focus-within:border-white/[0.12]">
              <input
                type="number"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-transparent font-mono text-sm text-white outline-none placeholder:text-white/20"
              />
              <span className="font-mono text-[10px] text-white/30 shrink-0">USDC</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.03] bg-white/[0.01] px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-white/25 uppercase tracking-widest">Current NAV</span>
              <span className="font-mono text-[10px] text-white/50">{formatNavQ(tranche.navPerShareQ)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-white/25 uppercase tracking-widest">Est. Shares</span>
              <span className="font-mono text-[10px] text-white/50">{estimatedShares} {meta.token}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-white/25 uppercase tracking-widest">Pool Liquidity</span>
              <span className="font-mono text-[10px] text-white/50">${formatUsdc(tranche.ammQuoteBalance, 0)} USDC</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleDeposit()}
            disabled={usdcAmount <= 0n || deposit.isPending}
            className="w-full py-3 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: usdcAmount > 0n && !deposit.isPending ? meta.color : undefined,
              color: usdcAmount > 0n && !deposit.isPending ? '#000' : undefined,
              border: usdcAmount <= 0n || deposit.isPending ? '1px solid rgba(255,255,255,0.06)' : undefined,
            }}
          >
            {deposit.isPending ? 'Depositing…' : `Deposit into ${meta.token}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AMM Pools & Margin Panels ────────────────────────────────────

function PoolsPanel({ data }: { data: TradeData }) {
  const [activeTranche, setActiveTranche] = useState<TradeData['tranches'][number] | null>(null);

  return (
    <>
      {activeTranche && (
        <LiquidityModal tranche={activeTranche} onClose={() => setActiveTranche(null)} />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 font-semibold">Tranche AMM Pools</p>
            <h2 className="mt-1 font-sans text-xl font-semibold tracking-tight text-white">Liquidity Distribution</h2>
          </div>
          <Pill tone="neutral">3 pools</Pill>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {data.tranches.map((t) => {
            const meta = TRANCHE_META[t.kind];
            return (
              <Card key={t.key} className="p-6 relative group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
                    <span className="font-mono text-xs font-semibold tracking-wider text-white/80">{meta.token}</span>
                  </div>
                  <Pill tone={t.ammQuoteBalance > 0n ? 'green' : 'neutral'}>
                    {t.ammQuoteBalance > 0n ? 'Active' : 'Empty'}
                  </Pill>
                </div>

                <div className="space-y-3.5 mb-5">
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-white/25 font-semibold mb-1">Liquidity</div>
                    <div className="font-mono text-lg font-medium text-white/80 tabular-nums">
                      ${formatUsdc(t.ammQuoteBalance, 0)}{' '}
                      <span className="text-white/25 text-xs font-medium">USDC</span>
                    </div>
                  </div>
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-white/25 font-semibold mb-1">Current NAV</div>
                    <div className="font-mono text-sm font-medium text-white/60 tabular-nums">
                      {formatNavQ(t.navPerShareQ)}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTranche(t)}
                  className="w-full py-2.5 border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.1] rounded-xl font-mono text-[10px] uppercase tracking-wider text-white/60 hover:text-white transition-all duration-200"
                >
                  Provide Liquidity
                </button>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}

function MarginPanel() {
  return (
    <Card className="min-h-[360px] flex items-center justify-center p-10 text-center">
      <div className="max-w-md">
        <p className="font-mono text-[9px] uppercase tracking-widest text-white/25 font-semibold">Institutional Suite</p>
        <h2 className="mt-2 font-sans text-xl font-semibold tracking-tight text-white">Cross-Chain Margin</h2>
        <p className="mt-3 font-mono text-[10px] text-white/30 uppercase tracking-wider leading-relaxed">
          Unified margin engine for collateral bridged into PRISM credit markets via FHE-sealed data.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <button className="px-6 py-3 border border-white/[0.03] bg-white/[0.005] text-white/25 font-mono text-[10px] uppercase tracking-[0.2em] cursor-not-allowed rounded-xl">
            Account creation restricted
          </button>
          <span className="font-mono text-[9px] text-white/15 uppercase tracking-widest">Available in mainnet v1.2</span>
        </div>
      </div>
    </Card>
  );
}

// ─── Token Asset List ─────────────────────────────────────────────────────────

const MARKET_TOKENS = [
  { symbol: 'USDC', name: 'USD Coin',       color: '#4ade80', bg: '#4ade8018', category: 'Stablecoin' },
  { symbol: 'USDT', name: 'Tether',         color: '#26a17b', bg: '#26a17b18', category: 'Stablecoin' },
  { symbol: 'XLM',  name: 'Stellar Lumens', color: '#9b7ff5', bg: '#9b7ff518', category: 'Layer 1'    },
  { symbol: 'BTC',  name: 'Bitcoin',        color: '#f7931a', bg: '#f7931a18', category: 'Layer 1'    },
  { symbol: 'ETH',  name: 'Ethereum',       color: '#627eea', bg: '#627eea18', category: 'Layer 1'    },
] as const;

const TOKEN_ICONS: Record<string, string> = {
  USDC: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png?v=029',
  USDT: 'https://cryptologos.cc/logos/tether-usdt-logo.png?v=029',
  XLM:  'https://cryptologos.cc/logos/stellar-xlm-logo.png?v=029',
  BTC:  'https://cryptologos.cc/logos/bitcoin-btc-logo.png?v=029',
  ETH:  'https://cryptologos.cc/logos/ethereum-eth-logo.png?v=029',
};

function TokenIcon({ symbol, color, bg }: { symbol: string; color: string; bg: string }) {
  if (TOKEN_ICONS[symbol]) {
    return (
      <div className="h-9 w-9 rounded-full overflow-hidden shrink-0 bg-white/[0.05] flex items-center justify-center p-0.5" style={{ border: `1px solid ${color}28` }}>
        <img src={TOKEN_ICONS[symbol]} alt={symbol} className="w-full h-full object-contain" />
      </div>
    );
  }

  const initials = symbol.startsWith('p') ? symbol.slice(1, 3) : symbol.slice(0, 2);
  return (
    <div
      className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 font-mono text-[10px] font-bold uppercase"
      style={{ backgroundColor: bg, color, border: `1px solid ${color}28` }}
    >
      {initials}
    </div>
  );
}

function TokenAssetList({
  vaultState,
  balances,
}: {
  vaultState: ReturnType<typeof useVaultState>;
  balances: ReturnType<typeof useIdentityBalances>['data'];
}) {
  const { data: marketPrices, isLoading: pricesLoading } = useMarketPrices();

  // Live PRISM tranche NAVs
  const trancheRows = TRANCHE_ORDER.map((kind) => {
    const t = vaultState.data?.tranches.find((tr) => tr.kind === kind);
    const meta = TRANCHE_META[kind];
    const nav = t ? Number((t.navPerShareQ * 1_000_000n) / Q64_ONE) / 1_000_000 : 1.0;
    const rawBal = balances?.tranches.find((b) => b.kind === kind)?.balance ?? 0n;
    const balFloat = Number(rawBal) / 1_000_000;
    const change = nav > 1 ? ((nav - 1) / 1) * 100 : 0;
    return { symbol: meta.token, name: meta.label + ' Tranche', color: meta.color, bg: meta.bg, price: nav, change, balFloat, isLive: true };
  });

  function fmtPrice(p: number) {
    if (p >= 1000) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    if (p >= 1)    return `$${p.toFixed(2)}`;
    return `$${p.toFixed(6)}`;
  }

  function fmtAmt(amt: number, sym: string) {
    const formatted = amt >= 1000
      ? amt.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : amt.toFixed(2);
    return `${formatted} ${sym}`;
  }

  // Market price row — shows token price, no portfolio value
  function PriceRow({
    symbol, name, color, bg, price, change, priceLoading,
  }: {
    symbol: string; name: string; color: string; bg: string;
    price: number; change: number; category: string; priceLoading?: boolean;
  }) {
    const pos = change >= 0;
    return (
      <div className="group flex items-center justify-between px-4 py-3 hover:bg-white/[0.015] transition-colors duration-150 cursor-pointer border-b border-white/[0.02] last:border-0">
        <div className="flex items-center gap-3">
          <TokenIcon symbol={symbol} color={color} bg={bg} />
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-sm font-semibold text-white tracking-tight">{name}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {priceLoading ? (
            <>
              <div className="h-4 w-20 rounded bg-white/[0.06] animate-pulse" />
              <div className="h-3 w-12 rounded bg-white/[0.04] animate-pulse mt-0.5" />
            </>
          ) : (
            <>
              <span className="font-mono text-sm font-semibold text-white tabular-nums">{fmtPrice(price)}</span>
              <span className={cx('flex items-center gap-0.5 font-mono text-[10px] font-semibold tabular-nums', pos ? 'text-emerald-400' : 'text-red-400')}>
                {pos ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  // Position row — shows balance × price as USD value, balance amount as subtitle
  function PositionRow({
    symbol, name, color, bg, price, change, balance, isLive,
  }: {
    symbol: string; name: string; color: string; bg: string;
    price: number; change: number; balance: number; isLive?: boolean;
  }) {
    const pos = change >= 0;
    const usdVal = price * balance;
    return (
      <div className="group flex items-center justify-between px-4 py-3 hover:bg-white/[0.015] transition-colors duration-150 cursor-pointer border-b border-white/[0.02] last:border-0">
        <div className="flex items-center gap-3">
          <TokenIcon symbol={symbol} color={color} bg={bg} />
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-sans text-sm font-semibold text-white tracking-tight">{name}</span>
              {isLive && <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse shrink-0" />}
            </div>
            <span className="font-mono text-[10px] text-white/30 tracking-tight">
              {fmtAmt(balance, symbol)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-sm font-semibold text-white tabular-nums">
            {usdVal > 0
              ? `$${usdVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : fmtPrice(price)}
          </span>
          <span className={cx('flex items-center gap-0.5 font-mono text-[10px] font-semibold tabular-nums', pos ? 'text-emerald-400' : 'text-red-400')}>
            {pos ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Market Prices */}
      <div className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.02]">
          <span className="font-sans text-sm font-semibold text-white">Market Prices</span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider">
            {pricesLoading ? (
              <span className="text-white/20 animate-pulse">fetching…</span>
            ) : (
              <>
                <span className="h-1 w-1 rounded-full bg-sky-400 animate-pulse" />
                <span className="text-sky-400/60">CoinGecko · live</span>
              </>
            )}
          </span>
        </div>
        {MARKET_TOKENS.map((tok) => {
          const live = marketPrices?.[tok.symbol];
          return (
            <PriceRow
              key={tok.symbol}
              symbol={tok.symbol}
              name={tok.name}
              color={tok.color}
              bg={tok.bg}
              price={live?.price ?? 0}
              change={live?.change24h ?? 0}
              category={tok.category}
              priceLoading={pricesLoading && !live}
            />
          );
        })}
      </div>

      {/* Positions */}
      <div className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.02]">
          <span className="font-sans text-sm font-semibold text-white">Positions</span>
          <span className="flex items-center gap-1.5 font-mono text-[9px] text-emerald-400/60 uppercase tracking-wider">
            <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
            Live Oracle
          </span>
        </div>
        {trancheRows.map((tok) => (
          <PositionRow
            key={tok.symbol}
            symbol={tok.symbol}
            name={tok.name}
            color={tok.color}
            bg={tok.bg}
            price={tok.price}
            change={tok.change}
            balance={tok.balFloat}
            isLive
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function TradeTerminal() {
  const data = useTradeData();
  const [activeTab, setActiveTab] = useState<(typeof TRADE_TABS)[number]>('Secondary swap');
  const [isMounted, setIsMounted] = useState(false);

  // Fetch balances
  const { data: balances } = useIdentityBalances();

  // Swap hooks
  const vaultState = useVaultState();
  const swap = useSwap();

  const [sellToken, setSellToken] = useState<SwapSide>('usdc');
  const [buyTrancheKind, setBuyTrancheKind] = useState<TrancheKind>(TrancheKind.Prime);
  const [amtStr, setAmtStr] = useState('');
  const [slippage, setSlippage] = useState('1.0');

  const isFromUsdc = sellToken === 'usdc';
  const activeKind: TrancheKind = isFromUsdc ? buyTrancheKind : (sellToken as TrancheKind);
  const direction: SwapDirection = isFromUsdc ? SWAP_DIR_USDC_TO_TRANCHE : 0;
  const buyToken: SwapSide = isFromUsdc ? buyTrancheKind : 'usdc';

  const poolTranche = vaultState.data?.tranches.find((t) => t.kind === activeKind);
  const ammTranche = poolTranche?.ammTrancheBalance ?? 0n;
  const ammQuote = poolTranche?.ammQuoteBalance ?? 0n;
  const feeBps = Number((poolTranche?.pool as any)?.feeBps ?? 30);
  const poolEmpty = ammTranche === 0n || ammQuote === 0n;

  const amountIn = (() => {
    try { return parseUsdc(amtStr); } catch { return 0n; }
  })();

  const [reserveIn, reserveOut] = direction === SWAP_DIR_USDC_TO_TRANCHE
    ? [ammQuote, ammTranche]
    : [ammTranche, ammQuote];

  const amountOut = cpAmountOut(amountIn, reserveIn, reserveOut, feeBps);
  const slipPct = Math.max(0.01, Math.min(50, parseFloat(slippage) || 1.0));
  const minAmountOut = amountOut > 0n
    ? (amountOut * BigInt(Math.round((100 - slipPct) * 100))) / 10000n
    : 0n;

  const impliedPrice =
    amountIn > 0n && amountOut > 0n
      ? Number(direction === SWAP_DIR_USDC_TO_TRANCHE
          ? (amountIn * 1_000_000n) / amountOut
          : (amountOut * 1_000_000n) / amountIn) / 1_000_000
      : null;

  const sellBalance = isFromUsdc
    ? (balances?.usdc ?? 0n)
    : (balances?.tranches.find((t) => t.kind === sellToken)?.balance ?? 0n);
  const buyBalance = buyToken === 'usdc'
    ? (balances?.usdc ?? 0n)
    : (balances?.tranches.find((t) => t.kind === buyToken)?.balance ?? 0n);

  const sellInfo = SIDE_INFO[sideKey(sellToken)];
  const buyInfo = SIDE_INFO[sideKey(buyToken)];

  function handleMax() {
    setAmtStr(formatUsdc(sellBalance));
  }

  function handleFlip() {
    if (isFromUsdc) {
      setSellToken(buyTrancheKind);
    } else {
      const prev = sellToken as TrancheKind;
      setSellToken('usdc');
      setBuyTrancheKind(prev);
    }
    setAmtStr('');
  }

  function handleSellChange(v: string) {
    const next: SwapSide = v === 'usdc' ? 'usdc' : (Number(v) as TrancheKind);
    if (next !== 'usdc' && next === buyToken) {
      setSellToken(next);
    } else if (next === 'usdc' && buyToken === 'usdc') {
      setSellToken(next);
      setBuyTrancheKind(TrancheKind.Prime);
    } else {
      setSellToken(next);
    }
    setAmtStr('');
  }

  function handleBuyChange(v: string) {
    const next: SwapSide = v === 'usdc' ? 'usdc' : (Number(v) as TrancheKind);
    if (next === 'usdc') {
      if (sellToken === 'usdc') {
        setSellToken(buyTrancheKind);
      }
    } else {
      const nextKind = next as TrancheKind;
      if (sellToken !== 'usdc') {
        setSellToken('usdc');
      }
      setBuyTrancheKind(nextKind);
    }
    setAmtStr('');
  }

  const insufficientBalance = amountIn > 0n && amountIn > sellBalance;

  function handleSwap() {
    if (amountIn === 0n || poolEmpty || insufficientBalance) return;
    swap.mutate({ trancheKind: activeKind, amountIn, minAmountOut, direction });
  }

  const canSwap = amountIn > 0n && !poolEmpty && !swap.isPending && !insufficientBalance;

  useEffect(() => setIsMounted(true), []);

  if (!isMounted) return null;

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-8 pb-10">
      {data.error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-sm text-red-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {data.error.message}
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex items-center">
        <TradeTabs active={activeTab} setActive={setActiveTab} />
      </div>

      {/* 2-Column main split layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[460px_1fr] gap-8 items-stretch">
        {activeTab === 'Secondary swap' ? (
          <>
            {/* Left Side: Compact Swap Card */}
            <CompactSwapCard
              data={data}
              balances={balances}
              sellToken={sellToken}
              setSellToken={setSellToken}
              buyTrancheKind={buyTrancheKind}
              setBuyTrancheKind={setBuyTrancheKind}
              amtStr={amtStr}
              setAmtStr={setAmtStr}
              slippage={slippage}
              setSlippage={setSlippage}
              amountIn={amountIn}
              amountOut={amountOut}
              minAmountOut={minAmountOut}
              impliedPrice={impliedPrice}
              insufficientBalance={insufficientBalance}
              canSwap={canSwap}
              handleMax={handleMax}
              handleFlip={handleFlip}
              handleSellChange={handleSellChange}
              handleBuyChange={handleBuyChange}
              handleSwap={handleSwap}
              swapPending={swap.isPending}
              sellInfo={sellInfo}
              buyInfo={buyInfo}
              buyBalance={buyBalance}
              sellBalance={sellBalance}
              buyToken={buyToken}
            />

            {/* Right Side: Price Action Chart */}
            <PriceChart
              activeKind={activeKind}
              isFromUsdc={isFromUsdc}
              buyInfo={buyInfo}
              sellInfo={sellInfo}
            />
          </>
        ) : null}

        {activeTab === 'AMM pools' && (
          <div className="lg:col-span-2">
            <PoolsPanel data={data} />
          </div>
        )}
        {activeTab === 'Cross-chain margin' && (
          <div className="lg:col-span-2">
            <MarginPanel />
          </div>
        )}
      </div>

      {/* Token Asset List — only on Secondary swap */}
      {activeTab === 'Secondary swap' && (
        <TokenAssetList vaultState={vaultState} balances={balances} />
      )}

    </div>
  );
}
