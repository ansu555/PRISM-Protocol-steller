# PRISM on Stellar - Delivery Plan

**Last updated:** 2026-05-30  
**Status:** Active implementation plan

This document is the execution plan for the Stellar-first PRISM stack currently in this repository.

## 1. Outcome

Ship a production-ready Soroban credit protocol where:

- capital is split into Prime/Core/Alpha tranches,
- LP positions are tokenized and tradable,
- credit losses propagate by deterministic on-chain rules,
- oracle attestations are verified in-contract,
- the UI and operations stack are stable for testnet and mainnet rollout.

## 2. Current Baseline

### Contract

- `soroban/prism-core/src/lib.rs` contains the full contract surface.
- Core entrypoints are live: vault/tranche initialization, deposit/withdraw, yield, credit events, loans, and oracle handlers.
- Storage uses `DataKey` with persistent + instance TTL extension.
- Q64.64 math lives in `soroban/prism-core/src/math.rs`.

### Frontend + wallet

- Next.js App Router UI in `app/` + `components/`.
- Stellar wallet integration via `@creit.tech/stellar-wallets-kit` in `components/providers/stellar-wallet-provider.tsx`.
- Soroban client wrapper in `app/lib/stellar.ts`.

### Integrations

- Soroswap helper paths in `app/lib/soroswap.ts` and contract interface in `soroban/prism-core/src/soroswap.rs`.
- Reflector read path in `app/lib/reflector.ts` and contract interface in `soroban/prism-core/src/reflector.rs`.

### Operational services

- Oracle signer routes:
  - `app/api/collateral-oracle/attest/route.ts`
  - `app/api/encrypt-oracle/attest_default/route.ts`
  - `app/api/cloak-oracle/attest/route.ts`
- Postgres-backed metadata/event services in `lib/*.ts`.

## 3. Workstreams

### W1 - Contract hardening

1. Keep `prism_core` as single source of truth for risk logic and state transitions.
2. Expand negative-path tests around pause/auth/state-machine edges.
3. Add explicit invariant assertions in tests:
   - reserve balance consistency,
   - monotonic nonce behavior for collateral attestations,
   - tranche supply/assets consistency after cascading losses.

### W2 - Liquidity and pricing

1. Finalize pool-seeding and market bootstrapping runbook for `seed_pool_liquidity`.
2. Validate slippage/deadline guardrails in real testnet conditions.
3. Expose clearer trade analytics in the dashboard using Soroswap return paths.

### W3 - Oracle reliability

1. Rotate signer keys into managed secrets per environment.
2. Add replay and abuse monitoring on oracle endpoints.
3. Add operational policy for allowlist updates and key revocation.
4. Keep attestation formats byte-identical between API routes and contract parsers.

### W4 - Data and observability

1. Stabilize event sync pipeline (`/api/events` + `app/lib/onchain-indexer.ts`).
2. Improve transaction classification beyond memo heuristics.
3. Add operational dashboards for:
   - oracle request counts,
   - failed signature verifications,
   - vault health and utilization,
   - credit-event timeline.

### W5 - Security and release readiness

1. Full internal security checklist for contract + API signer boundaries.
2. External review/audit before permissionless rollout.
3. Strict deployment/version process for contract IDs and environment updates.
4. Rollout gates:
   - all contract tests green,
   - smoke tests on wallet + deposit/withdraw + loan flows,
   - documented rollback procedure.

## 4. Milestones

### Milestone A - Protocol correctness

- Contract tests pass with all core lifecycle flows.
- Oracle verification flows pass with deterministic test vectors.

### Milestone B - Market integration

- Pool seeding and quoting paths validated.
- Dashboard shows live pricing + protocol state coherently.

### Milestone C - Production readiness

- Secrets, observability, release process, and operational docs finalized.
- Mainnet rollout can be executed with documented checkpoints.

## 5. Definition of Done

PRISM is considered delivery-complete for this plan when:

1. Contract state machine is stable under test and adverse-path simulation.
2. Oracle flows are verifiable, replay-safe, and operationally controlled.
3. UI can execute the full user and admin workflows on Stellar.
4. Deployment + operations documentation is enough for repeatable release.
