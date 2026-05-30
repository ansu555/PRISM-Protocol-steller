'use client';

import { useMemo, useState } from 'react';
import { CheckCircle2, Database, Loader2, RefreshCw, Shield, Terminal, Zap } from 'lucide-react';
import { toast } from 'sonner';

import { ACTIVE_CONTRACTS, CONTRACTS } from '@/app/lib/addresses';
import { formatUsdc, shortKey } from '@/app/lib/format';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { Skeleton } from '@/components/ui/skeleton';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { useVaultState } from '@/hooks/useVaultState';

export default function ProtocolPage() {
  const wallet = useStellarWallet();
  const { vaultId, addLog } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const [running, setRunning] = useState(false);

  const rows = useMemo(() => [
    { label: 'prism_core', value: ACTIVE_CONTRACTS.prismCore || 'not deployed' },
    { label: 'USDC SAC', value: ACTIVE_CONTRACTS.usdc || 'not configured' },
    { label: 'Soroswap router', value: ACTIVE_CONTRACTS.soroswapRouter || 'not configured' },
    { label: 'Reflector', value: ACTIVE_CONTRACTS.reflector || 'not configured' },
    { label: 'Soroban RPC', value: ACTIVE_CONTRACTS.rpcUrl },
  ], []);

  async function runSetupChecklist() {
    setRunning(true);
    try {
      addLog('Protocol setup checklist reviewed for Stellar testnet. No mainnet deploy executed.');
      toast.info('Use the Soroban deployment scripts for privileged setup. Mainnet deploy is intentionally skipped.');
    } finally {
      setRunning(false);
    }
  }

  if (vaultState.isLoading) {
    return (
      <div className="space-y-8 p-10">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-96 rounded-[2rem]" />
      </div>
    );
  }

  const tvl = (vaultState.data?.tranches ?? []).reduce((sum, tranche) => sum + tranche.totalAssets, 0n);

  return (
    <div className="min-h-full bg-background p-10">
      <div className="mx-auto max-w-[1500px] space-y-10">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-display text-3xl text-white">Protocol Setup</h1>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.28em] text-white/25">
              Stellar cutover registry · Vault #{vaultId}
            </p>
          </div>
          <button
            onClick={runSetupChecklist}
            disabled={running || !wallet.address}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-widest text-black transition hover:bg-white/90 disabled:opacity-40"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            Review Setup
          </button>
        </header>

        <div className="grid gap-5 md:grid-cols-4">
          {[
            { label: 'Config', value: vaultState.data?.config ? 'Initialized' : 'Pending', icon: Shield },
            { label: 'Vault State', value: vaultState.data?.vault ? 'Readable' : 'Missing', icon: Database },
            { label: 'TVL', value: `$${formatUsdc(tvl, 0)}`, icon: CheckCircle2 },
            { label: 'Network', value: CONTRACTS.testnet.passphrase.includes('Test') ? 'Testnet' : 'Mainnet', icon: Terminal },
          ].map((item) => (
            <div key={item.label} className="rounded-3xl border border-white/[0.06] bg-white/[0.02] p-6">
              <item.icon className="mb-5 h-5 w-5 text-white/30" />
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">{item.label}</div>
              <div className="mt-2 font-display text-2xl text-white">{item.value}</div>
            </div>
          ))}
        </div>

        <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/35">Contract Registry</h2>
            <button onClick={() => vaultState.refetch()} className="text-white/35 hover:text-white">
              <RefreshCw className={`h-4 w-4 ${vaultState.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="grid gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-4 md:grid-cols-[180px_1fr]">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">{row.label}</div>
                <div className="truncate font-mono text-xs text-white/60">{row.value ? shortKey(row.value) : row.value}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
