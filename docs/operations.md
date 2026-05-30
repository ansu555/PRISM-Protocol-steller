# Operations Guide

## 1. Prerequisites

- Node.js and pnpm
- Rust toolchain + Stellar CLI for contract build/deploy
- PostgreSQL (for events/loans/vault registry APIs)

## 2. Run The App

```bash
pnpm install
pnpm dev
```

Build check:

```bash
pnpm build
```

## 3. Run Contract Tests

```bash
cd soroban/prism-core
cargo test
```

## 4. Deploy `prism_core` To Testnet

```bash
bash soroban/scripts/deploy.sh
```

Deployment output is written to:

- `soroban/deployments/testnet.json`

## 5. Environment Variables

Common runtime variables:

- chain endpoints:
  - `NEXT_PUBLIC_SOROBAN_RPC_URL`
  - `NEXT_PUBLIC_HORIZON_URL`
  - `NEXT_PUBLIC_NETWORK_PASSPHRASE`
- contract IDs:
  - `NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID`
  - `NEXT_PUBLIC_USDC_CONTRACT_ID`
  - `NEXT_PUBLIC_SOROSWAP_ROUTER_ID`
  - `NEXT_PUBLIC_SOROSWAP_FACTORY_ID`
  - `NEXT_PUBLIC_REFLECTOR_CONTRACT_ID`
- data service:
  - `DATABASE_URL`
- oracle signer seeds:
  - `COLLATERAL_ORACLE_SEED` / `COLLATERAL_ORACLE_SEED_DEV`
  - `ENCRYPT_ORACLE_SECRET_SEED`
  - `CLOAK_ORACLE_SEED` / `CLOAK_ORACLE_SEED_DEV`

## 6. Data Services

The app persists operational metadata in Postgres:

- `protocol_events` via `lib/eventStore.ts`
- `loans` via `lib/loanStore.ts`
- `vault_registry` via `lib/vaultRegistry.ts`

API routes:

- `GET/POST /api/events`
- `GET/POST /api/loans`
- `GET/POST /api/vaults`

## 7. Observability Checklist

1. Verify contract ID/env alignment before each deploy.
2. Confirm oracle routes return signatures and expected message lengths.
3. Confirm `/api/events?sync=true` can ingest and store recent chain activity.
4. Confirm wallet connect/sign works in browser for selected network passphrase.
5. Confirm reserve and tranche state move as expected after yield and loss events.
