'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, Database, Layers, Loader2, RefreshCw, ShieldAlert, TrendingUp, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { TrancheKind } from '@/app/lib/constants';
import { formatNavQ, formatUsdc } from '@/app/lib/format';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { useReactivateVault } from '@/hooks/useReactivateVault';
import { useVaultState } from '@/hooks/useVaultState';

const TRANCHE_ROWS = [
  { kind: TrancheKind.Prime, label: 'PRIME', color: 'text-sky-400' },
  { kind: TrancheKind.Core, label: 'CORE', color: 'text-amber-400' },
  { kind: TrancheKind.Alpha, label: 'ALPHA', color: 'text-rose-400' },
] as const;

export default function AdminVaultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const vaultId = Number(id);
  const { setVaultId, addLog } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const reactivate = useReactivateVault(vaultId);
  const [lossAmount, setLossAmount] = useState('6500');
  const [seedAmount, setSeedAmount] = useState('1000');
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const vd = vaultState.data;
    const tvl = (vd?.tranches ?? []).reduce((sum, tranche) => sum + tranche.totalAssets, 0n);
    const reserveBal = vd?.reserveBalance ?? 0n;
    const lossBucketBal = vd?.lossBucketBalance ?? 0n;
    const accruedYield = (vd?.tranches ?? []).reduce((sum, tranche) => sum + tranche.cumulativeYield, 0n);
    const utilization = tvl + reserveBal > 0n ? (Number((tvl * 10_000n) / (tvl + reserveBal)) / 100).toFixed(1) : '0.0';
    return { tvl, reserveBal, lossBucketBal, accruedYield, utilization };
  }, [vaultState.data]);

  function recordAction(kind: 'loss' | 'seed') {
    setBusy(true);
    const amount = kind === 'loss' ? lossAmount : seedAmount;
    const label = kind === 'loss' ? 'credit event' : 'Soroswap seed liquidity';
    setTimeout(() => {
      addLog(`Requested ${label} for Vault #${vaultId} (${amount} USDC). Use the Stellar admin signer script to submit on testnet.`);
      toast.info(`${label} recorded locally. Mainnet deploy remains skipped.`);
      setBusy(false);
    }, 250);
  }

  return (
    <div className="min-h-full bg-background p-10">
      <div className="mx-auto max-w-[1500px] space-y-10">
        <Link href="/admin/vaults" className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-white/35 hover:text-white">
          <ArrowLeft className="h-3 w-3" /> Vault Registry
        </Link>

        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-4xl text-white">Vault #{vaultId}</h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.28em] text-white/25">
              Stellar contract state · Soroswap composition · Reflector-ready risk
            </p>
          </div>
          <button
            onClick={() => {
              setVaultId(vaultId);
              vaultState.refetch();
            }}
            className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-white/40 hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${vaultState.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </header>

        <div className="grid gap-5 md:grid-cols-4">
          {[
            { label: 'TVL', value: `$${formatUsdc(stats.tvl, 0)}`, icon: BarChart3 },
            { label: 'Reserve', value: `$${formatUsdc(stats.reserveBal, 0)}`, icon: Database },
            { label: 'Loss Bucket', value: `$${formatUsdc(stats.lossBucketBal, 0)}`, icon: ShieldAlert },
            { label: 'Utilization', value: `${stats.utilization}%`, icon: TrendingUp },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
              <item.icon className="mb-5 h-5 w-5 text-white/30" />
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{item.label}</div>
              <div className="mt-2 font-display text-2xl text-white">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8">
            <div className="mb-6 flex items-center gap-3">
              <Layers className="h-5 w-5 text-white/35" />
              <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/35">Tranche State</h2>
            </div>
            <div className="space-y-3">
              {TRANCHE_ROWS.map((row) => {
                const tranche = vaultState.data?.tranches.find((item) => item.kind === row.kind);
                return (
                  <div key={row.kind} className="grid gap-4 rounded-2xl border border-white/[0.05] bg-black/20 p-4 md:grid-cols-4">
                    <div className={`font-display text-xl ${row.color}`}>{row.label}</div>
                    <div className="font-mono text-xs text-white/50">Assets ${formatUsdc(tranche?.totalAssets ?? 0n, 2)}</div>
                    <div className="font-mono text-xs text-white/50">NAV {formatNavQ(tranche?.navPerShareQ ?? 0n)}</div>
                    <div className="font-mono text-xs text-white/50">Yield ${formatUsdc(tranche?.cumulativeYield ?? 0n, 2)}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <aside className="space-y-5">
            <div className="rounded-[2rem] border border-rose-400/15 bg-rose-400/[0.05] p-6">
              <h3 className="font-display text-xl text-white">Credit Event</h3>
              <p className="mt-2 text-sm text-white/40">Records the intended loss cascade amount for the Stellar admin signer flow.</p>
              <input value={lossAmount} onChange={(event) => setLossAmount(event.target.value)} className="mt-5 w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 font-mono text-white outline-none" />
              <button onClick={() => recordAction('loss')} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-400 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-black disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Record Default
              </button>
            </div>

            <div className="rounded-[2rem] border border-emerald-400/15 bg-emerald-400/[0.05] p-6">
              <h3 className="font-display text-xl text-white">Seed Liquidity</h3>
              <p className="mt-2 text-sm text-white/40">Soroswap seeding is now external composition, not a protocol AMM call.</p>
              <input value={seedAmount} onChange={(event) => setSeedAmount(event.target.value)} className="mt-5 w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 font-mono text-white outline-none" />
              <button onClick={() => recordAction('seed')} disabled={busy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-black disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Record Seed
              </button>
            </div>

            <button onClick={() => reactivate.mutate()} disabled={reactivate.isPending} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-white/45 hover:text-white disabled:opacity-40">
              {reactivate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Reactivate Notice
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}
