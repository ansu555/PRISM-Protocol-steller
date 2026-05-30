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
  - `COLLATERAL_ORACLE_SEED_NEXT`
  - `COLLATERAL_ORACLE_ACTIVE_KEY_ID`
  - `COLLATERAL_ORACLE_PRIMARY_KEY_ID`
  - `COLLATERAL_ORACLE_NEXT_KEY_ID`
  - `COLLATERAL_ORACLE_RATE_LIMIT_PER_MINUTE`
  - `ENCRYPT_ORACLE_SECRET_SEED`
  - `ENCRYPT_ORACLE_SECRET_SEED_DEV`
  - `ENCRYPT_ORACLE_SECRET_SEED_NEXT`
  - `ENCRYPT_ORACLE_ACTIVE_KEY_ID`
  - `ENCRYPT_ORACLE_PRIMARY_KEY_ID`
  - `ENCRYPT_ORACLE_NEXT_KEY_ID`
  - `ENCRYPT_ORACLE_RATE_LIMIT_PER_MINUTE`
  - `CLOAK_ORACLE_SEED` / `CLOAK_ORACLE_SEED_DEV`
  - `CLOAK_ORACLE_SEED_NEXT`
  - `CLOAK_ORACLE_ACTIVE_KEY_ID`
  - `CLOAK_ORACLE_PRIMARY_KEY_ID`
  - `CLOAK_ORACLE_NEXT_KEY_ID`
  - `CLOAK_ORACLE_RATE_LIMIT_PER_MINUTE`
  - `ORACLE_RATE_LIMIT_WINDOW_SECONDS`

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

Useful event API queries:

- `/api/events?limit=50&sync=true`
- `/api/events?limit=50&includeMeta=true`
- `/api/events?limit=50&summary=true`

## 8. Oracle Allowlist Update/Revocation Runbook

1. Add new signer key:
   - Call `add_oracle_to_allowlist(new_pubkey)` as admin.
   - CLI helper: `bash soroban/scripts/oracle-allowlist.sh add 0x<new_pubkey_hex>`
2. Stage next key in server env:
   - Set `*_SEED_NEXT` and `*_NEXT_KEY_ID`.
3. Dry-run next signer:
   - POST to route with `key_id` set to the next key id.
4. Cut over active signer:
   - Set `*_ACTIVE_KEY_ID` to the next key id and redeploy.
5. Revoke old signer:
   - Call `remove_oracle_from_allowlist(old_pubkey)` as admin.
   - CLI helper: `bash soroban/scripts/oracle-allowlist.sh remove 0x<old_pubkey_hex>`
6. Confirm revoke:
   - `is_oracle_allowlisted(old_pubkey)` returns `false`.
   - CLI helper: `bash soroban/scripts/oracle-allowlist.sh check 0x<old_pubkey_hex>`

## 9. Mainnet Rollout Gates

Before mainnet release:

1. Run manual workflow `.github/workflows/stellar-mainnet-gates.yml` with:
   - `audit_report_url`
   - `audit_signed_off=true`
2. `cargo test -p prism-core` passes in CI.
3. `stellar contract build --package prism-core` succeeds and WASM size gate passes.
4. Oracle route rate-limit envs and signer seeds are set (no missing-seed boot errors).
5. `/api/events?summary=true` shows stable ingestion and expected event classes.
6. External audit report is complete and signed off internally.
