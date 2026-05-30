'use client';

import { TrancheKind } from '@/app/lib/constants';
import { useVaultState } from '@/hooks/useVaultState';

export interface NavDataPoint {
  timestamp: number;
  navPerShare: number;
  ammSpotPrice: number | null;
}

export type NavHistoryMap = Record<TrancheKind, NavDataPoint[]>;

export function useNavHistory() {
  const vaultQuery = useVaultState();

  const history: NavHistoryMap = {
    [TrancheKind.Prime]: [],
    [TrancheKind.Core]: [],
    [TrancheKind.Alpha]: [],
  };

  return {
    history,
    currentData: vaultQuery.data,
    isLoading: vaultQuery.isLoading,
    version: 0,
  };
}
