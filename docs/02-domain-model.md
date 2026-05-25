# PRISM Protocol — Domain Model (Section 2)

**Status:** Locked. All Q1–Q7 design decisions resolved.
**Stack:** Anchor (Rust) on Solana, classic SPL tokens, single-vault demo.

---

## Mental model

State on Solana lives in **accounts**, not contract storage slots. Every entity here is either a PDA owned by the PRISM program, or an SPL token account owned by SPL Token Program. Users do *not* get a custom Position account per tranche — they hold pPRIME / pCORE / pALPHA in their associated token accounts. This collapses the "position" concept into a tradeable token from day one.

---

## 2.1 Core entities

| Entity | Type | Owner | Purpose |
|---|---|---|---|
| **GlobalConfig** | PDA | PRISM program | Admin authority, USDC mint reference, simulated yield rate, system pause |
| **Vault** | PDA | PRISM program | Single credit pool. Holds aggregate state, references its 3 tranches and its loan |
| **Tranche** (×3) | PDA | PRISM program | One per risk class. Holds NAV per share, target APY, subordination threshold |
| **Loan** | PDA | PRISM program | Underlying credit asset. Principal, APR, maturity, repayment state |
| **CreditEvent** | PDA (sequenced) | PRISM program | Append-style log of defaults / partial losses / recoveries |
| **AmmPool** (×3) | PDA | PRISM AMM program | Constant-product AMM, one per tranche token vs USDC. **Separate program.** |
| **Tranche Mint** (×3) | SPL Mint | SPL Token Program | The pPRIME / pCORE / pALPHA mints. PRISM holds mint authority |
| **User Position** | SPL Token Account | SPL Token Program | Just a token balance. No custom Position account. |
| **Vault USDC reserve** | SPL Token Account | SPL Token Program | Where deposited USDC sits. Authority is the Vault PDA |

---

## 2.2 PDA seed layout (deterministic addresses)

```
GlobalConfig:       ["config"]
Vault:              ["vault", vault_id_le_bytes]
Tranche:            ["tranche", vault, kind_byte]            // kind: 0=Prime 1=Core 2=Alpha
Loan:               ["loan", vault, loan_id_le_bytes]
CreditEvent:        ["credit_event", vault, event_seq_le_bytes]
AmmPool:            ["amm", tranche_mint]
TrancheMint:        ["mint", vault, kind_byte]               // mint authority is this PDA
VaultUsdcReserve:   ["reserve", vault]                       // token account authority is this PDA
LossBucket:         ["loss_bucket", vault]                   // USDC moved here on default; authority is vault PDA
```

`vault_id = 0` for the demo, but parameterized seeds cost nothing and let the design narrative scale to N vaults.

---

## 2.3 The NAV-per-share model (the spine — locked, do not change)

Every tranche tracks **`nav_per_share`** — how much USDC one tranche token is currently worth. Same pattern as ERC-4626, adapted to SPL tokens.

```
nav_per_share = total_tranche_assets / total_supply
```

| Operation | Effect on assets | Effect on supply | Effect on NAV |
|---|---|---|---|
| Deposit | +usdc_in | +shares | unchanged |
| Withdraw | -usdc_out | -shares | unchanged |
| Yield accrual | +yield_share | unchanged | **goes up** |
| Loss event | -loss_share | unchanged | **goes down** (can hit 0) |

**Why this wins:**
- Waterfall is just math on tranche NAVs — no per-user PnL bookkeeping
- Tranche token = position. Secondary market is trivially possible — *the position itself is the trading instrument*
- Demo dramatic moment: three NAV bars on the dashboard. Default hits. Alpha drops to 0. Core drops partially. Prime barely moves.

**Pitch line this enables:** *"We turned credit into tokens that markets can price."*

---

## 2.4 Account schemas

### Tranche

```rust
pub struct Tranche {
    pub vault: Pubkey,
    pub kind: TrancheKind,                  // Prime | Core | Alpha
    pub mint: Pubkey,                       // pPRIME / pCORE / pALPHA
    pub target_apy_bps: u16,                // Prime: 500 (5%), Core: 800 (8%), Alpha: 1500 (15%)
    pub total_assets: u64,                  // USDC backing this tranche, 1e6 base units
    pub total_supply: u64,                  // pTRANCHE tokens outstanding
    pub nav_per_share_q: u128,              // Q64.64 fixed point for precision
    pub cumulative_yield: u64,
    pub cumulative_loss: u64,
    pub last_nav_update_ts: i64,            // for time-weighted yield accrual
    pub bump: u8,
}

#[repr(u8)]
pub enum TrancheKind {
    Prime = 0,
    Core   = 1,
    Alpha = 2,
}
```

Q64.64 fixed-point on NAV avoids the rounding-loss bugs that plague EVM 4626 implementations.

### Vault

```rust
pub struct Vault {
    pub id: u32,
    pub usdc_mint: Pubkey,
    pub usdc_reserve: Pubkey,               // the actual USDC token account
    pub tranche_pdas: [Pubkey; 3],          // [Prime, Core, Alpha]
    pub loan_pda: Pubkey,                   // single loan for demo
    pub state: VaultState,                  // Active | Defaulted | Resolved
    pub total_deposits: u64,
    pub total_loaned: u64,
    pub last_yield_timestamp: i64,
    pub credit_event_seq: u32,              // monotonic counter for CreditEvent PDA seeding
    pub bump: u8,
}

pub enum VaultState {
    Active,
    Defaulted,
    Resolved,
}
```

### Loan

```rust
pub struct Loan {
    pub id: u32,
    pub vault: Pubkey,
    pub borrower: Pubkey,                   // demo: admin-controlled signer
                                            // future: Ika dWallet PDA with cross-chain collateral
    pub principal: u64,
    pub apr_bps: u16,
    pub origination_ts: i64,
    pub maturity_ts: i64,
    pub state: LoanState,
    pub total_repaid: u64,
    pub bump: u8,
}

pub enum LoanState {
    Originated,
    Active,
    Repaying,
    Defaulted,
    Resolved,
}
```

The `borrower` field is where Ika integration drops in later — replace the admin signer with an Ika dWallet PDA, and the same loan struct supports cross-chain collateral.

### CreditEvent (richer than v1 — supports partial losses + recoveries)

```rust
pub struct CreditEvent {
    pub vault: Pubkey,
    pub seq: u32,
    pub event_type: CreditEventType,
    pub loan: Pubkey,
    pub loss_amount: u64,                   // for Default / PartialLoss
    pub recovery_amount: u64,               // for Recovery
    pub severity_bps: u16,                  // 0–10000 = % of principal affected
    pub timestamp: i64,
    pub triggered_by: Pubkey,               // admin or Switchboard oracle
    pub bump: u8,
}

pub enum CreditEventType {
    Default,        // total loss event
    PartialLoss,    // partial impairment
    Recovery,       // post-default clawback / restructuring proceeds
}
```

`severity_bps` captures *how bad*: 10000 = 100% principal lost; 3000 = 30% impairment. The dashboard renders this as event severity, not just a binary "defaulted" flag.

### AmmPool (separate program, but shown here for completeness)

```rust
pub struct AmmPool {
    pub tranche_mint: Pubkey,               // pPRIME / pCORE / pALPHA
    pub quote_mint: Pubkey,                 // USDC
    pub tranche_reserve: Pubkey,            // token account
    pub quote_reserve: Pubkey,              // token account
    pub lp_mint: Pubkey,                    // LP tokens
    pub fee_bps: u16,
    pub bump: u8,
}
```

Pure constant-product (`x * y = k`). Does not know about NAV. The premium / discount of pTRANCHE-USDC vs the on-chain NAV emerges naturally as market sentiment — this *is* the price discovery story.

---

## 2.5 Money flow / state transitions

### Deposit (USDC → tranche)

```
1. User signs transfer of USDC into Vault USDC reserve
2. PRISM computes shares = usdc_in × (1 / nav_per_share)
3. PRISM mints `shares` of pTRANCHE to user's ATA
4. Tranche.total_assets += usdc_in
5. Tranche.total_supply += shares
6. Vault.total_deposits += usdc_in
   NAV unchanged.
```

### Yield accrual (admin or Switchboard-triggered)

```
1. Borrower (admin proxy in v1) deposits yield into Vault USDC reserve
2. PRISM splits yield via waterfall:
     remaining = yield_amount
     prime_take = min(prime.target_apy_share_for_period, remaining)
     remaining -= prime_take
     core_take = min(core.target_apy_share_for_period, remaining)
     remaining -= core_take
     alpha_take = remaining   // remaining yield flows to Alpha
3. Each tranche: total_assets += its take → nav_per_share recomputed
4. Tranche.last_nav_update_ts = now
5. Vault.last_yield_timestamp = now
   NAV goes up. Token supply unchanged.
```

### Default ("Trigger Default" — the demo moment)

```
1. Admin or Switchboard signs CreditEvent with loss_amount L and severity_bps
2. PRISM applies loss in reverse-priority order:
     alpha_loss = min(L, alpha.total_assets)
     L -= alpha_loss
     alpha.total_assets -= alpha_loss   → alpha NAV drops (potentially to 0)

     core_loss = min(L, core.total_assets)
     L -= core_loss
     core.total_assets -= core_loss       → core NAV drops

     prime_loss = L                       // only nonzero if Alpha AND Core both fully wiped
     prime.total_assets -= prime_loss
3. PRISM transfers `loss_amount` USDC from Vault USDC reserve to LossBucket PDA
   Invariant maintained: `vault_usdc_reserve.amount == sum(tranche.total_assets)`
4. PRISM creates a CreditEvent account (own PDA, seeded by seq)
5. Vault.state = Defaulted (if event_type == Default)
6. Each affected tranche updates last_nav_update_ts
   Token supply unchanged across all tranches.
   NAVs drop in cascade.
```

### Trade (secondary market — separate AMM program)

```
1. User sends pTRANCHE + USDC to AmmPool reserves
2. AMM applies x*y=k with fee
3. AMM mints LP tokens (or burns + pays out for swaps)
   AMM does not read NAV. Market price discovers premium/discount.
```

This is the "credit risk traded as tokens" pitch moment.

### Withdraw (post-default exit)

```
1. User signs burn of N pTRANCHE
2. PRISM computes payout = N × current nav_per_share
3. PRISM transfers `payout` USDC from Vault reserve to user
4. Tranche.total_assets -= payout
5. Tranche.total_supply -= N
   If alpha NAV = 0 (post-default), payout = 0 — burning alpha tokens proves the cascade visibly.
```

---

## 2.6 Locked design decisions (Q1–Q7)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | Single loan or loan-per-vault? | Single loan, parameterized seed | Demo simplicity; design narrative supports N |
| 2 | Default trigger | Admin button + Switchboard oracle (admin first if time pressure) | Admin = instant demo wow; oracle = judges' credibility |
| 3 | Tranche token standard | Classic SPL | Stable, fast; Cloak handles privacy at cash-flow layer |
| 4 | Loss math | Per-tranche-asset (not per-share) | Matches NAV model, avoids precision bugs |
| 5 | AMM placement | **Separate Anchor program** | AMM bug ≠ vault failure; modular pitch story |
| 6 | Precision | USDC = 6 decimals; NAV = Q64.64 | Avoids rounding loss in waterfall |
| 7 | Borrower model | Admin-simulated borrower in v1; Ika dWallet plug-in for v2 | Iteration without integration blocker |

---

## 2.7 What we've actually built

This is no longer a project. This is a **modular on-chain credit engine with market-driven price discovery** — separated cleanly into a credit risk engine (Vault + Tranches + Loan + CreditEvent) and a market layer (AMM). The integration surfaces for Encrypt + Ika + Cloak are already first-class fields in the schema, not afterthoughts.

---

## Next: Section 3 — Layered Architecture

Maps the 15 problem-statement layers into 5 architectural domains, marks each as **MVP-built**, **partner-integrated**, or **roadmap**.
