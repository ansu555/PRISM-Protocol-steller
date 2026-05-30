'use client';

import { useQuery } from '@tanstack/react-query';

export interface TokenPrice {
  price: number;
  change24h: number;
}

const STATIC_PRICES: Record<string, TokenPrice> = {
  USDC: { price: 0.999668, change24h: 0.01 },
  USDT: { price: 0.998666, change24h: 0.02 },
  XLM:  { price: 0.1245,   change24h: 0.85 },
  SOL:  { price: 82.52,     change24h: 1.68 },
  BTC:  { price: 73829,     change24h: 1.12 },
  ETH:  { price: 2024,      change24h: 1.19 },
  JUP:  { price: 0.0,       change24h: 0.0  },
};

export function useMarketPrices() {
  return useQuery({
    queryKey: ['market-prices'],
    queryFn: async () => STATIC_PRICES,
    initialData: STATIC_PRICES,
    staleTime: Infinity,
  });
}
