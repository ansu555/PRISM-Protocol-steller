'use client';

import { useState } from 'react';
import { Copy, Database, Eye, Filter, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { ACTIVE_CONTRACTS, CONTRACTS } from '@/app/lib/addresses';
import { formatNavQ, formatUsdc, shortKey } from '@/app/lib/format';
import { TrancheKind } from '@/app/lib/constants';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { useVaultState } from '@/hooks/useVaultState';

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`Copied ${label}`);
}

function AddressRow({ label, value, note, balance }: { label: string; value: string; note?: string; balance?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-2.5 transition-colors hover:bg-white/[0.03]">
      <div className="w-40 shrink-0">
        <div className="font-mono text-[10px] text-white/60">{label}</div>
        {note && <div className="font-mono text-[9px] text-white/22">{note}</div>}
      </div>
      <div className="flex-1 truncate font-mono text-[10px] text-white/35">{value}</div>
      {balance !== undefined && <div className="w-28 shrink-0 text-right font-mono text-[10px] text-emerald-400/70">{balance}</div>}
      <button onClick={() => copyToClipboard(value, label)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/20 transition-colors hover:text-white/60">
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function ObservabilityPage() {
  const { vaultId, log, clearLog } = useAdminVault();
  const [logFilter, setLogFilter] = useState('');
  const [registryOpen, setRegistryOpen] = useState(true);
  const vaultState = useVaultState(vaultId);
  const vd = vaultState.data;

  const getTranche = (kind: TrancheKind) => vd?.tranches.find((tranche) => tranche.kind === kind);
  const tP = getTranche(TrancheKind.Prime);
  const tC = getTranche(TrancheKind.Core);
  const tA = getTranche(TrancheKind.Alpha);

  const filteredLog = logFilter
    ? log.filter((line) => line.toLowerCase().includes(logFilter.toLowerCase()))
    : log;

  const groups = [
    {
      title: 'Core Contracts',
      rows: [
        { label: 'prism_core', value: ACTIVE_CONTRACTS.prismCore, note: `vault #${vaultId}` },
        { label: 'USDC SAC', value: ACTIVE_CONTRACTS.usdc, balance: vd?.reserveBalance !== undefined ? `$${formatUsdc(vd.reserveBalance, 2)}` : undefined },
        { label: 'Soroswap Router', value: ACTIVE_CONTRACTS.soroswapRouter },
        { label: 'Soroswap Factory', value: ACTIVE_CONTRACTS.soroswapFactory },
        { label: 'Reflector', value: ACTIVE_CONTRACTS.reflector },
      ],
    },
    {
      title: 'Tranche Tokens',
      rows: [
        { label: 'Prime pToken', value: tP?.mint || 'not initialized', balance: tP ? `$${formatUsdc(tP.totalAssets, 0)} · NAV ${formatNavQ(tP.navPerShareQ)}` : undefined },
        { label: 'Core pToken', value: tC?.mint || 'not initialized', balance: tC ? `$${formatUsdc(tC.totalAssets, 0)} · NAV ${formatNavQ(tC.navPerShareQ)}` : undefined },
        { label: 'Alpha pToken', value: tA?.mint || 'not initialized', balance: tA ? `$${formatUsdc(tA.totalAssets, 0)} · NAV ${formatNavQ(tA.navPerShareQ)}` : undefined },
      ],
    },
    {
      title: 'Network Endpoints',
      rows: [
        { label: 'Horizon', value: ACTIVE_CONTRACTS.horizonUrl },
        { label: 'Soroban RPC', value: ACTIVE_CONTRACTS.rpcUrl },
        { label: 'Mainnet Core', value: CONTRACTS.mainnet.prismCore || 'pending deployment', note: 'not deployed by request' },
      ],
    },
  ];

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-[15px] font-semibold text-white">Observability</h1>
        <p className="mt-0.5 font-mono text-[10px] text-white/30">
          Contract registry · Event log · Soroban metrics · Vault #{vaultId}
        </p>
      </div>

      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
        <button onClick={() => setRegistryOpen((open) => !open)} className="flex w-full items-center justify-between border-b border-white/[0.05] px-5 py-3.5 text-left">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-white/25" strokeWidth={1.5} />
            <span className="text-[12px] font-medium text-white/70">Stellar Registry</span>
            <span className="font-mono text-[9px] text-white/28">- {groups.reduce((sum, group) => sum + group.rows.length, 0)} entries</span>
          </div>
          <Eye className={`h-3.5 w-3.5 text-white/25 transition-opacity ${registryOpen ? '' : 'opacity-40'}`} strokeWidth={1.5} />
        </button>
        {registryOpen && (
          <div className="space-y-5 p-4">
            {groups.map(({ title, rows }) => (
              <div key={title}>
                <div className="mb-2 px-1 font-mono text-[9px] uppercase tracking-[0.2em] text-white/22">{title}</div>
                <div className="space-y-1">
                  {rows.map((row) => <AddressRow key={row.label} {...row} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
        <div className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3.5">
          <Eye className="h-4 w-4 text-white/25" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-white/70">Protocol Event Log</span>
          <span className="font-mono text-[9px] text-white/28">{filteredLog.length}/{log.length} entries</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/25" />
              <input value={logFilter} onChange={(event) => setLogFilter(event.target.value)} placeholder="Filter..." className="h-7 w-44 rounded-md border border-white/[0.06] bg-white/[0.02] pl-8 pr-3 font-mono text-[10px] text-white/50 outline-none placeholder:text-white/15" />
            </div>
            <button onClick={clearLog} className="flex h-7 items-center gap-1.5 rounded-md border border-white/[0.06] px-2.5 font-mono text-[9px] uppercase tracking-wider text-white/28 hover:text-white/60">
              <Trash2 className="h-3 w-3" /> Clear
            </button>
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto p-4">
          {filteredLog.length === 0 ? (
            <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-white/[0.04] text-[11px] text-white/20">
              No events logged in this admin session
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLog.map((entry, idx) => (
                <div key={`${entry}-${idx}`} className="rounded-md bg-white/[0.015] px-3 py-2 font-mono text-[10px] text-white/42">
                  {entry}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
