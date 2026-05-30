# PRISM on Stellar — Migration Plan

**Status:** Locked. Hard pivot from Solana to Stellar.
**Driver:** Stellar Community Fund grant submission.
**Scope:** Full migration. The Solana deployment is retired, not paralleled.
**Authoring date:** 2026-05-28.
**Last revision:** 2026-05-30 — IKA replaced with self-hosted oracle (§5, §6.1, §6.4, §6.6, §10 Phase 3, §13 Q1, §14); Encrypt oracle marked as needing Stellar-format rewrite; Cloak status reconciled.

This document is the source of truth for the Stellar migration. Anywhere it conflicts with the numbered architecture docs (`00-` through `13-`), this document wins for chain-specific concerns; the numbered docs remain authoritative for the financial model (tranches, NAV, waterfall, cascade).

---

## 1. Why Stellar, why now

PRISM's financial primitive — tranched credit with live NAV, waterfall yield, and cascade losses — is chain-agnostic. The Solana implementation was a fit for the Frontier hackathon. The Stellar pivot is a fit for **product** reasons, not just grant reasons:

| Reason | Why it matters for PRISM |
|---|---|
| **Native USDC on Stellar** issued by Circle | No bridge risk, no fragmented liquidity. PRISM is a USDC product. |
| **Soroban is Rust** | The existing `math/q.rs` module, instruction handlers, and state shapes port directly. No language change. |
| **Composable DeFi layer is small but real** | Soroswap (AMM), Reflector (oracle), Blend (lending), all audited and live. We compose instead of reinventing. |
| **MoneyGram Access** | Stellar's fiat on/off-ramp is the strongest in any L1. Replaces the Dodo demo with a real distribution channel. |
| **Lower RPC and storage cost** | Soroban's storage rent model is cheaper than Solana rent for our data volume. |
| **Regulated-friendly chain narrative** | Stellar's identity is payments + RWA. Tranched credit lands inside that narrative; on Solana it competed for attention. |

Grant fit (see §11): SCF rewards Soroban-native, USDC-denominated, composable-with-ecosystem projects. PRISM hits every bullet.

---

## 2. End-state architecture

```text
                            ┌─────────────────────────────┐
                            │  PRISM Frontend (Next.js)   │
                            │  • Stellar Wallet Kit       │
                            │  • @stellar/stellar-sdk     │
                            │  • React Query polling      │
                            └──────────────┬──────────────┘
                                           │
                              Soroban RPC + Horizon
                                           │
        ┌──────────────────────────────────┼──────────────────────────────────┐
        │                                  │                                  │
        ▼                                  ▼                                  ▼
┌───────────────────┐         ┌───────────────────────┐         ┌──────────────────────┐
│  prism_core       │         │  3× SEP-41 tranche    │         │  Soroswap pools      │
│  Soroban contract │◄────────┤  token contracts      │◄────────┤  (Stellar DEX)       │
│  • Vaults         │  mints  │  pPRIME / pCORE /     │  trade  │  pPRIME/USDC, etc.   │
│  • Tranches       │  burns  │  pALPHA               │         │                      │
│  • NAV math       │         └───────────────────────┘         └──────────────────────┘
│  • Yield waterfall│
│  • Loss cascade   │         ┌───────────────────────┐         ┌──────────────────────┐
│  • Loans          │ reads ──┤  Reflector oracle     │         │  Stellar USDC SAC    │
│  • IKA verify     │         │  (Stellar-native)     │         │  (Circle-issued)     │
│  • Encrypt verify │         └───────────────────────┘         └──────────────────────┘
└─────────┬─────────┘
          │
          │ Ed25519 attestation verify (in-contract)
          │
    ┌─────┴───────────────────────────────────┐
    │ IKA oracle    Encrypt oracle    Admin   │
    │ (off-chain signers)                     │
    └─────────────────────────────────────────┘
```

One core contract owns all PRISM-specific state. Tranche tokens are independent SEP-41 contract instances controlled by the core contract. The AMM is *not* reimplemented — we compose with Soroswap. The oracle layer is Reflector.

---

## 3. Stack mapping (Solana → Stellar)

| Layer | Solana (current) | Stellar (target) |
|---|---|---|
| Smart-contract language | Anchor / Rust | Soroban / Rust |
| Contract artifact | `*.so` deployed via `anchor deploy` | `*.wasm` deployed via `stellar contract deploy` |
| Contract identity | Program ID (`Pubkey`) | Contract address (sha256 of WASM + salt) |
| Authority derivation | PDAs (`find_program_address`) | Contract addresses + auth via `require_auth` |
| State storage | One account per object | `env.storage().persistent()` keyed by `DataKey` enum |
| Token standard | Classic SPL | **SEP-41** Soroban token interface |
| USDC | Circle SPL devnet mint | Circle Stellar Classic asset, used via SAC |
| AMM | Internal `prism_amm` program | **Soroswap** (router + factory + pair contracts) |
| Oracle | (Switchboard planned) | **Reflector** |
| Off-chain attestation verify | Ed25519 native precompile at ix[0] + sysvar read at ix[1] | `env.crypto().ed25519_verify(pk, msg, sig)` — single call |
| Cross-program calls | `CpiContext::new_with_signer` | `client.invoke(...)` with contract auth |
| Events | `emit!` macro | `env.events().publish((topic1, topic2), data)` |
| Frontend SDK | `@solana/web3.js` + `@coral-xyz/anchor` | `@stellar/stellar-sdk` + generated contract bindings |
| Wallet | Solana Wallet Adapter | **Stellar Wallet Kit** (Freighter / xBull / Albedo / LOBSTR / Hana / WalletConnect) |
| Node connection | Helius / public RPC | Soroban RPC + Horizon (SDF or Validation Cloud) |
| Indexing | Helius webhooks / Dune SIM | Soroban event subscription + Horizon |

---

## 4. Stellar products we compose with

We deliberately **do not** reimplement anything Stellar already has. The pitch is "credit primitive that *uses* the Stellar DeFi stack", not "credit primitive that competes with it".

| Component | Stellar product | Role in PRISM | Integration depth |
|---|---|---|---|
| AMM | **Soroswap** (CPMM, Uniswap-V2 model) | Hosts pPRIME/USDC, pCORE/USDC, pALPHA/USDC pools | Direct contract calls + frontend redirect to Soroswap UI |
| Oracle | **Reflector** | Price feeds for IKA collateral mark-to-market and Reflector-triggered credit events | Read-only contract calls |
| Lending reference (no integration) | **Blend Protocol** | Architectural reference for pool/reserve/backstop split | Read source, do not depend |
| Fiat on-ramp | **MoneyGram Access** + Circle Mint | Replaces the Dodo demo for borrower funding and LP entry | Anchor-protocol SEP-24 flow on frontend |
| Cross-chain USDC | **Allbridge Core** + **Wormhole NTT** | Optional borrower USDC source from EVM/Solana | Out-of-protocol; surfaced on frontend |
| Token standard | **SEP-41** | Tranche token interface | We implement |
| Asset bridging into Soroban | **SAC** (Stellar Asset Contract) | USDC Classic → Soroban callable | Use Circle's SAC, do not deploy our own |
| Wallets | **Stellar Wallet Kit** | All wallet UX | Replaces Solana Wallet Adapter |
| Indexing | **Horizon API**, **stellar.expert**, **Mercury** | Event indexing, dashboard analytics | Replaces Dune SIM |

---

## 5. Partner migration matrix

This is the **binding** plan for each Solana-era partner. Status reflects what's locked, what's pending verification, and what is being cut.

| Partner | Solana role | Decision | Notes |
|---|---|---|---|
| **IKA Network** | Cross-chain BTC/ETH collateral via 2PC-MPC dWallets + Ed25519 oracle attestation | **Replace with self-hosted PRISM Collateral Oracle.** IKA's dWallet network has no Stellar support — confirmed 2026-05-30. The Soroban contract has *no* `attach_ika_collateral` / `verify_ika_collateral` handlers (they were never ported). | Build a PRISM-owned Ed25519 signer that emits the same shape of attestation. The on-chain Ed25519 verification pattern is identical; only the signer changes. See §6.6 for the oracle design. Real cross-chain custody is deferred to post-v1; v1 collateral is admin-attested for the demo. |
| **Encrypt FHE** | Off-chain FHE credit score + on-chain commitment + Ed25519 attestation | **Keep on-chain. Rewrite off-chain oracle.** Soroban handlers `attach_encrypt_score` and `verify_encrypt_default` are already implemented and tested. | The mock oracle at [app/api/encrypt-oracle/attest_default/route.ts](../app/api/encrypt-oracle/attest_default/route.ts) still uses `@solana/web3.js` and a Solana pubkey in the message — rewrite to emit the Stellar layout (`loan_id u32 LE + 28 zero bytes`) that [app/lib/encrypt.ts](../app/lib/encrypt.ts) already expects. No real third-party FHE integration; demo uses a PRISM-hosted signer using the Encrypt attestation pattern. |
| **Reflector** | n/a (was going to use Switchboard) | **Add.** Replaces Switchboard. | Use Reflector's public price feeds; pay subscription cost from protocol treasury. |
| **Soroswap** | n/a (was internal `prism_amm`) | **Add.** Replaces `prism_amm` entirely. | `prism_amm` source is deleted in Phase 1. |
| **MoneyGram Access** | n/a | **Add.** Replaces Dodo for fiat demo. | SEP-24 flow on the borrower onboarding screen. |
| **Dodo Payments** | Fiat checkout demo | **Drop.** No Stellar coverage. | Delete `app/lib/dodo.ts`, `app/api/dodo/`, and `hooks/useDodoCheckout.ts`. |
| **Cloak** | Solana shielded payouts | **Status: contradiction — implemented in Soroban contract.** Original plan said "Drop", but `record_cloak_payout` is live in [soroban/prism-core/src/lib.rs:858](../soroban/prism-core/src/lib.rs#L858) with passing tests. Resolution: keep the on-chain handler (cost: zero), keep on the same self-hosted Ed25519 oracle pattern as Encrypt and Collateral. Reclassify Cloak from "external partner" to "internal feature" — same posture as the Collateral oracle. | Frontend integration is not required for the v1 demo. The handler stays callable for future use. |
| **Dune SIM** | Analytics dashboard | **Drop as primary; replace with Horizon + Mercury.** | Keep the dashboard UI; rewire the data source. |
| **Switchboard** | Planned oracle | **Drop.** Reflector replaces it. | Never integrated, no code to remove. |
| **Bags.fm** | Fee-stream collateral | **Drop.** Solana-only by design. | Delete the `feat/bags` work from the active branch line (kept in git history only). |

---

## 6. Soroban contract design

### 6.1 Contract layout

One Soroban contract: `prism_core`. Single `wasm`. No second AMM contract (Soroswap is the AMM).

```text
contracts/
└── prism-core/
    ├── Cargo.toml
    ├── src/
    │   ├── lib.rs              # #[contract] + function exports
    │   ├── storage.rs          # DataKey enum + accessors
    │   ├── state.rs            # Vault, Tranche, Loan, CreditEvent, IkaCollateral, EncryptHealth
    │   ├── errors.rs           # PrismError (mirrors current enum)
    │   ├── events.rs           # event publishers
    │   ├── math/
    │   │   ├── mod.rs
    │   │   └── q.rs            # Q64.64 — copied verbatim from Solana version
    │   ├── tranche_token.rs    # SEP-41 token deployer + ops
    │   ├── soroswap.rs         # client bindings for Soroswap router
    │   ├── reflector.rs        # client bindings for Reflector
    │   ├── attestation.rs      # Ed25519 attestation verifier (Encrypt + Collateral + Cloak)
    │   ├── waterfall.rs        # yield distribution
    │   ├── cascade.rs          # loss application
    │   └── instructions/
    │       ├── mod.rs
    │       ├── initialize.rs
    │       ├── deposit.rs
    │       ├── withdraw.rs
    │       ├── accrue_yield.rs
    │       ├── trigger_credit_event.rs
    │       ├── initialize_loan.rs
    │       ├── disburse_loan.rs
    │       ├── repay_loan.rs
    │       ├── attach_collateral.rs        # PRISM Collateral Oracle (replaces IKA)
    │       ├── verify_collateral.rs        # PRISM Collateral Oracle (replaces IKA)
    │       ├── attach_encrypt_score.rs
    │       ├── verify_encrypt_default.rs
    │       ├── record_cloak_payout.rs      # already implemented; kept
    │       ├── pause.rs
    │       └── reactivate_vault.rs
    └── tests/
        └── integration.rs       # soroban-sdk test harness
```

**Status note (2026-05-30):** the actual tree under `soroban/prism-core/src/` is currently flat (`lib.rs` holds all handlers, plus `state.rs`, `storage.rs`, `errors.rs`, `math.rs`, `tests.rs`). The split-out `instructions/` layout above is the target for Phase 1 cleanup, not the current state.

### 6.2 Storage model

Soroban storage replaces Solana's "each object is an account" pattern. We use a single `DataKey` enum and the `persistent` storage namespace for everything that must survive contract upgrades.

```rust
#[contracttype]
pub enum DataKey {
    Config,                              // GlobalConfig (admin, usdc_sac_address, oracle_allowlist, paused)
    Vault(u32),                          // Vault state by id
    Tranche(u32, TrancheKind),           // Tranche state — (vault_id, kind)
    TrancheToken(u32, TrancheKind),      // SEP-41 contract address for this tranche
    LossBucketBalance(u32),              // u128 (loss bucket is a contract-internal balance, not a separate account)
    Loan(u32, u32),                      // (vault_id, loan_id)
    CreditEvent(u32, u32),               // (vault_id, seq)
    Collateral(u32),                     // PRISM Collateral Oracle state, by loan_id
    EncryptHealth(u32),                  // by loan_id
    NonceUsed([u8; 32]),                 // attestation replay protection
}
```

Key differences from Solana:
- **No PDAs.** Contract addresses are derived from WASM hash + salt at deploy time. The tranche-token contract addresses are stored in `DataKey::TrancheToken(...)` after deploy.
- **No separate token accounts.** USDC balance is held by the `prism_core` contract address; the contract is the authority. Tranche tokens are SEP-41 contracts that recognise `prism_core` as their admin.
- **Loss bucket is a balance, not an account.** A `u128` slot under `DataKey::LossBucketBalance(vault_id)`. The invariant `reserve == sum(tranche.total_assets) + loss_bucket_balance` still holds.
- **TTL management.** Persistent storage has rent. Each handler that touches a key calls `env.storage().persistent().extend_ttl(key, threshold, extend_to)`. Standard pattern, applied uniformly.

### 6.3 Authority and auth model

Anchor's `Signer<'info>` becomes Soroban's `Address` + `require_auth()`:

```rust
pub fn deposit(env: Env, user: Address, vault_id: u32, kind: TrancheKind, usdc_amount: u128) {
    user.require_auth();
    // ...
}
```

The core contract itself is the authority for:
- Burning/minting tranche tokens (it is the SEP-41 admin)
- Moving USDC out of the reserve to the loss bucket or to borrowers
- Calling Soroswap on behalf of the protocol during initial seeding

Admin actions (`accrue_yield`, `trigger_credit_event`, `pause`, etc.) check the caller against `Config.admin` or `Config.oracle_allowlist`.

### 6.4 Attestation verification (Encrypt, Collateral, Cloak)

Soroban's host functions expose Ed25519 verification directly. The two-instruction precompile pattern from Solana collapses to a single in-contract call. All three oracle types (Encrypt FHE, PRISM Collateral, Cloak) share this pattern — only the message layout differs.

```rust
pub fn verify_collateral(
    env: Env,
    loan_id: u32,
    message: Bytes,            // 73-byte attestation (layout in §6.6)
    signature: BytesN<64>,
) -> Result<(), PrismError> {
    let collateral = storage::read_collateral(&env, loan_id)
        .ok_or(PrismError::CollateralNotAttached)?;

    // Single host call — no precompile, no sysvar parsing.
    env.crypto()
        .ed25519_verify(&collateral.oracle_pubkey, &message, &signature);

    // Parse binding fields, advance state, write back.
    // ...
}
```

Encrypt (`verify_encrypt_default`) is already implemented this way in [soroban/prism-core/src/lib.rs:717](../soroban/prism-core/src/lib.rs#L717). Cloak (`record_cloak_payout`) at [lib.rs:858](../soroban/prism-core/src/lib.rs#L858) uses the same call shape. PRISM Collateral (`verify_collateral`) is the new handler added in Phase 3 — see §6.6 for the full message layout.

### 6.5 Math (zero rework)

`math/q.rs` is copied unchanged. Q64.64 fixed-point on `u128` works identically on Soroban. The Solana unit tests in [math/q.rs:78-100](../contracts/programs/prism-core/src/math/q.rs#L78-L100) port to the `soroban_sdk::testutils` harness with no logic change.

### 6.6 PRISM Collateral Oracle (IKA replacement)

IKA Network does not support Stellar and has no roadmap to support it. The dWallet MPC layer is bound to Sui's consensus and validator set; porting it is not a partner ask, it's a multi-year engineering project. For v1, PRISM ships a **self-hosted Ed25519 oracle** that emits the same shape of attestation, and the on-chain verifier consumes it the same way.

**Trust model (honest framing for the SCF deck):**
- v1: the PRISM team holds the oracle key. Collateral declarations are administrative.
- v1.5: oracle is moved behind a 2-of-3 multisig (Stellar SEP-23 ed25519 or off-chain m-of-n).
- v2: replaced with a real cross-chain custody attestation (candidates: Wormhole NTT custody proofs, LayerZero DVNs, or — if/when it ships — IKA on Stellar).

This sequencing is **explicit in the SCF submission**: we are not claiming trust-minimised collateral on day one. The credit primitive itself (tranches, NAV, waterfall, cascade) is fully on-chain and trustless; the collateral attestation is a known custodial layer with a documented decentralisation path.

**Message layout (73 bytes — mirrors the Encrypt message size for symmetry):**

```text
bytes  0..8     b"col_atts"                      magic prefix
bytes  8..12    loan_id (u32 LE)
bytes 12..16    chain_id (u32 LE)                0=BTC, 1=ETH, 2=SOL, 3=XLM, 4=USDC-Stellar
bytes 16..48    asset_address (32 bytes)         hash of (chain || raw_addr) — chain-agnostic
bytes 48..56    amount_usd_micro (u64 LE)        marked-to-market USD value
bytes 56..64    valued_at_ts (i64 LE)            unix timestamp when oracle priced it
bytes 64..72    nonce (u64 LE)                   replay protection
byte  72        status (0x01=attached, 0x02=released, 0x03=liquidated)
```

The `chain_id` field intentionally generalises beyond BTC/ETH — Stellar-native USDC counts as "collateral" too, which lets the same path handle on-Stellar overcollateralisation.

**On-chain state:**

```rust
#[contracttype]
pub struct CollateralRecord {
    pub loan_id: u32,
    pub borrower: Address,
    pub oracle_pubkey: BytesN<32>,
    pub chain_id: u32,
    pub asset_address: BytesN<32>,
    pub amount_usd_micro: u64,
    pub valued_at_ts: i64,
    pub nonce: u64,
    pub status: CollateralStatus,
}
```

**Handlers added in Phase 3:**
- `attach_collateral(borrower, loan_id, oracle_pubkey)` — registers which oracle is authorised for this loan; oracle pubkey must be in `config.oracle_allowlist`.
- `verify_collateral(relayer, loan_id, message, signature)` — verifies the Ed25519 signature, parses bindings, advances `CollateralStatus`. Required before `disburse_loan` is allowed.
- `release_collateral(borrower, loan_id, message, signature)` — symmetric path on full repayment.
- `liquidate_collateral(admin, loan_id, message, signature)` — admin-triggered, fires loss cascade.

**Off-chain pieces:**
- New route `app/api/collateral-oracle/attest/route.ts` — Ed25519 signer (deterministic seed in dev, env-injected in prod).
- New `app/lib/collateral.ts` — message builder and HTTP client (replaces the `app/lib/ika.ts` runtime; the `IKA_*` exports stay as deprecated aliases for one release).
- New `hooks/useCollateral.tsx` — replaces `hooks/useIkaCollateral.tsx`.

The IKA-flavoured Sui DKG flow and BTC address derivation are dropped — none of it composes with Stellar.

---

## 7. Token model: SEP-41 Soroban tokens

**Decision: SEP-41 Soroban-native tokens, not Classic assets wrapped via SAC.**

Reasoning:
- Soroswap consumes SEP-41 directly. No SAC wrapping step.
- Tranche tokens are *not* meant to circulate on Stellar Classic. They are protocol instruments.
- Future tranche-aware features (e.g. transfer hooks for compliance, restricted lists) need contract-level control we cannot get from Classic.

Each vault produces 3 SEP-41 contract instances:
- `pPRIME_v{id}` — Prime tranche
- `pCORE_v{id}` — Core tranche
- `pALPHA_v{id}` — Alpha tranche

The `prism_core` contract is the SEP-41 admin for all three. `prism_core` calls `mint` and `burn` directly via the SEP-41 token client during `deposit` and `withdraw`. Users see standard SEP-41 balances in their wallets, transferable, tradeable on Soroswap.

USDC is the only exception: it is Circle's Classic asset, used via its SAC. The core contract holds USDC via the SAC and treats it as a SEP-41 client.

Decimals: 7 to match Stellar Classic (USDC included). This is a change from the Solana version's 6 decimals — the Q64.64 math is decimal-agnostic so no math change, only the display formatter.

---

## 8. Frontend migration

### 8.1 Files that get rewritten

| File | Change |
|---|---|
| [app/lib/program.ts](../app/lib/program.ts) | Replace with `app/lib/contract.ts` — Soroban contract client factory using `@stellar/stellar-sdk` |
| [app/lib/pda.ts](../app/lib/pda.ts) | Delete. Replaced by `app/lib/addresses.ts` — registry of deployed contract addresses by network |
| [app/lib/idl/](../app/lib/idl/) | Delete. Soroban contract specs live in generated TS bindings under `app/lib/bindings/` |
| [app/lib/constants.ts](../app/lib/constants.ts) | Strip Solana constants (`PRISM_*_PROGRAM_ID`, `USDC_MINT`). Add `PRISM_CORE_CONTRACT_ID`, `USDC_SAC_ADDRESS`, `SOROSWAP_ROUTER_ID`, `REFLECTOR_ORACLE_ID`, network selector |
| [components/providers/app-providers.tsx](../components/providers/app-providers.tsx) | Swap `SolanaWalletProvider` for **Stellar Wallet Kit** provider. Drop the Sui dapp-kit blocks. |
| [hooks/useVaultState.ts](../hooks/useVaultState.ts) | Same shape, same React Query polling, new implementation: Soroban RPC `simulateTransaction` reads + Horizon for token balances |
| [hooks/useIdentity.tsx](../hooks/useIdentity.tsx) | Keypair source becomes Stellar `Keypair`. The 4 demo roles (admin/senior/junior/borrower) stay. |
| [hooks/useDeposit.tsx](../hooks/useDeposit.tsx), [useSwap.tsx](../hooks/useSwap.tsx), [useRepayLoan.tsx](../hooks/useRepayLoan.tsx), [useSimulationActions.tsx](../hooks/useSimulationActions.tsx) | Replace Anchor `program.methods.X.rpc()` with Soroban `contract.invoke(...)` |
| [hooks/useIkaCollateral.tsx](../hooks/useIkaCollateral.tsx) | **Replaced** by `hooks/useCollateral.tsx`. Kept as deprecated re-export through Phase 3; deleted in Phase 4. |
| [app/lib/ika.ts](../app/lib/ika.ts) | **Replaced** by `app/lib/collateral.ts` calling the new PRISM Collateral Oracle (§6.6). IKA-flavoured types stay as deprecated aliases through Phase 3; deleted in Phase 4. |
| [app/lib/encrypt.ts](../app/lib/encrypt.ts) | Already Stellar-shaped (loan_id u32 message layout). No change. |
| [app/api/encrypt-oracle/attest_default/route.ts](../app/api/encrypt-oracle/attest_default/route.ts) | **Rewrite.** Currently uses `@solana/web3.js` and a Solana pubkey in the message — does not match what the Soroban verifier expects. Emit Stellar 73-byte layout; return oracle pubkey as hex. |
| Everything in `components/landing/`, `components/dashboard/`, `components/simulation/`, etc. | **Unchanged.** Pure UI components consume hooks. |

### 8.2 Files that get deleted

```text
app/lib/cloak.ts
app/lib/dodo.ts
app/lib/dune-sim.ts                  # keep file, gut implementation; replace with horizon.ts
app/lib/bags.ts
app/lib/bags-valuation.ts
app/api/cloak-oracle/
app/api/dodo/
app/api/dune/
app/api/sui-proxy/                   # was for IKA-on-Sui RPC; IKA still needs Sui RPC for dWallet ops, keep
app/api/testnet-faucet/              # devnet only; replaced by Stellar Friendbot URL
hooks/useCloakPayout.tsx
hooks/useDodoCheckout.ts
hooks/useFiatInvest.ts
hooks/useFiatRepaymentStatus.ts
contracts/programs/prism-amm/        # entire program directory
```

Sui proxy stays — IKA's dWallet operations still happen on Sui regardless of which destination chain consumes the attestation.

### 8.3 New files

```text
app/lib/contract.ts                  # Soroban contract client (replaces program.ts)
app/lib/addresses.ts                 # Deployed contract registry (replaces pda.ts)
app/lib/bindings/                    # Generated TS bindings: prism_core, sep41, soroswap_router, reflector
app/lib/soroban.ts                   # Soroban RPC helpers (simulate, prepare, send)
app/lib/horizon.ts                   # Horizon helpers (balances, history)
app/lib/reflector.ts                 # Oracle read helpers
app/lib/soroswap.ts                  # AMM helpers (quote, addLiquidity, swap)
app/lib/collateral.ts                # PRISM Collateral Oracle client (replaces ika.ts)
app/api/collateral-oracle/attest/    # PRISM Collateral Oracle Ed25519 signer (replaces ika-test-oracle)
hooks/useCollateral.tsx              # Replaces useIkaCollateral
components/providers/stellar-wallet-provider.tsx
```

---

## 9. Demo flow (preserved arc, new rails)

The financial story does not change. The arc — Setup → Deposit → Yield → Trade #1 → DEFAULT → Trade #2 → Withdraw — is preserved end-to-end. What changes:

| Demo step | Solana rail | Stellar rail |
|---|---|---|
| Wallet connect | Phantom / demo keypairs | Freighter / demo keypairs |
| Deposit USDC into Prime | SPL transfer + mint pPRIME | USDC SAC transfer + SEP-41 mint pPRIME |
| Yield distribution | `accrue_yield` ix from admin | `accrue_yield` invocation from admin |
| Trade #1 (single user swap) | Internal `prism_amm::swap` | **Soroswap router swap** — same UI button, real DEX route |
| Trigger credit event | `trigger_credit_event` ix | Same handler, in Soroban |
| Trade #2 (MM dumps Alpha and Core) | 5 + 2 sequential `prism_amm::swap` calls | 5 + 2 sequential Soroswap router swaps |
| Withdraw | `withdraw` ix burns shares, pays USDC | Same handler, in Soroban |

Locked demo numbers (19.5K vault TVL, 100 USDC yield, 6,500 USDC default loss, Alpha wipeout, Core hit to NAV 0.6798, Prime preserved at NAV 1.00411) do not change. The "killer sentence" at default and the closing line do not change.

The only narrative addition: **Trade #2 is now on a real Stellar DEX (Soroswap), not an internal AMM.** This is a pitch upgrade — judges can independently verify the prices on Soroswap's own UI.

---

## 10. Migration phases

Five phases. Each phase ends with a verifiable artifact. No phase is started until the prior phase's exit criteria are met. Each phase below lists **Implementation steps**, **Tests**, and **Exit criteria**. Tests are not optional — a phase is not complete until its test matrix is green.

### Phase 0 — Foundation (1–2 days)

**Goal:** Working Soroban dev loop.

**Implementation steps**
1. Install toolchain: `stellar` CLI ≥ 22.x, `rustup target add wasm32-unknown-unknown`, `cargo install --locked soroban-cli` (if not bundled).
2. Add `contracts-stellar/` workspace alongside (not replacing) `contracts/` until Phase 4. Workspace `Cargo.toml` pins `soroban-sdk = "22.0.0"`.
3. Create `contracts-stellar/prism-core/` with skeleton contract: one `hello(to: String) -> String` function.
4. Friendbot-fund an admin keypair, commit under `contracts-stellar/keys/admin.json` (testnet only).
5. Add `contracts-stellar/scripts/deploy.sh` wrapper around `stellar contract deploy`.
6. Add CI job `ci/stellar-build.yml` that runs `cargo build --target wasm32-unknown-unknown --release` on every push to a `stellar/*` branch.

**Tests**
| ID | Test | How to run | Pass criteria |
|---|---|---|---|
| P0-T1 | WASM builds | `cargo build --target wasm32-unknown-unknown --release -p prism-core` | exit 0, `.wasm` < 512 KB |
| P0-T2 | Contract deploys to testnet | `bash contracts-stellar/scripts/deploy.sh` | returns contract ID, no panic |
| P0-T3 | Hello invocation | `stellar contract invoke --id $CID -- hello --to world` | returns `["Hello", "world"]` |
| P0-T4 | CI smoke | push to `stellar/phase-0` branch | green check in GitHub Actions |

**Exit criteria:** All P0 tests pass. Contract ID committed to `contracts-stellar/deployments/testnet.json`.

---

### Phase 1 — Core protocol port (4–6 days)

**Goal:** Tier 1 instructions working on Soroban testnet with byte-exact NAV reproduction.

**Implementation steps**
1. Port `state.rs`, `errors.rs`, `events.rs`, `math/q.rs` from `contracts/programs/prism-core/src/`. `math/q.rs` is copied verbatim — Q64.64 on `u128` is identical.
2. Implement `DataKey` enum and `storage.rs` accessors (§6.2).
3. Implement handlers in `instructions/`:
   - `initialize_global_config` — sets admin, USDC SAC address, oracle allowlist.
   - `initialize_vault` — creates vault state.
   - `initialize_tranche` — deploys three child SEP-41 token contracts (pPRIME / pCORE / pALPHA) and stores their addresses under `DataKey::TrancheToken(...)`.
   - `deposit` — USDC SAC pull, mint SEP-41 shares via tranche-token client.
   - `withdraw` — burn SEP-41 shares, USDC SAC push.
   - `accrue_yield` — waterfall (Prime → Core → Alpha).
   - `trigger_credit_event` — cascade (Alpha → Core → Prime), loss bucket update.
4. Add `tests/integration.rs` using `soroban_sdk::testutils::Env::default()` + `register_contract`.
5. Wire TTL extension calls (`extend_ttl`) into every handler that touches persistent storage.

**Tests**
| ID | Test | Scope | Pass criteria |
|---|---|---|---|
| P1-T1 | Q64.64 unit tests | `cargo test -p prism-core math::q` | all asserts in current `q.rs` port over with identical expected values |
| P1-T2 | First deposit mints 1:1 | integration | depositing 1000 USDC mints 1000 pPRIME at NAV = `Q64_ONE` |
| P1-T3 | Reserve invariant | integration, property | for all sequences of deposit/withdraw/accrue/cascade: `reserve_balance == Σ tranche.total_assets + loss_bucket` |
| P1-T4 | Waterfall — locked demo numbers | integration | after 100 USDC yield on the 19.5K vault: Prime / Core / Alpha NAVs match [12-reference-card.md](12-reference-card.md) §4.3 byte-for-byte |
| P1-T5 | Cascade — locked demo numbers | integration | after 6,500 USDC loss: Alpha wipeout, Core NAV = 0.6798, Prime NAV = 1.00411 (matches §4.5) |
| P1-T6 | Tranche wipeout blocks deposit | integration | post-wipeout `deposit` into Alpha returns `PrismError::TrancheWipedNoDepositsAllowed` |
| P1-T7 | Post-wipe withdraw returns 0 | integration | burning Alpha shares after wipeout returns 0 USDC, no panic |
| P1-T8 | SEP-41 admin enforcement | integration | external caller invoking `mint` on tranche token without core auth fails |
| P1-T9 | Storage TTL extension | integration | after simulated ledger advance, all persistent keys remain readable |
| P1-T10 | Testnet end-to-end | bash script | scripted deposit/yield/cascade on Soroban testnet reproduces P1-T4 + P1-T5 NAVs from on-chain reads |

**Exit criteria:** All P1 tests pass on local `soroban-sdk` harness AND on Stellar testnet. CI gates merge on P1-T1 through P1-T9.

---

### Phase 2 — Composition layer (3–4 days)

**Goal:** Soroswap and Reflector wired in; Trade #1 and Trade #2 work on real Stellar DEX.

**Implementation steps**
1. Pull Soroswap router + factory contract interface specs. Generate TS bindings with `stellar contract bindings typescript --network testnet --id $SOROSWAP_ROUTER`.
2. Pull Reflector oracle interface; generate bindings.
3. Add `soroswap.rs` and `reflector.rs` client modules to `prism-core`.
4. Implement `seed_pool_liquidity(vault_id, kind)` — core contract approves USDC + tranche-token to Soroswap router, calls `add_liquidity`. Only callable by admin, once per pool.
5. Implement `read_reflector_price(asset)` — read-only helper exposed via contract function and called from frontend via `simulateTransaction`.
6. Frontend modules:
   - `app/lib/soroban.ts` — RPC helpers (`simulate`, `prepare`, `send`).
   - `app/lib/horizon.ts` — Horizon balance + history helpers.
   - `app/lib/soroswap.ts` — quote, addLiquidity, swap.
   - `app/lib/reflector.ts` — price read.
7. Rewire `hooks/useSwap.tsx` to call Soroswap router instead of `prism_amm`.

**Tests**
| ID | Test | Scope | Pass criteria |
|---|---|---|---|
| P2-T1 | Soroswap bindings compile | TS build | `tsc --noEmit` on `app/lib/bindings/soroswap_router/` passes |
| P2-T2 | Seed liquidity (testnet) | integration script | after seeding, Soroswap pool reserves > 0 for pPRIME/USDC, pCORE/USDC, pALPHA/USDC |
| P2-T3 | Quote round-trip | integration | `router.swap_exact_in(1 USDC → pPRIME)` returns > 0; quote matches actual swap within rounding |
| P2-T4 | Trade #1 demo step | end-to-end | single-user swap from dashboard executes, UI balance updates, tx visible on stellar.expert |
| P2-T5 | Trade #2 demo step | end-to-end | 5 + 2 sequential Alpha/Core dumps complete; final pool prices reflect locked demo NAVs (within Soroswap's CPMM slippage) |
| P2-T6 | Reflector read | integration | `read_reflector_price(USDC)` returns a non-zero price; UI dashboard surfaces it |
| P2-T7 | Soroswap auth boundary | integration | non-admin call to `seed_pool_liquidity` reverts with `PrismError::Unauthorized` |
| P2-T8 | Frontend regression | manual + playwright | dashboard renders all four roles' balances against testnet without console errors |

**Exit criteria:** Demo arc steps 4 (Trade #1) and 6 (Trade #2) executable end-to-end against testnet Soroswap. Reflector price live in dashboard. P2-T1 through P2-T8 green.

---

### Phase 3 — Oracle attestation surface (3–4 days)

**Goal:** PRISM Collateral Oracle live; Encrypt off-chain oracle fixed; Cloak handler verified; borrower onboarding end-to-end on Soroban.

**Implementation steps**
1. **PRISM Collateral Oracle (§6.6):**
   - Add handlers `attach_collateral`, `verify_collateral`, `release_collateral`, `liquidate_collateral`.
   - Build `app/api/collateral-oracle/attest/route.ts` — Ed25519 signer (deterministic dev seed via `COLLATERAL_ORACLE_SEED_DEV`, env-injected prod seed via `COLLATERAL_ORACLE_SEED`).
   - Build `app/lib/collateral.ts` (message builder + HTTP client) and `hooks/useCollateral.tsx`.
   - Keep `app/lib/ika.ts` and `hooks/useIkaCollateral.tsx` as deprecated re-exports through Phase 3.
2. **Encrypt oracle rewrite:**
   - Rewrite `app/api/encrypt-oracle/attest_default/route.ts` — remove `@solana/web3.js`, emit Stellar 73-byte layout (`b"enc_atts" || loan_id u32 LE || 28 zero bytes || commitment[32] || result[1]`), return `oracle_pubkey` as raw hex.
   - Confirm `app/lib/encrypt.ts` consumer is unchanged (already Stellar-shaped).
3. **Cloak verification:**
   - Audit existing `record_cloak_payout` handler at [soroban/prism-core/src/lib.rs:858](../soroban/prism-core/src/lib.rs#L858) for parity with the Encrypt/Collateral attestation pattern.
   - Add Ed25519 signer route under `app/api/cloak-oracle/attest/route.ts` (mirrors collateral-oracle shape). No frontend wiring required for v1 demo.
4. **MoneyGram Access SEP-24:**
   - Add anchor-protocol client in `app/lib/moneygram.ts`.
   - Surface "Fund with MoneyGram" button on borrower onboarding screen.
5. **Frontend deletions:**
   - Delete `app/lib/cloak.ts` (frontend lib only; on-chain handler stays — see §5 Cloak row), `app/lib/dodo.ts`, `app/lib/bags.ts`, `hooks/useCloakPayout.tsx`, `hooks/useDodoCheckout.ts`, `hooks/useFiatInvest.ts`, `hooks/useFiatRepaymentStatus.ts`.
   - Drop `app/api/ika-test-oracle/` after `collateral-oracle` ships.

**Tests**
| ID | Test | Scope | Pass criteria |
|---|---|---|---|
| P3-T1 | Collateral message round-trip | unit (TS) | `buildCollateralMessage(...)` produces a 73-byte buffer matching the layout in §6.6 byte-for-byte |
| P3-T2 | Collateral Ed25519 sign + verify | integration | signer + Soroban `verify_collateral` accept a freshly signed attestation; modifying any byte rejects with `PrismError::InvalidAttestation` |
| P3-T3 | Collateral replay protection | integration | reusing a `nonce` for the same `loan_id` rejects with `PrismError::NonceAlreadyUsed` |
| P3-T4 | Collateral status machine | integration | `attached → released` and `attached → liquidated` succeed; reverse transitions reject |
| P3-T5 | `disburse_loan` gating | integration | disburse without verified collateral rejects with `PrismError::CollateralNotVerified` |
| P3-T6 | Encrypt oracle message shape | unit (TS) | output from rewritten `encrypt-oracle/attest_default/route.ts` decodes correctly in `app/lib/encrypt.ts` |
| P3-T7 | Encrypt verify on Soroban | integration | end-to-end: oracle signs → `verify_encrypt_default` accepts → cascade fires |
| P3-T8 | Encrypt — no Solana imports | static | `rg "@solana" app/api/encrypt-oracle/` returns zero matches |
| P3-T9 | Cloak handler smoke | integration | `record_cloak_payout` accepts a valid Ed25519 attestation from the new cloak signer; rejects forged signature |
| P3-T10 | MoneyGram SEP-24 handshake | manual | clicking "Fund with MoneyGram" returns a valid interactive deposit URL from the anchor |
| P3-T11 | Deprecated IKA re-export | TS build | `import { ... } from 'app/lib/ika'` still type-checks and at runtime forwards to `collateral.ts` |
| P3-T12 | Borrower flow end-to-end | scripted | borrower deposits USDC → attaches PRISM collateral → attaches Encrypt commitment → admin disburses; default path triggers cascade and marks collateral liquidated |

**Exit criteria:** P3-T1 through P3-T12 green. Borrower onboarding video recorded on testnet. No `@solana/*` import remains in `app/api/encrypt-oracle/` or `app/api/collateral-oracle/`.

---

### Phase 4 — Cutover (2–3 days)

**Goal:** Solana code removed; Stellar is the only chain.

**Implementation steps**
1. Delete `contracts/programs/prism-amm/`, `contracts/programs/prism-core/`, `contracts/Anchor.toml`, `contracts/keys/`, `contracts/scripts/`, `contracts/tests/`.
2. Rename `contracts-stellar/` → `contracts/`. Update all relative paths in scripts and CI.
3. Strip `@solana/*`, `@coral-xyz/anchor`, `@solana/spl-token`, `@solana/wallet-adapter-*` from `package.json`. Run `pnpm install` to update lockfile.
4. Delete `app/lib/idl/`, `app/lib/pda.ts`, `app/lib/program.ts`, `app/lib/adminKeypair.ts`, `app/buffer-polyfill.ts`.
5. Delete `app/lib/ika.ts` and `hooks/useIkaCollateral.tsx` (the deprecated re-exports from Phase 3).
6. Archive `docs/bags-hackathon-strategy.md` and `docs/cloke.md` to `docs/archive/`.
7. Update [README.md](../README.md), [CLAUDE.md](../CLAUDE.md), [docs/00-overview.md](00-overview.md), [docs/12-reference-card.md](12-reference-card.md): Stellar as the only chain, mark Solana sections as historical.
8. Record final demo on Stellar testnet.
9. Deploy `prism_core` to Stellar mainnet behind an admin pause flag. Mainnet stays gated until audit.

**Tests**
| ID | Test | Scope | Pass criteria |
|---|---|---|---|
| P4-T1 | Zero Solana imports | static | `rg "@solana\|@coral-xyz/anchor" app/ hooks/ components/ lib/` returns zero matches |
| P4-T2 | Production build | CI | `pnpm build` exits 0 with zero warnings about missing modules |
| P4-T3 | Lint clean | CI | `pnpm lint` exits 0 |
| P4-T4 | Type check | CI | `tsc --noEmit` exits 0 |
| P4-T5 | Full demo replay (testnet) | scripted | full Setup → Deposit → Yield → Trade #1 → DEFAULT → Trade #2 → Withdraw runs end-to-end; final NAVs match locked demo numbers |
| P4-T6 | Mainnet deploy smoke | manual | `prism_core` deploys to mainnet, `pause` flag is set, `read_config` returns expected admin address |
| P4-T7 | Addresses registry | static | `app/lib/addresses.ts` contains both testnet + mainnet entries for every contract |
| P4-T8 | Doc consistency | manual | README, CLAUDE.md, docs/00, docs/12 contain no Anchor/PDA/SPL references in primary content (archive sections excluded) |
| P4-T9 | Dependency audit | CI | `pnpm audit --prod` reports zero high/critical vulnerabilities |

**Exit criteria:** P4-T1 through P4-T9 green. Mainnet contract addresses committed. Demo recording uploaded.

---

### Phase 5 — SCF submission (parallel with Phase 3–4)

**Goal:** Grant submitted.

**Implementation steps**
1. Update pitch deck at [pitch-deck-...](../pitch-deck-20260511-173017.html) for Stellar audience — replace Solana diagrams, swap demo screenshots to Stellar wallets/explorers.
2. Draft SCF application: problem, market size, technical approach, milestones, ask, team.
3. Submit Audit Pool application if Phase 4 is on schedule.
4. Define three audited milestones for ongoing SCF disbursement; document in `docs/scf-milestones.md`.

**Tests**
| ID | Test | Pass criteria |
|---|---|---|
| P5-T1 | Deck dry-run | 10-minute walkthrough with one external reviewer; no Solana-era confusion |
| P5-T2 | Application self-review | every SCF rubric line in §11 has a paragraph in the submission |
| P5-T3 | Live demo link works | reviewer can hit `/live` route on a public URL, connect Freighter, and complete one deposit |
| P5-T4 | Milestone scoping | each of the three milestones has acceptance criteria + estimated audit cost |

**Exit criteria:** SCF submission accepted (acknowledged by Stellar Development Foundation). Audit Pool application acknowledged.

---

## 11. Stellar Community Fund alignment

How each SCF evaluation axis maps to PRISM:

| SCF criterion | PRISM's answer |
|---|---|
| **Soroban-native?** | Yes. `prism_core` is a Soroban contract. Not a SAC-wrapped Classic project. |
| **USDC-denominated?** | Yes. Vault reserves, deposits, yield, repayments, all USDC. |
| **Composes with ecosystem?** | Yes. Soroswap (AMM), Reflector (oracle), MoneyGram (ramp). Three external integrations on day one. |
| **Real-world use case?** | Tranched credit. Identifiable LPs (yield seekers), identifiable borrowers (Treasury / crypto-collateralised loans), measurable cash flows. |
| **Auditability?** | One contract, ~3k lines of Rust, math identical to a 30-year-old finance primitive. Audit scope is well-defined. Off-chain oracles (Collateral, Encrypt, Cloak) are PRISM-hosted Ed25519 signers in v1 with a documented decentralisation path (§6.6). |
| **Mainnet readiness?** | Soroban dependencies (Soroswap, Reflector, USDC SAC) are already mainnet. Our contract is the only new variable. |
| **Distribution channel?** | MoneyGram Access for fiat, Soroswap UI for secondary markets, Freighter / LOBSTR for retail. |
| **Open-source?** | Yes. Apache-2.0. |

Submission narrative (one sentence, for the SCF form):

> *PRISM is structured credit on Soroban: depositors choose Prime, Core, or Alpha risk, receive SEP-41 tranche tokens, and trade them on Soroswap as the protocol distributes USDC yield top-down and absorbs losses bottom-up — Stellar's first programmable, market-priced credit primitive.*

---

## 12. What gets deleted

Explicit cut list, to be removed in Phase 4. No half-states, no `// removed` comments, no stub backwards-compat shims.

**Solana contracts**
- `contracts/programs/prism-amm/` (entire program)
- `contracts/programs/prism-core/` (entire program)
- `contracts/Anchor.toml`
- `contracts/Cargo.toml`, `contracts/Cargo.lock`
- `contracts/build-and-deploy.sh`, `contracts/deploy*.sh`, `contracts/fresh_deploy.sh.bak`
- `contracts/keys/` (Solana keypairs)
- `contracts/scripts/setup-demo.ts`, `contracts/scripts/mint-usdc.ts`, `contracts/scripts/generate-keys.ts`
- `contracts/tests/prism-core.ts`, `contracts/tests/prism-amm.ts`, `contracts/tests/ika-collateral.ts`
- `sync-idl.sh` at repo root

**Frontend Solana**
- `app/lib/idl/`
- `app/lib/pda.ts`
- `app/lib/program.ts`
- `app/lib/adminKeypair.ts` (replaced with Stellar equivalent)
- `app/buffer-polyfill.ts` (Stellar SDK does not need this)

**Dropped partner integrations**
- `app/lib/cloak.ts` (frontend lib), `app/api/cloak-oracle/`, `hooks/useCloakPayout.tsx`
  *Note:* the on-chain `record_cloak_payout` handler in [soroban/prism-core/src/lib.rs:858](../soroban/prism-core/src/lib.rs#L858) is **kept** (already implemented and tested). Cloak is reclassified as an internal Ed25519-attested feature, not an external partner — see §5 Cloak row.
- `app/lib/dodo.ts`, `app/api/dodo/`, `hooks/useDodoCheckout.ts`, `hooks/useFiatInvest.ts`, `hooks/useFiatRepaymentStatus.ts`, `app/dodo-mock-pay/`
- `app/lib/dune-sim.ts`, `app/api/dune/` (replaced by `app/lib/horizon.ts`)
- `app/lib/bags.ts`, `app/lib/bags-valuation.ts`, `hooks/useBags*`, `app/(app)/creator-credit/`, `components/creator-credit/`
- `app/api/ika-test-oracle/` — Solana-flavoured test oracle. Replaced by `app/api/collateral-oracle/` in Phase 3.
- `app/lib/ika.ts` and `hooks/useIkaCollateral.tsx` — deleted in Phase 4 once `app/lib/collateral.ts` + `hooks/useCollateral.tsx` ship (Phase 3 leaves them as deprecated re-exports for one release).
- `contracts/programs/prism-core/src/instructions/accept_bags_fee_collateral.rs`
- `contracts/programs/prism-core/src/instructions/claim_and_settle_bags_fees.rs`

**Dependencies**
- `@solana/spl-token`, `@solana/wallet-adapter-*`, `@solana/web3.js`
- `@coral-xyz/anchor`
- `bitcoinjs-lib`, `ecpair`, `tiny-secp256k1` (were used for BTC address derivation in IKA flow — re-evaluate in Phase 3; may keep if IKA flow needs them client-side)

**Docs**
- `docs/bags-hackathon-strategy.md` — archive to `docs/archive/` rather than delete; useful narrative reference for SCF.
- `docs/cloke.md` — archive.

---

## 13. Open questions

These are the only items genuinely unresolved. Everything else above is locked.

| # | Question | Owner | Resolution path |
|---|---|---|---|
| Q1 | ~~Does the IKA oracle have a Stellar-compatible attestation flow?~~ **Resolved 2026-05-30: no.** IKA has no Stellar support. Replaced by self-hosted PRISM Collateral Oracle (§6.6). | — | Closed. See §6.6 trust-model and the v1.5/v2 decentralisation path. |
| Q2 | Do we use Reflector's public price feeds or run our own oracle attestation pattern as we do on Solana? | Engineering | Use Reflector public feeds for v1; admin-allowlisted Ed25519 attestation as a fallback path remains in the contract for events not covered by Reflector (e.g. private default declarations). |
| Q3 | What's the right SEP-41 decimals choice — 6 (USDC-aligned) or 7 (Stellar Classic default)? | Engineering | Default 7. Q64.64 math is decimal-agnostic; only the display formatter changes. |
| Q4 | One vault contract per chain or one contract per vault? | Architecture | One contract supporting N vaults, like the Solana version. Cheaper deploys, simpler upgrades. |
| Q5 | Do we keep the `useIdentity` 4-keypair demo system or move to real wallet-only flows for the SCF demo? | Product | Keep `useIdentity` for the recorded demo; expose real-wallet flow on a `/live` route for grant reviewers. |
| Q6 | Audit firm choice for SCF Audit Pool submission? | Team | Veridise, OtterSec, and Runtime Verification have Soroban experience. Decide in Phase 4. |
| Q7 | Mainnet USDC SAC address verification | Engineering | Pull from Circle's official Stellar docs at start of Phase 1; commit to `app/lib/addresses.ts`. |

---

## 14. Locked decisions

| # | Decision | Locked when |
|---|---|---|
| 1 | Hard pivot. No parallel Solana deployment. | 2026-05-28 |
| 2 | Stellar Community Fund is the grant target. | 2026-05-28 |
| 3 | Soroban contracts (not Stellar Classic only). | 2026-05-28 |
| 4 | SEP-41 tranche tokens (not Classic assets via SAC). | 2026-05-28 |
| 5 | Soroswap is the AMM. `prism_amm` is deleted. | 2026-05-28 |
| 6 | Reflector is the oracle. Switchboard plans dropped. | 2026-05-28 |
| 7 | MoneyGram Access replaces Dodo for fiat. | 2026-05-28 |
| 8 | Cloak, Dodo, Bags, Dune (as primary) are cut. | 2026-05-28 |
| 9 | ~~IKA and Encrypt are kept; attestation pattern ports to Soroban Ed25519.~~ **Revised 2026-05-30:** IKA replaced with self-hosted PRISM Collateral Oracle (§6.6); Encrypt on-chain verifier kept and already implemented, off-chain oracle rewritten to Stellar message format. Shared Ed25519 attestation pattern unchanged. | 2026-05-30 |
| 10 | Financial model (tranches, NAV, waterfall, cascade, locked demo numbers) is unchanged. | Inherited from numbered docs |
| 11 | One `prism_core` contract supporting N vaults. | 2026-05-28 |
| 12 | Stellar Wallet Kit for wallet UX. | 2026-05-28 |

---

## 15. Cross-references

- Protocol model: [protocol_explained.md](protocol_explained.md) — unchanged, chain-agnostic.
- Demo numbers: [12-reference-card.md](12-reference-card.md) — unchanged; PDA tables in §2 become obsolete and are superseded by `app/lib/addresses.ts`.
- Build sequencing: [06-mvp-build-plan.md](06-mvp-build-plan.md) — obsolete for chain rails; the phases in §10 of this document supersede.
- Production blockers: [before-mainnet.md](before-mainnet.md) — most Solana items obsolete; Stellar-specific blockers (rent TTL extension policy, Reflector subscription funding, MoneyGram anchor onboarding) take their place. A revised checklist is a follow-up document.
- IKA: [ika-integration.md](ika-integration.md), [ika-audit-2026-05-01.md](ika-audit-2026-05-01.md) — attestation layout sections need re-binding to Stellar contract IDs in Phase 3.

End of plan.
