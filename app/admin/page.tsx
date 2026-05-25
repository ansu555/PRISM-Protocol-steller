'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  BarChart3,
  ChevronRight,
  Clock,
  Coins,
  Database,
  FileText,
  Layers,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useVaultState } from '@/hooks/useVaultState';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { formatUsdc, formatNavQ } from '@/app/lib/format';
import { TrancheKind } from '@/app/lib/constants';

const TRANCHE_ROWS = [
  { kind: TrancheKind.Prime, label: 'PRIME', color: '#38596a', apy: '5.0%' },
  { kind: TrancheKind.Core,  label: 'CORE',  color: '#ad7b21', apy: '8.0%' },
  { kind: TrancheKind.Alpha, label: 'ALPHA', color: '#9f442b', apy: '15.0%' },
] as const;

const QUICK_LINKS = [
  { label: 'Deploy New Vault',      desc: 'Initialize a fresh credit pool',    href: '/admin/vaults',        icon: Layers      },
  { label: 'Inject Yield',           desc: 'Accrue waterfall distribution',     href: '/admin/capital',       icon: Coins       },
  { label: 'Trigger Credit Event',  desc: 'Loss cascade simulation',           href: '/admin/risk',          icon: Zap,   danger: true },
  { label: 'PDA Inspector',         desc: 'On-chain account viewer',           href: '/admin/observability', icon: Database    },
  { label: 'Protocol Setup',        desc: 'Initialize or reconfigure',         href: '/admin/protocol',      icon: Shield      },
];

import { Skeleton } from '@/components/ui/skeleton';

export default function AdminOverviewPage() {
  useEffect(() => {
    document.title = 'Admin Overview | PRISM Protocol';
  }, []);
  const { vaultId } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const { applications } = useLoanApplications();

  if (vaultState.isLoading) {
    return (
      <div className="space-y-7 p-8 bg-background min-h-full">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 rounded-md" />
          <Skeleton className="h-4 w-32 rounded-sm" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <div className="grid grid-cols-[1fr_300px] gap-6">
          <Skeleton className="h-[500px] rounded-xl" />
          <div className="space-y-3">
             <Skeleton className="h-40 rounded-xl" />
             <Skeleton className="h-40 rounded-xl" />
             <Skeleton className="h-40 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  const vd = vaultState.data;
  const tvl = (vd?.tranches ?? []).reduce((sum, t) => sum + t.totalAssets, 0n);
  const reserveBal = vd?.reserveBalance ?? 0n;
  const lossBucketBal = vd?.lossBucketBalance ?? 0n;
  const isHealthy = lossBucketBal === 0n;

  const pendingApps = applications.filter((a) => a.status === 'pending');
  const approvedApps = applications.filter((a) => a.status === 'approved');
  const totalExposure = approvedApps.reduce(
    (sum, a) => sum + BigInt(Math.round(a.requestedUSDC * 1_000_000)),
    0n,
  );

  const stats = [
    { label: 'Total Value Locked', value: `$${formatUsdc(tvl, 2)}`,           Icon: BarChart3,  color: '#38596a' },
    { label: 'Vault Reserve',      value: `$${formatUsdc(reserveBal, 2)}`,    Icon: Database,   color: '#ad7b21' },
    { label: 'Active Exposure',    value: `$${formatUsdc(totalExposure, 2)}`, Icon: TrendingUp, color: '#6d5ca8' },
    { label: 'Loss Bucket',        value: `$${formatUsdc(lossBucketBal, 2)}`, Icon: Shield,     color: lossBucketBal > 0n ? '#9f442b' : '#2f7d4f' },
  ];

  return (
    <div className="space-y-7 p-8">
      {/* Page header */}
      <div>
        <h1 className="text-[15px] font-semibold text-white">Mission Control</h1>
        <p className="mt-0.5 font-mono text-[10px] text-white/30">
          Protocol overview · Vault #{vaultId}
        </p>
      </div>

      {/* Alerts */}
      {(!isHealthy || pendingApps.length > 0) && (
        <div className="space-y-2">
          {!isHealthy && (
            <div className="flex items-center gap-3 rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" strokeWidth={1.5} />
              <div>
                <p className="text-[12px] font-medium text-rose-300">Loss Event Active</p>
                <p className="text-[10px] text-rose-400/55">
                  ${formatUsdc(lossBucketBal, 2)} in loss bucket — review Risk Engine
                </p>
              </div>
              <Link
                href="/admin/risk"
                className="ml-auto flex items-center gap-1 text-[10px] text-rose-400 hover:text-rose-300"
              >
                Review <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          )}
          {pendingApps.length > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.5} />
              <div>
                <p className="text-[12px] font-medium text-amber-300">
                  {pendingApps.length}{' '}Loan Application{pendingApps.length > 1 ? 's' : ''} Awaiting Review
                </p>
                <p className="text-[10px] text-amber-400/55">Pending admin approval to originate on-chain</p>
              </div>
              <Link
                href="/admin/loans"
                className="ml-auto flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300"
              >
                Review <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map(({ label, value, Icon, color }) => (
          <div
            key={label}
            className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707] px-4 py-4"
          >
            <div
              className="absolute inset-y-0 left-0 w-[2px] rounded-l-xl"
              style={{ backgroundColor: color }}
            />
            <div className="mb-2.5 flex items-center justify-between">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/22">
                {label}
              </span>
              <Icon className="h-3.5 w-3.5 opacity-35" strokeWidth={1.5} style={{ color }} />
            </div>
            <div className="font-mono text-[22px] font-medium leading-none text-white">
              {vaultState.isLoading ? (
                <span className="animate-pulse text-sm text-white/20">loading…</span>
              ) : (
                value
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Main body: tranche monitor + quick actions */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_300px]">
        {/* Tranche monitor */}
        <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
          <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/28">
                Tranche Monitor
              </span>
            </div>
            <span className="font-mono text-[9px] text-white/14">auto-refresh 5s</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  {['Tranche', 'Total Assets', 'NAV / Share', 'AMM Liq.', 'Yield', 'Loss', 'APY'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-5 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.15em] text-white/18"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {TRANCHE_ROWS.map(({ kind, label, color, apy }) => {
                  const t = vd?.tranches.find((tr) => tr.kind === kind);
                  const hasLoss = (t?.cumulativeLoss ?? 0n) > 0n;
                  return (
                    <tr key={kind} className="transition-colors hover:bg-white/[0.015]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-[2px] rounded-full" style={{ backgroundColor: color }} />
                          <span className="font-mono text-[11px] font-semibold" style={{ color }}>
                            {label}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-white/55">
                        ${formatUsdc(t?.totalAssets ?? 0n, 2)}
                      </td>
                      <td
                        className={`px-5 py-3 font-mono text-[11px] ${hasLoss ? 'text-rose-300' : 'text-white/50'}`}
                      >
                        {formatNavQ(t?.navPerShareQ ?? 0n)}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-white/38">
                        ${formatUsdc(t?.ammQuoteBalance ?? 0n, 2)}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] text-emerald-400/65">
                        ${formatUsdc(t?.cumulativeYield ?? 0n, 2)}
                      </td>
                      <td
                        className={`px-5 py-3 font-mono text-[11px] ${hasLoss ? 'text-rose-300' : 'text-white/18'}`}
                      >
                        {hasLoss ? `$${formatUsdc(t?.cumulativeLoss ?? 0n, 2)}` : '—'}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px] font-medium" style={{ color }}>
                        {apy}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Quick actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/22">
              Quick Actions
            </span>
            {pendingApps.length > 0 && (
              <Link href="/admin/loans">
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 font-mono text-[9px] font-bold text-amber-300">
                  {pendingApps.length}
                </span>
              </Link>
            )}
          </div>
          {pendingApps.length > 0 && (
            <Link
              href="/admin/loans"
              className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-4 py-3 transition-all hover:border-amber-500/35 hover:bg-amber-500/[0.08]"
            >
              <div>
                <div className="flex items-center gap-2 text-[12px] font-medium text-amber-300">
                  <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Manage Loan Applications
                </div>
                <div className="mt-0.5 text-[10px] text-white/28">
                  {pendingApps.length} pending review
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-amber-400/50" />
            </Link>
          )}
          {QUICK_LINKS.map(({ label, desc, href, icon: Icon, danger }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all duration-150 ${
                danger
                  ? 'border-rose-500/15 hover:border-rose-500/30 hover:bg-rose-500/[0.04]'
                  : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`h-3.5 w-3.5 shrink-0 ${danger ? 'text-rose-400/60' : 'text-white/25'}`}
                  strokeWidth={1.5}
                />
                <div>
                  <div
                    className={`text-[12px] font-medium ${danger ? 'text-rose-300' : 'text-white/70'}`}
                  >
                    {label}
                  </div>
                  <div className="text-[10px] text-white/25">{desc}</div>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-white/15 shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
