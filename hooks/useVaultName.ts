'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

function queryKey(vaultId: number) {
  return ['vault-name', vaultId] as const;
}

export function useVaultName(vaultId: number): [string, (name: string) => Promise<void>] {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKey(vaultId),
    queryFn: async () => {
      const res = await fetch(`/api/vault/name?vaultId=${vaultId}`, { cache: 'no-store' });
      const j = (await res.json()) as { name: string };
      return j.name;
    },
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch('/api/vault/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultId, name }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? 'failed to save vault name');
      }
      const j = (await res.json()) as { name: string };
      return j.name;
    },
    onSuccess: (savedName) => {
      qc.setQueryData(queryKey(vaultId), savedName);
    },
  });

  const setName = async (name: string) => {
    await mutation.mutateAsync(name);
  };

  return [data ?? `Credit Vault #${vaultId}`, setName];
}
