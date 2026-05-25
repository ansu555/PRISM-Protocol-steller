# PRISM Protocol — Anchor Program Architecture (Section 5)

**Status:** Locked. Pull pattern for `accrue_yield`. Admin-only LP for MVP.

This section is the bridge between design and code. Instruction signatures, account contexts, validation, errors, CPI patterns — directly translatable to Rust scaffolding.

---

## 5.1 Two Anchor programs

| Program | Owns | Why separate |
|---|---|---|
| **`prism_core`** | GlobalConfig, Vault, Tranche × 3, Loan, CreditEvent, all 3 SPL mints, USDC reserve | Credit risk engine |
| **`prism_amm`** | AmmPool × 3, LP mints, pool reserves | Market layer. Bug here ≠ vault failure |

`prism_amm` only depends on the SPL mints exposed by `prism_core`. It does not read or call into `prism_core`. This is the blast-radius isolation that supports the "modular DeFi architecture" pitch.

---

## 5.2 Instruction inventory

### `prism_core`

| # | Instruction | Caller | Notes |
|---|---|---|---|
| 1 | `initialize_global_config` | admin | One-time. Sets admin, USDC mint, default yield_rate, oracle allowlist |
| 2 | `initialize_vault` | admin | Creates Vault + USDC reserve token account |
| 3 | `initialize_tranche` | admin | × 3 (Prime, Core, Alpha). Creates SPL mint + Tranche PDA |
| 4 | `initialize_loan` | admin | Single loan for demo |
| 5 | `disburse_loan` | admin | Moves USDC vault → borrower; transitions Loan to Active |
| 6 | **`deposit`** | user | Mints pTRANCHE; updates tranche assets + supply |
| 7 | **`withdraw`** | user | Burns pTRANCHE; pays out shares × NAV |
| 8 | **`accrue_yield`** | admin or Switchboard | Pull pattern — pulls USDC from borrower, runs waterfall, updates 3 NAVs |
| 9 | **`trigger_credit_event`** | admin or Switchboard | Creates CreditEvent PDA, applies loss cascade |
| 10 | `repay_loan` | borrower (admin proxy in v1) | Updates Loan state |
| 11 | `pause` / `unpause` | admin | Emergency switch |

Bold = the four hot-path instructions.

### `prism_amm`

| # | Instruction | Caller | Notes |
|---|---|---|---|
| 1 | `initialize_pool` | admin | × 3. Creates LP mint + reserve accounts |
| 2 | `add_liquidity` | **admin only** in MVP | Seeds pool depth at demo start |
| 3 | `remove_liquidity` | admin | Cleanup if needed |
| 4 | **`swap`** | user | Constant-product, fee_bps |

Permissionless LP is a roadmap item — pitch line: *"Liquidity is seeded for the demo — pools are permissionless in production."*

---

## 5.3 Authority model

| Resource | Authority | Why |
|---|---|---|
| `GlobalConfig.admin` signer | wallet | Human admin |
| Tranche SPL mint | **Tranche PDA** | Only the program can mint pTRANCHE — no human path |
| Vault USDC reserve | **Vault PDA** | Program-controlled |
| LP mints (AMM) | **AmmPool PDA** | Program-controlled |
| `accrue_yield` caller | admin OR `[Switchboard feed pubkey]` (allowlist in GlobalConfig) | Dual path: admin button + oracle |
| `trigger_credit_event` caller | admin OR `[Switchboard feed pubkey]` | Same dual path |

The PDA-as-authority pattern is Solana's equivalent of EVM's `onlyOwner`. Anchor handles it via `seeds` constraints on signer accounts.

---

## 5.4 Load-bearing Anchor contexts

### `deposit`

```rust
#[derive(Accounts)]
#[instruction(tranche_kind: u8, usdc_amount: u64)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.state == VaultState::Active @ PrismError::VaultNotActive,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"tranche", vault.key().as_ref(), &[tranche_kind]],
        bump = tranche.bump,
    )]
    pub tranche: Account<'info, Tranche>,

    #[account(
        mut,
        seeds = [b"mint", vault.key().as_ref(), &[tranche_kind]],
        bump,
    )]
    pub tranche_mint: Account<'info, Mint>,

    #[account(mut, token::mint = config.usdc_mint, token::authority = user)]
    pub user_usdc_ata: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"reserve", vault.key().as_ref()],
        bump,
    )]
    pub vault_usdc_reserve: Account<'info, TokenAccount>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = tranche_mint,
        associated_token::authority = user,
    )]
    pub user_tranche_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
```

### `accrue_yield` (pull pattern)

```rust
#[derive(Accounts)]
#[instruction(yield_amount: u64)]
pub struct AccrueYield<'info> {
    /// Either admin OR allowlisted Switchboard feed authority.
    pub authority: Signer<'info>,

    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    /// Tranches passed in fixed order (kind constraint enforces it)
    #[account(mut, constraint = tranche_prime.kind == TrancheKind::Prime)]
    pub tranche_prime: Account<'info, Tranche>,
    #[account(mut, constraint = tranche_core.kind == TrancheKind::Core)]
    pub tranche_core: Account<'info, Tranche>,
    #[account(mut, constraint = tranche_alpha.kind == TrancheKind::Alpha)]
    pub tranche_alpha: Account<'info, Tranche>,

    /// Borrower's USDC ATA — yield is PULLED from here.
    /// In v1: admin proxy. In v1.5: Ika dWallet's USDC ATA.
    #[account(mut, token::mint = config.usdc_mint)]
    pub borrower_usdc_ata: Account<'info, TokenAccount>,

    /// Borrower must sign (or co-sign with authority for admin path)
    pub borrower_authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"reserve", vault.key().as_ref()],
        bump,
    )]
    pub vault_usdc_reserve: Account<'info, TokenAccount>,

    /// Optional Switchboard feed for oracle-driven yield triggers
    /// CHECK: validated against config.oracle_allowlist
    pub switchboard_feed: Option<UncheckedAccount<'info>>,

    pub token_program: Program<'info, Token>,
}
```

The pull pattern means a single transaction visibly moves USDC from borrower → vault and runs the waterfall. No "magical" balance appearance.

### `trigger_credit_event`

```rust
#[derive(Accounts)]
#[instruction(event_type: CreditEventType, loss_amount: u64, severity_bps: u16)]
pub struct TriggerCreditEvent<'info> {
    /// Either admin OR allowlisted Switchboard feed authority.
    pub authority: Signer<'info>,

    #[account(seeds = [b"config"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut, constraint = tranche_prime.kind == TrancheKind::Prime)]
    pub tranche_prime: Account<'info, Tranche>,
    #[account(mut, constraint = tranche_core.kind == TrancheKind::Core)]
    pub tranche_core: Account<'info, Tranche>,
    #[account(mut, constraint = tranche_alpha.kind == TrancheKind::Alpha)]
    pub tranche_alpha: Account<'info, Tranche>,

    #[account(mut, has_one = vault)]
    pub loan: Account<'info, Loan>,

    /// CHECK: validated against config.oracle_allowlist if present
    pub switchboard_feed: Option<UncheckedAccount<'info>>,

    /// Vault USDC reserve — loss USDC is transferred OUT of here on default
    #[account(
        mut,
        seeds = [b"reserve", vault.key().as_ref()],
        bump,
    )]
    pub vault_usdc_reserve: Account<'info, TokenAccount>,

    /// Loss bucket — destination for the loss USDC. Authority = vault PDA
    #[account(
        mut,
        seeds = [b"loss_bucket", vault.key().as_ref()],
        bump,
    )]
    pub loss_bucket: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = payer,
        space = 8 + CreditEvent::INIT_SPACE,
        seeds = [b"credit_event", vault.key().as_ref(), &vault.credit_event_seq.to_le_bytes()],
        bump,
    )]
    pub credit_event: Account<'info, CreditEvent>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}
```

The three tranches are constrained by `kind`, so the loss cascade always applies in the right order regardless of input ordering. The instruction handler atomically (a) applies the loss cascade across tranches and (b) transfers `loss_amount` USDC from `vault_usdc_reserve` to `loss_bucket` so the cash-accounting invariant `vault_usdc_reserve.amount == sum(tranche.total_assets)` holds at all times.

### `swap` (AMM)

```rust
#[derive(Accounts)]
#[instruction(amount_in: u64, min_amount_out: u64, direction: SwapDirection)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"amm", pool.tranche_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, AmmPool>,

    #[account(mut, constraint = pool_tranche_reserve.key() == pool.tranche_reserve)]
    pub pool_tranche_reserve: Account<'info, TokenAccount>,
    #[account(mut, constraint = pool_quote_reserve.key() == pool.quote_reserve)]
    pub pool_quote_reserve: Account<'info, TokenAccount>,

    #[account(mut, token::mint = pool.tranche_mint, token::authority = user)]
    pub user_tranche_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = pool.quote_mint, token::authority = user)]
    pub user_quote_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
```

---

## 5.5 PRISM error enum

```rust
#[error_code]
pub enum PrismError {
    #[msg("Vault is not in Active state")]
    VaultNotActive,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Invalid tranche kind")]
    InvalidTrancheKind,
    #[msg("Loan is not in expected state")]
    LoanInWrongState,
    #[msg("Insufficient liquidity in tranche")]
    InsufficientLiquidity,
    #[msg("Slippage exceeded — swap output below min_amount_out")]
    SlippageExceeded,
    #[msg("Unauthorized — caller is neither admin nor allowlisted oracle")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("NAV calculation: division by zero (empty tranche)")]
    EmptyTrancheNav,
    #[msg("CreditEvent severity exceeds 100% (10000 bps)")]
    InvalidSeverity,
    #[msg("Loss amount exceeds total vault assets")]
    LossExceedsTotalAssets,
    #[msg("Borrower account mismatch")]
    BorrowerMismatch,
    #[msg("Tranche has been wiped (NAV = 0); deposits blocked until reset")]
    TrancheWipedNoDepositsAllowed,
}
```

---

## 5.6 CPI patterns

| From | To | Purpose | PDA signer needed |
|---|---|---|---|
| `prism_core::deposit` | SPL Token | `mint_to` user | Tranche PDA (mint authority) |
| `prism_core::withdraw` | SPL Token | `burn` user tokens | none (user signs) |
| `prism_core::withdraw` | SPL Token | `transfer` USDC out | Vault PDA |
| `prism_core::accrue_yield` | SPL Token | `transfer` USDC in (borrower → vault) | none (borrower signs) |
| `prism_core::trigger_credit_event` | SPL Token | `transfer` loss USDC (vault → loss_bucket) | Vault PDA |
| `prism_amm::swap` | SPL Token | `transfer` both directions | AmmPool PDA |

PDA-signer pattern in Anchor:

```rust
let kind_byte = [TrancheKind::Prime as u8];
let vault_key = vault.key();
let seeds = &[b"tranche", vault_key.as_ref(), &kind_byte, &[tranche.bump]];
let signer_seeds = &[&seeds[..]];

token::mint_to(
    CpiContext::new_with_signer(
        token_program.to_account_info(),
        MintTo {
            mint: tranche_mint.to_account_info(),
            to: user_tranche_ata.to_account_info(),
            authority: tranche.to_account_info(),
        },
        signer_seeds,
    ),
    shares,
)?;
```

---

## 5.7 Partner integration touchpoints

| Partner | Where it touches the code |
|---|---|
| **Ika** | `Loan.borrower` becomes an Ika dWallet PDA. `borrower_usdc_ata` in `accrue_yield` is the dWallet's ATA. Ika SDK called from frontend / off-chain agent for cross-chain collateral signing. **No on-chain CPI** — Ika is a separate network |
| **Switchboard** | `accrue_yield` and `trigger_credit_event` validate `switchboard_feed` account against `config.oracle_allowlist`. Read latest feed value on-chain via Switchboard's account-deserialization helper |
| **Cloak** | Off-chain SDK only. Frontend integrates with `withdraw` flow — payout USDC routes through Cloak's shielded send to the LP. **No on-chain CPI** to PRISM. (Periodic coupon distribution deferred to Phase 2) |
| **Encrypt** | Off-chain initially. Confidential borrower scoring stored client-side; on-chain only stores a commitment hash in the `Loan` struct (or extended via a separate `BorrowerScore` PDA in v1.5) |
| **Dune SIM** | Off-chain only. Reads emitted events via webhook subscription. **No on-chain integration** |

**Key insight:** only **Switchboard** requires on-chain integration with `prism_core`. The other four partners are off-chain SDKs the frontend uses. This minimizes the contract surface area.

---

## 5.8 Account size / rent budgets

| Account | Size (bytes) | Rent at 0.00204 SOL/byte/year |
|---|---|---|
| GlobalConfig | ~120 | ~0.001 SOL |
| Vault | ~250 | ~0.002 SOL |
| Tranche | ~200 | ~0.0015 SOL |
| Loan | ~150 | ~0.001 SOL |
| CreditEvent | ~140 | ~0.001 SOL |
| AmmPool | ~180 | ~0.0015 SOL |

Negligible on devnet.

---

## 5.9 Workspace layout

```
prism-protocol/
├── Anchor.toml
├── Cargo.toml                  (workspace root)
├── programs/
│   ├── prism-core/
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── lib.rs          (instruction entry points)
│   │       ├── state.rs        (account structs)
│   │       ├── errors.rs
│   │       ├── instructions/
│   │       │   ├── initialize.rs
│   │       │   ├── deposit.rs
│   │       │   ├── withdraw.rs
│   │       │   ├── accrue_yield.rs
│   │       │   ├── trigger_credit_event.rs
│   │       │   └── ...
│   │       └── math/
│   │           ├── nav.rs       (Q64.64 helpers)
│   │           └── waterfall.rs
│   └── prism-amm/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── state.rs
│           ├── errors.rs
│           └── instructions/
│               ├── initialize_pool.rs
│               ├── add_liquidity.rs
│               └── swap.rs
├── tests/
│   ├── prism-core.ts
│   └── prism-amm.ts
├── app/                        (Next.js frontend)
│   ├── package.json
│   ├── src/
│   │   ├── app/                (App Router)
│   │   ├── components/
│   │   │   ├── TrancheBar.tsx
│   │   │   ├── DepositPanel.tsx
│   │   │   ├── SwapPanel.tsx
│   │   │   ├── DefaultButton.tsx
│   │   │   ├── EventTicker.tsx
│   │   │   └── StrategyPresets.tsx
│   │   ├── hooks/
│   │   │   ├── usePrismCore.ts
│   │   │   └── usePrismAmm.ts
│   │   └── lib/
│   │       ├── idl/            (auto-generated from Anchor)
│   │       └── pda.ts
│   └── ...
└── docs/                       (this directory)
```

---

## Next: Section 6 — MVP Slice & 16-Day Build Plan

Day-by-day plan from Apr 25 → May 11, with critical-path vs stretch markers and a definition of done per phase.
