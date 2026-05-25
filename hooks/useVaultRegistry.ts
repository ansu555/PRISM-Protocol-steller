'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type VaultEntry = {
  vault_id: number;
  name: string;
  prime_bps: number;
  core_bps: number;
  alpha_bps: number;
  loan_principal: string;
  maturity_days: number;
  created_at: string;
};

const QUERY_KEY = ['vault-registry'] as const;

export function useVaultList() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<VaultEntry[]> => {
      const res = await fetch('/api/vaults', { cache: 'no-store' });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'failed to fetch vaults');
      }
      const j = (await res.json()) as { vaults: VaultEntry[] };
      return j.vaults;
    },
    staleTime: 30_000,
  });
}

export type RegisterVaultPayload = {
  vaultId: number;
  name: string;
  primeBps: number;
  coreBps: number;
  alphaBps: number;
  loanPrincipal: bigint;
  maturityDays: number;
};

export function useRegisterVault() {
  const qc = useQueryClient();
  return useMutation<void, Error, RegisterVaultPayload>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, loanPrincipal: payload.loanPrincipal.toString() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'failed to register vault');
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
