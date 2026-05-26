'use client';

import { useConnection } from '@/components/providers/stellar-wallet-context';
import { ChevronDown } from 'lucide-react';
import { getNetworkName, formatUsdc } from '@/app/lib/format';
import { useVaultState } from '@/hooks/useVaultState';
import { useAllVaults } from '@/hooks/useAllVaults';
import { useAdminVault } from '@/components/admin/AdminVaultContext';

export function AdminTopbar() {
  const { connection } = useConnection();
  const { vaultId, setVaultId } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const allVaults = useAllVaults();
  const network = getNetworkName(connection.rpcEndpoint);

  const lossBucket = vaultState.data?.lossBucketBalance ?? 0n;
  const isHealthy = lossBucket === 0n;
  const tvl = (vaultState.data?.tranches ?? []).reduce((sum, t) => sum + t.totalAssets, 0n);
  const vaults = allVaults.data ?? [];

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-white/[0.06] bg-background px-6">
      {/* Vault selector */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15">Active Vault</span>
        <div className="relative group">
          <select
            value={vaultId}
            onChange={(e) => setVaultId(Number(e.target.value))}
            className="cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-white/[0.04] py-1 pl-3 pr-8 font-mono text-[12px] text-white/60 transition-all hover:bg-white/[0.06] hover:text-white focus:border-white/20 focus:outline-none"
          >
            {vaults.length > 0
              ? vaults.map((v) => (
                  <option key={v.id} value={v.id}>
                    VAULT #{v.id}
                  </option>
                ))
              : <option value={0}>VAULT #0</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20 group-hover:text-white/40 transition-colors" />
        </div>
      </div>

      <div className="h-4 w-px bg-white/[0.05]" />

      {/* TVL */}
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/15">Protocol TVL</span>
        <span className="font-display text-lg text-white/70">${formatUsdc(tvl, 0)}</span>
      </div>

      <div className="h-4 w-px bg-white/[0.05]" />

      {/* Refresh indicator */}
      {vaultState.isFetching && (
        <div className="flex items-center gap-2">
           <div className="h-1 w-1 rounded-full bg-purple-400 animate-ping" />
           <span className="font-mono text-[10px] text-purple-400/60 uppercase tracking-widest">Polling State</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-4">
        {/* Protocol health */}
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-all ${
            isHealthy
              ? 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400/80 shadow-[0_0_12px_rgba(16,185,129,0.05)]'
              : 'border-rose-500/20 bg-rose-500/[0.05] text-rose-400/80 shadow-[0_0_12px_rgba(244,63,94,0.05)]'
          }`}
        >
          <div
            className={`h-1.5 w-1.5 rounded-full bg-current ${isHealthy ? 'animate-pulse' : ''}`}
          />
          {isHealthy ? 'Operational' : 'Default Event'}
        </div>

        {/* Network */}
        <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-white/30">
          <div className="h-1.5 w-1.5 rounded-full bg-amber-500/60" />
          {network}
        </div>

        {/* Program ID */}
        {vaultState.data?.programIds.core && (
          <div className="hidden items-center gap-2 rounded-lg bg-white/[0.02] px-2 py-1 font-mono text-[10px] text-white/15 xl:flex">
            <span className="uppercase opacity-40">Core</span>
            <span>{vaultState.data.programIds.core.toBase58().slice(0, 6)}…</span>
          </div>
        )}
      </div>
    </header>
  );
}
