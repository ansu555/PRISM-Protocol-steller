'use client';

// Poll the deployed Soroban contracts for the full vault snapshot.
// Reads the deployed Soroban contracts for the dashboard.
//
// Returned shape:
//   {
//     config, vault, loan, tranches[3], reserveBalance, lossBucketBalance,
//     usdcMint
//   }
//
// The contract id is the canonical address callers need, so dashboards
// display tranche `kind` or the relevant contract id.

import { useQuery } from '@tanstack/react-query';

import {
  PRISM_CORE_CONTRACT_ID,
  SOROSWAP_FACTORY_ID,
  TRANCHE_CONFIG,
  TrancheKind,
  USDC_CONTRACT_ID,
} from '@/app/lib/constants';
import { toBigInt } from '@/app/lib/format';
import {
  addr,
  ContractClient,
  getCoreClient,
  getUsdcClient,
  nativeToScVal,
} from '@/app/lib/stellar';
import { useSelectedVaultId } from '@/hooks/useSelectedVault';

interface VaultSnapshot {
  credit_event_seq: number;
  id: number;
  last_yield_timestamp: bigint;
  state: 'Active' | 'Defaulted' | 'Resolved';
  total_deposits: bigint;
  total_loaned: bigint;
}

interface ConfigSnapshot {
  admin: string;
  default_yield_rate_bps: number;
  oracle_allowlist: string[];
  paused: boolean;
  usdc_token: string;
}

interface TrancheSnapshot {
  cumulative_loss: bigint;
  cumulative_yield: bigint;
  kind: 'Prime' | 'Core' | 'Alpha';
  last_nav_update_ts: bigint;
  nav_per_share_q: bigint;
  ptoken: string;
  target_apy_bps: number;
  total_assets: bigint;
  total_supply: bigint;
  vault_id: number;
}

interface LoanSnapshot {
  apr_bps: number;
  borrower: string;
  id: number;
  maturity_ts: bigint;
  origination_ts: bigint;
  principal: bigint;
  state: 'Originated' | 'Active' | 'Repaying' | 'Repaid' | 'Defaulted' | 'Resolved';
  total_repaid: bigint;
  vault_id: number;
}

interface AmmPoolSnapshot {
  fee_bps: number;
  lp_token: string;
  quote_token: string;
  tranche_token: string;
}

const trancheKinds = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

async function readUsdcBalance(holder: string): Promise<bigint> {
  try {
    const usdc = getUsdcClient();
    const bal = await usdc.read<bigint | number | string>('balance', [addr(holder)]);
    return toBigInt(bal);
  } catch {
    return 0n;
  }
}

export function useVaultState(vaultIdOverride?: number) {
  const { vaultId: contextVaultId } = useSelectedVaultId();
  const vaultId = vaultIdOverride ?? contextVaultId;

  return useQuery({
    queryKey: ['vault-state', PRISM_CORE_CONTRACT_ID, vaultId],
    refetchInterval: 5_000,
    queryFn: async () => {
      const core    = getCoreClient();
      const factory = new ContractClient(SOROSWAP_FACTORY_ID);

      // Three parallel reads against prism-core for the headline state.
      const [config, vault, contractUsdcBalance] = await Promise.all([
        core.read<ConfigSnapshot | null>('get_config').catch(() => null),
        core.read<VaultSnapshot | null>('get_vault', [nativeToScVal(vaultId, { type: 'u32' })]).catch(
          () => null,
        ),
        readUsdcBalance(PRISM_CORE_CONTRACT_ID),
      ]);

      // Try to read loan id = 1 (the first loan in our demo flows). For a
      // multi-loan vault this would iterate; the current UI only renders
      // one. Failure here is non-fatal.
      const loan = await core
        .read<LoanSnapshot | null>('get_loan', [nativeToScVal(1, { type: 'u32' })])
        .catch(() => null);

      // Per-tranche reads: get_tranche on prism-core + get_pair/get_reserves on Soroswap.
      const tranches = await Promise.all(
        trancheKinds.map(async (kind) => {
          const tranche = await core
            .read<TrancheSnapshot | null>('get_tranche', [
              nativeToScVal(vaultId, { type: 'u32' }),
              nativeToScVal(kind, { type: 'u32' }),
            ])
            .catch(() => null);

          let ammTrancheBalance = 0n;
          let ammQuoteBalance = 0n;
          if (tranche?.ptoken) {
            // Read reserves from Soroswap: factory.get_pair → pair.get_reserves
            const pairAddress = await factory
              .read<string | null>('get_pair', [addr(USDC_CONTRACT_ID), addr(tranche.ptoken)])
              .catch(() => null);
            if (pairAddress && typeof pairAddress === 'string') {
              const pair = new ContractClient(pairAddress);
              const reserves = await pair
                .read<[bigint, bigint] | null>('get_reserves')
                .catch(() => null);
              if (reserves) {
                // Soroswap orders tokens lexicographically; USDC may be token_0 or token_1.
                // We compare the pToken address to determine which reserve is which.
                const usdcIsFirst = USDC_CONTRACT_ID.toLowerCase() < tranche.ptoken.toLowerCase();
                ammQuoteBalance   = toBigInt(usdcIsFirst ? reserves[0] : reserves[1]);
                ammTrancheBalance = toBigInt(usdcIsFirst ? reserves[1] : reserves[0]);
              }
            }
          }

          return {
            kind,
            ...TRANCHE_CONFIG[kind],
            tokenAddress: tranche?.ptoken ?? PRISM_CORE_CONTRACT_ID,
            mint: tranche?.ptoken ?? '',
            account: tranche
              ? {
                  totalAssets: toBigInt(tranche.total_assets),
                  totalSupply: toBigInt(tranche.total_supply),
                  navPerShareQ: toBigInt(tranche.nav_per_share_q),
                  cumulativeYield: toBigInt(tranche.cumulative_yield),
                  cumulativeLoss: toBigInt(tranche.cumulative_loss),
                  kind: { [String(tranche.kind).toLowerCase()]: {} } as Record<string, unknown>,
                  targetApyBps: tranche.target_apy_bps,
                }
              : null,
            pool: null,
            poolAddress: '',
            poolTrancheReserve: '',
            poolQuoteReserve: '',
            totalAssets: tranche ? toBigInt(tranche.total_assets) : 0n,
            totalSupply: tranche ? toBigInt(tranche.total_supply) : 0n,
            navPerShareQ: tranche ? toBigInt(tranche.nav_per_share_q) : 0n,
            cumulativeYield: tranche ? toBigInt(tranche.cumulative_yield) : 0n,
            cumulativeLoss: tranche ? toBigInt(tranche.cumulative_loss) : 0n,
            ammTrancheBalance,
            ammQuoteBalance,
          };
        }),
      );

      return {
        config: config
          ? {
              admin: config.admin,
              usdcMint: config.usdc_token,
              defaultYieldRateBps: config.default_yield_rate_bps,
              paused: config.paused,
              oracleAllowlist: config.oracle_allowlist,
            }
          : null,
        configAddress: PRISM_CORE_CONTRACT_ID,
        vault: vault
          ? {
              id: vault.id,
              state: { [String(vault.state).toLowerCase()]: {} } as Record<string, unknown>,
              totalDeposits: toBigInt(vault.total_deposits),
              totalLoaned: toBigInt(vault.total_loaned),
              lastYieldTimestamp: toBigInt(vault.last_yield_timestamp),
              creditEventSeq: vault.credit_event_seq,
            }
          : null,
        vaultAddress: PRISM_CORE_CONTRACT_ID,
        reserveAddress: PRISM_CORE_CONTRACT_ID,
        reserveBalance: contractUsdcBalance,
        lossBucketAddress: PRISM_CORE_CONTRACT_ID,
        lossBucketBalance: 0n, // Loss bucket is informational on Stellar; the contract holds USDC directly.
        loan: loan
          ? {
              id: loan.id,
              borrower: loan.borrower,
              principal: toBigInt(loan.principal),
              aprBps: loan.apr_bps,
              originationTs: toBigInt(loan.origination_ts),
              maturityTs: toBigInt(loan.maturity_ts),
              state: { [String(loan.state).toLowerCase()]: {} } as Record<string, unknown>,
              totalRepaid: toBigInt(loan.total_repaid),
            }
          : null,
        loanAddress: PRISM_CORE_CONTRACT_ID,
        usdcMint: config?.usdc_token ?? USDC_CONTRACT_ID,
        tranches,
      };
    },
  });
}
