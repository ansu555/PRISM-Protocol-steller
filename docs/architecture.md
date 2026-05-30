# Architecture

## 1. System Overview

PRISM is a Soroban credit engine with a web app, off-chain oracle signers, and a Postgres-backed operational layer.

```text
Client UI (Next.js)
  - landing, app shell, admin, borrower, simulation
  - Stellar wallet connect + tx signing

        |
        | Soroban RPC + Horizon
        v
Soroban contract: prism_core
  - vaults / tranches / loans / events
  - waterfall + cascade logic
  - oracle verification
  - integration entrypoints for Soroswap + Reflector

        |
        +-- Server oracle routes (signed attestations)
        +-- Postgres metadata + event services
```

## 2. Main Runtime Components

### Frontend and app shell

- Next.js App Router pages under `app/`.
- Shared UI components under `components/`.
- Global providers in `components/providers/app-providers.tsx`.
- Wallet adapter layer in:
  - `components/providers/stellar-wallet-context.tsx`
  - `components/providers/stellar-wallet-provider.tsx`

### Contract execution layer

- Contract: `soroban/prism-core/src/lib.rs`
- Storage model: `soroban/prism-core/src/storage.rs`
- State structs/enums: `soroban/prism-core/src/state.rs`
- Errors: `soroban/prism-core/src/errors.rs`
- Fixed-point math: `soroban/prism-core/src/math.rs`

### Chain access and client utilities

- Soroban RPC contract client wrapper: `app/lib/stellar.ts`
- Contract/address registry: `app/lib/constants.ts`, `app/lib/addresses.ts`
- Horizon account/transaction helpers: `app/lib/horizon.ts`

### Integration helpers

- Soroswap routing + swap helpers: `app/lib/soroswap.ts`
- Reflector price reads: `app/lib/reflector.ts`

### Server-side operational layer

- Event persistence: `lib/eventStore.ts`
- Loan metadata store: `lib/loanStore.ts`
- Vault registry store: `lib/vaultRegistry.ts`
- API surfaces: `app/api/events/route.ts`, `app/api/loans/route.ts`, `app/api/vaults/route.ts`

## 3. Protocol Mechanics

### Tranche model

- Prime = senior tranche.
- Core = middle tranche.
- Alpha = junior tranche and first-loss buffer.

Each tranche tracks:

- `total_assets`
- `total_supply`
- `nav_per_share_q` (Q64.64)
- cumulative yield/loss counters

### Yield waterfall

`accrue_yield` applies yield in strict order:

1. Prime target allocation
2. Core target allocation
3. Alpha receives residual

### Loss cascade

`trigger_credit_event`, `verify_encrypt_default`, and `liquidate_collateral` apply loss in strict order:

1. Alpha absorbs first
2. then Core
3. then Prime

### Reserve accounting invariant

Loss write-downs also move value into `LossBucketBalance`, preserving accounting consistency:

`reserve == sum(tranche.total_assets) + loss_bucket_balance`

## 4. Loan + Collateral Lifecycle

1. Admin creates loan via `init_loan`.
2. Borrower registers collateral oracle key via `attach_collateral`.
3. Oracle-signed attestation is verified by `verify_collateral`.
4. Admin disburses funds via `disburse_loan`.
5. Borrower repays through `repay_loan`.
6. On release condition: `release_collateral`.
7. On liquidation condition: `liquidate_collateral` + loss cascade.

## 5. Security Boundaries

- Admin-gated functions enforce `require_auth` and admin address checks.
- Oracle functions enforce signature verification (`env.crypto().ed25519_verify`) and allowlist constraints.
- Collateral attestations enforce monotonic nonce progression for replay resistance.
- Paused mode blocks sensitive flows through `cfg.paused` checks.

## 6. Testing Coverage

`cargo test` in `soroban/prism-core` covers:

- initialization and auth boundaries,
- deposit/withdraw math behavior,
- yield/cascade behavior,
- storage TTL behavior,
- collateral/encrypt/cloak attestation paths,
- integration interface wiring for Soroswap/Reflector entrypoints.
