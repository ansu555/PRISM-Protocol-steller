# PRISM Protocol (Stellar / Soroban)

PRISM is a structured credit protocol on Stellar that turns one credit pool into three tradable risk layers:

- Prime (senior)
- Core (mezzanine)
- Alpha (junior, first-loss)

The protocol runs on Soroban with tranche accounting, live NAV, yield waterfall, and loss cascade fully on-chain.

## What Is In This Repo

- Soroban core contract: `soroban/prism-core`
- Next.js app (landing, app shell, admin, borrower, simulation): `app/`, `components/`
- Stellar wallet integration (Freighter via Stellar Wallets Kit): `components/providers/`
- Oracle attestation routes (collateral, Encrypt, Cloak): `app/api/*-oracle/`
- Protocol/event metadata services backed by Postgres: `lib/`, `app/api/events`, `app/api/loans`, `app/api/vaults`

## Architecture Snapshot

```text
Wallet (G...) + Next.js UI
        |
        | Soroban RPC + Horizon
        v
  prism_core contract (C...)
    - vaults, tranches, loans
    - deposit/withdraw
    - yield waterfall
    - loss cascade
    - oracle verification
        |
        +--> Soroswap router (liquidity + trading)
        +--> Reflector oracle (market price reads)

Server routes
  - /api/collateral-oracle/attest
  - /api/encrypt-oracle/attest_default
  - /api/cloak-oracle/attest

Data layer (Postgres)
  - protocol_events
  - loans
  - vault_registry
```

## Core Protocol Flows

1. LP deposit: `deposit(user, vault_id, kind, amount)` mints tranche tokens and updates NAV.
2. LP withdraw: `withdraw(user, vault_id, kind, shares)` burns tranche tokens and pays USDC by NAV.
3. Yield accrual: `accrue_yield(...)` applies top-down waterfall (Prime -> Core -> Alpha).
4. Credit event: `trigger_credit_event(...)` applies bottom-up cascade (Alpha -> Core -> Prime).
5. Loan lifecycle: `init_loan` -> `attach_collateral`/`verify_collateral` -> `disburse_loan` -> `repay_loan`.
6. Oracle-triggered default: `verify_encrypt_default(...)` can fire a default cascade with signed evidence.

## Local Development

### App

```bash
pnpm install
pnpm dev
```

### Build

```bash
pnpm build
```

### Contract tests

```bash
cd soroban/prism-core
cargo test
```

### Testnet deploy

```bash
bash soroban/scripts/deploy.sh
```

Deployment metadata is written to `soroban/deployments/testnet.json`.

## Required Environment (Current Code Paths)

The frontend and API routes primarily use:

- `NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID`
- `NEXT_PUBLIC_USDC_CONTRACT_ID`
- `NEXT_PUBLIC_SOROSWAP_ROUTER_ID`
- `NEXT_PUBLIC_SOROSWAP_FACTORY_ID`
- `NEXT_PUBLIC_REFLECTOR_CONTRACT_ID`
- `NEXT_PUBLIC_SOROBAN_RPC_URL`
- `NEXT_PUBLIC_HORIZON_URL`
- `NEXT_PUBLIC_NETWORK_PASSPHRASE`
- `DATABASE_URL`
- `COLLATERAL_ORACLE_SEED` (or `COLLATERAL_ORACLE_SEED_DEV`)
- `COLLATERAL_ORACLE_SEED_NEXT` + key-id selectors (`COLLATERAL_ORACLE_ACTIVE_KEY_ID`, etc.)
- `ENCRYPT_ORACLE_SECRET_SEED` (optional `ENCRYPT_ORACLE_SECRET_SEED_NEXT`)
- `CLOAK_ORACLE_SEED` (or `CLOAK_ORACLE_SEED_DEV`, optional `CLOAK_ORACLE_SEED_NEXT`)
- `*_ORACLE_RATE_LIMIT_PER_MINUTE` and `ORACLE_RATE_LIMIT_WINDOW_SECONDS`

## Docs

- [docs/README.md](docs/README.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/contract-reference.md](docs/contract-reference.md)
- [docs/oracles.md](docs/oracles.md)
- [docs/operations.md](docs/operations.md)
- [stellar-migration-plan.md](stellar-migration-plan.md)

## Current Status (2026-05-30)

- Soroban `prism_core` is implemented with tests.
- Stellar wallet flow is integrated in the app shell.
- Oracle attestation endpoints are wired for collateral, Encrypt, and Cloak patterns.
- Soroswap and Reflector integration paths exist in both contract and frontend helpers
