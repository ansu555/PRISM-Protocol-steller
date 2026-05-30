'use client';

import { ChevronDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useSelectedVaultId } from '@/hooks/useSelectedVault';
import { useVaultList } from '@/hooks/useVaultRegistry';

export function VaultSelector() {
  const { vaultId, setVaultId } = useSelectedVaultId();
  const { data: vaults, isLoading } = useVaultList();
  const [open, setOpen] = useState(false);

  // Auto-select the first registered vault if the default id isn't in the registry
  useEffect(() => {
    if (vaults && vaults.length > 0 && !vaults.find((v) => v.vault_id === vaultId)) {
      setVaultId(vaults[0].vault_id);
    }
  }, [vaults, vaultId, setVaultId]);

  const active = vaults?.find((v) => v.vault_id === vaultId);
  const label = active ? active.name : `Vault #${vaultId}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
        <span className="max-w-[160px] truncate font-mono text-xs">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-md border border-white/[0.1] bg-[#0e0e0e] shadow-2xl">
            {isLoading && (
              <div className="px-4 py-3 text-xs text-white/30">Loading vaults…</div>
            )}

            {!isLoading && (!vaults || vaults.length === 0) && (
              <div className="px-4 py-3 text-xs text-white/30">No vaults registered yet</div>
            )}

            {vaults?.map((v) => {
              const isActive = v.vault_id === vaultId;
              return (
                <button
                  key={v.vault_id}
                  type="button"
                  onClick={() => { setVaultId(v.vault_id); setOpen(false); }}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.05] ${isActive ? 'bg-white/[0.07]' : ''}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-white/90">{v.name}</div>
                    <div className="font-mono text-[10px] text-white/30">Vault #{v.vault_id}</div>
                  </div>
                  {isActive && <span className="text-[10px] text-emerald-400/70">active</span>}
                </button>
              );
            })}

            <div className="border-t border-white/[0.07]">
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-3 text-xs text-white/40 transition-colors hover:bg-white/[0.04] hover:text-white/70"
              >
                <Plus className="h-3.5 w-3.5" />
                Create new vault
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
