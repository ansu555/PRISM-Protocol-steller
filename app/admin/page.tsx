'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowUpRight,
  Clock,
  FileText,
  MoreHorizontal,
  Shield,
  TrendingUp,
  Vault,
  Zap,
} from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useVaultState } from '@/hooks/useVaultState';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { formatUsdc, formatNavQ } from '@/app/lib/format';
import { TrancheKind } from '@/app/lib/constants';

const TRANCHE_ROWS = [
  { kind: TrancheKind.Prime, label: 'Prime',  color: '#4a9ec9', apy: '5.0%'  },
  { kind: TrancheKind.Core,  label: 'Core',   color: '#d4a83a', apy: '8.0%'  },
  { kind: TrancheKind.Alpha, label: 'Alpha',  color: '#d45c6a', apy: '15.0%' },
] as const;

// Simulated TVL history (replace with real data when available)
function useTvlHistory(currentTvl: bigint) {
  const base = Number(currentTvl) / 1e7;
  return Array.from({ length: 12 }, (_, i) => ({
    month: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][i],
    value: Math.max(0, base * (0.4 + (i / 11) * 0.6) + (Math.sin(i) * base * 0.05)),
  }));
}

export default function AdminOverviewPage() {
  useEffect(() => { document.title = 'Admin Overview | PRISM Protocol'; }, []);

  const { vaultId } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const { applications } = useLoanApplications();

  const vd = vaultState.data;
  const tvl = (vd?.tranches ?? []).reduce((sum, t) => sum + t.totalAssets, 0n);
  const reserveBal = vd?.reserveBalance ?? 0n;
  const lossBucket = vd?.lossBucketBalance ?? 0n;
  const isHealthy = lossBucket === 0n;

  const pendingApps  = applications.filter((a) => a.status === 'pending');
  const approvedApps = applications.filter((a) => a.status === 'approved');
  const totalExposure = approvedApps.reduce((s, a) => s + BigInt(Math.round(a.requestedUSDC * 10_000_000)), 0n);

  const tvlHistory = useTvlHistory(tvl);
  const tvlDisplay = `$${formatUsdc(tvl, 2)}`;

  if (vaultState.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-5 w-5 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
          <span className="font-mono text-[10px] text-white/25 uppercase tracking-widest">Loading…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 min-h-full">

      {/* ── Alerts ───────────────────────────────────────────────── */}
      {(!isHealthy || pendingApps.length > 0) && (
        <div className="space-y-2">
          {!isHealthy && (
            <div className="flex items-center gap-3 rounded-xl border border-rose-500/15 bg-rose-500/[0.04] px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" strokeWidth={1.5} />
              <div className="flex-1">
                <p className="font-sans text-sm font-medium text-rose-300">Loss Event Active</p>
                <p className="font-mono text-[10px] text-rose-400/50">${formatUsdc(lossBucket, 2)} in loss bucket</p>
              </div>
              <Link href="/admin/risk" className="flex items-center gap-1 font-mono text-[10px] text-rose-400 hover:text-rose-300">
                Review <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          )}
          {pendingApps.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3">
              <Clock className="h-4 w-4 shrink-0 text-amber-400" strokeWidth={1.5} />
              <div className="flex-1">
                <p className="font-sans text-sm font-medium text-amber-300">{pendingApps.length} Application{pendingApps.length > 1 ? 's' : ''} Awaiting Review</p>
                <p className="font-mono text-[10px] text-amber-400/50">Pending admin approval</p>
              </div>
              <Link href="/admin/loans" className="flex items-center gap-1 font-mono text-[10px] text-amber-400 hover:text-amber-300">
                Review <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── Main grid: TVL chart + Key metrics ───────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">

        {/* TVL Chart Card */}
        <div className="rounded-2xl border border-white/[0.04] bg-[#0f0f0f] p-6">
          <p className="font-sans text-sm text-white/40 mb-1">Total Value Locked (TVL)</p>
          <p className="font-sans text-4xl font-bold text-white tracking-tight mb-5">{tvlDisplay}</p>

          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={tvlHistory} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e54b73" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#e54b73" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                tick={{ fill: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}
                itemStyle={{ color: '#e54b73' }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, 'TVL']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#e54b73"
                strokeWidth={1.5}
                fill="url(#tvlGrad)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Key Metrics */}
        <div className="rounded-2xl border border-white/[0.04] bg-[#0f0f0f] p-5 flex flex-col gap-4">
          <p className="font-sans text-sm font-medium text-white/70">Key metrics</p>

          <MetricBlock
            label="Loan Applications"
            lines={[
              { text: `Active: ${pendingApps.length}`, color: 'text-white/60' },
              { text: `Completed: ${approvedApps.length}`, color: 'text-emerald-400' },
            ]}
            href="/admin/loans"
            icon={<FileText className="h-4 w-4 text-white/30" strokeWidth={1.5} />}
          />

          <MetricBlock
            label="Vault Reserve"
            lines={[
              { text: `Balance: $${formatUsdc(reserveBal, 2)}`, color: 'text-white/60' },
              { text: isHealthy ? 'No loss events' : 'Loss event active', color: isHealthy ? 'text-emerald-400' : 'text-rose-400' },
            ]}
            href="/admin/vaults"
            icon={<Shield className="h-4 w-4 text-white/30" strokeWidth={1.5} />}
          />

          <MetricBlock
            label="Active Exposure"
            lines={[
              { text: `$${formatUsdc(totalExposure, 2)} deployed`, color: 'text-white/60' },
              { text: `${approvedApps.length} active loan(s)`, color: 'text-[#d4a83a]' },
            ]}
            href="/admin/loans"
            icon={<TrendingUp className="h-4 w-4 text-white/30" strokeWidth={1.5} />}
          />
        </div>
      </div>

      {/* ── Vault / Tranche Cards ─────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-sans text-sm font-medium text-white/60">Credit Tranches</h3>
          <div className="flex items-center gap-2">
            <Link href="/admin/vaults" className="flex items-center gap-1.5 font-mono text-[9px] text-white/25 hover:text-white/60 transition-colors">
              View all <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TRANCHE_ROWS.map(({ kind, label, color, apy }) => {
            const t = vd?.tranches.find((tr) => tr.kind === kind);
            const hasLoss = (t?.cumulativeLoss ?? 0n) > 0n;
            return (
              <div key={kind} className="rounded-2xl border border-white/[0.04] bg-[#0f0f0f] p-5 group hover:border-white/[0.08] transition-all">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
                      <Vault className="h-4 w-4" style={{ color }} strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="font-sans text-sm font-semibold" style={{ color }}>{label}</p>
                      <p className="font-mono text-[9px] text-white/25">{apy} APY</p>
                    </div>
                  </div>
                  <button className="text-white/20 hover:text-white/50 transition-colors">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="font-sans text-[10px] text-white/25 mb-1">Total Assets</p>
                    <p className="font-sans text-xl font-bold text-white tabular-nums">${formatUsdc(t?.totalAssets ?? 0n, 2)}</p>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-white/25">NAV / share</span>
                    <span className={`font-mono font-medium ${hasLoss ? 'text-rose-400' : 'text-white/60'}`}>
                      {formatNavQ(t?.navPerShareQ ?? 0n)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-mono text-white/25">Cumul. yield</span>
                    <span className="font-mono text-emerald-400/80">${formatUsdc(t?.cumulativeYield ?? 0n, 2)}</span>
                  </div>
                  {hasLoss && (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-white/25">Loss</span>
                      <span className="font-mono text-rose-400">${formatUsdc(t?.cumulativeLoss ?? 0n, 2)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <div>
        <p className="font-sans text-sm font-medium text-white/60 mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Inject Yield',   icon: Zap,      href: '/admin/capital',  color: '#4a9ec9' },
            { label: 'Credit Event',   icon: AlertCircle, href: '/admin/risk',  color: '#d45c6a' },
            { label: 'Loan Review',    icon: FileText,  href: '/admin/loans',   color: '#d4a83a' },
            { label: 'Protocol Setup', icon: Shield,    href: '/admin/protocol',color: '#a78bfa' },
          ].map(({ label, icon: Icon, href, color }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-[#0f0f0f] px-4 py-3.5 hover:border-white/[0.08] hover:bg-white/[0.015] transition-all group"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}15` }}>
                <Icon className="h-4 w-4" style={{ color }} strokeWidth={1.5} />
              </div>
              <div>
                <p className="font-sans text-sm text-white/70 group-hover:text-white transition-colors">{label}</p>
              </div>
              <ArrowUpRight className="h-3.5 w-3.5 text-white/15 group-hover:text-white/40 ml-auto transition-colors" />
            </Link>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── Helper component ──────────────────────────────────────────────────────────

function MetricBlock({
  label, lines, href, icon,
}: {
  label: string;
  lines: { text: string; color: string }[];
  href: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="flex items-start gap-3 rounded-xl border border-white/[0.03] bg-black/20 p-3.5 hover:border-white/[0.06] hover:bg-white/[0.01] transition-all group">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="font-sans text-xs text-white/30 mb-1">{label}</p>
        {lines.map((l, i) => (
          <p key={i} className={`font-mono text-[11px] ${l.color}`}>{l.text}</p>
        ))}
      </div>
      <ArrowUpRight className="h-3.5 w-3.5 text-white/10 group-hover:text-white/30 transition-colors mt-0.5 shrink-0" />
    </Link>
  );
}
