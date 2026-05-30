'use client';

import { useRouter } from 'next/navigation';
import { TrancheVisual } from './TrancheVisual';
import { formatUsdc, stateName } from '@/app/lib/format';
import { Building2, Database, Layers, Zap, ArrowUpRight, ShieldCheck, type LucideIcon } from 'lucide-react';

interface VaultMarketCardProps {
  vault: any;
}

interface CategoryMeta {
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconBorder: string;
  iconColor: string;
}

const CATEGORIES: CategoryMeta[] = [
  { label: 'Structured Credit', icon: Database,  iconBg: 'rgba(139,92,246,0.06)',  iconBorder: 'rgba(139,92,246,0.15)', iconColor: '#a78bfa' },
  { label: 'Institutional SOL', icon: Building2, iconBg: 'rgba(14,165,233,0.06)',   iconBorder: 'rgba(14,165,233,0.15)', iconColor: '#7dd3fc' },
  { label: 'RWA Financed',      icon: Layers,    iconBg: 'rgba(16,185,129,0.06)',   iconBorder: 'rgba(16,185,129,0.15)', iconColor: '#6ee7b7' },
  { label: 'Liquidity Alpha',   icon: Zap,       iconBg: 'rgba(245,158,11,0.06)',   iconBorder: 'rgba(245,158,11,0.15)', iconColor: '#fcd34d' },
];

function fmtTvl(value: any): string {
  return formatUsdc(value, 0).replace(/\.$/, '');
}

export function VaultMarketCard({ vault }: VaultMarketCardProps) {
  const router = useRouter();
  const meta = CATEGORIES[vault.id % CATEGORIES.length];
  const Icon = meta.icon;

  const utilization = Number(vault.utilization) || 0;
  const isHighDemand = vault.id === 1;

  const minApy = vault.tranches[0] ? (vault.tranches[0].targetApyBps / 100).toFixed(1) : '5.0';
  const maxApy = vault.tranches.length > 1
    ? (vault.tranches[vault.tranches.length - 1].targetApyBps / 100).toFixed(1)
    : minApy;

  const utilBarColor =
    utilization > 85 ? 'bg-rose-400/40' :
    utilization > 60 ? 'bg-amber-400/40' :
    'bg-emerald-400/30';

  return (
    <div
      onClick={() => router.push(`/earn/${vault.id}`)}
      className="group flex flex-col rounded-2xl border border-white/[0.03] bg-[#0c0c0f] cursor-pointer transition-all duration-200 hover:bg-[#0e0e12] hover:-translate-y-0.5 hover:border-white/[0.06]"
    >
      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
            style={{ backgroundColor: meta.iconBg, borderColor: meta.iconBorder }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: meta.iconColor }} strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <div className="font-mono text-[9px] text-white/30 truncate">{meta.label}</div>
            <h3 className="font-sans text-sm font-semibold text-white/90 leading-tight truncate">
              Credit Vault #{vault.id}
            </h3>
          </div>
        </div>

        <div className={`shrink-0 flex items-center gap-1 rounded-full border px-2 py-0.5 ${
          isHighDemand ? 'border-amber-500/[0.08] bg-amber-500/[0.02]' : 'border-emerald-500/[0.08] bg-emerald-500/[0.02]'
        }`}>
          <span className={`h-1 w-1 rounded-full animate-pulse ${isHighDemand ? 'bg-amber-400/80' : 'bg-emerald-400/80'}`} />
          <span className={`font-mono text-[9px] ${isHighDemand ? 'text-amber-400/80' : 'text-emerald-400/80'}`}>
            {isHighDemand ? 'High Demand' : 'Active'}
          </span>
        </div>
      </div>

      {/* ── Primary metrics ──────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 px-5 pb-4">
        <div>
          <div className="font-mono text-[9px] text-white/25 mb-0.5">TVL</div>
          <div className="font-mono text-base font-medium text-white/85 tabular-nums leading-none">
            ${fmtTvl(vault.totalDeposits)}
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] text-white/25 mb-0.5">APY</div>
          <div className="font-mono text-base font-medium text-emerald-400/75 tabular-nums leading-none">
            {minApy === maxApy ? `${minApy}%` : `${minApy}–${maxApy}%`}
          </div>
        </div>
        <div>
          <div className="font-mono text-[9px] text-white/25 mb-0.5">Util.</div>
          <div className="font-mono text-base font-medium text-white/65 tabular-nums leading-none">
            {utilization.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* ── Utilization bar ──────────────────────────── */}
      <div className="px-5 pb-4">
        <div className="h-0.5 w-full rounded-full bg-white/[0.04] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${utilBarColor}`}
            style={{ width: `${Math.min(utilization, 100)}%` }}
          />
        </div>
      </div>

      {/* ── Allocation ───────────────────────────────── */}
      <div className="px-5 pb-4 border-t border-white/[0.025] pt-4">
        <div className="font-mono text-[9px] text-white/25 mb-2">Allocation</div>
        <TrancheVisual tranches={vault.tranches} totalDeposits={vault.totalDeposits} />
      </div>

      {/* ── Footer ───────────────────────────────────── */}
      <div className="mt-auto flex items-center justify-between px-5 py-3.5 border-t border-white/[0.025]">
        <div className="flex items-center gap-1.5">
          <span className="flex items-center gap-1 rounded border border-emerald-500/[0.08] px-1.5 py-0.5 font-mono text-[9px] text-emerald-400/50">
            <ShieldCheck className="h-2.5 w-2.5" />
            Insured
          </span>
          <span className="hidden sm:flex items-center gap-1 rounded border border-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-white/25">
            {stateName(vault.state)}
          </span>
        </div>
        <button className="group/btn flex items-center gap-1 font-mono text-[10px] text-white/35 hover:text-white/70 transition-colors">
          Deposit
          <ArrowUpRight className="h-3 w-3 group-hover/btn:text-[#e54b73] transition-colors" />
        </button>
      </div>
    </div>
  );
}
