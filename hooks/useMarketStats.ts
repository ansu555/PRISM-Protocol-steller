'use client';

import { useAllVaults } from './useAllVaults';
import { toBigInt } from '@/app/lib/format';

export function useMarketStats() {
  const { data: vaults, isLoading } = useAllVaults();

  if (isLoading || !vaults) {
    return {
      totalTvl: 0n,
      totalActiveCredit: 0n,
      avgPrimeYield: 0,
      activeVaults: 0,
      isLoading: true
    };
  }

  const totalTvl = vaults.reduce((acc, v) => acc + toBigInt(v.totalDeposits), 0n);
  const totalActiveCredit = vaults.reduce((acc, v) => acc + toBigInt(v.totalLoaned), 0n);
  const activeVaults = vaults.length;
  
  // Calculate average prime yield (target APY)
  const primeYields = vaults
    .map(v => Number(v.tranches?.[0]?.targetApyBps ?? 0))
    .filter(y => y > 0);
    
  const avgPrimeYield = primeYields.length > 0 
    ? primeYields.reduce((a, b) => a + b, 0) / (primeYields.length * 100)
    : 0;

  return {
    totalTvl,
    totalActiveCredit,
    avgPrimeYield,
    activeVaults,
    isLoading: false
  };
}
