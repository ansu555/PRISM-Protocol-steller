'use client';

import { useQuery } from '@tanstack/react-query';

export function useMarketSignals() {
  return useQuery({
    queryKey: ['market-signals'],
    refetchInterval: 15000,
    queryFn: async () => {
      const res = await fetch('/api/events?limit=10&sync=true');
      if (!res.ok) throw new Error('Failed to fetch market signals');
      const data = await res.json();
      return data.events || [];
    }
  });
}
