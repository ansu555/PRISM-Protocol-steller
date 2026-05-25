'use client';

// Dashboard aggregator — reshapes `useVaultState` output into the props
// dashboard surfaces expect. No chain calls of its own.

import { useVaultState } from '@/hooks/useVaultState';
import { TRANCHE_CONFIG, TrancheKind, VAULT_ID } from '@/app/lib/constants';
import { shortKey, stateName, toBigInt } from '@/app/lib/format';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

const TRANCHE_ORDER = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

export type DashboardTranche = {
  kind: TrancheKind;
  key: string;
  totalAssets: bigint;
  totalSupply: bigint;
  navPerShareQ: bigint;
  cumulativeYield: bigint;
  cumulativeLoss: bigint;
  ammQuoteBalance: bigint;
  ammTrancheBalance: bigint;
  utilization: number;
};

export type PrismData = {
  connected: boolean;
  walletLabel: string;
  vaultLabel: string;
  vaultStatus: string;
  tranches: DashboardTranche[];
  vaultCapital: bigint;
  yieldDistributed: bigint;
  poolLiquidity: bigint;
  lossBucket: bigint;
  vaultHealth: number;
  isLoading: boolean;
  error?: Error;
};

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

export function usePrismData(vaultId: number = VAULT_ID): PrismData {
  const { connected, address } = useStellarWallet();
  const vaultQuery = useVaultState(vaultId);
  const data = vaultQuery.data;

  const tranches: DashboardTranche[] = TRANCHE_ORDER.map((kind) => {
    const config = TRANCHE_CONFIG[kind];
    const live = data?.tranches.find((tranche) => tranche.kind === kind);
    const totalAssets = live?.totalAssets ?? 0n;
    const ammQuote = live?.ammQuoteBalance ?? 0n;

    return {
      kind,
      key: config.key,
      totalAssets,
      totalSupply: live?.totalSupply ?? 0n,
      navPerShareQ: live?.navPerShareQ ?? 0n,
      cumulativeYield: live?.cumulativeYield ?? 0n,
      cumulativeLoss: live?.cumulativeLoss ?? 0n,
      ammQuoteBalance: ammQuote,
      ammTrancheBalance: live?.ammTrancheBalance ?? 0n,
      utilization:
        totalAssets > 0n
          ? Number(((totalAssets - ammQuote) * 10_000n) / totalAssets) / 100
          : 0,
    };
  });

  const trancheAssets = sum(tranches.map((tranche) => tranche.totalAssets));
  const reserveBalance = toBigInt(data?.reserveBalance ?? 0n);
  const vaultCapital = trancheAssets > 0n ? trancheAssets : reserveBalance;
  const lossBucket = toBigInt(data?.lossBucketBalance ?? 0n);

  return {
    connected,
    walletLabel: connected && address ? shortKey(address) : 'Not connected',
    vaultLabel: data ? shortKey(data.vaultPda) : 'Vault #0',
    vaultStatus: stateName(data?.vault?.state),
    tranches,
    vaultCapital,
    yieldDistributed: sum(tranches.map((tranche) => tranche.cumulativeYield)),
    poolLiquidity: sum(tranches.map((tranche) => tranche.ammQuoteBalance)),
    lossBucket,
    vaultHealth:
      vaultCapital > 0n
        ? Number(((vaultCapital - lossBucket) * 10_000n) / vaultCapital) / 100
        : 100,
    isLoading: vaultQuery.isLoading,
    error: vaultQuery.error instanceof Error ? vaultQuery.error : undefined,
  };
}
