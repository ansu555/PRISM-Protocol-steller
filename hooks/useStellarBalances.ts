'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchStellarBalances, type FetchBalancesResult } from '@/app/lib/stellar-ledger';

export function useStellarBalances(address: string) {
  return useQuery<FetchBalancesResult>({
    queryKey: ['stellar-balances', address],
    queryFn: () => fetchStellarBalances(address),
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: !!address,
    initialData: { wallet_address: address, balances: [] },
  });
}
