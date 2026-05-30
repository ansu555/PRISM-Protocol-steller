# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

You are coding on the PRISM Protocol codebase — a structured credit protocol built on **Stellar Soroban**. These rules apply to every file you write or edit.

If you're new to this project, **read [stellar-migration-plan.md](stellar-migration-plan.md) first** for architecture context, then [stellar-deploy-plan.md](stellar-deploy-plan.md) for the current delivery plan, then this file, then [docs/12-reference-card.md](docs/12-reference-card.md). After that, you have full context to start coding.

> **Solana is retired.** `contracts/programs/prism-core/` and `contracts/programs/prism-amm/` are historical. The active contract is `soroban/prism-core/`. Do not create or reference Anchor/Solana artifacts.

---

## Commands

### Frontend (root — pnpm)

```bash
pnpm dev          # Start Next.js dev server (port 3000)
pnpm build        # Production build
pnpm lint         # ESLint
```

### Soroban contract (cd soroban — cargo)

```bash
cd soroban
cargo build --target wasm32-unknown-unknown --release -p prism-core   # Build WASM
cargo test -p prism-core                                               # Run all tests
cargo test -p prism-core -- math                                       # Run a subset
cargo fmt                                                              # Format Rust
```

### Deploy and CLI

```bash
bash soroban/scripts/deploy.sh          # Deploy prism-core to testnet
bash soroban/scripts/oracle-allowlist.sh # Manage oracle key allowlist
stellar contract invoke --id $CID -- get_config   # Read on-chain state
```

### No IDL sync step

Soroban does not use IDL JSON files. Contract bindings for the frontend are either hand-written in `app/lib/stellar.ts` or generated once with:

```bash
stellar contract bindings typescript --network testnet --id $CID --output-dir app/lib/bindings/
```

There is no `anchor build && cp` step.

---

## Project structure

```
prism-protocol/
├── app/                     Next.js App Router pages
│   ├── (app)/               Route group: authenticated app shell
│   │   ├── borrow/          Borrower loan facility (originate + fund + repay)
│   │   ├── dashboard/       Simulation harness UI
│   │   ├── earn/            LP deposit / withdraw
│   │   └── trade/           Soroswap swap interface
│   ├── api/                 Route handlers
│   │   ├── collateral-oracle/  PRISM Collateral Oracle Ed25519 signer
│   │   ├── encrypt-oracle/     Encrypt FHE oracle signer
│   │   ├── cloak-oracle/       Cloak oracle signer
│   │   ├── events/             On-chain event indexer endpoint
│   │   ├── loans/              Loan state queries
│   │   └── vaults/             Vault state queries
│   └── lib/                 Frontend-only utilities
│       ├── addresses.ts     Deployed contract registry — all contract IDs live here
│       ├── constants.ts     TrancheKind enum, TRANCHE_CONFIG, protocol parameters
│       ├── stellar.ts       Soroban RPC client factory (buildCoreClient)
│       ├── collateral.ts    PRISM Collateral Oracle client (message builder + HTTP)
│       ├── encrypt.ts       Encrypt FHE oracle client
│       ├── moneygram.ts     MoneyGram Access SEP-24 deposit client
│       ├── soroswap.ts      Soroswap AMM helpers (quote, addLiquidity, swap)
│       ├── reflector.ts     Reflector oracle read helpers
│       └── horizon.ts       Horizon API helpers (balances, history)
├── components/              React components by domain
│   ├── simulation/          SimulationHarness, VaultStateDashboard, etc.
│   ├── borrower/            StellarBorrowForm, LoanIntelligencePanel
│   ├── providers/           stellar-wallet-provider, app-providers
│   ├── landing/             Marketing page sections
│   └── app-shell/           Layout chrome (sidebar, topbar)
├── hooks/                   Custom React hooks
│   ├── useVaultState.ts     Polls all on-chain state every 8s via React Query
│   ├── useIdentity.tsx      Demo role switcher (admin/senior/junior/borrower)
│   ├── useCollateral.tsx    PRISM Collateral Oracle hooks
│   ├── useSwap.tsx          Soroswap swap hook (rewired from prism_amm)
│   └── useSimulationActions.tsx  Admin action mutations
├── lib/                     Shared non-React utilities (utils.ts, waitlist.ts)
├── soroban/                 Soroban contract workspace
│   ├── prism-core/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs       Main contract (all handlers)
│   │       ├── state.rs     Vault, Tranche, Loan, CollateralRecord, etc. structs
│   │       ├── storage.rs   DataKey enum + persistent accessors
│   │       ├── errors.rs    PrismError enum
│   │       ├── math.rs      Q64.64 fixed-point arithmetic (Q64_ONE = 1u128 << 64)
│   │       ├── reflector.rs Reflector oracle client bindings
│   │       ├── soroswap.rs  Soroswap router client bindings
│   │       └── tests.rs     Integration tests (soroban-sdk testutils harness)
│   ├── Cargo.toml           Workspace root; soroban-sdk = "22.0"
│   ├── keys/                Testnet keypairs (committed — testnet only!)
│   ├── deployments/         testnet.json — deployed contract IDs
│   └── scripts/             deploy.sh, oracle-allowlist.sh, update-admin.sh
└── docs/                    Architecture docs — see stellar-migration-plan.md §15
```

---

## Key architectural patterns

### Simulation identity system

The dashboard is a **demo simulation**, not a live wallet-connected dApp. `useIdentity` (`hooks/useIdentity.tsx`) manages four in-memory Stellar Keypairs:

- `admin` — triggers credit events, yield accrual, and loan admin actions
- `senior` / `junior` — LP investors in Prime and Alpha tranches
- `borrower` — receives disbursed loans, repays, and initiates MoneyGram funding

The admin keypair's public address is pinned to the deployer address (`NEXT_PUBLIC_ADMIN_ADDRESS`); its secret is not on the client. Admin button flows display a "needs deployer wallet" message rather than failing silently. All other role keypairs are random per session.

`buildCoreClient(keypair)` from `app/lib/stellar.ts` is the call-site factory for all on-chain interactions. It handles `simulate → prepare → sign → submit`.

### Vault state polling

`useVaultState` (`hooks/useVaultState.ts`) is the central data source. It fetches all on-chain state (config, vault, tranches, loans, reserve balances) via Soroban RPC `simulateTransaction` in parallel and returns a single snapshot refreshed every 8 seconds via React Query. All UI reads from this one hook — do not add duplicate RPC calls in components.

### Oracle attestation pattern

All three oracle types (Collateral, Encrypt, Cloak) share the same Ed25519 attestation pattern. On-chain verification collapses to a single call:

```rust
env.crypto().ed25519_verify(&oracle_pubkey, &message, &signature);
```

This replaces the Solana two-instruction precompile pattern. Each oracle has:
- An API route under `app/api/{oracle}-oracle/` that signs the message with an Ed25519 seed
- A client library under `app/lib/{oracle}.ts` that builds the message and calls the route
- An on-chain handler in `soroban/prism-core/src/lib.rs` that verifies and advances state

The oracle pubkey must be in `Config.oracle_allowlist` before it can sign.

### Contract addresses

Contract IDs are stable 56-char Stellar StrKey strings (`CXX...`) derived from WASM hash + salt at deploy time. Never hardcode — always use `ACTIVE_CONTRACTS` from `app/lib/addresses.ts`:

```typescript
import { ACTIVE_CONTRACTS } from '@/app/lib/addresses';
const id = ACTIVE_CONTRACTS.prismCore;
```

`ACTIVE_NETWORK` defaults to `'testnet'` unless `NEXT_PUBLIC_STELLAR_NETWORK=mainnet`.

### Soroswap (AMM)

Tranche token pools live on Soroswap (Uniswap-V2 CPMM). The `prism_amm` Solana program is deleted; swap UI calls Soroswap router via `app/lib/soroswap.ts`. Pool seeding is admin-only via `seed_pool_liquidity` on the core contract.

---

## Environment variables

```bash
# Stellar / Soroban
NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID    # Deployed prism_core contract StrKey (CXX...)
NEXT_PUBLIC_USDC_CONTRACT_ID          # USDC / TUSDC SAC contract StrKey
NEXT_PUBLIC_SOROSWAP_ROUTER_ID        # Soroswap router contract StrKey
NEXT_PUBLIC_SOROSWAP_FACTORY_ID       # Soroswap factory contract StrKey
NEXT_PUBLIC_REFLECTOR_CONTRACT_ID     # Reflector oracle contract StrKey
NEXT_PUBLIC_SOROBAN_RPC_URL           # Soroban RPC (default: https://soroban-testnet.stellar.org)
NEXT_PUBLIC_HORIZON_URL               # Horizon (default: https://horizon-testnet.stellar.org)
NEXT_PUBLIC_NETWORK_PASSPHRASE        # Stellar network passphrase
NEXT_PUBLIC_STELLAR_NETWORK           # 'testnet' (default) or 'mainnet'
NEXT_PUBLIC_VAULT_ID                  # Active vault id (default: 0)
NEXT_PUBLIC_ADMIN_ADDRESS             # Deployer G-address pinned to admin role

# MoneyGram SEP-24
NEXT_PUBLIC_MONEYGRAM_ANCHOR_DOMAIN   # MoneyGram anchor home domain (default: stellar.moneygram.com)
NEXT_PUBLIC_MONEYGRAM_ASSET_CODE      # Asset to deposit (default: USDC)

# Oracle signer seeds (server-side only — never NEXT_PUBLIC_)
COLLATERAL_ORACLE_SEED                # Primary Ed25519 seed (hex or mnemonic)
COLLATERAL_ORACLE_SEED_DEV            # Dev/testnet fallback seed
ENCRYPT_ORACLE_SECRET_SEED            # Encrypt oracle primary seed
CLOAK_ORACLE_SEED                     # Cloak oracle primary seed

# Database
DATABASE_URL                          # Postgres connection string
```

---

## Rust / Soroban conventions

### Naming

- **Modules / files:** `snake_case` — `math.rs`, `reflector.rs`, `storage.rs`
- **Structs / enums:** `PascalCase` — `Vault`, `TrancheKind`, `PrismError`
- **Functions / variables:** `snake_case` — `compute_nav_q`, `total_assets`
- **Constants:** `SCREAMING_SNAKE_CASE` — `Q64_ONE`, `MSG_PREFIX`
- **Contract functions:** `snake_case` matching the exported name — `pub fn deposit(env: Env, user: Address, ...)`
- **DataKey variants:** `PascalCase` — `DataKey::Vault(u32)`, `DataKey::Collateral(u32)`

### Style

- Use `cargo fmt` defaults (4-space indent, 100-char line width)
- Imports grouped: `std`, then external crates, then `crate::`
- Doc comments (`///`) on public contract functions only
- No `unwrap()` or `expect()` in contract handlers — use `ok_or(PrismError::X)?`

### Auth and state storage

```rust
// Every user-facing handler requires explicit auth:
user.require_auth();

// All persistent state uses DataKey + extend_ttl:
env.storage().persistent().set(&DataKey::Vault(vault_id), &vault);
env.storage().persistent().extend_ttl(&DataKey::Vault(vault_id), THRESHOLD, EXTEND_TO);
```

### Error handling

- All custom errors in `soroban/prism-core/src/errors.rs` as `PrismError`
- Pattern: `if !condition { return Err(PrismError::X); }`
- Never panic in handlers; never use `anyhow`/`thiserror` for contract code

### Math

- Use the `math` module for all NAV math — don't reimplement
- Use `checked_*` methods for multi-step arithmetic
- Q64.64 representation: `u128` where `Q64_ONE = 1u128 << 64` represents 1.0

### Soroban gotchas

| Don't | Do |
|---|---|
| ❌ Forget `require_auth()` on user-facing handlers | ✅ Every `Address` arg calls `addr.require_auth()` before state changes |
| ❌ Skip `extend_ttl()` after touching persistent storage | ✅ Every handler that reads/writes a persistent key extends its TTL |
| ❌ Use `unwrap()` or `expect()` in contract handlers | ✅ Use `ok_or(PrismError::X)?` throughout |
| ❌ Store a running balance manually | ✅ USDC balance is held by the contract's own address via the SAC |
| ❌ Call `env.crypto().ed25519_verify()` without checking replay | ✅ Always consume the nonce via `DataKey::NonceUsed([u8;32])` first |
| ❌ Hardcode network addresses in contract code | ✅ Pass them as constructor args stored in `Config` |

---

## TypeScript / Next.js conventions

### Naming

- **Files:** `PascalCase` for components (`StellarBorrowForm.tsx`), `camelCase` for hooks/utilities (`useSwap.ts`, `soroswap.ts`)
- **React components:** `PascalCase` — `<StellarBorrowForm />`, `<TrancheBar />`
- **Hooks:** `useXxx` prefix — `useVaultState`, `useCollateral`
- **Constants:** `SCREAMING_SNAKE_CASE` — `Q64_ONE`, `ACTIVE_CONTRACTS`
- **Types / interfaces:** `PascalCase` — `TrancheKind`, `CollateralAttestation`
- **Variables / functions:** `camelCase` — `navPerShare`, `initiateMoneyGramDeposit`

### Style

- 2-space indent, single quotes, semicolons, 100-char line width (Prettier defaults)
- ESLint `next/core-web-vitals` config
- Functional components only — no class components
- `const` over `let` — `let` only when reassigning
- Named exports over default exports (default only for Next.js page files)
- Imports: React → next → external libs → `@/app/lib/...` → `@/components/...` → relative

### React patterns

- All async data fetching through React Query (`@tanstack/react-query`)
- All mutations through `useMutation` — never bare `await contract.invoke(...)` in components
- All errors surface via `sonner` toast (`import { toast } from 'sonner'`) — never silent
- The wallet kit (`useStellarWallet`) is used for user-facing flows; the simulation harness uses `useIdentity` keypairs directly

### Soroban TS gotchas

| Don't | Do |
|---|---|
| ❌ Pass `u128` / `i128` values as JS numbers | ✅ Use `BigInt` and `nativeToScVal(value, { type: 'i128' })` |
| ❌ Hardcode contract IDs inline | ✅ Import from `app/lib/addresses.ts` via `ACTIVE_CONTRACTS` |
| ❌ Call the contract without simulating first | ✅ Use `buildCoreClient(keypair).invoke(...)` which handles simulate+prepare+send |
| ❌ Read on-chain state with a raw transaction | ✅ Use `buildCoreClient().read(...)` which does a dry-run simulation |
| ❌ Use `new BN(value)` (Anchor idiom) | ✅ Use native `BigInt` — Soroban SDK uses `bigint` throughout |

---

## Test conventions

### Rust tests (in `soroban/prism-core/src/tests.rs`)

- `snake_case` test names: `test_waterfall_locked_demo_numbers`
- Use the `soroban_sdk::testutils::Env::default()` harness + `register_contract`
- Hardcode expected NAV values from [docs/12-reference-card.md](docs/12-reference-card.md) §4.3 and §4.5

```rust
#[test]
fn test_waterfall_locked_demo_numbers() {
    let env = Env::default();
    // ... setup ...
    assert_eq!(prime_nav, expected_q64);
}
```

### Running tests

```bash
cargo test -p prism-core                          # All tests
cargo test -p prism-core -- waterfall             # Substring match
cargo test -p prism-core -- --nocapture           # Show println! output
```

---

## Git conventions

- **Conventional commits:** `type(scope): subject`
- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`
- Scopes: `core`, `app`, `tests`, `scripts`, `docs`, `oracle`

### Don't commit

- `.env` (only `.env.example` is committed)
- `soroban/target/` (Rust build output)
- `node_modules/`, `.next/`, `test-ledger/`
- Any mainnet keys (testnet keys in `soroban/keys/` are OK)

---

## Editing the design docs

The numbered docs in `docs/` (`00-overview.md` through `12-reference-card.md`) are **locked architecture** for the financial model. Don't modify them unless the user explicitly asks. For chain-specific concerns, [stellar-migration-plan.md](stellar-migration-plan.md) is the authoritative override.

---

## Hard rules (don't break)

1. Tier 1 (`deposit`, `accrue_yield`, `trigger_credit_event`) must work correctly before any Tier 2 or 3 work begins
2. The vault USDC reserve invariant (`reserve_balance == Σ tranche.total_assets + loss_bucket_balance`) holds at all times — enforced in the contract's cascade handler
3. NAV edge cases: handle first-deposit (mint 1:1 at Q64_ONE), total wipeout (block deposits with `TrancheWipedNoDepositsAllowed`), post-wipe withdraw (returns 0 USDC — intentional)
4. Test math values must match §4.3 and §4.5 of `12-reference-card.md` exactly
5. No Solana/Anchor imports anywhere in `app/`, `components/`, or `hooks/` — run `grep -r "@solana\|@coral-xyz" app/ hooks/ components/` to verify
6. Never modify locked architecture without user approval

If still stuck, **stop and ask the user** — one clarification beats 200 lines of wrong code.
