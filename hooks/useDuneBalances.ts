'use client';

import { useQuery } from '@tanstack/react-query';

import { fetchDuneBalances, type FetchBalancesResult } from '@/app/lib/dune-sim';

export function useDuneBalances(address: string) {
  return useQuery<FetchBalancesResult>({
    queryKey: ['dune-balances', address],
    queryFn: () => fetchDuneBalances(address),
    refetchInterval: 30_000,
    staleTime: 20_000,
    enabled: !!address,
    initialData: { wallet_address: address, balances: [] },
  });
}
