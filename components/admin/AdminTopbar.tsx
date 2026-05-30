'use client';

import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useEffect } from 'react';
import { getNetworkName } from '@/app/lib/format';
import { useConnection } from '@/components/providers/stellar-wallet-provider';
import { useVaultState } from '@/hooks/useVaultState';
import { useAllVaults } from '@/hooks/useAllVaults';
import { useAdminVault } from '@/components/admin/AdminVaultContext';

const BREADCRUMBS: Record<string, string> = {
  '/admin':              'Dashboard Overview',
  '/admin/loans':        'Loan Applications',
  '/admin/vaults':       'Vault Registry',
  '/admin/capital':      'Capital Management',
  '/admin/risk':         'Risk Engine',
  '/admin/observability':'Observability',
  '/admin/protocol':     'Protocol Setup',
};

export function AdminTopbar() {
  const pathname = usePathname();
  const { connection } = useConnection();
  const { vaultId, setVaultId } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const allVaults = useAllVaults();

  const vaults = allVaults.data ?? [];
  useEffect(() => {
    if (vaults.length > 0 && !vaults.find((v) => v.id === vaultId)) {
      setVaultId(vaults[0].id);
    }
  }, [vaults, vaultId, setVaultId]);

  const network = getNetworkName(connection.rpcEndpoint);
  const lossBucket = vaultState.data?.lossBucketBalance ?? 0n;
  const isHealthy = lossBucket === 0n;

  // Match longest prefix
  const label = Object.entries(BREADCRUMBS)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([key]) => pathname === key || pathname.startsWith(key + '/'))?.[1]
    ?? 'Admin';

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/[0.04] bg-[#0a0a0a] px-6">
      {/* Breadcrumb */}
      <h2 className="font-sans text-sm font-medium text-white/70">{label}</h2>

      {/* Right controls */}
      <div className="flex items-center gap-3">
        {/* Vault selector */}
        <div className="relative">
          <select
            value={vaultId}
            onChange={(e) => setVaultId(Number(e.target.value))}
            className="cursor-pointer appearance-none rounded-lg border border-white/[0.06] bg-white/[0.03] py-1 pl-3 pr-7 font-mono text-[10px] text-white/40 hover:text-white/70 transition-colors focus:outline-none"
          >
            {vaults.length > 0
              ? vaults.map((v) => <option key={v.id} value={v.id}>Vault #{v.id}</option>)
              : <option value={0}>Vault #0</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/20" />
        </div>

        <div className="h-3 w-px bg-white/[0.06]" />

        {/* Health */}
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest border transition-all ${
          isHealthy
            ? 'border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-400/70'
            : 'border-rose-500/20 bg-rose-500/[0.04] text-rose-400/70'
        }`}>
          <div className={`h-1.5 w-1.5 rounded-full ${isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
          {isHealthy ? 'Healthy' : 'Alert'}
        </div>

        {/* Network */}
        <div className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-white/25">
          <div className="h-1.5 w-1.5 rounded-full bg-[#d4a83a]/60" />
          {network}
        </div>
      </div>
    </header>
  );
}
