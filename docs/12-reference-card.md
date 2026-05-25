# PRISM Protocol — Reference Card

**Single-page lookup. Keep this open while coding.**

Every magic number, PDA seed, error code, event schema, demo wallet, and glossary term in one place. If a constant lives in two docs, this is the source of truth — other docs reference back to here.

---

## 1. Constants

### 1.1 Math constants

```rust
// Q64.64 fixed-point representation
pub const Q64_SHIFT: u32 = 64;
pub const Q64_ONE:   u128 = 1u128 << 64;  // = 18,446,744,073,709,551,616

// AMM minimum liquidity locked at first add_liquidity
pub const MIN_LIQUIDITY: u64 = 1000;

// Fee bounds
pub const MAX_FEE_BPS:   u16 = 1000;   // 10% absolute max
pub const DEFAULT_FEE_BPS: u16 = 30;   // 0.3% — Uniswap V2 standard
pub const BPS_DENOMINATOR: u64 = 10_000;

// Time constants
pub const SECONDS_PER_YEAR: i64 = 365 * 24 * 60 * 60;  // = 31,536,000

// Oracle freshness threshold for Switchboard reads
pub const ORACLE_STALENESS_LIMIT_SECS: i64 = 300;  // 5 minutes
```

### 1.2 Token decimals

| Token | Decimals | 1.0 in base units |
|---|---|---|
| USDC (Circle devnet) | 6 | 1_000_000 |
| pPRIME | 6 | 1_000_000 |
| pCORE | 6 | 1_000_000 |
| pALPHA | 6 | 1_000_000 |
| LP-PRIME | 6 | 1_000_000 |
| LP-CORE | 6 | 1_000_000 |
| LP-ALPHA | 6 | 1_000_000 |

All tokens use 6 decimals to match USDC base units. NAV math at 1.0 → 1 USDC base = 1 pTRANCHE base (clean integer math).

### 1.3 Tranche parameters

| Tranche | `kind` byte | `target_apy_bps` |
|---|---|---|
| Prime | `0` | `500` (5%) |
| Core | `1` | `800` (8%) |
| Alpha | `2` | `1500` (15%) |

### 1.4 Locked demo numbers

**Tranche deposits (per [§8.5](08-open-questions.md))**

| Source | Prime | Core | Alpha |
|---|---:|---:|---:|
| LP wallet | 5,000 | 3,000 | 2,000 |
| MM wallet | — | 500 | 2,000 |
| Admin (AMM seed) | 5,000 | 1,000 | 1,000 |
| **Total tranche** | **10,000** | **4,500** | **5,000** |

**Vault total at demo start:** 19,500 USDC.
**Borrower wallet pre-fund (for yield):** 10,000 USDC.

**Yield event:** 100 USDC over 30 days
- Prime take: 41.10 USDC (5% APY × 30/365 × 10,000)
- Core take: 29.59 USDC (8% APY × 30/365 × 4,500)
- Alpha take: 29.31 USDC (remaining yield toward the 15% target)

**Default loss:** 6,500 USDC
- Alpha loss: 5,014.50 (full — wiped to NAV 0)
- Core loss: 1,485.50 (NAV 1.00987 → 0.6798, ~32% drop)
- Prime loss: 0 (unchanged at NAV 1.00411)

**AMM pool sizes (per pool — initial seeding by admin)**

| Pool | Tranche side | USDC side | Why differentiated |
|---|---:|---:|---|
| pPRIME/USDC | 5,000 | 5,000 | Deep — Prime swap should feel stable |
| pCORE/USDC | 1,000 | 1,000 | Thin — allows Trade #2 repricing |
| pALPHA/USDC | 1,000 | 1,000 | Thin — same reason |

**MM Trade #2 inventory** (used by `Run Market Reaction` button):
- 2,000 pALPHA → 5 sequential sells of 400 each → final pool price ~0.11
- 500 pCORE → 2 sequential sells of 250 each → final pool price ~0.44

**Trade #1** (single user swap): 50 pPRIME → ~49.5 USDC (price 0.980, ~2% discount to NAV 1.00411).

### 1.5 Total devnet USDC needed

| Wallet | USDC funded at setup |
|---|---:|
| `lp_prime` | 5,000 |
| `lp_core` | 3,000 |
| `lp_alpha` | 2,000 |
| `mm` | 2,500 |
| `admin` | 7,000 (5K + 1K + 1K for AMM seeding + buffer) |
| `borrower` | 10,000 |
| **Total** | **~30,000 USDC** |

Plus ~5 SOL across all wallets for transaction fees (Circle USDC faucet at https://faucet.circle.com, Solana SOL faucet at https://faucet.solana.com).

---

## 2. PDA seeds — derivation table

All PDAs derived against the appropriate program ID (`prism_core` or `prism_amm`).

| PDA name | Owner program | Seeds | TS helper |
|---|---|---|---|
| `GlobalConfig` | `prism_core` | `["config"]` | `getConfigPda()` |
| `Vault` | `prism_core` | `["vault", vault_id_le_bytes(4)]` | `getVaultPda(id)` |
| `Tranche` | `prism_core` | `["tranche", vault_pubkey, [kind_byte]]` | `getTranchePda(vault, kind)` |
| `Tranche Mint` | `prism_core` | `["mint", vault_pubkey, [kind_byte]]` | `getTrancheMintPda(vault, kind)` |
| `Vault USDC reserve` | `prism_core` | `["reserve", vault_pubkey]` | `getVaultReservePda(vault)` |
| `Loss Bucket` | `prism_core` | `["loss_bucket", vault_pubkey]` | `getLossBucketPda(vault)` |
| `Loan` | `prism_core` | `["loan", vault_pubkey, loan_id_le_bytes(4)]` | `getLoanPda(vault, id)` |
| `CreditEvent` | `prism_core` | `["credit_event", vault_pubkey, event_seq_le_bytes(4)]` | `getCreditEventPda(vault, seq)` |
| `AmmPool` | `prism_amm` | `["amm", tranche_mint_pubkey]` | `getPoolPda(trancheMint)` |
| `AMM Tranche reserve` | `prism_amm` | `["amm_tranche", tranche_mint_pubkey]` | `getPoolTrancheReservePda(trancheMint)` |
| `AMM Quote reserve` | `prism_amm` | `["amm_quote", tranche_mint_pubkey]` | `getPoolQuoteReservePda(trancheMint)` |
| `LP Mint` | `prism_amm` | `["amm_lp", tranche_mint_pubkey]` | `getLpMintPda(trancheMint)` |

### 2.1 TypeScript PDA helper module (`app/src/lib/pda.ts`)

```typescript
import { PublicKey } from "@solana/web3.js";
import { PRISM_CORE_PROGRAM_ID, PRISM_AMM_PROGRAM_ID } from "./constants";

export function getConfigPda(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PRISM_CORE_PROGRAM_ID,
  );
}

export function getVaultPda(vaultId: number): [PublicKey, number] {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(vaultId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), idBuf],
    PRISM_CORE_PROGRAM_ID,
  );
}

export function getTranchePda(vault: PublicKey, kind: TrancheKind): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("tranche"), vault.toBuffer(), Buffer.from([kind])],
    PRISM_CORE_PROGRAM_ID,
  );
}

export function getTrancheMintPda(vault: PublicKey, kind: TrancheKind): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("mint"), vault.toBuffer(), Buffer.from([kind])],
    PRISM_CORE_PROGRAM_ID,
  );
}

export function getVaultReservePda(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("reserve"), vault.toBuffer()],
    PRISM_CORE_PROGRAM_ID,
  );
}

export function getLossBucketPda(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("loss_bucket"), vault.toBuffer()],
    PRISM_CORE_PROGRAM_ID,
  );
}

export function getLoanPda(vault: PublicKey, loanId: number): [PublicKey, number] {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(loanId, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("loan"), vault.toBuffer(), idBuf],
    PRISM_CORE_PROGRAM_ID,
  );
}

export function getCreditEventPda(vault: PublicKey, seq: number): [PublicKey, number] {
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeUInt32LE(seq, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("credit_event"), vault.toBuffer(), seqBuf],
    PRISM_CORE_PROGRAM_ID,
  );
}

export function getPoolPda(trancheMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("amm"), trancheMint.toBuffer()],
    PRISM_AMM_PROGRAM_ID,
  );
}

export function getPoolTrancheReservePda(trancheMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("amm_tranche"), trancheMint.toBuffer()],
    PRISM_AMM_PROGRAM_ID,
  );
}

export function getPoolQuoteReservePda(trancheMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("amm_quote"), trancheMint.toBuffer()],
    PRISM_AMM_PROGRAM_ID,
  );
}

export function getLpMintPda(trancheMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("amm_lp"), trancheMint.toBuffer()],
    PRISM_AMM_PROGRAM_ID,
  );
}
```

### 2.2 Rust PDA helpers (mirror these in `programs/prism-core/src/pda.rs`)

```rust
use anchor_lang::prelude::*;
use crate::ID;  // program ID

pub fn config_pda() -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"config"], &ID)
}

pub fn vault_pda(vault_id: u32) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"vault", &vault_id.to_le_bytes()], &ID)
}

pub fn tranche_pda(vault: &Pubkey, kind: u8) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"tranche", vault.as_ref(), &[kind]], &ID)
}

pub fn loss_bucket_pda(vault: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"loss_bucket", vault.as_ref()], &ID)
}

// ...etc, mirror all PDAs from §2 table
```

---

## 3. Error codes

`prism_core` errors (defined in `programs/prism-core/src/errors.rs`):

| Code | Variant | Message | Used by |
|---|---|---|---|
| 6000 | `VaultNotActive` | "Vault is not in Active state" | `deposit`, `accrue_yield` |
| 6001 | `VaultPaused` | "Vault is paused" | `deposit`, `withdraw` |
| 6002 | `InvalidTrancheKind` | "Invalid tranche kind" | all tranche-touching |
| 6003 | `LoanInWrongState` | "Loan is not in expected state" | `disburse_loan`, `repay_loan` |
| 6004 | `InsufficientLiquidity` | "Insufficient liquidity in tranche" | `withdraw` |
| 6005 | `SlippageExceeded` | "Slippage exceeded — swap output below min_amount_out" | `swap`, `add_liquidity` |
| 6006 | `Unauthorized` | "Unauthorized — caller is neither admin nor allowlisted oracle" | admin instructions |
| 6007 | `ArithmeticOverflow` | "Arithmetic overflow" | math helpers |
| 6008 | `EmptyTrancheNav` | "NAV calculation: division by zero (empty tranche)" | NAV math |
| 6009 | `InvalidSeverity` | "CreditEvent severity exceeds 100% (10000 bps)" | `trigger_credit_event` |
| 6010 | `LossExceedsTotalAssets` | "Loss amount exceeds total vault assets" | `trigger_credit_event` |
| 6011 | `BorrowerMismatch` | "Borrower account mismatch" | `accrue_yield`, `repay_loan` |
| 6012 | `TrancheWipedNoDepositsAllowed` | "Tranche has been wiped (NAV = 0); deposits blocked until reset" | `deposit` |
| 6013 | `OracleStale` | "Switchboard feed value is older than freshness threshold" | `accrue_yield`, `trigger_credit_event` |

`prism_amm` errors:

| Code | Variant | Message |
|---|---|---|
| 7000 | `PoolNotInitialized` | "Pool reserves are empty" |
| 7001 | `SlippageExceeded` | "Swap output below min_amount_out" |
| 7002 | `InvalidFee` | "fee_bps exceeds MAX_FEE_BPS (1000)" |
| 7003 | `RatioMismatch` | "add_liquidity ratio doesn't match current pool" |
| 7004 | `MinLiquidityViolation` | "First LP must supply > MIN_LIQUIDITY (1000) shares" |

---

## 4. Event schemas

All events emit through Anchor's `emit!` macro and are indexed by Dune SIM.

```rust
#[event] pub struct DepositEvent {
    pub user: Pubkey, pub vault: Pubkey, pub tranche_kind: u8,
    pub usdc_amount: u64, pub shares_minted: u64,
    pub nav_at_deposit_q: u128, pub timestamp: i64,
}

#[event] pub struct WithdrawEvent {
    pub user: Pubkey, pub vault: Pubkey, pub tranche_kind: u8,
    pub shares_burned: u64, pub usdc_paid: u64,
    pub nav_at_withdraw_q: u128, pub timestamp: i64,
}

#[event] pub struct YieldDistributed {
    pub vault: Pubkey, pub total_yield: u64,
    pub prime_take: u64, pub core_take: u64, pub alpha_take: u64,
    pub timestamp: i64,
}

#[event] pub struct LossApplied {
    pub vault: Pubkey, pub credit_event_seq: u32, pub tranche_kind: u8,
    pub loss_amount: u64, pub new_total_assets: u64, pub new_nav_q: u128,
    pub timestamp: i64,
}

#[event] pub struct CreditEventCreated {
    pub vault: Pubkey, pub seq: u32, pub event_type: u8,
    pub loss_amount: u64, pub severity_bps: u16, pub triggered_by: Pubkey,
    pub timestamp: i64,
}

#[event] pub struct SwapExecuted {
    pub user: Pubkey, pub pool: Pubkey, pub direction: u8,
    pub amount_in: u64, pub amount_out: u64,
    pub new_tranche_reserve: u64, pub new_quote_reserve: u64,
    pub timestamp: i64,
}
```

---

## 5. Demo wallets

All wallets stored as JSON keypair files in `keys/`. Committed to repo (devnet only — never use these on mainnet).

| Filename | Pubkey label | Role | SOL needed | USDC needed |
|---|---|---|---|---|
| `keys/admin.json` | `admin` | Init authority, admin signer for accrue_yield + trigger_default + run_market_reaction | 2 SOL | 7,000 USDC (5K Prime AMM + 1K Core AMM + 1K Alpha AMM) |
| `keys/borrower.json` | `borrower` | Yield USDC source for `accrue_yield` pull pattern | 0.1 SOL | 10,000 USDC |
| `keys/lp_prime.json` | `User A` | Prime LP for the demo PnL panel | 0.1 SOL | 5,000 USDC |
| `keys/lp_core.json` | `User B` | Core LP | 0.1 SOL | 3,000 USDC |
| `keys/lp_alpha.json` | `User C` | Alpha LP | 0.1 SOL | 2,000 USDC |
| `keys/mm.json` | `Market Maker` | Holds 2,000 pALPHA + 500 pCORE for Trade #2 dumps | 0.1 SOL | 2,500 USDC |

**Total funding:** ~3 SOL + ~30,000 USDC, all on devnet.

The PnL panel hard-references `lp_prime`, `lp_core`, `lp_alpha` — see [§9.12](09-lld-completion.md) for `app/src/lib/demo-wallets.ts`.

---

## 6. Glossary

Vocabulary that appears across the docs. If two words could be confused, both are listed and disambiguated.

| Term | Definition |
|---|---|
| **NAV** (Net Asset Value) | The USDC value of one tranche token. `nav = total_assets / total_supply`. Stored as `nav_per_share_q` in Q64.64 format on the Tranche account |
| **Q64.64** | Fixed-point number representation. `u128` where bits 0–63 are fractional, bits 64–127 are integer. `Q64_ONE` (= 2^64) represents 1.0 |
| **Tranche** | A single risk class within a vault. Three exist per vault: Prime (priority 0), Core (priority 1), Alpha (priority 2) |
| **Tranche kind** | `u8` byte indicating Prime/Core/Alpha. Prime = 0, Core = 1, Alpha = 2 |
| **Waterfall** | Yield distribution algorithm. Prime gets first call up to its 5% target APY, then Core to 8%, then Alpha to 15% |
| **Cascade** | Loss application algorithm. Reverse of waterfall — Alpha absorbs first, Core next, Prime last |
| **Loss bucket** | A PDA-controlled token account holding USDC moved out of the vault on default. Maintains the cash invariant: `vault_reserve.amount == sum(tranche.total_assets)` |
| **Closed-loop demo** | The MVP demo skips real loan disbursement. USDC stays in the vault; default just moves loss USDC to the loss bucket. See [§8.1](08-open-questions.md) |
| **Pull pattern** (yield) | `accrue_yield` instruction transfers USDC from borrower's ATA into vault reserve in one tx, then runs waterfall. Visible borrower → vault flow |
| **Run Market Reaction** | A demo button that signs 5 sequential MM swaps of pALPHA + 2 of pCORE to crash AMM prices toward NAV after default |
| **Hot path** | The 4 instructions that *must* work for the demo: `deposit`, `accrue_yield`, `trigger_credit_event`, `swap`. Tier 1 priority |
| **Tier 1 / 2 / 3** | Priority ordering for the build. Tier 1 = hot path. Tier 2 = AMM + dashboard. Tier 3 = polish + integrations. See [§6.2](06-mvp-build-plan.md) |
| **MM** | Market Maker — a pre-funded wallet that dumps pALPHA/pCORE into AMM pools after default to simulate arbitrage repricing |
| **Vault state** | `Active` (normal ops), `Defaulted` (after a Default credit event), `Resolved` (after Recovery — Phase 2 only) |
| **Loan state** | `Originated` → `Active` (after disburse) → `Repaying` / `Defaulted` / `Resolved`. In closed-loop demo, loan stays at `Originated` |
| **CreditEvent type** | `Default`, `PartialLoss`, or `Recovery`. Demo only uses `Default` |
| **Severity bps** | 0–10000 indicating fraction of principal lost. 10000 = 100% loss. Stored on CreditEvent for analytics |
| **dWallet** | Ika's distributed signing wallet — Phase 2 borrower model for cross-chain collateral. Not in MVP |
| **Side track** | A sponsor-run prize track at Frontier hackathon. We submit to Encrypt+Ika (primary), Cloak, Dune SIM, Dodo Payments. See [01-sidetrack-strategy.md](01-sidetrack-strategy.md) |
| **`pPRIME` / `pCORE` / `pALPHA`** | The three SPL tokens minted by `prism_core` representing tranche positions. Mint authority = Tranche PDA |
| **Loss bucket PDA seed** | `["loss_bucket", vault]` — careful, **don't confuse with** `["reserve", vault]` (vault USDC reserve where deposits sit) |
| **`vault_id`** | `u32` parameterizing each vault. Demo uses `vault_id = 0`. Re-recordings use `vault_id = 1, 2, ...` per [§8.22](08-open-questions.md) |
| **Constant-product** | AMM formula `x * y = k`. Used by `prism_amm::swap`. Fee taken from input before applying |
| **MIN_LIQUIDITY** | 1,000 LP shares permanently locked at first add_liquidity to prevent rounding attacks (Uniswap V2 pattern) |

---

## 7. Cross-references

When you need more detail than this card provides:

| Topic | Where to look |
|---|---|
| Account struct definitions | [02-domain-model.md §2.4](02-domain-model.md) |
| Full instruction contexts | [05-anchor-architecture.md §5.4](05-anchor-architecture.md) (hot-path) + [09-lld-completion.md §9.3](09-lld-completion.md) (rest) |
| Handler pseudocode | [09-lld-completion.md §9.4](09-lld-completion.md) |
| Q64.64 helper module | [09-lld-completion.md §9.1](09-lld-completion.md) |
| User flow sequence diagrams | [04-data-flows.md](04-data-flows.md) |
| Demo storyboard with frame-by-frame | [04-data-flows.md §4.5](04-data-flows.md) (default cascade) |
| Frontend component tree + hook signatures | [09-lld-completion.md §9.7](09-lld-completion.md) |
| Switchboard / Cloak SDK patterns | [09-lld-completion.md §9.9, §9.10](09-lld-completion.md) |
| Day-by-day build plan | [06-mvp-build-plan.md §6.4](06-mvp-build-plan.md) |
| "Why did we pick X?" | [08-open-questions.md](08-open-questions.md) |

---

End of reference card. If a constant or PDA you need isn't here, **add it** rather than recomputing — keep this doc the source of truth.
