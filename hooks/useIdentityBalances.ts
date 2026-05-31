'use client';

// Per-identity USDC + pTranche balances. Mirrors useUserPosition + adds USDC.
// On Stellar, balances are SAC reads on the USDC contract + each tranche's
// pToken contract.

import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { TrancheKind, VAULT_ID } from '@/app/lib/constants';
import { toBigInt } from '@/app/lib/format';
import {
  ContractClient,
  addr,
  getCoreClient,
  getUsdcClient,
  nativeToScVal,
} from '@/app/lib/stellar';
import { useIdentity } from '@/hooks/useIdentity';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

const TRANCHE_KINDS = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

async function sacBalance(contractId: string, holder: string): Promise<bigint> {
  try {
    const client = new ContractClient(contractId);
    const bal = await client.read<bigint | number | string>('balance', [addr(holder)]);
    return toBigInt(bal);
  } catch {
    return 0n;
  }
}

interface TrancheSnapshot {
  ptoken: string;
}

export function useIdentityBalances() {
  const { address: walletAddress } = useStellarWallet();
  const { address: identityAddress } = useIdentity();

  // Prefer the connected wallet; fall back to the simulation identity.
  const authority = walletAddress ?? identityAddress;

  return useQuery({
    queryKey: ['identity-balances', authority],
    refetchInterval: 8_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const usdcClient = getUsdcClient();
      const core = getCoreClient();

      const usdc = await usdcClient
        .read<bigint | number | string>('balance', [addr(authority)])
        .then(toBigInt)
        .catch(() => 0n);

      const tranches = await Promise.all(
        TRANCHE_KINDS.map(async (kind) => {
          const t = await core
            .read<TrancheSnapshot | null>('get_tranche', [
              nativeToScVal(VAULT_ID, { type: 'u32' }),
              nativeToScVal(kind, { type: 'u32' }),
            ])
            .catch(() => null);
          if (!t?.ptoken) return { kind, balance: 0n };
          const balance = await sacBalance(t.ptoken, authority);
          return { kind, balance };
        }),
      );

      return { usdc, tranches };
    },
  });
}
