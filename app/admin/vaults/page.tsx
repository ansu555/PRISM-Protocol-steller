'use client';

import { ChevronRight, Layers, Loader2, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';

import { formatUsdc } from '@/app/lib/format';
import { TrancheKind } from '@/app/lib/constants';
import { useAllVaults } from '@/hooks/useAllVaults';
import { useVaultState } from '@/hooks/useVaultState';
import { Skeleton } from '@/components/ui/skeleton';

function VaultCard({ vaultId }: { vaultId: number }) {
  const vaultState = useVaultState(vaultId);
  const vd = vaultState.data;
  
  if (vaultState.isLoading) {
    return <Skeleton className="h-64 rounded-2xl bg-white/[0.02] border border-white/[0.06]" />;
  }

  const tvl = (vd?.tranches ?? []).reduce((s, t) => s + t.totalAssets, 0n);
  const reserveBal = vd?.reserveBalance ?? 0n;
  const lossBal = vd?.lossBucketBalance ?? 0n;
  const isHealthy = lossBal === 0n;
  const stateLabel = vd?.vault
    ? Object.keys(vd.vault.state ?? {})[0] ?? 'active'
    : 'active';

  return (
    <Link 
      href={`/admin/vaults/${vaultId}`}
      className="group block overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] transition-all hover:border-purple-500/30 hover:bg-white/[0.04] hover:shadow-[0_0_30px_rgba(168,85,247,0.05)]"
    >
      <div className="flex items-center justify-between border-b border-white/[0.05] px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] font-mono text-[13px] font-bold text-white/50 transition-colors group-hover:border-purple-500/30 group-hover:bg-purple-500/10 group-hover:text-purple-300">
            #{vaultId}
          </div>
          <div>
            <div className="font-display text-lg tracking-tight text-white/90">Vault Pool {vaultId}</div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-white/20">{stateLabel}</div>
          </div>
        </div>
        <div className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${
          isHealthy
            ? 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400'
            : 'border-rose-500/20 bg-rose-500/[0.05] text-rose-400'
        }`}>
          <div className={`h-1.5 w-1.5 rounded-full bg-current ${isHealthy ? 'animate-pulse' : ''}`} />
          {isHealthy ? 'Healthy' : 'Breached'}
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-white/[0.04]">
        {[
          { label: 'Total TVL',     value: `$${formatUsdc(tvl, 0)}`, isMetric: true },
          { label: 'Reserve Cap', value: `$${formatUsdc(reserveBal, 0)}` },
          { label: 'Loss Pool',    value: lossBal > 0n ? `$${formatUsdc(lossBal, 0)}` : '0.00', warn: lossBal > 0n },
        ].map(({ label, value, warn, isMetric }) => (
          <div key={label} className="px-6 py-5">
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15 mb-2">{label}</div>
            <div className={`font-display text-xl leading-none ${warn ? 'text-rose-300' : isMetric ? 'text-white' : 'text-white/60'}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="border-t border-white/[0.04] px-6 py-4 bg-white/[0.01]">
        <div className="flex items-center justify-between mb-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15">Liquidity Tranches</div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-white/10 group-hover:text-purple-400/50 transition-colors">
            Performance <ChevronRight className="h-3 w-3" />
          </div>
        </div>
        <div className="flex gap-5">
          {[
            { kind: TrancheKind.Prime, label: 'PRIME', color: '#38596a' },
            { kind: TrancheKind.Core,  label: 'CORE',  color: '#ad7b21' },
            { kind: TrancheKind.Alpha, label: 'ALPHA', color: '#9f442b' },
          ].map(({ kind, label, color }) => {
            const t = vd?.tranches.find((tr) => tr.kind === kind);
            return (
              <div key={label} className="flex items-center gap-2">
                <div className="h-3 w-0.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="font-mono text-[11px] font-medium tracking-tight" style={{ color: `${color}cc` }}>
                  {label}: <span className="text-white/40">${formatUsdc(t?.totalAssets ?? 0n, 0)}</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}

export default function VaultsPage() {
  const allVaults = useAllVaults();
  const vaults = allVaults.data ?? [];

  return (
    <div className="space-y-10 p-10 bg-background min-h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-white">Vault Management</h1>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/20">
            Programmable credit infrastructure · Monitor pool health
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => allVaults.refetch()}
            disabled={allVaults.isFetching}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/30 transition-all hover:bg-white/[0.05] hover:text-white/70 disabled:opacity-40 shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 ${allVaults.isFetching ? 'animate-spin' : ''}`} strokeWidth={1.5} />
          </button>
          <Link
            href="/admin/vaults/new"
            className="flex items-center gap-2 rounded-xl border border-purple-500/25 bg-purple-500/[0.1] px-5 py-2.5 font-mono text-xs uppercase tracking-widest text-purple-200 transition-all hover:bg-purple-500/[0.18] shadow-lg shadow-purple-500/5"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Deploy Pool
          </Link>
        </div>
      </div>

      {/* Vault list */}
      {allVaults.isLoading ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
           <Skeleton className="h-64 rounded-2xl" />
           <Skeleton className="h-64 rounded-2xl" />
           <Skeleton className="h-64 rounded-2xl" />
           <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : vaults.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/[0.05] bg-white/[0.01] py-28 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.03]">
            <Layers className="h-8 w-8 text-white/10" strokeWidth={1} />
          </div>
          <div>
            <p className="text-sm font-medium text-white/40">No active pools detected</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-white/15">Initialize via configuration sequence</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {vaults.map((v) => (
            <VaultCard key={v.id} vaultId={v.id} />
          ))}
        </div>
      )}
    </div>
  );
}
