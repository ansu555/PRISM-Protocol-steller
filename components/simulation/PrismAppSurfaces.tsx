'use client';

import Link from 'next/link';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useWallet } from '@/components/providers/stellar-wallet-provider';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BarChart,
  CircleDollarSign,
  Database,
  Layers3,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from 'lucide-react';

import { Q64_ONE, TRANCHE_CONFIG, TrancheKind } from '@/app/lib/constants';
import { formatNavQ, formatUsdc, parseUsdc, shortKey, stateName, toBigInt } from '@/app/lib/format';
import { AllocationTerminal } from '@/components/vault-detail/AllocationTerminal';
import { EventTickerPanel } from '@/components/simulation/EventTickerPanel';
import { useDeposit } from '@/hooks/useDeposit';
import { useIdentityBalances } from '@/hooks/useIdentityBalances';
import { useSwap, SWAP_DIR_USDC_TO_TRANCHE, type SwapDirection } from '@/hooks/useSwap';
import { useUserPosition } from '@/hooks/useUserPosition';
import { useVaultList, type VaultEntry } from '@/hooks/useVaultRegistry';
import { useVaultState } from '@/hooks/useVaultState';

const TRANCHE_ORDER = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

const TRANCHE_META = {
  [TrancheKind.Prime]: {
    token: 'pPRIME',
    label: 'Prime',
    shortLabel: 'Prime',
    apy: '5%',
    allocation: 70,
    color: '#38596a',
    soft: '#e5edf0',
    border: '#8ea3ad',
    copy: 'Lowest risk - paid first',
    risk: 'Absorbs losses last. Protected by subordinated capital below.',
  },
  [TrancheKind.Core]: {
    token: 'pCORE',
    label: 'Core',
    shortLabel: 'Core',
    apy: '8%',
    allocation: 20,
    color: '#ad7b21',
    soft: '#f1e5c7',
    border: '#caa65f',
    copy: 'Balanced risk and yield',
    risk: 'Alpha absorbs first losses. Core absorbs next.',
  },
  [TrancheKind.Alpha]: {
    token: 'pALPHA',
    label: 'Alpha',
    shortLabel: 'Alpha',
    apy: '15%',
    allocation: 10,
    color: '#9f442b',
    soft: '#f2d6ca',
    border: '#c47f68',
    copy: 'Highest risk - first loss',
    risk: 'Takes the first dollar of loss. Levered exposure to vault performance.',
  },
} as const;

const TRANCHE_PROTECTION: Record<TrancheKind, string> = {
  [TrancheKind.Prime]: 'Maximum',
  [TrancheKind.Core]: 'High',
  [TrancheKind.Alpha]: 'None',
};

const FEATURED_STACK = [
  { kind: TrancheKind.Prime, width: 70 },
  { kind: TrancheKind.Core, width: 20 },
  { kind: TrancheKind.Alpha, width: 10 },
] as const;

type DashboardTranche = {
  kind: TrancheKind;
  key: string;
  label: string;
  totalAssets: bigint;
  totalSupply: bigint;
  navPerShareQ: bigint;
  cumulativeYield: bigint;
  cumulativeLoss: bigint;
  ammQuoteBalance: bigint;
  ammTrancheBalance: bigint;
  pdaLabel: string;
};

type PrismData = {
  connected: boolean;
  walletLabel: string;
  vaultLabel: string;
  vaultStatus: string;
  tranches: DashboardTranche[];
  vaultCapital: bigint;
  yieldDistributed: bigint;
  poolLiquidity: bigint;
  lossBucket: bigint;
  isLoading: boolean;
  error?: Error;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

function usePrismData(): PrismData {
  const { connected, publicKey } = useWallet();
  const vaultQuery = useVaultState();
  const data = vaultQuery.data;

  const tranches: DashboardTranche[] = TRANCHE_ORDER.map((kind) => {
    const config = TRANCHE_CONFIG[kind];
    const live = data?.tranches.find((tranche) => tranche.kind === kind);
    const meta = TRANCHE_META[kind];

    return {
      kind,
      key: config.key,
      label: meta.label,
      totalAssets: live?.totalAssets ?? 0n,
      totalSupply: live?.totalSupply ?? 0n,
      navPerShareQ: live?.navPerShareQ ?? 0n,
      cumulativeYield: live?.cumulativeYield ?? 0n,
      cumulativeLoss: live?.cumulativeLoss ?? 0n,
      ammQuoteBalance: live?.ammQuoteBalance ?? 0n,
      ammTrancheBalance: live?.ammTrancheBalance ?? 0n,
      pdaLabel: live ? shortKey(live.pda) : meta.token,
    };
  });

  const trancheAssets = sum(tranches.map((tranche) => tranche.totalAssets));
  const reserveBalance = toBigInt(data?.reserveBalance ?? 0n);

  return {
    connected,
    walletLabel: connected && publicKey ? shortKey(publicKey) : 'Not connected',
    vaultLabel: data ? shortKey(data.vaultPda) : 'Vault #0',
    vaultStatus: stateName(data?.vault?.state),
    tranches,
    vaultCapital: trancheAssets > 0n ? trancheAssets : reserveBalance,
    yieldDistributed: sum(tranches.map((tranche) => tranche.cumulativeYield)),
    poolLiquidity: sum(tranches.map((tranche) => tranche.ammQuoteBalance)),
    lossBucket: toBigInt(data?.lossBucketBalance ?? 0n),
    isLoading: vaultQuery.isLoading,
    error: vaultQuery.error instanceof Error ? vaultQuery.error : undefined,
  };
}

function usePrismDataById(vaultId: number): PrismData {
  const { connected, publicKey } = useWallet();
  const vaultQuery = useVaultState(vaultId);
  const data = vaultQuery.data;

  const tranches: DashboardTranche[] = TRANCHE_ORDER.map((kind) => {
    const config = TRANCHE_CONFIG[kind];
    const live = data?.tranches.find((tranche) => tranche.kind === kind);
    const meta = TRANCHE_META[kind];
    return {
      kind,
      key: config.key,
      label: meta.label,
      totalAssets: live?.totalAssets ?? 0n,
      totalSupply: live?.totalSupply ?? 0n,
      navPerShareQ: live?.navPerShareQ ?? 0n,
      cumulativeYield: live?.cumulativeYield ?? 0n,
      cumulativeLoss: live?.cumulativeLoss ?? 0n,
      ammQuoteBalance: live?.ammQuoteBalance ?? 0n,
      ammTrancheBalance: live?.ammTrancheBalance ?? 0n,
      pdaLabel: live ? shortKey(live.pda) : meta.token,
    };
  });

  const trancheAssets = sum(tranches.map((t) => t.totalAssets));
  const reserveBalance = toBigInt(data?.reserveBalance ?? 0n);

  return {
    connected,
    walletLabel: connected && publicKey ? shortKey(publicKey) : 'Not connected',
    vaultLabel: data ? shortKey(data.vaultPda) : `Vault #${vaultId}`,
    vaultStatus: stateName(data?.vault?.state),
    tranches,
    vaultCapital: trancheAssets > 0n ? trancheAssets : reserveBalance,
    yieldDistributed: sum(tranches.map((t) => t.cumulativeYield)),
    poolLiquidity: sum(tranches.map((t) => t.ammQuoteBalance)),
    lossBucket: toBigInt(data?.lossBucketBalance ?? 0n),
    isLoading: vaultQuery.isLoading,
    error: vaultQuery.error instanceof Error ? vaultQuery.error : undefined,
  };
}

function PageFrame({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={cx('mx-auto w-full px-4 pb-12 pt-24 sm:px-6 lg:px-8', narrow ? 'max-w-[900px]' : 'max-w-[1456px]')}>
      {children}
    </div>
  );
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-md border border-white/10 bg-black/35 shadow-[0_8px_24px_rgba(60,46,22,0.05)]', className)}>
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/40">{children}</div>;
}

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'green' | 'blue' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
        tone === 'neutral' && 'border-white/10 bg-white/[0.04] text-white/55',
        tone === 'green' && 'border-[#16a34a] bg-[#e9f7ea] text-[#16a34a]',
        tone === 'blue' && 'border-[#2d72ff] bg-[#eaf1ff] text-[#1f62df]',
      )}
    >
      {children}
    </span>
  );
}

function DataState({ data }: { data: PrismData }) {
  return (
    <>
      {data.isLoading ? (
        <div className="mb-5 flex items-center gap-2 rounded-md border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/40">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading live PRISM vault state
        </div>
      ) : null}
      {data.error ? (
        <div className="mb-5 flex items-start gap-3 rounded-md border border-[#c45a45]/30 bg-[#f7e8df] px-4 py-3 text-sm leading-6 text-[#9f442b]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {data.error.message}
        </div>
      ) : null}
    </>
  );
}

function StatCard({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: ReactNode;
}) {
  return (
    <Card className="p-6">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-4 font-display text-5xl leading-none text-white">{value}</div>
      <div className="mt-3 text-sm leading-6 text-white/50">{caption}</div>
    </Card>
  );
}

function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="font-display text-4xl leading-none text-white">{title}</h2>
      {action ? <div className="hidden text-sm text-white sm:block">{action}</div> : null}
    </div>
  );
}

function PathCard({
  index,
  eyebrow,
  title,
  copy,
  href,
  stats,
  accent,
}: {
  index: string;
  eyebrow: string;
  title: string;
  copy: string;
  href: string;
  stats: Array<{ label: string; value: string }>;
  accent: string;
}) {
  return (
    <Link href={href} className="group block h-full">
      <Card className="flex h-full min-h-[330px] flex-col p-7 transition-colors group-hover:border-white/25 group-hover:bg-white/[0.06]">
        <div className="mb-5 flex items-center justify-between">
          <Eyebrow>
            <span style={{ color: accent }}>{index} · {eyebrow}</span>
          </Eyebrow>
          <ArrowUpRight className="h-5 w-5 text-white transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </div>
        <h3 className="min-h-[6rem] text-[2.45rem] font-normal leading-[1.14] tracking-normal text-white">{title}</h3>
        <p className="mt-4 min-h-[6.75rem] text-base leading-7 text-white/70">{copy}</p>
        <div className="mt-auto grid grid-cols-3 gap-4 border-t border-white/10 pt-5">
          {stats.map((stat) => (
            <div key={stat.label}>
              <Eyebrow>{stat.label}</Eyebrow>
              <div className="mt-2 font-mono text-base text-white">{stat.value}</div>
            </div>
          ))}
        </div>
      </Card>
    </Link>
  );
}

function SparkLine({ color }: { color: string }) {
  return (
    <svg width="90" height="34" viewBox="0 0 90 34" aria-hidden className="shrink-0">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points="2,26 14,28 24,21 35,24 46,17 58,18 69,11 82,8 88,5"
      />
    </svg>
  );
}

function ProtocolAtGlance({ data }: { data: PrismData }) {
  const metrics = [
    { label: 'TVL', value: `$${formatUsdc(data.vaultCapital, 2)}`, caption: '1 vault · USDC denominated', color: '#38596a' },
    { label: 'Yield distributed', value: `$${formatUsdc(data.yieldDistributed, 2)}`, caption: 'Since genesis', color: '#ad7b21' },
    { label: 'Protection buffer', value: `$${formatUsdc(data.lossBucket, 2)}`, caption: 'Visible loss bucket', color: '#9f442b' },
    { label: 'Pool liquidity', value: `$${formatUsdc(data.poolLiquidity, 2)}`, caption: 'Across tranche AMMs', color: '#eca8d6' },
  ];

  return (
    <section className="mt-16">
      <SectionTitle title="Protocol · At a glance" action={<Link href="/trade">Full analytics {'->'}</Link>} />
      <div className="grid overflow-hidden rounded-md border border-white/10 bg-black/35 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="border-b border-white/10 p-7 md:border-r xl:border-b-0">
            <Eyebrow>{metric.label}</Eyebrow>
            <div className="mt-4 flex items-end justify-between gap-5">
              <div>
                <div className="font-display text-5xl leading-none text-white">{metric.value}</div>
                <div className="mt-3 text-sm text-white/50">{metric.caption}</div>
              </div>
              <SparkLine color={metric.color} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowPrismWorks() {
  const node = 'rounded border border-white/10 bg-black/35 px-5 py-4 text-center';
  const links = [
    { label: 'Read the docs', href: '#', external: false, disabled: true },
    { label: 'Developer integration', href: '/', external: false },
    { label: 'Explore vaults', href: '/earn', external: false },
  ];

  return (
    <section className="mt-16">
      <SectionTitle
        title="How PRISM works"
        action={
          <span className="pointer-events-none opacity-50 cursor-not-allowed">
            Read the docs {'->'}
          </span>
        }
      />
      <Card className="p-6">
        <div className="grid gap-3 xl:grid-cols-[1fr_36px_1fr_36px_1.1fr_36px_1fr_36px_0.68fr] xl:items-center">
          <div className={node}>
            <Eyebrow>01 · Underlying</Eyebrow>
            <h3 className="mt-2 font-display text-xl">Credit positions</h3>
            <p className="text-sm text-white/50">On-chain loans</p>
          </div>
          <ArrowRight className="mx-auto hidden h-4 w-4 text-white xl:block" />
          <div className={node}>
            <Eyebrow>02 · Vault</Eyebrow>
            <h3 className="mt-2 font-display text-xl">PRISM</h3>
            <p className="text-sm text-white/50">USDC collateral pool</p>
          </div>
          <ArrowRight className="mx-auto hidden h-4 w-4 text-white xl:block" />
          <div>
            <Eyebrow>03 · Tranches</Eyebrow>
            <div className="mt-3 space-y-2">
              {TRANCHE_ORDER.map((kind) => {
                const meta = TRANCHE_META[kind];
                return (
                  <div
                    key={meta.label}
                    className="flex items-center justify-between rounded border px-4 py-2.5 font-mono text-xs"
                    style={{ borderColor: meta.border, backgroundColor: meta.soft, color: meta.color }}
                  >
                    <span>{meta.label}</span>
                    <span>{meta.apy}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-white/50">Losses absorb bottom-up {'->'} Alpha first</p>
          </div>
          <ArrowRight className="mx-auto hidden h-4 w-4 text-white xl:block" />
          <div className={node}>
            <Eyebrow>04 · Depositors</Eyebrow>
            <h3 className="mt-2 font-display text-xl">You</h3>
            <p className="text-sm text-white/50">Tranche tokens</p>
          </div>
          <ArrowRight className="mx-auto hidden h-4 w-4 text-white xl:block" />
          <div className="rounded bg-[#11100e] px-5 py-5 text-center text-white">
            <Eyebrow>05 · Yield</Eyebrow>
            <h3 className="mt-2 font-display text-2xl">$</h3>
            <p className="text-sm text-white/55">Waterfall pays</p>
          </div>
        </div>
        <div className="mt-8 grid gap-8 border-t border-white/10 pt-7 lg:grid-cols-[minmax(0,1fr)_440px]">
          <p className="max-w-4xl text-base leading-7 text-white/70">
            Underlying credit positions generate cashflow that flows into the vault. Cashflow pays tranches from the top down: Prime first, then Core, then Alpha. When losses occur they are absorbed from the bottom up: Alpha first, then Core, finally Prime.
          </p>
          <div className="grid gap-3">
            {links.map((item) => {
              const isDisabled = "disabled" in item && item.disabled;
              if (isDisabled) {
                return (
                  <span
                    key={item.label}
                    className="flex items-center justify-between rounded border border-white/10 bg-black/35 px-4 py-3 text-sm text-white/40 cursor-not-allowed"
                  >
                    {item.label}
                    <ArrowRight className="h-4 w-4" />
                  </span>
                );
              }
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  target={item.external ? '_blank' : undefined}
                  rel={item.external ? 'noreferrer' : undefined}
                  className="flex items-center justify-between rounded border border-white/10 bg-black/35 px-4 py-3 text-sm text-white hover:bg-white/[0.06]"
                >
                  {item.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              );
            })}
          </div>
        </div>
      </Card>
    </section>
  );
}

function FeaturedVault({ data }: { data: PrismData }) {
  const metrics = [
    ['Vault TVL', `$${formatUsdc(data.vaultCapital, 2)}`],
    ['Tranches', '3'],
    ['Underlying', 'Stellar credit + USDC'],
    ['30d default', '0.00%'],
  ];

  return (
    <section className="mt-16">
      <SectionTitle title="Featured vault" action={<Link href="/earn#vault-0">Open vault {'->'}</Link>} />
      <Link href="/earn#vault-0" className="group block">
      <Card className="overflow-hidden transition-colors group-hover:border-white/25 group-hover:bg-white/[0.045]">
        <div className="grid lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="border-b border-white/10 bg-white/[0.055] p-7 lg:border-r lg:border-b-0">
            <Eyebrow>Capital stack</Eyebrow>
            <div className="mt-5 max-w-[330px] space-y-1">
              {FEATURED_STACK.map(({ kind, width }) => {
                const meta = TRANCHE_META[kind];
                return (
                  <div
                    key={meta.label}
                    className="h-20 min-w-[9rem] px-4 py-3 text-white shadow-[18px_0_0_rgba(255,255,255,0.035)]"
                    style={{ width: `${width}%`, backgroundColor: meta.color }}
                  >
                    <div className="font-mono text-xs uppercase tracking-[0.18em]">{meta.label}</div>
                    <div className="mt-4 font-mono text-sm">{meta.allocation}% · {meta.apy}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Eyebrow>Vault #0</Eyebrow>
                  <Pill tone="green">Active</Pill>
                  <Pill>USDC</Pill>
                </div>
                <h3 className="mt-5 font-display text-4xl leading-none text-white">PRISM Credit Vault</h3>
                <p className="mt-3 text-sm text-white/50">Stellar credit positions · transparent tranche accounting · USDC denominated</p>
              </div>
              <ArrowUpRight className="h-5 w-5 text-white/45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
            </div>
            <div className="grid border-t border-white/10 pt-6 sm:grid-cols-4">
              {metrics.map(([label, value]) => (
                <div key={label} className="py-4">
                  <Eyebrow>{label}</Eyebrow>
                  <div className="mt-3 font-mono text-2xl text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
      </Link>
    </section>
  );
}

export function PrismOverview() {
  const data = usePrismData();
  const headline = 'PRISM is ready.';

  return (
    <PageFrame>
      <DataState data={data} />
      <section className="grid gap-8 lg:grid-cols-[minmax(0,0.62fr)_minmax(320px,0.38fr)] lg:items-end">
        <div>
          <Eyebrow>Portfolio · {data.connected ? 'Connected' : 'Not connected'}</Eyebrow>
          <h1 className="mt-6 max-w-4xl font-display text-[clamp(3rem,6vw,5.4rem)] leading-[1.04] tracking-tight text-white">
            {headline}
            <span className="mt-2 block text-white/35">
              {data.connected ? 'Your account is live.' : 'Get ready to earn on-chain credit yield.'}
            </span>
          </h1>
        </div>
        <p className="max-w-xl text-lg leading-8 text-white/70">
          PRISM is a structured credit protocol on Stellar. Deposit into tranched vaults to earn, monitor credit protection, or provide liquidity to tranche markets. <Link href="#how-it-works" className="border-b border-white">How it works {'->'}</Link>
        </p>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <StatCard label="Your deposits" value={`$${formatUsdc(data.vaultCapital, 2)}`} caption={<>Nothing earning yet. <Link href="/earn" className="border-b border-white text-white">Start earning {'->'}</Link></>} />
        <StatCard label="Your protection" value={`$${formatUsdc(data.lossBucket, 2)}`} caption={<>Loss buffer visible on-chain. <Link href="/protect" className="border-b border-white text-white">View risk {'->'}</Link></>} />
        <StatCard label="Your yield · lifetime" value={data.yieldDistributed > 0n ? `$${formatUsdc(data.yieldDistributed, 2)}` : '—'} caption="No activity yet." />
      </section>

      <section className="mt-16">
        <SectionTitle title="What brings you here today?" action={<Eyebrow>Choose a path</Eyebrow>} />
        <div className="grid gap-5 lg:grid-cols-3">
          <PathCard
            index="01"
            eyebrow="Earn"
            title="Deposit and earn yield"
            copy="Choose a risk tranche - Prime, Core, or Alpha - in a structured credit vault. Earn from underlying credit cashflows."
            href="/earn"
            accent={TRANCHE_META[TrancheKind.Prime].color}
            stats={[
              { label: 'Prime', value: '5.0%' },
              { label: 'Core', value: '8.0%' },
              { label: 'Alpha', value: '15.0%' },
            ]}
          />
          <PathCard
            index="02"
            eyebrow="Protect"
            title="Hedge credit risk with CDS"
            copy="Buy credit protection against vault risk, track reserve depth, and see the loss order before a credit event reaches Prime capital."
            href="/protect"
            accent={TRANCHE_META[TrancheKind.Core].color}
            stats={[
              { label: 'Active CDS', value: '2' },
              { label: 'Notional', value: '$110.0K' },
              { label: 'Avg. spread', value: '250 bp' },
            ]}
          />
          <PathCard
            index="03"
            eyebrow="Trade"
            title="LP and trade tranches"
            copy="Provide liquidity to tranche AMM pools, rotate risk on secondary markets, or inspect cross-chain collateral routes."
            href="/trade"
            accent={TRANCHE_META[TrancheKind.Alpha].color}
            stats={[
              { label: 'Pools', value: '1' },
              { label: 'Liquidity', value: '$0' },
              { label: 'LP APR', value: '-' },
            ]}
          />
        </div>
      </section>

      <ProtocolAtGlance data={data} />
      <EventTickerPanel />
      <div id="how-it-works">
        <HowPrismWorks />
      </div>
      <FeaturedVault data={data} />
    </PageFrame>
  );
}

function TrancheDepositRow({ tranche }: { tranche: PrismData['tranches'][number] }) {
  const meta = TRANCHE_META[tranche.kind];
  const { connected } = useWallet();
  const deposit = useDeposit();
  const { data: positions } = useUserPosition();
  const [amount, setAmount] = useState('');

  const myBalance = positions?.find((p) => p.kind === tranche.kind)?.balance ?? 0n;
  const myUsdValue = myBalance > 0n
    ? (myBalance * tranche.navPerShareQ) / Q64_ONE
    : 0n;

  function handleDeposit() {
    const usd = parseFloat(amount);
    if (isNaN(usd) || usd <= 0) return;
    deposit.mutate(
      { trancheKind: tranche.kind, usdcAmount: BigInt(Math.round(usd * 1_000_000)) },
      { onSuccess: () => setAmount('') },
    );
  }

  return (
    <div className="grid gap-5 p-7 lg:grid-cols-[minmax(170px,0.9fr)_160px_130px_minmax(220px,1fr)_180px] lg:items-center">
      <div className="flex items-start gap-4">
        <span className="mt-1 h-12 w-1 rounded" style={{ backgroundColor: meta.color }} />
        <div>
          <Eyebrow><span style={{ color: meta.color }}>{meta.label}</span></Eyebrow>
          <p className="mt-2 text-sm text-white/50">{meta.copy}</p>
        </div>
      </div>

      <div>
        <div className="font-mono text-sm text-white">${formatUsdc(tranche.totalAssets, 2)} / {meta.allocation}% alloc</div>
        <div className="mt-3 h-1.5 rounded-full bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${meta.allocation}%`, backgroundColor: meta.color }} />
        </div>
      </div>

      <div>
        <Eyebrow>Target APY</Eyebrow>
        <div className="mt-2 font-mono text-3xl text-white" style={{ color: tranche.kind === TrancheKind.Alpha ? meta.color : undefined }}>
          {meta.apy}
        </div>
      </div>

      <p className="text-sm leading-6 text-white/50">{meta.risk}</p>

      <div className="space-y-2">
        {connected ? (
          <>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDeposit()}
                placeholder="USDC amount"
                className="w-full min-w-0 rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-white/25"
              />
              <button
                disabled={deposit.isPending || !amount}
                onClick={handleDeposit}
                className={cx(
                  'shrink-0 rounded border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40',
                  tranche.kind === TrancheKind.Alpha
                    ? 'border-white bg-white text-black hover:bg-white/90'
                    : 'border-white/12 bg-black/35 text-white hover:bg-white/10',
                )}
              >
                {deposit.isPending ? '…' : 'Deposit'}
              </button>
            </div>
            {myBalance > 0n && (
              <p className="text-xs text-white/40">
                Your position: {formatUsdc(myBalance, 2)} p{meta.shortLabel} ≈ ${formatUsdc(myUsdValue, 2)}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-white/30">Connect wallet to deposit</p>
        )}
      </div>
    </div>
  );
}

function TrancheRows({ data }: { data: PrismData }) {
  return (
    <div className="divide-y divide-white/10">
      {data.tranches.map((tranche) => (
        <TrancheDepositRow key={tranche.key} tranche={tranche} />
      ))}
    </div>
  );
}

function VaultCard({ entry }: { entry: VaultEntry }) {
  const data = usePrismDataById(entry.vault_id);
  const aprPrime = (entry.prime_bps / 100).toFixed(1);
  const aprAlpha = (entry.alpha_bps / 100).toFixed(1);

  return (
    <div id={`vault-${entry.vault_id}`} className="scroll-mt-24">
      <Card className="mt-12 overflow-hidden">
        <div className="grid gap-6 border-b border-white/10 bg-white/[0.055] p-7 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow>Vault #{entry.vault_id}</Eyebrow>
              <Pill tone="green">{data.vaultStatus || 'Active'}</Pill>
              <Pill>USDC</Pill>
            </div>
            <h2 className="mt-5 font-display text-4xl text-white">{entry.name}</h2>
            <p className="mt-3 text-white/50">
              Stellar credit positions · {aprPrime}%–{aprAlpha}% APR range · USDC denominated
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px border-l border-white/10 pl-7">
            <div>
              <Eyebrow>Vault TVL</Eyebrow>
              <div className="mt-3 font-display text-4xl text-white">${formatUsdc(data.vaultCapital, 2)}</div>
            </div>
            <div>
              <Eyebrow>Tranches</Eyebrow>
              <div className="mt-3 font-display text-4xl text-white">3</div>
            </div>
          </div>
        </div>
        <div className="grid lg:grid-cols-[440px_minmax(0,1fr)]">
          <div className="min-h-[520px] border-b border-white/10 p-7 lg:border-r lg:border-b-0">
            <Eyebrow>The waterfall</Eyebrow>
            <p className="mt-4 text-sm text-white/50">Cash flows top-down. Losses absorb bottom-up.</p>
            <div className="mt-8">
              <div className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-white/45">Cashflow</div>
              <div className="relative pl-9 pr-7">
                <div className="absolute bottom-3 left-3 top-0 border-l border-dashed border-white/30" />
                <ArrowDown className="absolute left-1 bottom-0 h-4 w-4 text-white/45" strokeWidth={1.7} />
                <div className="absolute bottom-3 right-0 top-0 border-r border-dashed border-[#c47f68]/55" />
                <ArrowUp className="absolute -right-2 top-0 h-4 w-4 text-[#c47f68]" strokeWidth={1.7} />
                {TRANCHE_ORDER.map((kind) => {
                  const meta = TRANCHE_META[kind];
                  const bps = kind === TrancheKind.Prime ? entry.prime_bps : kind === TrancheKind.Core ? entry.core_bps : entry.alpha_bps;
                  const apyLabel = `${(bps / 100).toFixed(1)}%`;
                  return (
                    <div
                      key={meta.label}
                      className="relative mb-4 h-20 overflow-hidden rounded-lg text-white"
                      style={{ backgroundColor: meta.soft }}
                    >
                      <div className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${meta.allocation}%`, backgroundColor: meta.color }} />
                      <div className="relative flex h-full items-center justify-between gap-4 px-4 sm:px-5">
                        <div className="min-w-0 [text-shadow:0_1px_8px_rgba(0,0,0,0.26)]">
                          <div className="font-mono text-sm uppercase tracking-[0.22em] text-white sm:text-base sm:tracking-[0.26em]">{meta.label}</div>
                          <div className="mt-3 text-sm text-white/90 sm:text-base">{meta.allocation}% filled</div>
                        </div>
                        <div className="font-mono text-3xl text-white drop-shadow-sm sm:text-4xl">{apyLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-5 flex justify-between text-xs text-white/50">
              <span className="inline-flex items-center gap-1">Paid first <ArrowDown className="h-3 w-3" strokeWidth={1.7} /></span>
              <span className="inline-flex items-center gap-1 text-[#c47f68]"><ArrowUp className="h-3 w-3" strokeWidth={1.7} /> Loss first</span>
            </div>
          </div>
          <TrancheRows data={data} />
        </div>
        <div className="grid border-t border-white/10 bg-white/[0.055] md:grid-cols-5">
          {[
            ['Underlying', 'Stellar credit + USDC'],
            ['Originator', data.vaultLabel],
            ['Maturity', `${entry.maturity_days}d`],
            ['30d default rate', '0.00%'],
            ['Details', <Link key="link" href={`/earn/vault/${entry.vault_id}`} className="text-white/60 hover:text-white transition-colors">Open vault →</Link>],
          ].map(([label, value]) => (
            <div key={String(label)} className="border-b border-white/10 p-6 md:border-r md:border-b-0">
              <Eyebrow>{label}</Eyebrow>
              <div className="mt-3 text-sm text-white">{value}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const UPCOMING_VAULTS = [
  {
    label: 'Vault #1 · Queued',
    title: 'RWA Invoice Credit',
    copy: '60-day invoice factoring · Multi-originator',
  },
  {
    label: 'Vault #2 · Queued',
    title: 'On-chain Treasury Plus',
    copy: 'Short-duration treasury basis · 30-day maturity',
  },
  {
    label: 'Vault #3 · Queued',
    title: 'Validator Credit',
    copy: 'Lending against staked SOL · 120-day',
  },
] as const;

function EarnGuideBanner() {
  return (
    <section className="mt-12 rounded-md border border-white/10 bg-white/[0.045] p-6 shadow-[0_10px_32px_rgba(0,0,0,0.18)] sm:p-7">
      <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/75">
          <CircleDollarSign className="h-5 w-5" strokeWidth={1.7} />
        </div>
        <div>
          <h2 className="font-display text-3xl leading-none text-white">New to PRISM?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
            You are on Devnet. Use simulated USDC, choose a tranche, and see how the waterfall behaves before any real capital is involved.
          </p>
        </div>
        <span
          className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-black/30 px-5 text-sm font-medium text-white/40 cursor-not-allowed"
        >
          Read the docs
        </span>
      </div>
    </section>
  );
}

function MoreVaultsComing() {
  return (
    <section className="mt-16">
      <div className="mb-8 grid grid-cols-[1fr_auto_1fr] items-center gap-5">
        <div className="h-px bg-white/10" />
        <Eyebrow>More vaults coming</Eyebrow>
        <div className="h-px bg-white/10" />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {UPCOMING_VAULTS.map((vault) => (
          <article key={vault.label} className="rounded-md border border-white/10 bg-white/[0.035] p-7">
            <Eyebrow>{vault.label}</Eyebrow>
            <h3 className="mt-7 font-display text-3xl leading-none text-white/85">{vault.title}</h3>
            <p className="mt-3 text-sm text-white/45">{vault.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PrismEarn() {
  const data = usePrismData();
  const { data: registeredVaults, isLoading: vaultsLoading } = useVaultList();

  const vaultCount = registeredVaults?.length ?? 0;

  return (
    <PageFrame>
      <DataState data={data} />
      <section className="grid gap-8 border-b border-white/10 pb-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <Eyebrow>Earn · structured credit vaults</Eyebrow>
          <h1 className="mt-6 max-w-5xl font-display text-[clamp(3.7rem,7vw,6.4rem)] leading-[0.92] text-white">Tranched yield on real credit.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">
            Choose the risk layer that matches your appetite. Prime holders get paid first and take losses last. Alpha holders get paid last and take losses first.
          </p>
        </div>
        <div className="text-right">
          <Eyebrow>Vaults</Eyebrow>
          <div className="mt-6 font-display text-6xl text-white">{vaultsLoading ? '…' : vaultCount}</div>
          <p className="mt-2 text-sm text-white/50">Active on Devnet</p>
        </div>
      </section>

      {/* Registered vaults */}
      {registeredVaults && registeredVaults.length > 0 ? (
        registeredVaults.map((entry) => <VaultCard key={entry.vault_id} entry={entry} />)
      ) : (
        <div className="mt-16 rounded-md border border-white/10 bg-white/[0.025] px-8 py-12 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-white/30">No vaults registered</p>
          <p className="mt-3 text-sm text-white/40">
            Go to <Link href="/admin" className="underline hover:text-white/70">Admin → New Vault</Link> to initialize your first vault.
          </p>
        </div>
      )}

      <EarnGuideBanner />
    </PageFrame>
  );
}

export function PrismVaultDetail({ vaultId }: { vaultId: string }) {
  const data = usePrismData();
  const [, setActiveTranche] = useState<TrancheKind>(TrancheKind.Prime);

  if (vaultId !== '0') {
    return (
      <PageFrame>
        <div className="rounded-md border border-white/10 bg-black/35 p-12 text-center">
          <h1 className="text-xl text-white/60">Vault #{vaultId} not found or not yet active on Devnet.</h1>
          <Link href="/earn" className="mt-6 inline-block text-sm text-white border-b border-white">Back to Earn</Link>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <DataState data={data} />
      <div className="mb-6 flex items-center gap-3">
        <Link href="/earn" className="text-sm text-white/50 transition-colors hover:text-white">
          <ArrowLeft className="inline h-4 w-4" /> Back to Earn
        </Link>
        <Pill tone="blue">Vault Detail View</Pill>
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-6 border-b border-white/10 bg-white/[0.055] p-7 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Eyebrow>Vault #0</Eyebrow>
              <Pill tone="green">Active</Pill>
              <Pill>USDC</Pill>
            </div>
            <h2 className="mt-5 font-display text-4xl text-white">PRISM Credit Vault</h2>
            <p className="mt-3 text-white/50">Stellar credit positions · transparent tranche accounting · USDC denominated</p>
          </div>
          <div className="grid grid-cols-2 gap-px border-l border-white/10 pl-7">
            <div>
              <Eyebrow>Vault TVL</Eyebrow>
              <div className="mt-3 font-display text-4xl text-white">${formatUsdc(data.vaultCapital, 2)}</div>
            </div>
            <div>
              <Eyebrow>Tranches</Eyebrow>
              <div className="mt-3 font-display text-4xl text-white">3</div>
            </div>
          </div>
        </div>
        <div className="grid lg:grid-cols-[440px_minmax(0,1fr)]">
          <div className="min-h-[520px] border-b border-white/10 p-7 lg:border-r lg:border-b-0">
            <Eyebrow>The waterfall</Eyebrow>
            <p className="mt-4 text-sm text-white/50">Cash flows top-down. Losses absorb bottom-up.</p>
            <div className="mt-8">
              <div className="mb-4 font-mono text-xs uppercase tracking-[0.24em] text-white/45">Cashflow</div>
              <div className="relative pl-9 pr-7">
                <div className="absolute bottom-3 left-3 top-0 border-l border-dashed border-white/30" />
                <ArrowDown className="absolute left-1 bottom-0 h-4 w-4 text-white/45" strokeWidth={1.7} />
                <div className="absolute bottom-3 right-0 top-0 border-r border-dashed border-[#c47f68]/55" />
                <ArrowUp className="absolute -right-2 top-0 h-4 w-4 text-[#c47f68]" strokeWidth={1.7} />
                {TRANCHE_ORDER.map((kind) => {
                  const meta = TRANCHE_META[kind];
                  const apyLabel = `${Number.parseFloat(meta.apy).toFixed(1)}%`;

                  return (
                    <div
                      key={meta.label}
                      className="relative mb-4 h-20 overflow-hidden rounded-lg text-white"
                      style={{ backgroundColor: meta.soft }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-lg"
                        style={{ width: `${meta.allocation}%`, backgroundColor: meta.color }}
                      />
                      <div className="relative flex h-full items-center justify-between gap-4 px-4 sm:px-5">
                        <div className="min-w-0 [text-shadow:0_1px_8px_rgba(0,0,0,0.26)]">
                          <div className="font-mono text-sm uppercase tracking-[0.22em] text-white sm:text-base sm:tracking-[0.26em]">{meta.label}</div>
                          <div className="mt-3 text-sm text-white/90 sm:text-base">{meta.allocation}% filled</div>
                        </div>
                        <div className="font-mono text-3xl text-white drop-shadow-sm sm:text-4xl">{apyLabel}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-5 flex justify-between text-xs text-white/50">
              <span className="inline-flex items-center gap-1">Paid first <ArrowDown className="h-3 w-3" strokeWidth={1.7} /></span>
              <span className="inline-flex items-center gap-1 text-[#c47f68]"><ArrowUp className="h-3 w-3" strokeWidth={1.7} /> Loss first</span>
            </div>
          </div>
          <TrancheRows data={data} />
        </div>
      </Card>

      <section className="mt-8 space-y-4" id="allocation-terminal">
        <Eyebrow>Tranche Allocation Terminal · USDC &amp; Fiat</Eyebrow>
        <AllocationTerminal
          vaultStatus={data.vaultStatus}
          tranches={TRANCHE_ORDER.map((k) => ({
            kind: k,
            label: TRANCHE_META[k].label,
            apy: TRANCHE_META[k].apy,
            color: TRANCHE_META[k].color,
            risk: TRANCHE_META[k].risk,
            protection: TRANCHE_PROTECTION[k],
            nav: data.tranches.find((t) => t.kind === k)?.navPerShareQ ?? Q64_ONE,
          }))}
          onTrancheChange={setActiveTranche}
        />
      </section>

      <EarnGuideBanner />
    </PageFrame>
  );
}

function ProtectionCard({
  index,
  amount,
  premium,
  vaultLabel,
}: {
  index: string;
  amount: string;
  premium: string;
  vaultLabel: string;
}) {
  const rows = [
    ['Reference Vault', vaultLabel],
    ['Protection Amount', amount],
    ['Premium Rate', premium],
    ['Time to Maturity', 'Open'],
  ];

  return (
    <Link href={`/protect/${index}`} className="group block h-full">
      <Card className="flex h-full min-h-[230px] flex-col overflow-hidden transition-colors group-hover:border-white/25 group-hover:bg-white/[0.055]">
        <div className="border-b border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Eyebrow>CDS Route #{index}</Eyebrow>
              <h3 className="mt-2.5 flex items-center gap-3 text-xl font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-[#ad7b21]" />
                Risk Route #{index}
              </h3>
            </div>
            <Pill tone="green">Active</Pill>
          </div>
        </div>

        <div className="grid flex-1 content-start gap-px bg-white/10">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5 bg-black/35 px-5 py-3">
              <span className="text-sm text-white/45">{label}</span>
              <span className="font-mono text-sm text-white">{value}</span>
            </div>
          ))}
        </div>
      </Card>
    </Link>
  );
}

export function PrismProtect() {
  const data = usePrismData();

  return (
    <PageFrame>
      <DataState data={data} />
      <section className="mx-auto max-w-[1040px]">
        <div className="mb-6 grid gap-5 border-b border-white/10 pb-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <Eyebrow>Protect · credit default swaps</Eyebrow>
            <h1 className="mt-3 font-display text-[clamp(2.4rem,4.5vw,4rem)] leading-[0.98] text-white">Hedge vault risk.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/60">
              Buy credit protection against vault risk with automated settlement state.
            </p>
          </div>
          <Pill>2 routes</Pill>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <ProtectionCard index="0" amount="$100,000.00" premium="2.50%" vaultLabel={data.vaultLabel} />
          <ProtectionCard index="1" amount="$10,000.00" premium="1.75%" vaultLabel={data.vaultLabel} />
        </div>
      </section>
    </PageFrame>
  );
}

export function PrismProtectDetail({ routeId }: { routeId: '0' | '1' }) {
  const data = usePrismData();
  const isRouteOne = routeId === '1';
  const amount = isRouteOne ? data.lossBucket : data.vaultCapital;
  const premium = isRouteOne ? '1.75%' : '2.50%';

  return (
    <PageFrame>
      <DataState data={data} />
      <section>
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link href="/protect" className="text-sm text-white/50">
            <ArrowLeft className="inline h-4 w-4" /> Back
          </Link>
          <h1 className="text-2xl font-semibold text-white">Risk Route #{routeId}</h1>
          <Pill tone="green">Active</Pill>
          <Pill tone="blue">Live on Devnet</Pill>
        </div>
        <p className="mb-8 font-mono text-sm text-white/50">{data.vaultLabel}</p>
        <div className="grid gap-5 lg:grid-cols-4">
          {[
            ['Status', data.vaultStatus],
            ['Reference Vault', data.vaultLabel],
            ['Protection Amount', `$${formatUsdc(amount, 2)}`],
            ['Premium Rate', premium],
            ['Maturity', 'Open'],
            ['Time Left', 'Continuous'],
            ['Collateral Posted', `$${formatUsdc(data.lossBucket, 2)}`],
            ['Premium Deposit', `$${formatUsdc(data.yieldDistributed, 2)}`],
          ].map(([label, value], index) => (
            <Card key={label} className={cx('p-5', index > 5 && 'border-[#ad7b21]/60 bg-[#ad7b21]/10')}>
              <div className="text-sm text-white/50">{label}</div>
              <div className={cx('mt-2 font-mono text-lg text-white', index > 5 && 'text-[#f0c06a]')}>{value}</div>
            </Card>
          ))}
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <div className="text-sm text-white/50">Protection Buyer</div>
            <div className="mt-3 font-mono text-lg text-white">{data.walletLabel}</div>
          </Card>
          <Card className="p-5">
            <div className="text-sm text-white/50">Protection Seller</div>
            <div className="mt-3 font-mono text-lg text-white">{data.vaultLabel}</div>
          </Card>
        </div>
        <div className="mt-8 rounded-md border border-pink-500/25 bg-pink-500/[0.06] p-5">
          <h3 className="font-semibold text-pink-200">Contract Active</h3>
          <p className="mt-4 text-sm text-white/55">Both sides are matched. Premium accrues through the protocol accounting layer.</p>
          <button type="button" className="mt-5 rounded-full border border-pink-500/30 bg-pink-500/10 px-5 py-3 text-sm font-semibold text-pink-100 transition-colors hover:bg-pink-500/20">Pay Premium</button>
        </div>
      </section>
    </PageFrame>
  );
}

const TRADE_TABS = ['Secondary swap', 'AMM pools', 'Cross-chain margin'] as const;

function TradeTabs({ active, setActive }: { active: string; setActive: (tab: string) => void }) {
  return (
    <div className="mb-6 inline-flex flex-wrap gap-1 rounded-full border border-white/10 bg-black/35 p-1">
      {TRADE_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => setActive(tab)}
          className={cx(
            'rounded-full px-4 py-2 text-sm font-medium transition-colors',
            active === tab ? 'bg-white text-black' : 'text-white/50 hover:bg-white/10 hover:text-white',
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function TradeMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center gap-2 text-xs text-white/45">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
        {label}
      </div>
      <div className="mt-2 font-mono text-lg text-white">{value}</div>
    </div>
  );
}

// ─── Swap helpers ─────────────────────────────────────────────────────────────

type SwapSide = 'usdc' | TrancheKind;

const SIDE_INFO: Record<string, { symbol: string; color: string }> = {
  usdc: { symbol: 'USDC', color: '#4ade80' },
  [String(TrancheKind.Prime)]: { symbol: 'pPRIME', color: '#38596a' },
  [String(TrancheKind.Core)]: { symbol: 'pCORE', color: '#ad7b21' },
  [String(TrancheKind.Alpha)]: { symbol: 'pALPHA', color: '#9f442b' },
};

function sideKey(s: SwapSide): string {
  return s === 'usdc' ? 'usdc' : String(s);
}

function cpAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): bigint {
  if (amountIn === 0n || reserveIn === 0n || reserveOut === 0n) return 0n;
  const feeNum = BigInt(10000 - feeBps);
  const amtFee = amountIn * feeNum;
  const num = reserveOut * amtFee;
  const den = reserveIn * 10000n + amtFee;
  return den === 0n ? 0n : num / den;
}

// ─── SwapPanel ────────────────────────────────────────────────────────────────

function SwapPanel({ data }: { data: PrismData }) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Holdings items
  const holdings = [
    { symbol: 'USDC', color: '#4ade80', balance: balances?.usdc ?? 0n },
    { symbol: 'pPRIME', color: '#38596a', balance: balances?.tranches.find((t) => t.kind === TrancheKind.Prime)?.balance ?? 0n },
    { symbol: 'pCORE', color: '#ad7b21', balance: balances?.tranches.find((t) => t.kind === TrancheKind.Core)?.balance ?? 0n },
    { symbol: 'pALPHA', color: '#9f442b', balance: balances?.tranches.find((t) => t.kind === TrancheKind.Alpha)?.balance ?? 0n },
  ];

  return (
    <section className="space-y-5">
      {/* Holdings strip */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/[0.03] sm:grid-cols-4">
        {balsLoading ? (
          <div className="col-span-4 flex items-center gap-2 bg-[#070707] px-5 py-4 font-mono text-xs text-white/30">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Loading balances…
          </div>
        ) : (
          holdings.map((item) => (
            <div key={item.symbol} className="bg-[#070707] px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/22">{item.symbol}</span>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
              </div>
              <div className="mt-2 font-mono text-xl text-white">{formatUsdc(item.balance, 2)}</div>
              <div className="mt-0.5 font-mono text-[10px] text-white/18">token units</div>
            </div>
          ))
        )}
      </div>

      {/* Swap widget + pool sidebar */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden">
          <div className="border-b border-white/10 bg-white/[0.045] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Eyebrow>Swap · PRISM AMM</Eyebrow>
                <p className="mt-2 text-sm text-white/50">
                  Trade USDC against tranche tokens through constant-product pools.
                </p>
              </div>
              <Pill tone="green">Devnet</Pill>
            </div>
          </div>

          <div className="space-y-3 p-6">
            {/* Sell side */}
            <div className="rounded-md border border-white/10 bg-black/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">You sell</span>
                <button type="button" onClick={handleMax} className="font-mono text-[10px] text-white/30 transition-colors hover:text-white/60">
                  Balance: {formatUsdc(sellBalance, 2)}&nbsp;
                  <span className="rounded border border-white/10 px-1 py-0.5 text-white/45">MAX</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={sideKey(sellToken)}
                  onChange={(e) => handleSellChange(e.target.value)}
                  className="h-10 shrink-0 rounded border border-white/15 bg-black/60 px-3 font-mono text-sm focus:outline-none"
                  style={{ color: sellInfo.color }}
                >
                  <option value="usdc" style={{ color: '#4ade80' }}>USDC</option>
                  <option value={String(TrancheKind.Prime)} style={{ color: '#38596a' }}>pPRIME</option>
                  <option value={String(TrancheKind.Core)} style={{ color: '#ad7b21' }}>pCORE</option>
                  <option value={String(TrancheKind.Alpha)} style={{ color: '#9f442b' }}>pALPHA</option>
                </select>
                <input
                  type="number"
                  min="0"
                  value={amtStr}
                  onChange={(e) => setAmtStr(e.target.value)}
                  placeholder="0.00"
                  className="min-w-0 flex-1 rounded border border-white/10 bg-black/40 px-3 py-2.5 font-mono text-base text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
                />
              </div>
            </div>

            {/* Flip */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleFlip}
                title="Flip direction"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white/40 transition-all hover:border-white/25 hover:text-white/70 hover:rotate-180"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>

            {/* Buy side */}
            <div className="rounded-md border border-white/10 bg-black/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/40">You receive</span>
                <span className="font-mono text-[10px] text-white/25">Balance: {formatUsdc(buyBalance, 2)}</span>
              </div>
              <div className="flex items-center gap-2">
                {isFromUsdc ? (
                  <select
                    value={String(buyTrancheKind)}
                    onChange={(e) => { setBuyTrancheKind(Number(e.target.value) as TrancheKind); setAmtStr(''); }}
                    className="h-10 shrink-0 rounded border border-white/15 bg-black/60 px-3 font-mono text-sm focus:outline-none"
                    style={{ color: buyInfo.color }}
                  >
                    <option value={String(TrancheKind.Prime)} style={{ color: '#38596a' }}>pPRIME</option>
                    <option value={String(TrancheKind.Core)} style={{ color: '#ad7b21' }}>pCORE</option>
                    <option value={String(TrancheKind.Alpha)} style={{ color: '#9f442b' }}>pALPHA</option>
                  </select>
                ) : (
                  <div
                    className="flex h-10 shrink-0 items-center rounded border border-white/15 bg-black/60 px-3 font-mono text-sm"
                    style={{ color: buyInfo.color }}
                  >
                    {buyInfo.symbol}
                  </div>
                )}
                <div className="min-w-0 flex-1 rounded border border-white/[0.05] bg-black/20 px-3 py-2.5 font-mono text-base text-white/55">
                  {amountOut > 0n ? `~${formatUsdc(amountOut, 4)}` : '—'}
                </div>
              </div>
              {impliedPrice !== null && (
                <div className="mt-2 font-mono text-[10px] text-white/25">
                  1 {direction === SWAP_DIR_USDC_TO_TRANCHE ? buyInfo.symbol : sellInfo.symbol} ≈ {impliedPrice.toFixed(6)} USDC
                </div>
              )}
            </div>

            {/* Slippage row */}
            <div className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-black/20 px-4 py-2.5">
              <span className="font-mono text-[11px] text-white/30">Slippage</span>
              <div className="flex items-center gap-1">
                {['0.5', '1.0', '2.0'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSlippage(v)}
                    className={cx(
                      'rounded px-2 py-1 font-mono text-[11px] transition-colors',
                      slippage === v ? 'bg-white text-black' : 'text-white/40 hover:text-white/70',
                    )}
                  >
                    {v}%
                  </button>
                ))}
                <input
                  type="number"
                  min="0.01"
                  max="50"
                  step="0.1"
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  className="w-14 rounded border border-white/10 bg-black/40 px-2 py-1 font-mono text-[11px] text-white focus:outline-none"
                />
                <span className="font-mono text-[11px] text-white/30">%</span>
              </div>
            </div>

            {/* Insufficient balance warning */}
            {insufficientBalance && (
              <div className="flex items-center gap-2 rounded-md border border-[#9f442b]/30 bg-[#9f442b]/10 px-4 py-2.5 font-mono text-xs text-[#e8a090]">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                Insufficient balance — you have {formatUsdc(sellBalance, 2)} {sellInfo.symbol}.
              </div>
            )}

            {/* Pool-empty warning */}
            {poolEmpty && (
              <div className="flex items-center gap-2 rounded-md border border-[#9f442b]/30 bg-[#9f442b]/10 px-4 py-2.5 font-mono text-xs text-[#e8a090]">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                No liquidity in this pool. Add liquidity first or pick another tranche.
              </div>
            )}

            {/* Min received summary */}
            {minAmountOut > 0n && (
              <div className="flex items-center justify-between px-1 font-mono text-[11px] text-white/25">
                <span>Min received ({slipPct}% slippage)</span>
                <span>{formatUsdc(minAmountOut, 4)} {buyInfo.symbol}</span>
              </div>
            )}

            {/* Execute */}
            <button
              type="button"
              onClick={handleSwap}
              disabled={!canSwap}
              className="h-12 w-full rounded-full border border-white/10 bg-white font-mono text-sm font-semibold text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {swap.isPending ? 'Swapping…' : `Swap ${sellInfo.symbol} → ${buyInfo.symbol}`}
            </button>
          </div>
        </Card>

        {/* Pool sidebar */}
        <div className="grid content-start gap-5">
          <Card className="p-5">
            <Eyebrow>Market snapshot</Eyebrow>
            <div className="mt-5 grid gap-3">
              <TradeMetric icon={Layers3} label="Active pools" value={String(data.tranches.filter((t) => t.ammTrancheBalance > 0n).length)} />
              <TradeMetric icon={BarChart} label="Total liquidity" value={`$${formatUsdc(data.poolLiquidity, 2)}`} />
              <TradeMetric icon={ShieldCheck} label="Pool fee" value={`${feeBps / 100}%`} />
            </div>
          </Card>

          <Card className="p-5">
            <Eyebrow>Select pool</Eyebrow>
            <div className="mt-4 grid gap-2">
              {data.tranches.map((tranche) => {
                const meta = TRANCHE_META[tranche.kind];
                const isActive = tranche.kind === activeKind;
                return (
                  <button
                    key={tranche.key}
                    type="button"
                    onClick={() => {
                      if (isFromUsdc) {
                        setBuyTrancheKind(tranche.kind);
                      } else {
                        setSellToken('usdc');
                        setBuyTrancheKind(tranche.kind);
                      }
                      setAmtStr('');
                    }}
                    className={cx(
                      'w-full rounded-md border p-3 text-left transition-colors',
                      isActive
                        ? 'border-white/25 bg-white/[0.06]'
                        : 'border-white/10 bg-black/30 hover:border-white/18 hover:bg-white/[0.03]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                        <span className="font-mono text-xs text-white">{meta.token}</span>
                      </div>
                      <span className="font-mono text-[10px] text-white/45">
                        {tranche.ammQuoteBalance > 0n ? `$${formatUsdc(tranche.ammQuoteBalance, 0)} USDC` : 'No liquidity'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-3">
                      <span className="font-mono text-[10px] text-white/25">
                        {tranche.ammTrancheBalance > 0n ? `${formatUsdc(tranche.ammTrancheBalance, 0)} tokens` : '—'}
                      </span>
                      <span className="font-mono text-[10px]" style={{ color: meta.color }}>
                        NAV {formatNavQ(tranche.navPerShareQ)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* Steps */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['01', 'Select tokens', 'Choose what you sell and what you receive. One side must always be USDC.'],
          ['02', 'Review output', 'The constant-product AMM computes your output including the pool fee.'],
          ['03', 'Execute on-chain', 'Transaction signs with the active simulation identity and settles atomically.'],
        ].map(([step, title, copy]) => (
          <Card key={step} className="p-5">
            <div className="font-mono text-xs text-white/35">{step}</div>
            <h3 className="mt-3 text-sm font-semibold text-white">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-white/45">{copy}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}

function PoolsPanel({ data }: { data: PrismData }) {
  const poolRows: Array<{ label: string; value: ReactNode }> = [
    { label: 'Reference Asset', value: data.vaultLabel },
    {
      label: 'Total Liquidity',
      value: (
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-[#ad7b21]" />
          ${formatUsdc(data.poolLiquidity, 2)}
        </span>
      ),
    },
    { label: 'Protection Sold', value: '$0.00' },
    { label: 'Current Spread', value: '2.00%' },
    { label: 'Time to Maturity', value: 'Expired' },
  ];

  return (
    <div>
      <div className="mb-8 flex items-end justify-between border-b border-white/10 pb-7">
        <div>
          <h1 className="text-3xl font-semibold text-white">Tranche AMM Pools</h1>
          <p className="mt-3 text-white/50">Automated credit risk liquidity pools</p>
        </div>
        <Pill>1 pool</Pill>
      </div>
      <Link href="/trade/pools/0" className="block max-w-[500px]">
        <Card className="p-5 transition-colors hover:border-white/25 hover:bg-white/[0.055]">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[#ad7b21]" />
              <h2 className="text-xl font-semibold text-white">Pool #0</h2>
            </div>
            <Pill tone="green">Active</Pill>
          </div>

          <div className="grid gap-3">
            {poolRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5">
                <span className="text-sm text-white/50">{row.label}</span>
                <span className="font-mono text-base text-white">{row.value}</span>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-4">
              <span className="text-sm text-white/50">Utilization</span>
              <span className="font-mono text-sm text-white/55">0.0%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-[#ad7b21]" style={{ width: '0%' }} />
            </div>
          </div>
        </Card>
      </Link>
    </div>
  );
}

function PoolStatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'amber' | 'green';
}) {
  return (
    <Card className={cx('p-5', tone === 'amber' && 'border-[#ad7b21]/50', tone === 'green' && 'border-[#16a34a]/50')}>
      <div className="text-sm text-white/45">{label}</div>
      <div className={cx('mt-3 font-mono text-2xl text-white', tone === 'amber' && 'text-[#f0c06a]', tone === 'green' && 'text-[#86efac]')}>
        {value}
      </div>
    </Card>
  );
}

function PoolActionCard({
  title,
  placeholder,
  action,
  tone,
}: {
  title: string;
  placeholder: string;
  action: string;
  tone: 'green' | 'pink' | 'neutral';
}) {
  return (
    <Card
      className={cx(
        'p-5',
        tone === 'green' && 'border-[#16a34a]/50 bg-[#16a34a]/5',
        tone === 'pink' && 'border-pink-500/35 bg-pink-500/[0.045]',
      )}
    >
      <h3 className={cx('font-semibold text-white', tone === 'green' && 'text-[#86efac]', tone === 'pink' && 'text-pink-200')}>
        {title}
      </h3>
      <input
        className="mt-4 h-11 w-full rounded-md border border-white/10 bg-black/40 px-4 font-mono text-sm text-white outline-none placeholder:text-white/35 focus:border-pink-500/40"
        placeholder={placeholder}
      />
      <button
        type="button"
        className={cx(
          'mt-4 h-11 w-full rounded-full text-sm font-semibold transition-colors',
          tone === 'green' && 'bg-[#16a34a]/75 text-white hover:bg-[#16a34a]',
          tone === 'pink' && 'bg-pink-500/80 text-white hover:bg-pink-500',
          tone === 'neutral' && 'border border-white/10 bg-white/10 text-white/65 hover:bg-white/15',
        )}
      >
        {action}
      </button>
    </Card>
  );
}

export function PrismPoolDetail({ poolId }: { poolId: string }) {
  const data = usePrismData();
  const poolAddress = data.vaultLabel;
  const terms = [
    ['Reference Asset', poolAddress],
    ['Base Spread', '2.00%'],
    ['Curve Slope', '5.00%'],
    ['Maturity', 'Feb 16, 2027'],
    ['Total LP Shares', '0.00'],
  ];

  return (
    <PageFrame>
      <DataState data={data} />
      <section className="mx-auto max-w-[1180px]">
        <Link href="/trade#pools" className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to pools
        </Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold text-white">CDS AMM Pool #{poolId}</h1>
              <Pill>Live on Devnet</Pill>
            </div>
            <div className="mt-2 font-mono text-sm text-white/45">{poolAddress}</div>
          </div>
          <Pill tone="green">Active</Pill>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PoolStatCard label="Total Liquidity" value="$0.00" tone="amber" />
          <PoolStatCard label="Protection Sold" value="$0.00" />
          <PoolStatCard label="Current Spread" value="2.00%" tone="amber" />
          <PoolStatCard label="Utilization" value="0.0%" tone="green" />
        </div>

        <Card className="mt-6 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-white">Pool Utilization</h2>
            <span className="font-mono text-sm text-[#86efac]">0.0%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#16a34a]" style={{ width: '0%' }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-xs text-white/35">
            <span>0%</span>
            <span>50%</span>
            <span>95% max</span>
          </div>
        </Card>

        <Card className="mt-6 p-5">
          <h2 className="font-semibold text-white">Pool Terms</h2>
          <div className="mt-5 grid gap-3">
            {terms.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6">
                <span className="text-sm text-white/50">{label}</span>
                <span className="font-mono text-sm text-white">{value}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <PoolActionCard title="Provide Liquidity" placeholder="Amount to deposit (e.g. 50000)" action="Deposit" tone="green" />
          <PoolActionCard title="Withdraw Liquidity" placeholder="Shares to withdraw" action="Withdraw" tone="neutral" />
        </div>

        <div className="mt-6">
          <PoolActionCard title="Buy Protection" placeholder="Protection notional (e.g. 10000)" action="Buy Protection" tone="pink" />
        </div>
      </section>
    </PageFrame>
  );
}

function MarginPanel() {
  return (
    <div className="grid min-h-[420px] place-items-center text-center">
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold text-white">Cross-Chain Margin</h1>
        <p className="mt-5 text-white/50">Unified margin engine for collateral routes bridged into PRISM credit markets.</p>
        <p className="mt-4 text-white/50">Open an account to deposit collateral, borrow against it, and manage positions across chains.</p>
        <button type="button" className="mt-9 rounded-md bg-[#11100e] px-7 py-4 text-sm font-semibold text-white">Open Margin Account</button>
      </div>
    </div>
  );
}

export function PrismTrade() {
  const data = usePrismData();
  const [active, setActive] = useState('Secondary swap');

  useEffect(() => {
    if (window.location.hash === '#pools') {
      setActive('AMM pools');
    }
  }, []);

  return (
    <PageFrame>
      <DataState data={data} />
      <section className="mx-auto max-w-[1180px]">
        <TradeTabs active={active} setActive={setActive} />
        {active === 'Secondary swap' ? <SwapPanel data={data} /> : null}
        {active === 'AMM pools' ? <PoolsPanel data={data} /> : null}
        {active === 'Cross-chain margin' ? <MarginPanel /> : null}
      </section>
    </PageFrame>
  );
}
