# PRISM Protocol - Stellar Deployment Cost Notes

PRISM deploys one custom Soroban contract and three tranche-token Stellar Asset
Contracts (SACs). Secondary-market liquidity uses Soroswap. PRISM does not
deploy or maintain a separate AMM contract.

## 1. Deployment Surface

| Item | Ownership | Purpose |
|---|---|---|
| `prism-core` | PRISM | Vault accounting, tranche state, loans, collateral, yield accrual, credit events, and oracle attestations |
| `pPrime` SAC | PRISM | Prime tranche receipt token |
| `pCore` SAC | PRISM | Core tranche receipt token |
| `pAlpha` SAC | PRISM | Alpha tranche receipt token |
| Soroswap pools | Soroswap | External pToken / USDC secondary-market liquidity |

## 2. Cost Categories

Deployment planning must include:

| Category | How to estimate |
|---|---|
| `prism-core` WASM upload | Run `node soroban/estimate-deploy-cost.mjs` after the release build |
| `prism-core` contract creation | Simulate the deployment transaction against the target Stellar RPC |
| Three pToken SAC deployments | Simulate each SAC deployment against the target Stellar RPC |
| Initialization calls | Simulate config, vault, tranche, and pool-seeding transactions |
| Account reserves | Budget XLM minimum balances and trustlines for operational accounts |
| Soroswap liquidity | Budget the USDC and pToken inventory supplied to each external pool |
| TTL maintenance | Reserve XLM for periodic extension of persistent entries |

The values are intentionally simulation-driven. Resource fees depend on the
compiled WASM size, ledger state, TTL choices, and the target network fee
schedule. A fixed historical estimate should not be treated as a launch quote.

## 3. Initialization Checklist

1. Build the optimized `prism-core` WASM.
2. Upload and deploy `prism-core`.
3. Deploy the three pToken SACs.
4. Initialize global config and the first vault.
5. Initialize Prime, Core, and Alpha tranche records.
6. Create or locate the three Soroswap pToken / USDC pools.
7. Seed the Soroswap pools with the intended demo or production liquidity.
8. Record deployed IDs in the `NEXT_PUBLIC_*` environment variables.
9. Re-run RPC simulations before mainnet submission.

## 4. Runtime Cost Reference

PRISM-owned transactions include deposits, withdrawals, loan disbursals,
repayments, yield accrual, credit events, collateral operations, and oracle
attestations. Swaps and liquidity changes execute through Soroswap and should be
estimated from the Soroswap router transactions used by the application.

## 5. Estimator

The repository estimator uploads the release `prism_core.wasm` to Stellar
testnet RPC simulation and reports the resource fee. It also lists the
additional deployment, SAC, initialization, reserve, and operations-buffer
categories:

```bash
stellar contract build --package prism-core
node soroban/estimate-deploy-cost.mjs
```
