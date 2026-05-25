# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

You are coding on the PRISM Protocol codebase. These rules apply to every file you write or edit.

If you're new to this project, **read [docs/README.md](docs/README.md) first** for orientation, then this file, then [docs/12-reference-card.md](docs/12-reference-card.md). After that, you have full context to start coding.

---

## Commands

### Frontend (root — pnpm)

```bash
pnpm dev          # Start Next.js dev server (port 3000)
pnpm build        # Production build
pnpm lint         # ESLint
```

### Contracts (cd contracts — yarn)

```bash
cd contracts
yarn build                    # anchor build
yarn test                     # anchor test (spins up localnet)
yarn test:skip-build          # anchor test --skip-build (faster iteration)
yarn deploy:devnet            # deploy to devnet
yarn setup                    # ts-node scripts/setup-demo.ts (seeds demo state)
yarn format                   # prettier on tests/ and scripts/
```

### IDL sync (run after every contract change)

```bash
cd contracts && anchor build
cp contracts/target/idl/*.json app/lib/idl/
# Then commit both the program binary and the updated IDL JSON files
```

### Run a single test file

```bash
cd contracts && yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/prism-core.ts
```

---

## Project structure

```
prism-protocol/
├── app/                     Next.js App Router pages
│   ├── (app)/               Route group: authenticated app shell
│   │   ├── dashboard/       Simulation harness UI
│   │   └── borrower/        Borrower collateral onboarding
│   ├── api/                 Route handlers (waitlist, ika-test-oracle)
│   └── lib/                 Frontend-only utilities
│       ├── constants.ts     Program IDs, TrancheKind enum, TRANCHE_CONFIG
│       ├── pda.ts           All PDA derivation functions
│       ├── program.ts       buildProvider() / buildPrograms() factory
│       ├── ika.ts           IKA Network dWallet integration
│       └── idl/             Auto-generated IDL JSON (DO NOT edit manually)
├── components/              React components by domain
│   ├── simulation/          SimulationHarness, VaultStateDashboard, etc.
│   ├── borrower/            CollateralOnboarding, LoanApplicationForm
│   ├── admin/               AdminPanel
│   ├── landing/             Marketing page sections
│   └── app-shell/           Layout chrome (sidebar, topbar)
├── hooks/                   Custom React hooks
│   ├── useVaultState.ts     Polls all on-chain state every 5s via React Query
│   ├── useIdentity.tsx      Demo role switcher (admin/senior/junior/borrower)
│   ├── useIkaCollateral.tsx IKA dWallet collateral read/write hooks
│   └── useSimulationActions.tsx  Admin action mutations
├── lib/                     Shared non-React utilities (utils.ts, waitlist.ts)
├── contracts/               Anchor workspace (Rust programs + tests)
│   ├── programs/
│   │   ├── prism-core/      Credit engine: tranches, vault, loans, yield, default
│   │   └── prism-amm/       Constant-product AMM for tranche tokens
│   ├── tests/               Mocha integration tests (prism-core.ts, prism-amm.ts)
│   ├── scripts/             setup-demo.ts — seeds full demo state on localnet/devnet
│   ├── keys/                Devnet keypairs (committed — devnet only!)
│   └── Anchor.toml          Cluster = localnet; devnet program IDs listed here
├── docs/                    Architecture docs — see reading order in docs/README.md
└── doc-website/             Documentation website (separate package)
```

---

## Key architectural patterns

### Simulation identity system

The dashboard is a **demo simulation**, not a real wallet-connected dApp. `useIdentity` (`hooks/useIdentity.tsx`) manages four hardcoded demo keypairs loaded from `contracts/keys/`:

- `admin` — triggers credit events, yield, and setup
- `senior` / `junior` — LP investors in Prime and Alpha tranches
- `borrower` — receives disbursed loans and repays

All on-chain calls use `buildPrograms(connection, keypair)` from `app/lib/program.ts` with the active role's keypair, not the browser wallet. The wallet adapter is only used in the borrower IKA collateral flow.

### Vault state polling

`useVaultState` (`hooks/useVaultState.ts`) is the central data source. It fetches all accounts (config, vault, tranches, AMM pools, loan, reserves) in parallel and returns a single snapshot, refreshed every 5 seconds via React Query. All UI reads from this one hook — do not add duplicate RPC calls in components.

### IKA Network collateral integration

`app/lib/ika.ts` handles dWallet collateral from IKA Network (Sui-based threshold MPC). The flow:

1. Borrower runs DKG on IKA testnet via Sui SDK → gets a `dwalletId`
2. Transfers BTC/ETH to the derived address
3. IKA oracle signs an 81-byte attestation message
4. Frontend builds a two-instruction tx: Ed25519 precompile (ix[0]) + `verify_ika_collateral` (ix[1])
5. `verify_ika_collateral` reads the precompile result via the instructions sysvar

The attestation message layout in `ika.ts` must stay byte-identical to `verify_ika_collateral.rs`.

### PDA derivation

All PDAs are derived in `app/lib/pda.ts` (frontend) and mirrored in `contracts/lib/pda.ts` (scripts/tests). Never hardcode addresses — use the exported helpers. PDA seeds match exactly what's in the Rust program's `pda.rs`.

---

## Environment variables

```bash
NEXT_PUBLIC_PRISM_CORE_PROGRAM_ID   # Defaults to IDL address if unset
NEXT_PUBLIC_PRISM_AMM_PROGRAM_ID    # Defaults to IDL address if unset
NEXT_PUBLIC_USDC_MINT               # Defaults to devnet USDC if unset
NEXT_PUBLIC_VAULT_ID                # Defaults to 0
NEXT_PUBLIC_IKA_FULLNODE_URL        # Defaults to https://fullnode.testnet.ika.xyz
NEXT_PUBLIC_IKA_NETWORK             # "testnet" or "mainnet", defaults to "testnet"
```

---

## Rust / Anchor conventions

### Naming

- **Modules / files:** `snake_case` — `nav.rs`, `waterfall.rs`, `accrue_yield.rs`
- **Structs / enums:** `PascalCase` — `Tranche`, `CreditEventType`
- **Functions / variables:** `snake_case` — `compute_nav_q`, `total_assets`
- **Constants:** `SCREAMING_SNAKE_CASE` — `Q64_ONE`, `MIN_LIQUIDITY`
- **Anchor instruction handlers:** `snake_case` matching the instruction name — `pub fn deposit(ctx: Context<Deposit>, ...)`
- **Anchor account contexts:** `PascalCase` matching the instruction — `pub struct Deposit<'info>`
- **PDA seed strings:** lowercase — `b"config"`, `b"loss_bucket"`, `b"tranche"`

### Style

- Use `cargo fmt` defaults (4-space indent, 100-char line width)
- Imports grouped: `std`, then external crates, then `crate::`
- One `use` line per item, not bundled (Anchor's convention)
- Doc comments (`///`) on **public** items only
- No `unwrap()` in instruction handlers — use `?` with our `PrismError` enum

### Error handling

- All custom errors in `contracts/programs/prism-core/src/errors.rs` and `contracts/programs/prism-amm/src/errors.rs`
- Pattern: `require!(condition, PrismError::SpecificError);`
- For computed errors: `return Err(PrismError::X.into());`
- Never use generic `anyhow` or `thiserror` errors in handlers
- See [docs/12-reference-card.md](docs/12-reference-card.md) for the full error enum

### Account validation

- Prefer Anchor's `#[account(...)]` constraints over imperative checks in handlers
- Use `has_one`, `seeds`, `bump`, `constraint = ...` aggressively
- For PDA bumps: pass `bump = stored_bump_value` when reading existing accounts. Use `bump` (no value) only on `init`
- For `init` instructions: use `init_if_needed` only when truly needed. Otherwise use `init` so a duplicate init fails loudly

### Math

- Use the `math::q` module for all NAV math — don't reimplement
- Use `checked_*` methods (`checked_add`, `checked_mul`) for any multi-step arithmetic
- Q64.64 representation: `u128` where `Q64_ONE = 1u128 << 64` represents 1.0

### Anchor footguns

| Don't | Do |
|---|---|
| ❌ `bump` (no value) when reading an existing PDA | ✅ `bump = vault.bump` (stored bump) |
| ❌ `init` on a token account that already exists | ✅ `init_if_needed` (sparingly) |
| ❌ Use `ctx.bumps.get("name")` (deprecated) | ✅ `ctx.bumps.name` (Anchor 0.30+) |
| ❌ Forget `mut` on accounts you modify | ✅ Add `mut` to every account whose data or lamports change |
| ❌ Pass mints as `UncheckedAccount` | ✅ `Account<'info, Mint>` |
| ❌ Sign CPI without seeds for PDA-controlled accounts | ✅ `CpiContext::new_with_signer(...)` with seeds |
| ❌ Skip `space = 8 + Struct::INIT_SPACE` on `init` | ✅ Always derive `InitSpace` and use the macro |
| ❌ Recompute PDA bumps in handlers | ✅ Store the bump at init time, read it later |
| ❌ Forget `system_program` in `init` contexts | ✅ Always include it |

---

## TypeScript / Next.js conventions

### Naming

- **Files:** `PascalCase` for components (`TrancheBar.tsx`), `camelCase` for hooks/utilities (`useTranche.ts`, `pda.ts`)
- **React components:** `PascalCase` — `<TrancheBar />`, `<DepositForm />`
- **Hooks:** `useXxx` prefix — `useTranche`, `useDeposit`
- **Constants:** `SCREAMING_SNAKE_CASE` — `Q64_ONE`, `DEMO_WALLETS`
- **Types / interfaces:** `PascalCase` — `TrancheKind`, `UserPnL`
- **Variables / functions:** `camelCase` — `navPerShare`, `computeShares`

### Style

- 2-space indent, single quotes, semicolons, 100-char line width (Prettier defaults)
- ESLint `next/core-web-vitals` config
- Functional components only — no class components
- `const` over `let` — `let` only when reassigning
- Named exports over default exports (default only for Next.js pages)
- Imports: React → next → external libs → `@/app/lib/...` → `@/components/...` → relative

### React patterns

- All async data fetching through React Query (`@tanstack/react-query`)
- All mutations through `useMutation` — never bare `await program.methods.X.rpc()` in components
- All transactions wait for `commitment: "confirmed"`
- All errors surface via `sonner` toast (`import { toast } from 'sonner'`) — never silent
- The wallet adapter (`useWallet`, `useConnection`) is used only in the IKA collateral flow; the simulation harness uses `useIdentity` keypairs directly

### Anchor TS gotchas

| Don't | Do |
|---|---|
| ❌ Use raw `BN` arithmetic without `.toString()` for display | ✅ Always `.toString()` or convert to number for UI |
| ❌ Pass numbers directly as `u64` args | ✅ Wrap in `new BN(value)` |
| ❌ Hardcode PDA addresses | ✅ Derive via `app/lib/pda.ts` helpers |
| ❌ Build instructions then call `.rpc()` separately | ✅ For multi-ix tx: build with `.instruction()`, combine in `Transaction`, send via `provider.sendAndConfirm` |

---

## Test conventions

### Rust unit tests (in `contracts/programs/*/src/math/*.rs`)

- `snake_case` test names: `test_compute_nav_q_with_zero_supply`
- Use `#[cfg(test)] mod tests { ... }` pattern
- Hardcode expected values from [docs/04-data-flows.md](docs/04-data-flows.md) tables

### TypeScript integration tests (in `contracts/tests/`)

- Mocha + Chai (Anchor's default)
- `it("...")` style: `it("mints shares 1:1 on first deposit at NAV 1.0", async () => {...})`
- Group with `describe("instruction_name", () => {...})`
- Assert exact NAV values from §4.3 and §4.5 — math correctness is the highest-risk failure

---

## Git conventions

- **Conventional commits:** `type(scope): subject`
- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`
- Scopes: `core`, `amm`, `app`, `tests`, `scripts`, `docs`

### Don't commit

- `.env` (only `.env.example` is committed)
- `contracts/target/` (Rust build output)
- `node_modules/`, `.next/`, `test-ledger/`
- Any mainnet keys (devnet keys in `contracts/keys/` are OK)

---

## Editing the design docs

The numbered docs in `docs/` (`00-overview.md` through `09-lld-completion.md`) are **locked architecture**. Don't modify them unless the user explicitly asks, you found a real inconsistency, or you're propagating a locked decision.

---

## Hard rules (don't break)

1. Tier 1 (`deposit`, `accrue_yield`, `trigger_credit_event`) must work perfectly before any Tier 2 or 3 work begins
2. The vault USDC reserve invariant (`reserve.amount == sum(tranche.total_assets)`) holds at all times — enforce on default by transferring loss to `loss_bucket` PDA
3. NAV edge cases: handle first-deposit (mint 1:1), total wipeout (block deposits with `TrancheWipedNoDepositsAllowed`), post-wipe withdraw (returns 0 USDC — this is intentional)
4. Test math values must match §4.3 and §4.5 exactly
5. IDL sync after every contract change: `anchor build && cp contracts/target/idl/*.json app/lib/idl/` and commit
6. Never modify locked architecture without user approval

If still stuck, **stop and ask the user** — one clarification beats 200 lines of wrong code.
