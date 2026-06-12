'use client';

// Poll the deployed prism-core CosmWasm contract for the full vault snapshot.
//
// Each field is a `coreQuery` smart-query against prism-core on XION (replaces
// the Soroban `getCoreClient().read` simulation path). CosmWasm returns plain
// JSON: `u64` amounts decode as numbers, `Uint128` (nav_per_share_q, loss
// bucket) as strings — `toBigInt` normalizes both.
//
// Returned shape is deliberately UNCHANGED from the Stellar build (legacy
// `pda` / `mint` / `programIds` / `toBase58` fields kept) so every downstream
// component reads from this one hook without edits.

import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { TRANCHE_CONFIG, TrancheKind } from '@/app/lib/constants';
import { toBigInt } from '@/app/lib/format';
import { coreQuery, cw20Balance, ACTIVE_XION } from '@/app/lib/xion';
import { useSelectedVaultId } from '@/hooks/useSelectedVault';

interface VaultSnapshot {
  credit_event_seq: number;
  id: number;
  last_yield_timestamp: number;
  state: 'active' | 'defaulted' | 'resolved';
  total_deposits: number;
  total_loaned: number;
}

interface ConfigSnapshot {
  admin: string;
  default_yield_rate_bps: number;
  oracle_allowlist: string[];
  paused: boolean;
  usdc_token: string;
}

interface TrancheSnapshot {
  cumulative_loss: number;
  cumulative_yield: number;
  kind: 'prime' | 'core' | 'alpha';
  last_nav_update_ts: number;
  nav_per_share_q: string;
  ptoken: string;
  target_apy_bps: number;
  total_assets: number;
  total_supply: number;
  vault_id: number;
}

interface LoanSnapshot {
  apr_bps: number;
  borrower: string;
  id: number;
  maturity_ts: number;
  origination_ts: number;
  principal: number;
  state: 'originated' | 'active' | 'repaying' | 'repaid' | 'defaulted' | 'resolved';
  total_repaid: number;
  vault_id: number;
}

const trancheKinds = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

async function readContractUsdcBalance(): Promise<bigint> {
  try {
    return await cw20Balance(ACTIVE_XION.usdc, ACTIVE_XION.prismCore);
  } catch {
    return 0n;
  }
}

export function useVaultState(vaultIdOverride?: number) {
  const { vaultId: contextVaultId } = useSelectedVaultId();
  const vaultId = vaultIdOverride ?? contextVaultId;

  return useQuery({
    queryKey: ['vault-state', ACTIVE_XION.prismCore, vaultId],
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Headline state — config + vault + the contract's own USDC balance +
      // the loss bucket, in parallel. All guarded: pre-deploy (empty contract
      // id) these reject and degrade to null/0 rather than throwing.
      const [config, vault, contractUsdcBalance, lossBucketBalance] = await Promise.all([
        coreQuery<ConfigSnapshot | null>({ get_config: {} }).catch(() => null),
        coreQuery<VaultSnapshot | null>({ get_vault: { vault_id: vaultId } }).catch(() => null),
        readContractUsdcBalance(),
        coreQuery<string>({ get_loss_bucket_balance: { vault_id: vaultId } })
          .then(toBigInt)
          .catch(() => 0n),
      ]);

      // Demo loan id. NOTE: the admin/initialize route seeds loan_id 0 while the
      // originate flow uses the monotonic counter (first id = 1). Kept at 1 to
      // match prior behavior; reconcile if the demo loan id changes.
      const loan = await coreQuery<LoanSnapshot | null>({ get_loan: { loan_id: 1 } }).catch(
        () => null,
      );

      const tranches = await Promise.all(
        trancheKinds.map(async (kind) => {
          const tranche = await coreQuery<TrancheSnapshot | null>({
            get_tranche: { vault_id: vaultId, kind },
          }).catch(() => null);

          // AMM tranche/quote reserves come from the self-deployed DEX pair
          // (Slice 3). Until that contract is deployed they read as 0.
          const ammTrancheBalance = 0n;
          const ammQuoteBalance = 0n;

          return {
            kind,
            ...TRANCHE_CONFIG[kind],
            pda: tranche?.ptoken ?? ACTIVE_XION.prismCore, // legacy field name kept
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
            poolPda: '',
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
        configPda: ACTIVE_XION.prismCore,
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
        vaultPda: ACTIVE_XION.prismCore,
        reservePda: ACTIVE_XION.prismCore,
        reserveBalance: contractUsdcBalance,
        lossBucketPda: ACTIVE_XION.prismCore,
        lossBucketBalance,
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
        loanPda: ACTIVE_XION.prismCore,
        usdcMint: config?.usdc_token ?? ACTIVE_XION.usdc,
        tranches,
        programIds: {
          core: {
            toBase58: () => ACTIVE_XION.prismCore,
            toString: () => ACTIVE_XION.prismCore,
          },
          amm: {
            toBase58: () => ACTIVE_XION.dexRouter ?? '',
            toString: () => ACTIVE_XION.dexRouter ?? '',
          },
        },
      };
    },
  });
}
