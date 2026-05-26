'use client';

import { useWallet } from '@/components/providers/stellar-wallet-context';
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  BarChart,
  ChevronDown,
  Layers3,
  RefreshCw,
  RefreshCwIcon,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState, useMemo, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';

import { TrancheKind, TRANCHE_CONFIG, Q64_ONE } from '@/app/lib/constants';
import { formatUsdc, shortKey, formatNavQ, parseUsdc } from '@/app/lib/format';
import { useVaultState } from '@/hooks/useVaultState';
import { useIdentity } from '@/hooks/useIdentity';
import { useIdentityBalances } from '@/hooks/useIdentityBalances';
import { useSwap, SWAP_DIR_USDC_TO_TRANCHE, type SwapDirection } from '@/hooks/useSwap';
import { useEvents } from '@/hooks/useEvents';
import { useSimulationLog } from '@/hooks/useSimulationLog';

import { KPIStrip } from '@/components/dashboard/KPIStrip';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRANCHE_ORDER = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

const TRANCHE_META = {
  [TrancheKind.Prime]: { token: 'pPRIME', color: '#38596a', bg: 'rgba(56,89,106,0.15)' },
  [TrancheKind.Core]:  { token: 'pCORE',  color: '#ad7b21', bg: 'rgba(173,123,33,0.15)' },
  [TrancheKind.Alpha]: { token: 'pALPHA', color: '#9f442b', bg: 'rgba(159,68,43,0.15)' },
};

const TRADE_TABS = ['Secondary swap', 'AMM pools', 'Cross-chain margin'] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cx(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/22">
      {children}
    </span>
  );
}

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' }) {
  const styles = {
    neutral: 'border-white/10 bg-white/5 text-white/50',
    green: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400',
  };
  return (
    <span className={cx('rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider', styles[tone])}>
      {children}
    </span>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx('rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04]', className)}>
      {children}
    </div>
  );
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

// ─── Components ───────────────────────────────────────────────────────────────

function PageHeader({ data }: { data: TradeData }) {
  const { label: roleLabel } = useIdentity();

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 80% at 100% 0%, rgba(173,123,33,0.12) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 0% 100%, rgba(159,68,43,0.08) 0%, transparent 50%)',
        }}
      />

      <div className="relative flex flex-col gap-6 px-8 py-7 sm:flex-row sm:items-center sm:justify-between">
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
            Liquidity Hub
          </h1>
          <p className="mt-2 font-mono text-sm text-white/30">
            {roleLabel !== 'Protocol Admin' && `${roleLabel} · `}5s chain refresh
          </p>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:block text-right">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-white/25 mb-1">
              Total Liquidity
            </div>
            <div className="font-mono text-3xl font-medium text-white/80 tabular-nums">
              ${formatUsdc(data.poolLiquidity, 2)}
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-white/[0.06]" />
          <div className="hidden sm:block text-right">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-white/25 mb-1">
              Active Pools
            </div>
            <div className="font-mono text-3xl font-medium text-white/50 tabular-nums">
              {data.activePools}
            </div>
          </div>
          <div className="hidden sm:block w-px h-12 bg-white/[0.06]" />

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
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  );
}

function TradeTabs({ active, setActive }: { active: string; setActive: (tab: (typeof TRADE_TABS)[number]) => void }) {
  return (
    <div className="flex gap-1.5 p-1 rounded-lg border border-white/[0.08] bg-black/20 w-fit">
      {TRADE_TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => setActive(tab)}
          className={cx(
            'px-5 py-2 rounded-md font-mono text-xs uppercase tracking-widest transition-all',
            active === tab
              ? 'bg-white/10 text-white border border-white/15'
              : 'text-white/30 hover:text-white/50 border border-transparent'
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function TradeMetric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="group flex items-center justify-between p-4 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-white/25 group-hover:text-white/40 transition-colors" />
        <span className="font-mono text-[11px] uppercase tracking-widest text-white/35 group-hover:text-white/50">
          {label}
        </span>
      </div>
      <span className="font-mono text-sm font-medium text-white/75">{value}</span>
    </div>
  );
}

// ─── Swap helpers ─────────────────────────────────────────────────────────────

type SwapSide = 'usdc' | TrancheKind;

const SIDE_INFO: Record<string, { symbol: string; color: string }> = {
  usdc: { symbol: 'USDC', color: '#4ade80' },
  [String(TrancheKind.Prime)]: { symbol: 'pPRIME', color: '#38596a' },
  [String(TrancheKind.Core)]:  { symbol: 'pCORE',  color: '#ad7b21' },
  [String(TrancheKind.Alpha)]: { symbol: 'pALPHA', color: '#9f442b' },
};

function sideKey(s: SwapSide): string {
  return s === 'usdc' ? 'usdc' : String(s);
}

// ─── TokenSelect (custom dropdown) ────────────────────────────────────────────

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
        className="flex h-12 items-center gap-2.5 rounded-lg border border-white/10 bg-black/40 px-3.5 font-mono text-sm font-semibold text-white transition-colors hover:border-white/25 hover:bg-black/60 min-w-[120px]"
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: current.color, boxShadow: `0 0 8px ${current.color}80` }} />
        <span className="flex-1 text-left">{current.symbol}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-[140px] overflow-hidden rounded-lg border border-white/10 bg-black/95 shadow-2xl backdrop-blur">
          {options.map((opt) => {
            const active = opt.key === value;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => { onChange(opt.key); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left font-mono text-sm transition-colors ${
                  active ? 'bg-white/[0.08] text-white' : 'text-white/70 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: opt.color, boxShadow: `0 0 8px ${opt.color}80` }} />
                <span className="font-semibold">{opt.symbol}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function cpAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  const feeNum = BigInt(10000 - feeBps);
  const amtFee = amountIn * feeNum;
  const num = reserveOut * amtFee;
  const den = reserveIn * 10000n + amtFee;
  return den === 0n ? 0n : num / den;
}

// ─── Panels ───────────────────────────────────────────────────────────────────

function SwapPanel({ data }: { data: TradeData }) {
  const vaultState = useVaultState();
  const { data: balances, isLoading: balsLoading } = useIdentityBalances();
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
    setSellToken(next);
    if (next !== 'usdc' && next === buyTrancheKind) {
      setBuyTrancheKind(next === TrancheKind.Prime ? TrancheKind.Core : TrancheKind.Prime);
    }
    setAmtStr('');
  }

  const insufficientBalance = amountIn > 0n && amountIn > sellBalance;

  function handleSwap() {
    if (amountIn === 0n || poolEmpty || insufficientBalance) return;
    swap.mutate({ trancheKind: activeKind, amountIn, minAmountOut, direction });
  }

  const canSwap = amountIn > 0n && !poolEmpty && !swap.isPending && !insufficientBalance;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="px-8 py-5 border-b border-white/[0.07] flex items-center justify-between">
          <div>
            <Eyebrow>Secondary Swap · PRISM AMM</Eyebrow>
            <h2 className="mt-1.5 font-display text-2xl text-white">Execution Terminal</h2>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03]">
            <Activity className="h-3 w-3 text-emerald-400 animate-pulse" />
            <span className="font-mono text-xs uppercase tracking-widest text-white/40">Market Live</span>
          </div>
        </div>

        <div className="p-8 space-y-4">
          {/* Sell Input */}
          <div className="p-6 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[11px] uppercase tracking-widest text-white/30">Sell Asset</span>
              <button onClick={handleMax} className="font-mono text-[10px] text-white/20 hover:text-white/40 transition-colors uppercase tracking-widest">
                Balance: {formatUsdc(sellBalance, 2)} <span className="ml-1 text-emerald-400/50 underline">Max</span>
              </button>
            </div>
            <div className="flex items-center gap-4">
              <TokenSelect
                value={sideKey(sellToken)}
                onChange={handleSellChange}
                options={[
                  { key: 'usdc',                          symbol: 'USDC',   color: '#4ade80' },
                  { key: String(TrancheKind.Prime),       symbol: 'pPRIME', color: '#7aa3bd' },
                  { key: String(TrancheKind.Core),        symbol: 'pCORE',  color: '#d4a449' },
                  { key: String(TrancheKind.Alpha),       symbol: 'pALPHA', color: '#d97a5d' },
                ]}
              />
              <input
                type="number"
                value={amtStr}
                onChange={(e) => setAmtStr(e.target.value)}
                placeholder="0.00"
                className="flex-1 bg-transparent font-mono text-3xl text-white outline-none placeholder:text-white/10 tabular-nums"
              />
            </div>
          </div>

          {/* Flip Button */}
          <div className="flex justify-center -my-6 relative z-10">
            <button
              onClick={handleFlip}
              className="group h-10 w-10 flex items-center justify-center rounded-full border border-white/10 bg-black transition-all hover:border-white/30 hover:scale-110 active:scale-95"
            >
              <ArrowDown className="h-5 w-5 text-white/30 group-hover:text-white group-hover:rotate-180 transition-all duration-300" />
            </button>
          </div>

          {/* Buy Input */}
          <div className="p-6 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[11px] uppercase tracking-widest text-white/30">Receive Estimated</span>
              <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest">
                Balance: {formatUsdc(buyBalance, 2)}
              </span>
            </div>
            <div className="flex items-center gap-4">
              {isFromUsdc ? (
                <TokenSelect
                  value={String(buyTrancheKind)}
                  onChange={(v) => { setBuyTrancheKind(Number(v) as TrancheKind); setAmtStr(''); }}
                  options={[
                    { key: String(TrancheKind.Prime), symbol: 'pPRIME', color: '#7aa3bd' },
                    { key: String(TrancheKind.Core),  symbol: 'pCORE',  color: '#d4a449' },
                    { key: String(TrancheKind.Alpha), symbol: 'pALPHA', color: '#d97a5d' },
                  ]}
                />
              ) : (
                <div className="flex h-12 items-center gap-2.5 rounded-lg border border-white/10 bg-black/40 px-3.5 font-mono text-sm font-semibold text-white min-w-[120px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: '#4ade80', boxShadow: '0 0 8px #4ade8080' }} />
                  <span>USDC</span>
                </div>
              )}
              <div className="flex-1 font-mono text-3xl text-white/50 tabular-nums">
                {amountOut > 0n ? `~${formatUsdc(amountOut, 4)}` : '0.00'}
              </div>
            </div>
          </div>

          {/* Details & Action */}
          <div className="pt-4 space-y-4">
             <div className="flex items-center justify-between px-2 font-mono text-[11px] uppercase tracking-wider">
               <span className="text-white/25">Implied Price</span>
               <span className="text-white/50">
                 {impliedPrice ? `1 ${direction === SWAP_DIR_USDC_TO_TRANCHE ? buyInfo.symbol : sellInfo.symbol} ≈ ${impliedPrice.toFixed(6)} USDC` : '—'}
               </span>
             </div>

             <div className="flex items-center justify-between px-2 font-mono text-[11px] uppercase tracking-wider">
               <span className="text-white/25">Max Slippage</span>
               <div className="flex items-center gap-2">
                 {['0.5', '1.0', '2.0'].map(v => (
                   <button
                    key={v}
                    onClick={() => setSlippage(v)}
                    className={cx('px-2 py-0.5 rounded transition-colors', slippage === v ? 'bg-white/20 text-white' : 'text-white/20 hover:text-white/40')}
                   >
                     {v}%
                   </button>
                 ))}
                 <input
                  type="number"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  className="w-12 bg-transparent text-right text-white/60 outline-none"
                 />
                 <span className="text-white/25">%</span>
               </div>
             </div>

             {insufficientBalance && (
               <div className="flex items-center gap-2.5 p-4 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 font-mono text-xs uppercase tracking-wider">
                 <TriangleAlert className="h-4 w-4" />
                 Insufficient balance
               </div>
             )}

             <button
                onClick={handleSwap}
                disabled={!canSwap}
                className="w-full py-4 bg-white text-black font-mono text-sm font-bold uppercase tracking-[0.3em] hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all rounded-lg"
             >
               {swap.isPending ? 'Processing transaction…' : `Execute Swap`}
             </button>
          </div>
        </div>
      </Card>
      
      {/* Simulation Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Settlement', value: 'Atomic', desc: 'No counterparty risk' },
          { label: 'Engine', value: 'v1.0.4', desc: 'PRISM Core' },
          { label: 'Security', value: 'Sealed', desc: 'FHE Protected' },
        ].map(item => (
          <div key={item.label} className="p-5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
             <div className="font-mono text-[10px] uppercase tracking-widest text-white/20">{item.label}</div>
             <div className="mt-2 font-mono text-sm text-white/60 font-medium">{item.value}</div>
             <div className="mt-1 font-mono text-[10px] text-white/10 uppercase tracking-tighter">{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PoolsPanel({ data }: { data: TradeData }) {
  return (
    <div className="space-y-6">
      <Card className="p-8">
        <Eyebrow>Tranche AMM Pools</Eyebrow>
        <h2 className="mt-2 font-display text-3xl text-white">Liquidity Distribution</h2>
        <p className="mt-4 text-white/40 leading-relaxed max-w-2xl">
          PRISM utilizes segmented liquidity pools for each risk tranche. 
          LPs provide protection to senior tranches by taking on junior risk, earning yields and fees.
        </p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {data.tranches.map((t) => {
          const meta = TRANCHE_META[t.kind];
          return (
            <Card key={t.key} className="p-6 relative group hover:border-white/20 transition-all cursor-pointer">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                  <span className="font-mono text-sm font-bold tracking-widest text-white">{meta.token}</span>
                </div>
                <Pill tone={t.ammQuoteBalance > 0n ? 'green' : 'neutral'}>
                  {t.ammQuoteBalance > 0n ? 'Active' : 'Empty'}
                </Pill>
              </div>

              <div className="space-y-4 mb-8">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-white/20 mb-1">Liquidity</div>
                  <div className="font-mono text-xl text-white/80 tabular-nums">
                    ${formatUsdc(t.ammQuoteBalance, 0)} <span className="text-white/20 text-xs">USDC</span>
                  </div>
                </div>
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-white/20 mb-1">Current NAV</div>
                  <div className="font-mono text-lg text-white/60 tabular-nums">
                    {formatNavQ(t.navPerShareQ)}
                  </div>
                </div>
              </div>

              <button className="w-full py-2.5 border border-white/10 rounded font-mono text-[10px] uppercase tracking-widest text-white/30 group-hover:text-white/60 group-hover:border-white/20 transition-all">
                Provide Liquidity
              </button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function MarginPanel() {
  return (
    <Card className="min-h-[400px] flex items-center justify-center p-12 text-center">
      <div className="max-w-lg">
        <Eyebrow>Institutional Suite</Eyebrow>
        <h2 className="mt-4 font-display text-4xl text-white tracking-tight">Cross-Chain Margin</h2>
        <p className="mt-6 text-white/40 leading-relaxed font-mono text-sm uppercase tracking-wide">
          Unified margin engine for collateral routes bridged into PRISM credit markets. 
          Leverage your institutional credit score via FHE-sealed data.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4">
           <button className="px-8 py-4 bg-white/5 border border-white/10 text-white/40 font-mono text-xs uppercase tracking-[0.25em] cursor-not-allowed">
             Account creation restricted
           </button>
           <span className="font-mono text-[10px] text-white/15 uppercase tracking-widest">Available in mainnet v1.2</span>
        </div>
      </div>
    </Card>
  );
}

function TradeSidebar({ data }: { data: TradeData }) {
  const holdings = useIdentityBalances();
  
  return (
    <aside className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <BarChart className="h-4 w-4 text-white/35" />
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Market Snapshot</h2>
        </div>

        <div className="space-y-3">
          <TradeMetric icon={Layers3} label="Active pools" value={String(data.activePools)} />
          <TradeMetric icon={TrendingUp} label="24h Volume" value="$1.2M" />
          <TradeMetric icon={ShieldCheck} label="Avg Fee Tier" value="0.30%" />
        </div>

        <div className="mt-8 pt-6 border-t border-white/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] uppercase tracking-widest text-white/20">Pool Distribution</span>
            <span className="font-mono text-[10px] text-emerald-400/50 uppercase tracking-widest">Balanced</span>
          </div>
          <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-white/[0.04]">
             {data.tranches.map((t, i) => {
               const meta = TRANCHE_META[t.kind];
               const pct = data.poolLiquidity > 0n ? Number(t.ammQuoteBalance * 100n / data.poolLiquidity) : 33.3;
               return (
                 <div key={t.key} style={{ width: `${pct}%`, backgroundColor: meta.color }} className="h-full border-r border-black/20 last:border-0" />
               );
             })}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <Activity className="h-4 w-4 text-white/35" />
          <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Your Holdings</h2>
        </div>
        
        <div className="space-y-4">
          {[
            { label: 'USDC', balance: holdings.data?.usdc ?? 0n, color: '#4ade80' },
            { label: 'pPRIME', balance: holdings.data?.tranches.find(t => t.kind === TrancheKind.Prime)?.balance ?? 0n, color: '#38596a' },
            { label: 'pCORE', balance: holdings.data?.tranches.find(t => t.kind === TrancheKind.Core)?.balance ?? 0n, color: '#ad7b21' },
            { label: 'pALPHA', balance: holdings.data?.tranches.find(t => t.kind === TrancheKind.Alpha)?.balance ?? 0n, color: '#9f442b' },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between group">
              <div className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="font-mono text-xs text-white/40 group-hover:text-white/60 transition-colors uppercase tracking-widest">{item.label}</span>
              </div>
              <span className="font-mono text-sm text-white/70 tabular-nums">
                {formatUsdc(item.balance, 2)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <div className="px-4 py-2 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/10 leading-relaxed">
          PRISM AMM ROUTER V1.0<br />
          LOW LATENCY EXECUTION<br />
          {new Date().toLocaleTimeString()} UTC
        </p>
      </div>
    </aside>
  );
}

function HorizontalTicker() {
  const { entries: logEntries } = useSimulationLog();
  const events = logEntries.slice(0, 15).map(e => ({
    type: e.action,
    sig: e.id,
    role: e.role,
    time: e.timestamp
  }));

  if (events.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] backdrop-blur-md bg-white/[0.03]">
      <div className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-2.5">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-white/18">Live Trading activity</span>
        <div className="h-px flex-1 bg-white/[0.04]" />
        <span className="font-mono text-[9px] text-white/14">Devnet Sim</span>
      </div>
      <div className="py-3 marquee-ticker whitespace-nowrap overflow-hidden">
        {[...events, ...events, ...events].map((e, i) => (
          <span key={i} className="mx-6 inline-flex items-center gap-2">
            <span className={`h-1 w-1 rounded-full ${e.type.includes('Swap') ? 'bg-pink-400' : 'bg-white/20'}`} />
            <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">{e.type}</span>
            <span className="font-mono text-[9px] text-white/10">{e.sig.slice(0, 8)}</span>
            <span className="ml-4 text-white/[0.05]">·</span>
          </span>
        ))}
      </div>
    </section>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function TradeTerminal() {
  const data = useTradeData();
  const [activeTab, setActiveTab] = useState<(typeof TRADE_TABS)[number]>('Secondary swap');
  
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  if (!isMounted) return null;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-10 px-10 pb-20 pt-4">
      <PageHeader data={data} />
      
      {data.error && (
        <div className="flex items-start gap-2.5 rounded border border-[#c45a45]/20 bg-[#9f442b]/[0.06] px-4 py-2.5 text-sm text-[#e8a090]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {data.error.message}
        </div>
      )}

      <div className="flex items-center justify-between">
        <TradeTabs active={activeTab} setActive={setActiveTab} />
        <div className="hidden lg:flex items-center gap-4 px-4 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
           <div className="flex items-center gap-2">
             <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
             <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/60">AMM Connected</span>
           </div>
           <div className="w-px h-3 bg-white/10" />
           <span className="font-mono text-[10px] text-white/20 uppercase tracking-widest">Router: main-v1</span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="space-y-6">
          {activeTab === 'Secondary swap' && <SwapPanel data={data} />}
          {activeTab === 'AMM pools' && <PoolsPanel data={data} />}
          {activeTab === 'Cross-chain margin' && <MarginPanel />}
        </div>

        <div className="relative">
          <div className="sticky top-6">
            <TradeSidebar data={data} />
          </div>
        </div>
      </div>

      <div className="pt-2">
        <HorizontalTicker />
      </div>
    </div>
  );
}
