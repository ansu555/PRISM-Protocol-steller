'use client';

// Per-user pTranche balances. On Stellar these are SAC balances on the
// pre-deployed tranche pToken contracts (looked up via `get_tranche` on prism-core).

import { useQuery } from '@tanstack/react-query';

import { TrancheKind, VAULT_ID } from '@/app/lib/constants';
import { toBigInt } from '@/app/lib/format';
import { ContractClient, addr, getCoreClient, nativeToScVal } from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

const KINDS = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

export interface TranchePosition {
  kind: TrancheKind;
  balance: bigint;
}

interface TrancheSnapshot {
  ptoken: string;
}

async function readSacBalance(contractId: string, holder: string): Promise<bigint> {
  try {
    const client = new ContractClient(contractId);
    const bal = await client.read<bigint | number | string>('balance', [addr(holder)]);
    return toBigInt(bal);
  } catch {
    return 0n;
  }
}

export function useUserPosition() {
  const { address } = useStellarWallet();

  return useQuery<TranchePosition[]>({
    queryKey: ['user-position', address],
    enabled: !!address,
    refetchInterval: 10_000,
    queryFn: async () => {
      if (!address) return [];
      const core = getCoreClient();

      return Promise.all(
        KINDS.map(async (kind) => {
          const tranche = await core
            .read<TrancheSnapshot | null>('get_tranche', [
              nativeToScVal(VAULT_ID, { type: 'u32' }),
              nativeToScVal(kind, { type: 'u32' }),
            ])
            .catch(() => null);
          if (!tranche?.ptoken) return { kind, balance: 0n };
          const balance = await readSacBalance(tranche.ptoken, address);
          return { kind, balance };
        }),
      );
    },
  });
}
