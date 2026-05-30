'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  Coins,
  Database,
  Droplets,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';

import { HORIZON_URL, USDC_ASSET_CODE, USDC_ASSET_ISSUER } from '@/app/lib/constants';
import { formatUsdc } from '@/app/lib/format';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useVaultState } from '@/hooks/useVaultState';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

export default function CapitalPage() {
  const wallet = useStellarWallet();
  const { vaultId, addLog } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const { applications } = useLoanApplications();
  const [localLog, setLocalLog] = useState<string[]>([]);
  const [fundAmount, setFundAmount] = useState('100000');
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const vd = vaultState.data;
    const tvl = (vd?.tranches ?? []).reduce((sum, tranche) => sum + tranche.totalAssets, 0n);
    const reserveBal = vd?.reserveBalance ?? 0n;
    const approvedApps = applications.filter((app) => app.status === 'approved');
    const totalExposure = approvedApps.reduce(
      (sum, app) => sum + BigInt(Math.round(app.requestedUSDC * 10_000_000)),
      0n,
    );
    const utilization = tvl + reserveBal > 0n
      ? (Number((totalExposure * 10_000n) / (tvl + reserveBal)) / 100).toFixed(1)
      : '0.0';
    const accruedYield = (vd?.tranches ?? []).reduce((sum, tranche) => sum + tranche.cumulativeYield, 0n);
    return { tvl, reserveBal, totalExposure, utilization, accruedYield };
  }, [applications, vaultState.data]);

  function log(message: string) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`;
    setLocalLog((current) => [line, ...current].slice(0, 20));
    addLog(message);
  }

  async function requestTestnetFunding() {
    setBusy(true);
    try {
      if (!wallet.address) throw new Error('Connect a Stellar wallet first');
      log(`Funding request recorded for ${fundAmount} ${USDC_ASSET_CODE} to ${wallet.address.slice(0, 8)}...`);
      toast.info('USDC minting is handled by the Soroban token issuer script in this build. Mainnet deployment was intentionally skipped.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Funding request failed: ${message}`);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (vaultState.isLoading) {
    return (
      <div className="min-h-full bg-background p-10 font-sans">
        <div className="mx-auto max-w-[1600px] space-y-10">
          <Skeleton className="h-24 rounded-[2rem]" />
          <Skeleton className="h-96 rounded-[2.5rem]" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background p-10 font-sans">
      <div className="mx-auto max-w-[1600px] space-y-10">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-3xl tracking-tight text-white">Capital Operations</h1>
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-400/80">
                Stellar Testnet
              </div>
            </div>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-white/20">
              Treasury visibility · USDC SAC funding · Vault #{vaultId}
            </p>
          </div>
          <button
            onClick={() => vaultState.refetch()}
            className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-white/40 transition-all hover:text-white"
          >
            <RefreshCw className={`h-4 w-4 ${vaultState.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
          {[
            { label: 'Protocol TVL', value: `$${formatUsdc(stats.tvl, 0)}`, icon: TrendingUp, color: 'text-emerald-400' },
            { label: 'Reserve', value: `$${formatUsdc(stats.reserveBal, 0)}`, icon: Database, color: 'text-amber-400' },
            { label: 'Exposure', value: `$${formatUsdc(stats.totalExposure, 0)}`, icon: Activity, color: 'text-sky-400' },
            { label: 'Utilization', value: `${stats.utilization}%`, icon: ShieldCheck, color: 'text-purple-300' },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{item.label}</span>
                <item.icon className={`h-4 w-4 ${item.color}`} />
              </div>
              <div className="mt-5 font-display text-3xl text-white">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_420px]">
          <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10">
            <div className="mb-8 flex items-center gap-3">
              <Droplets className="h-5 w-5 text-emerald-300/70" />
              <h2 className="font-display text-xl text-white/90">USDC Funding Console</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-white/45">
              Phase 4 removed the old token faucet. Testnet USDC is now issued through the Stellar SAC/deployer tooling, while mainnet deployment stays paused until audit.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto]">
              <input
                value={fundAmount}
                onChange={(event) => setFundAmount(event.target.value)}
                className="rounded-2xl border border-white/[0.08] bg-black/30 px-5 py-4 font-mono text-sm text-white outline-none focus:border-emerald-400/40"
                placeholder="USDC amount"
              />
              <button
                onClick={requestTestnetFunding}
                disabled={busy || !wallet.address}
                className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-widest text-black transition hover:bg-emerald-300 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                Record Funding
              </button>
            </div>
            <div className="mt-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4 font-mono text-[11px] text-white/35">
              Asset: {USDC_ASSET_CODE} · Issuer {USDC_ASSET_ISSUER.slice(0, 8)}... · Horizon {HORIZON_URL.replace('https://', '')}
            </div>
          </section>

          <aside className="rounded-[2rem] border border-white/[0.08] bg-black/30 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/35">Operations Log</h3>
              <ArrowUpRight className="h-4 w-4 text-white/20" />
            </div>
            <div className="space-y-2">
              {(localLog.length ? localLog : ['No capital actions recorded this session.']).map((entry) => (
                <div key={entry} className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-3 font-mono text-[11px] text-white/45">
                  {entry}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
