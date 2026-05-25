'use client';

import { useRouter } from 'next/navigation';
import { TrancheVisual } from './TrancheVisual';
import { formatUsdc, stateName } from '@/app/lib/format';
import {
  Building2,
  Database,
  Layers,
  Zap,
  ArrowUpRight,
  ShieldCheck,
  Globe,
  Activity,
  type LucideIcon,
} from 'lucide-react';

interface VaultMarketCardProps {
  vault: any;
}

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
  glow: string;
  accent: string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    label: 'Structured Credit',
    icon: Database,
    iconBg: 'bg-violet-500/[0.08]',
    iconBorder: 'border-violet-500/25',
    iconColor: 'text-violet-300',
    glow: 'shadow-[0_0_24px_rgba(139,92,246,0.10)]',
    accent: 'rgba(139,92,246,0.18)',
  },
  {
    label: 'Institutional SOL',
    icon: Building2,
    iconBg: 'bg-sky-500/[0.08]',
    iconBorder: 'border-sky-500/25',
    iconColor: 'text-sky-300',
    glow: 'shadow-[0_0_24px_rgba(14,165,233,0.10)]',
    accent: 'rgba(14,165,233,0.18)',
  },
  {
    label: 'RWA Financed',
    icon: Layers,
    iconBg: 'bg-emerald-500/[0.08]',
    iconBorder: 'border-emerald-500/25',
    iconColor: 'text-emerald-300',
    glow: 'shadow-[0_0_24px_rgba(16,185,129,0.10)]',
    accent: 'rgba(16,185,129,0.18)',
  },
  {
    label: 'Liquidity Alpha',
    icon: Zap,
    iconBg: 'bg-amber-500/[0.08]',
    iconBorder: 'border-amber-500/25',
    iconColor: 'text-amber-300',
    glow: 'shadow-[0_0_24px_rgba(245,158,11,0.10)]',
    accent: 'rgba(245,158,11,0.18)',
  },
];

function formatTvlShort(value: any): string {
  // Strip trailing dot from formatUsdc(value, 0)
  return formatUsdc(value, 0).replace(/\.$/, '');
}

export function VaultMarketCard({ vault }: VaultMarketCardProps) {
  const router = useRouter();
  const meta = CATEGORIES[vault.id % CATEGORIES.length];
  const Icon = meta.icon;

  const isHighDemand = vault.id === 1;
  const utilization = Number(vault.utilization) || 0;

  const utilColor =
    utilization > 85 ? 'bg-rose-500/60' :
    utilization > 60 ? 'bg-amber-500/60' :
    'bg-emerald-500/50';

  return (
    <div
      onClick={() => router.push(`/earn/${vault.id}`)}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md transition-all duration-300 hover:border-white/[0.18] hover:bg-white/[0.05] cursor-pointer"
      style={{
        backgroundImage: `radial-gradient(ellipse 60% 80% at 100% 0%, ${meta.accent} 0%, transparent 55%)`,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 pb-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${meta.iconBg} ${meta.iconBorder} ${meta.glow}`}>
              <Icon className={`h-5 w-5 ${meta.iconColor}`} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <div className={`font-mono text-[10px] uppercase tracking-[0.22em] ${meta.iconColor} opacity-80`}>
                {meta.label}
              </div>
              <h3 className="mt-1 font-display text-xl text-white tracking-tight leading-none truncate">
                Credit Vault #{vault.id}
              </h3>
            </div>
          </div>

          {/* Status pill */}
          <div className={`shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 backdrop-blur-sm ${
            isHighDemand
              ? 'border-amber-400/25 bg-amber-400/[0.08]'
              : 'border-emerald-400/25 bg-emerald-400/[0.08]'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${
              isHighDemand ? 'bg-amber-400' : 'bg-emerald-400'
            }`} />
            <span className={`font-mono text-[10px] font-bold uppercase tracking-[0.15em] ${
              isHighDemand ? 'text-amber-300' : 'text-emerald-300'
            }`}>
              {isHighDemand ? 'High Demand' : 'Healthy'}
            </span>
          </div>
        </div>

        {/* Hero TVL */}
        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30 mb-1.5">
              Total Value Locked
            </div>
            <div className="font-mono text-3xl font-medium text-white tabular-nums leading-none">
              ${formatTvlShort(vault.totalDeposits)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30 mb-1.5">
              Utilization
            </div>
            <div className="font-mono text-3xl font-medium text-white/85 tabular-nums leading-none">
              {utilization.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Utilization bar */}
        <div className="mt-3 h-1 w-full rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${utilColor}`}
            style={{ width: `${Math.min(utilization, 100)}%` }}
          />
        </div>
      </div>

      {/* ── Capital Structure ──────────────────────────────────────── */}
      <div className="px-6 py-5 border-t border-white/[0.05] bg-black/[0.15]">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="h-3.5 w-3.5 text-white/30" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/40">
            Capital Structure
          </span>
          <div className="h-px flex-1 bg-white/[0.04]" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/25">
            APY
          </span>
        </div>
        <TrancheVisual tranches={vault.tranches} totalDeposits={vault.totalDeposits} />
      </div>

      {/* ── Footer Meta ─────────────────────────────────────────────── */}
      <div className="mt-auto flex items-center justify-between gap-3 px-6 py-4 border-t border-white/[0.05]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-md border border-emerald-500/15 bg-emerald-500/[0.04] px-2 py-1">
            <ShieldCheck className="h-3 w-3 text-emerald-400/70" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-300/70">
              Insured
            </span>
          </span>
          <span className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1">
            <Globe className="h-3 w-3 text-white/40" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              Global
            </span>
          </span>
          <span className="hidden md:flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              {stateName(vault.state)}
            </span>
          </span>
        </div>

        <button className="flex items-center gap-1.5 rounded-full border border-white/[0.10] bg-white/[0.02] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-white/70 transition-all group-hover:border-white group-hover:bg-white group-hover:text-black">
          Open
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>

      {/* Hover indicator */}
      <div className="pointer-events-none absolute top-4 right-4">
        <Activity className="h-3 w-3 text-emerald-400/0 group-hover:text-emerald-400/40 transition-colors animate-pulse" />
      </div>
    </div>
  );
}
