# PRISM Protocol: Complete System Specification
### A Deep-Dive Technical & Financial Reference for Developers, Auditors, and Protocol Architects

> **Document Type:** Production-Grade System Specification  
> **Audience:** Protocol developers, smart contract auditors, DeFi architects, technical investors  
> **Status:** Living document — reflects on-chain implementation of PRISM v1  
> **Stack:** Solana / Anchor Framework / SPL Tokens / USDC

---

## Table of Contents

1. [What This System Is](#1-what-this-system-is)
2. [Core Mechanics](#2-core-mechanics)
3. [Full User Flow](#3-full-user-flow)
4. [Full Borrower Flow](#4-full-borrower-flow)
5. [Cashflow Architecture](#5-cashflow-architecture)
6. [Token System](#6-token-system)
7. [Tranche Logic](#7-tranche-logic)
8. [What-If Scenarios](#8-what-if-scenarios)
9. [Edge Cases](#9-edge-cases)
10. [Code-Level Explanation](#10-code-level-explanation)

---

## 1. What This System Is

### 1.1 The One-Paragraph Summary

PRISM is a structured credit protocol built on Solana. It allows a pool of capital to be deployed to real-world or on-chain borrowers (SMEs, invoice financiers, DeFi protocols), and the yield from that capital to be distributed back to investors in a risk-tiered, prioritized waterfall. Investors don't pick individual loans — they deposit into a pool that has multiple risk layers called tranches, receive tokens representing their ownership and risk exposure, and earn yield proportional to the risk they chose to take.

### 1.2 What Makes This Different From Traditional Lending

In traditional bank lending, a bank raises capital from depositors at a fixed rate (say 2%), lends it out at a higher rate (say 8%), and keeps the spread. The depositor is not exposed to credit risk directly — their deposits are insured or guaranteed. The bank pools all risk internally, and the depositor has no say in which loans their money goes to.

PRISM inverts this entirely:

- There is no bank intermediary absorbing the spread
- Capital goes into a protocol-managed pool
- Investors explicitly choose their risk layer (tranche)
- Yield and losses flow transparently through on-chain waterfall logic
- All accounting is verifiable on-chain in real time
- The protocol is non-custodial — no human can move funds without smart contract authorization

The result: investors get direct exposure to credit risk with transparent, real-time accounting and programmable yield distribution, at a scale and cost structure that traditional finance cannot match.

### 1.3 What Makes This Different From DeFi Lending (Aave, Compound)

Aave and Compound are collateralized lending protocols. Every borrower must deposit more collateral than they borrow. This is called overcollateralization. A borrower who deposits $150 worth of ETH can borrow $100 worth of USDC. If ETH drops and the collateral ratio falls below a threshold, the position is automatically liquidated.

This model has one fundamental limitation: **it cannot serve borrowers who don't have existing on-chain capital**. A small business owner who needs $50,000 to buy inventory doesn't have $75,000 of crypto sitting around. They have purchase orders, invoices, and business cashflow — off-chain assets.

PRISM is designed for **undercollateralized or real-world credit**. This means:

- Borrowers can be businesses, not just crypto-native users
- Credit is assessed off-chain through underwriting, then brought on-chain through attestation
- The protocol doesn't liquidate collateral — it uses a loss cascade across tranches to absorb defaults
- Risk is priced and distributed through structured tranching, not liquidation auctions

| Feature | Traditional Bank | Aave/Compound | PRISM |
|---|---|---|---|
| Collateral Required | Partial (real estate etc.) | 150%+ overcollateralized | None to partial (real-world assets) |
| Risk to Depositor | Socialized/insured | Liquidation risk only | Explicit, tranche-based |
| Yield | Fixed, low | Variable, market-driven | Structured, waterfall-distributed |
| Transparency | None (opaque) | On-chain but complex | On-chain, explicit waterfall |
| Borrower Type | Any (verified) | Crypto-native only | SMEs, invoices, real-world credit |
| Loss Mechanism | Bank absorbs | Liquidation | Tranche cascade |

### 1.4 The Core Innovation: Structured Finance On-Chain

PRISM brings the mechanics of structured finance — specifically Collateralized Loan Obligations (CLOs) and Asset-Backed Securities (ABS) — on-chain. In traditional structured finance, a bank packages a pool of loans, slices them into risk tranches, and sells them to different investors. Prime tranches get paid first and are the safest; junior tranches get paid last and are the riskiest but highest-yielding.

This works very well as a risk distribution mechanism, but in traditional finance it's opaque, expensive, and inaccessible to retail. PRISM makes the same mechanics:

- Transparent (on-chain)
- Programmable (smart contract waterfall)
- Accessible (anyone with USDC can participate)
- Composable (tranche tokens are SPL tokens that can be traded, staked, or used in other DeFi protocols)

---

## 2. Core Mechanics

### 2.1 Pool Structure

A **Pool** (called a Vault in the on-chain implementation) is the fundamental unit of PRISM. It is not a single loan. It is a capital container that:

- Accepts deposits in a single denomination (USDC)
- Maintains its own internal accounting
- Has a defined set of borrowers it serves
- Holds a reserve (the Vault Reserve) and a safety buffer (the Loss Bucket)
- Tracks total assets, total liabilities, and net asset value over time

Each vault is a Program Derived Address (PDA) on Solana, meaning its ownership and authority are cryptographically derived — no private key controls it directly. Only instructions authorized by the smart contract can move funds.

**Key vault state tracked on-chain:**

```
Vault {
    vault_id: u64,
    total_assets: u64,        // USDC in reserve
    total_shares: u64,        // LP tokens outstanding
    nav_per_share: u64,       // current price per share (6 decimals)
    loss_bucket: u64,         // first-loss buffer
    is_paused: bool,
    tranches: [Tranche; 3],
    loans: Vec<Loan>
}
```

### 2.2 Tranches

Every vault has exactly three tranches. These represent three different risk-return profiles within the same pool of capital. Every dollar of investor capital flows into one of these three layers.

**Prime Tranche**
- Lowest risk
- Lowest yield (target: 5% APY in initial implementation)
- First to be paid in any profit distribution
- Last to absorb losses
- Designed for risk-averse capital — pension funds, conservative allocators, stablecoin yield seekers

**Core Tranche**
- Medium risk
- Medium yield (target: 8% APY)
- Paid second in profit distribution
- Absorbs losses only after Alpha is wiped out
- Designed for yield-seekers who understand credit risk but want a floor

**Alpha Tranche**
- Highest risk
- Highest yield target (15% APY)
- Paid last in profit distribution
- First to absorb any losses
- Designed for risk-on capital that wants maximum upside in well-performing pools

The three tranches exist within the same vault and share the same underlying borrowers. The difference is not **which** loans your capital goes to — it is **what order** you get paid, and what order you absorb losses.

### 2.3 Token Mechanics

When a user deposits USDC into a tranche, they receive **tranche tokens** (SPL Tokens minted by the vault's tranche mint). These tokens are not USDC receipts — they are **ownership shares** in their specific tranche layer.

Critical properties:

1. **Token count does not change after minting** (unless more deposits come in or redemptions occur). There is no rebasing.
2. **Token price (NAV per share) changes** as the underlying assets appreciate or depreciate.
3. **Each tranche has its own token** — Prime tokens, Core tokens, Alpha tokens are distinct SPL token mints with different prices.

When you deposit, you get tokens. When you redeem, you burn those tokens and receive the USDC equivalent of your current NAV. Your profit or loss is the difference between entry NAV and exit NAV.

### 2.4 NAV (Net Asset Value) Calculation

NAV is the price of one tranche token at any given moment. It reflects the current value of the underlying assets assigned to that tranche.

**Basic NAV formula:**

```
NAV_per_share = Total_Assets_in_Tranche / Total_Shares_Outstanding
```

**On first deposit (genesis):**

```
NAV_per_share = 1.0 (normalized)
Shares_minted = USDC_deposited / 1.0 = USDC_deposited
```

**After yield accrues:**

```
Total_Assets_in_Tranche increases (more USDC in the vault)
Total_Shares_Outstanding stays the same
NAV_per_share increases
```

**Numerical Example:**

| Event | Total Assets (Prime) | Shares Outstanding | NAV/share |
|---|---|---|---|
| User A deposits 1,000 USDC | 1,000 | 1,000 | 1.000 |
| User B deposits 1,000 USDC | 2,000 | 2,000 | 1.000 |
| Yield of 200 USDC distributed to Prime | 2,200 | 2,000 | 1.100 |
| User A redeems 1,000 shares | 1,100 returned, 1,100 assets remain | 1,000 | 1.100 |

User A entered at NAV 1.0, exited at NAV 1.1 — a 10% return, purely through price appreciation of their tokens. No new tokens were ever created.

**NAV after a loss:**

If 400 USDC of losses cascade up to the Prime tranche:

```
Total_Assets_in_Tranche: 2,200 → 1,800
Shares_Outstanding: 2,000 (unchanged)
NAV/share: 1,800 / 2,000 = 0.90
```

A token holder who bought at NAV 1.0 is now sitting at a 10% loss on their position.

### 2.5 Waterfall Logic

The waterfall is the core financial mechanic of PRISM. It defines the priority order in which money flows.

**On profit (borrower repays with interest):**

```
Incoming cashflow: $X

Step 1: Pay Prime tranche to its 5% target APY
Step 2: Pay Core tranche to its 8% target APY
Step 3: Pay Alpha tranche to its 15% target APY
```

**Visualized:**

```
Borrower Repayment: $1,000 principal + $100 interest

WATERFALL ENTRY: $100 yield

→ Prime allocation: $50 (5% APY on $1,000 Prime TVL)
  → NAV of Prime tokens increases
→ Core allocation: $32 (up to 8% APY target)
  → NAV of Core tokens increases
→ Alpha allocation: $18 (remaining yield toward the 15% APY target)
  → NAV of Alpha tokens increases
```

**On loss (borrower defaults):**

The loss cascade is the mirror image of the profit waterfall — but it flows from the bottom up.

```
Default amount: $D

Step 1: Alpha tranche absorbs first
  → If D < Alpha TVL: only Alpha holders are impacted
  → If D > Alpha TVL: Alpha is wiped to zero, remainder cascades up

Step 2: Core tranche absorbs
  → If remaining D < Core TVL: Core absorbs remainder
  → If remaining D > Core TVL: Core wiped, remainder cascades to Prime

Step 3: Prime tranche absorbs only if both Alpha and Core are insufficient
  → Prime holders are protected by two full layers beneath them
```

### 2.6 Loss Cascade: Full Example

**Pool setup:**

| Tranche | TVL | APY Target |
|---|---|---|
| Prime | $10,000 | 5% |
| Core | $5,000 | 8% |
| Alpha | $2,000 | 15% |
| **Total** | **$17,000** | |

**Scenario A: $1,500 default**

```
Loss = $1,500
Alpha TVL = $2,000

Alpha absorbs $1,500 → Alpha TVL drops to $500
Core impact: ZERO
Prime impact: ZERO
```

Prime and Core investors don't even know there was a default. Their NAV is unchanged. Alpha investors just lost 75% of their TVL.

**Scenario B: $3,000 default**

```
Loss = $3,000
Alpha TVL = $2,000 → WIPED. Alpha holders: 100% loss.

Remaining loss = $3,000 - $2,000 = $1,000
Core TVL = $5,000 → Absorbs $1,000 → Core TVL drops to $4,000

Prime impact: ZERO
```

Core investors lose 20% of their TVL. Prime investors remain at 100% NAV.

**Scenario C: $9,000 default**

```
Loss = $9,000
Alpha TVL = $2,000 → WIPED.
Remaining: $7,000

Core TVL = $5,000 → WIPED.
Remaining: $2,000

Prime TVL = $10,000 → Absorbs $2,000 → Drops to $8,000
Prime NAV drops by 20%.
```

This is the worst-case scenario for Prime holders. They only get impacted when losses exceed the combined buffer of the two tranches below them.

---

## 3. Full User Flow

### 3.1 Step-by-Step: Investor Journey

#### Step 1: Platform Entry

A user connects their Solana wallet (Phantom, Backpack, Solflare) to the PRISM frontend. The protocol reads the user's USDC balance and any existing tranche token holdings. No KYC is required at the protocol level for the initial implementation (though specific vault configurations may enforce this).

**What happens internally:**
- Frontend calls `getTokenAccountsByOwner` to check existing holdings
- `GlobalConfig` PDA is read to verify protocol is not paused
- Protocol version and fee parameters are loaded from `GlobalConfig`

#### Step 2: Choosing a Pool (Vault)

The user sees a list of available vaults, each representing a different credit pool. Vaults differ in:
- Asset type (SME loans, invoice financing, trade credit)
- Geography / jurisdiction
- Risk profile (distribution of Prime/Core/Alpha capital)
- Average maturity of underlying loans
- Historical yield performance

**What happens internally:**
- Frontend fetches all `Vault` PDAs via `getProgramAccounts` with the vault discriminator
- For each vault: total assets, current NAV per tranche, utilization rate, outstanding loans are displayed
- Users can view the `Loan` PDAs attached to each vault to see underlying credit positions

#### Step 3: Choosing a Tranche

Within a vault, the user selects their tranche: Prime, Core, or Alpha. This is the most important decision — it determines their yield ceiling, their loss exposure, and their priority in the waterfall.

The frontend should present:
- Current NAV per share for the chosen tranche
- Historical yield vs. target APY
- Current Alpha buffer (how much must default before this tranche is impacted)
- Outstanding loan portfolio quality metrics

**What happens internally:**
- The chosen tranche's `Tranche` PDA is read
- Current `nav_per_share` is retrieved (this is the entry price)
- The tranche's `total_shares` outstanding and `total_assets` are displayed

#### Step 4: Depositing

The user inputs a USDC amount and approves the transaction. The smart contract:

1. Verifies the protocol is not paused
2. Transfers USDC from user wallet to the `Vault Reserve` token account
3. Calculates shares to mint: `shares = amount / current_nav_per_share`
4. Mints tranche tokens to the user's associated token account
5. Updates `Vault.total_assets` and `Tranche.total_shares`

**Example:**
```
User deposits: 5,000 USDC
Current NAV (Prime): 1.05 (after some yield has accrued)
Shares minted: 5,000 / 1.05 = 4,761.9 Prime tokens
```

The user now holds 4,761.9 Prime tokens. These tokens represent their pro-rata claim on the Prime tranche of this vault.

#### Step 5: Receiving Tokens

The user's wallet now shows their tranche tokens (e.g., `pPRIME`, `pCORE`, or `pALPHA` in the PRISM implementation). These are standard SPL tokens. They can:

- Hold them and watch the NAV appreciate
- Sell them on the AMM for instant liquidity (secondary market)
- Transfer them to another wallet
- Use them as collateral in other DeFi protocols (future composability)

**What happens internally:**
- Standard SPL token mint instruction is executed by the vault authority PDA
- The user's associated token account for the tranche mint receives the minted tokens
- On-chain token balance is updated atomically with the USDC transfer (same transaction)

#### Step 6: Earning Yield

Yield accrues to the vault as borrowers make interest payments. These payments go into the Vault Reserve and are then distributed to tranches via the waterfall. The user doesn't do anything — their tokens automatically appreciate in value.

**What happens internally:**
- Yield enters via `accrue_yield` instruction (see Section 5)
- Waterfall logic runs on-chain
- `nav_per_share` for each tranche is updated
- No new tokens are minted — existing tokens are now worth more

#### Step 7: Exiting (Withdrawal)

When the user wants to exit, they call the `withdraw` instruction:

1. User specifies how many tranche tokens to burn (can be partial)
2. Protocol calculates USDC owed: `usdc_out = shares_burned * current_nav_per_share`
3. Tranche tokens are burned
4. USDC is transferred from Vault Reserve to user wallet
5. Vault state is updated

**Example continuing from Step 4:**
```
Tokens held: 4,761.9 Prime tokens
Entry NAV: 1.05
Exit NAV (6 months later): 1.1025 (approximately 5% APY)
USDC received: 4,761.9 * 1.1025 = 5,248.95 USDC
Profit: 248.95 USDC on 5,000 invested = ~4.98% return
```

The profit is slightly below the 5% target APY because the user exited mid-period. The NAV appreciation is continuous.

#### Step 8: Liquidity Constraint

If the Vault Reserve has insufficient USDC at withdrawal time (because capital is deployed to borrowers), the user may need to wait for loan repayments to flow back in. The AMM provides an alternative exit path — the user can sell their tranche tokens on the secondary market for immediate liquidity, accepting whatever price the market has set.

---

## 4. Full Borrower Flow

### 4.1 Application

A borrower (SME, invoice discounter, supply chain financier) applies to PRISM off-chain through the protocol's credit origination layer. The application includes:

- Business financials (revenue, margins, balance sheet)
- Purpose of credit (working capital, inventory, invoice pre-financing)
- Loan amount and requested term
- Collateral offered (if any — for undercollateralized credit, this may be business assets or personal guarantee)

This is fundamentally an off-chain process. PRISM v1 uses a trusted admin/attestor model to bring credit decisions on-chain.

### 4.2 Underwriting

The protocol's underwriting layer (initially centralized, designed to be decentralized via attestation networks over time) evaluates:

- Credit risk: probability of default (PD)
- Loss given default (LGD): how much is recovered if they do default
- Expected yield: the APR the borrower will pay

The output of underwriting is a **Loan Term Sheet** that specifies:
- Principal amount
- APR
- Maturity date
- Repayment schedule
- Vault/tranche this loan will be allocated to

### 4.3 On-Chain Loan Initialization

Once underwriting approves, the admin calls `initialize_loan` on-chain. This creates a `Loan` PDA with immutable terms:

```rust
Loan {
    loan_id: u64,
    vault_id: u64,
    borrower: Pubkey,
    principal: u64,
    apr_bps: u32,       // APR in basis points (e.g., 1500 = 15%)
    maturity: i64,      // Unix timestamp
    status: LoanStatus, // Pending → Active → Repaid / Defaulted
    disbursed_at: i64,
    repaid_at: i64,
    amount_repaid: u64
}
```

The loan is now on-chain but `status = Pending`. Capital has not moved.

### 4.4 Capital Disbursement

When the vault has sufficient liquidity and the loan terms are confirmed, the admin calls `disburse_loan`. This:

1. Validates the loan is in `Pending` state
2. Validates the vault has sufficient USDC reserve
3. Transfers USDC from Vault Reserve to borrower's USDC account
4. Sets `loan.status = Active`
5. Records `disbursed_at` timestamp

```
Vault Reserve before: 100,000 USDC
Loan disbursement: 50,000 USDC
Vault Reserve after: 50,000 USDC
Loan.status: Active
```

Note: The `total_assets` of the vault does not decrease at this point in many structured finance implementations. The loan itself is an asset — it's just illiquid. The vault's NAV includes the present value of outstanding loan receivables. The reserve decreases, but the total asset base remains the same (a loan receivable replaces the cash).

### 4.5 Borrower Usage of Capital

The borrower receives USDC in their on-chain wallet. They may:
- Convert to fiat for business operations
- Use directly for on-chain purchases
- Deploy as working capital

From the protocol's perspective, the capital is now "out." The loan is live. Interest accrues from `disbursed_at`.

### 4.6 Repayment

The borrower makes repayments (typically periodic — monthly in the initial implementation). Each repayment is sent to the `Vault Reserve`. The admin (or in future, an automated trigger) calls `repay_loan` which:

1. Receives the USDC payment
2. Splits it into principal and interest components
3. Credits interest to yield distribution
4. Credits principal back to vault reserve
5. Updates `loan.amount_repaid`
6. If `amount_repaid >= principal`, sets `loan.status = Repaid`

**Internal accounting:**
```
Payment received: 5,000 USDC
Interest component: 625 USDC (15% APR on 50,000 for 1 month)
Principal component: 4,375 USDC

Vault Reserve += 5,000
Yield to be distributed: 625 USDC
Loan.amount_repaid += 4,375
```

The 625 USDC in yield then flows through the waterfall (see Section 5).

### 4.7 Default Handling

If a borrower misses a payment and the maturity date passes without full repayment:

1. The admin (or automated oracle) marks `loan.status = Defaulted`
2. The unrecovered principal is calculated: `loss = principal - amount_repaid`
3. `allocate_loss` is called on-chain
4. Loss cascades down through tranches starting from Alpha (see Section 2.6)
5. `nav_per_share` for affected tranches is updated downward
6. Recovery process begins off-chain (legal, asset seizure, etc.)

Any recovered funds from the default process are reinjected into the vault and re-distributed via the waterfall, partially restoring NAV.

---

## 5. Cashflow Architecture

### 5.1 The Two Directions of Money

All money in PRISM flows in two directions at different times. Understanding this is essential.

**Direction 1: Capital In (Deployment)**
```
[Investor] → USDC → [Vault Reserve] → USDC → [Borrower]
```

**Direction 2: Yield & Principal Out (Return)**
```
[Borrower] → Repayment → [Vault Reserve] → Waterfall → [Prime] → [Core] → [Alpha]
                                                       → User redemption on exit
```

### 5.2 How Yield Enters the System

Yield (interest income) enters the system exclusively through borrower interest payments. In the current implementation, it can also be simulated through the `accrue_yield` instruction for testing/demo purposes.

When a borrower makes a periodic payment:
- The interest component is extracted
- It is added to a **yield buffer** in the vault
- At distribution time (triggered by admin or automated cron), the `distribute_yield` function runs

In the simulation mode:
- `accrue_yield(amount)` is called directly by the admin
- USDC is minted or transferred to the vault reserve
- The same distribution logic runs

Both paths lead to the same on-chain state change: `vault.total_assets` increases, and NAV per tranche updates.

### 5.3 How Value Accumulates

Value accumulates silently inside tranche tokens. The token holder doesn't receive periodic USDC payments (this is not an income token — it is a NAV token). Instead:

1. Yield enters vault
2. Vault distributes to tranches via waterfall
3. Each tranche's `total_assets` increases
4. Since `total_shares` hasn't changed, `nav_per_share` increases
5. Token holders' tokens are now worth more in USDC terms

This is mechanically identical to how index fund NAVs work. You don't receive dividends — your fund units just become worth more.

**Daily NAV update example:**

```
Day 1:
  Prime total_assets: 100,000 USDC
  Prime total_shares: 100,000
  Prime NAV: 1.000

Day 30 (after $416 of yield distributed to Prime — ~5% APY on 100k over 1 month):
  Prime total_assets: 100,416 USDC
  Prime total_shares: 100,000 (unchanged)
  Prime NAV: 1.00416

Day 365:
  Prime total_assets: 105,000 USDC (assuming perfect 5% APY)
  Prime total_shares: 100,000
  Prime NAV: 1.050
```

### 5.4 Distribution Mechanics

The `distribute_yield` function runs the waterfall:

```
Total yield available: Y

Prime allocation:
  prime_target_yield = prime_total_assets * prime_apy * (days_elapsed / 365)
  prime_allocation = min(Y, prime_target_yield)
  Y_remaining = Y - prime_allocation

Core allocation:
  core_target_yield = core_total_assets * core_apy * (days_elapsed / 365)
  core_allocation = min(Y_remaining, core_target_yield)
  Y_remaining = Y_remaining - core_allocation

Alpha allocation:
  alpha_target_yield = alpha_total_assets * alpha_apy * (days_elapsed / 365)
  alpha_allocation = min(Y_remaining, alpha_target_yield)
```

The allocations are then applied to each tranche's `total_assets`:
```
prime.total_assets += prime_allocation
core.total_assets += core_allocation
alpha.total_assets += alpha_allocation
```

And NAV is recalculated for each tranche.

### 5.5 The Loss Bucket (First-Loss Reserve)

The Loss Bucket is a separate reserve within the vault funded by the protocol treasury or dedicated backstop capital at vault inception. It acts as a buffer that absorbs losses before they reach the Alpha tranche. Think of it as a deductible on the credit pool.

```
Loss occurs: $L

Step 0: Check Loss Bucket
  if loss_bucket >= L:
    loss_bucket -= L
    NO TRANCHE IMPACT
  else:
    remaining_loss = L - loss_bucket
    loss_bucket = 0
    → cascade remaining_loss through tranches (Alpha → Core → Prime)
```

This mechanism gives Prime and Core holders an additional layer of protection that isn't part of the investor capital structure — it's protocol-provided insurance.

---

## 6. Token System

### 6.1 What Tranche Tokens Represent

A tranche token is a programmable, transferable claim on a specific layer of a specific vault's assets. It is not:
- A debt instrument (you are not owed a fixed amount)
- A governance token (it confers no voting rights by itself)
- A yield receipt (interest is not paid out — it accrues into NAV)

It is:
- An ownership-like share of a tranche's asset pool
- Priced continuously at NAV
- Freely transferable (it's an SPL token — can be sent, traded, or used in other protocols)
- Redeemable for USDC at current NAV when the vault has liquidity

### 6.2 Why Token Count Doesn't Increase (Except for New Deposits)

This is the most counterintuitive aspect of NAV-based tokens for people used to rebasing tokens like stETH.

In a rebasing model:
- You deposit 1,000 USDC → receive 1,000 tokens
- 10% yield → you now have 1,100 tokens
- Still worth 1 USDC each

In a NAV model (PRISM):
- You deposit 1,000 USDC at NAV 1.0 → receive 1,000 tokens
- 10% yield → you still have 1,000 tokens
- But each token is now worth 1.10 USDC
- Your 1,000 tokens are now worth 1,100 USDC

Both models are mathematically equivalent. The NAV model is preferred because:
- It's simpler for smart contract accounting (no rebase math)
- It doesn't require all token holders to update their wallet display
- NAV changes are the standard in fund accounting (mutual funds, ETFs, hedge funds)
- It avoids integer precision issues that rebasing can introduce

### 6.3 How Token Price Changes: Mechanistic Detail

Token price (NAV per share) can change in two ways:

**Upward (yield accrual):**
```
nav_per_share = (total_assets + accrued_yield_allocated) / total_shares
```

Since total_shares is constant and the numerator increases, NAV rises.

**Downward (loss allocation):**
```
nav_per_share = (total_assets - allocated_loss) / total_shares
```

Since total_shares is constant and the numerator decreases, NAV falls.

### 6.4 Multi-Period NAV Example With Real Numbers

**Starting state:**
```
Prime pool: 500,000 USDC total assets
Prime shares outstanding: 500,000
Prime NAV: 1.000
Target APY: 5%
```

**Month 1: $2,083 yield distributed to Prime (5% / 12 months on 500k)**
```
total_assets: 502,083
total_shares: 500,000
NAV: 1.004166
```

**Month 2: New investor deposits 50,000 USDC**
```
Entry NAV: 1.004166
New shares minted: 50,000 / 1.004166 = 49,792.5
total_assets: 552,083
total_shares: 549,792.5
NAV: 1.004166 (unchanged — new deposit doesn't dilute)
```

Note: New deposits don't change NAV because shares are minted at the current NAV. This is the fairness mechanism.

**Month 3: $2,300 yield distributed (5% APY on new 552k total)**
```
total_assets: 554,383
total_shares: 549,792.5
NAV: 1.008503
```

**Month 4: Default — $30,000 loss cascades to Prime (after Alpha+Core exhausted)**
```
total_assets: 554,383 - 30,000 = 524,383
total_shares: 549,792.5
NAV: 0.953789
```

**Original investor's position (500,000 shares):**
```
Entry NAV: 1.000
Current NAV: 0.953789
Mark-to-market loss: (0.953789 - 1.000) / 1.000 * 100 = -4.62%
```

**Month 5: Partial recovery, $15,000 injected**
```
total_assets: 524,383 + 15,000 = 539,383
NAV: 539,383 / 549,792.5 = 0.981067
```

The NAV begins recovering as credit losses are partially recouped.

---

## 7. Tranche Logic

### 7.1 Why Tranches Exist

Without tranches, all investors in a pool share risk equally. A 2% default rate hits everyone proportionally. This is fine for homogeneous risk appetites, but in practice, capital pools come from vastly different sources with different requirements:

- Pension funds **legally cannot** take more than X% principal risk
- Hedge funds **specifically want** maximum yield even if it means higher risk
- Retail investors want **predictable yield** without tail-risk volatility

Tranches allow a single pool of diversified loans to simultaneously serve all three categories. The pool's aggregate risk is real — but it's distributed in a way that matches each investor's actual risk appetite and legal constraints.

This is why structured finance exists. It's not financial engineering for its own sake — it's genuine capital market efficiency.

### 7.2 Risk-Return Relationship

The tranche structure creates a mathematically precise risk-return tradeoff:

```
Expected Return: Prime < Core < Alpha
Expected Loss Probability: Prime < Core < Alpha
Yield Target: Prime (5%) < Core (8%) < Alpha (15%)
Protection Buffer: Prime (Core + Alpha buffer) > Core (Alpha buffer) > Alpha (none)
```

The Alpha tranche is the most volatile:
- If the pool performs well → Alpha receives the highest target yield
- If the pool performs poorly → Alpha absorbs all losses first

This means Alpha is the "first-loss piece" — the riskiest but also the one incentivized to care most about pool performance.

### 7.3 Payment Priority: Full Detail

**Scenario: Pool has $1,000 of yield to distribute**

Pool TVL breakdown:
- Prime: $1,000,000 (5% APY target → needs $50,000/yr → $4,167/month)
- Core: $500,000 (8% APY target → needs $40,000/yr → $3,333/month)
- Alpha: $200,000 (15% APY target → needs $30,000/yr → $2,500/month)

Monthly distribution of $1,000:

```
Prime demand: $4,167 (monthly share of 5% on $1M)
Available: $1,000
→ Prime gets: $1,000 (100% of available — doesn't even cover target)
→ Core gets: $0
→ Alpha gets: $0

Result: Prime partially funded (24% of target)
        Core unfunded
        Alpha unfunded
```

Monthly distribution of $10,000:

```
Prime demand: $4,167
→ Prime gets: $4,167
→ Remaining: $5,833

Core demand: $3,333
→ Core gets: $3,333
→ Remaining: $2,500

Alpha demand: $2,500
→ Alpha gets: $2,500
```

Alpha's effective yield: $2,500 / $200,000 * 12 months = 15% APY

Monthly distribution of $20,000:

```
Prime gets: $4,167
Core gets: $4,167
Alpha gets: $11,666
Alpha effective APY: $11,666 / $200,000 * 12 = 70% APY
```

This is the power of the Alpha tranche in an outperforming pool.

### 7.4 Loss Absorption: Detailed Example

**Setup:**
```
Prime TVL: 10,000 USDC (NAV: 1.0, shares: 10,000)
Core TVL: 5,000 USDC (NAV: 1.0, shares: 5,000)
Alpha TVL: 2,000 USDC (NAV: 1.0, shares: 2,000)
Total: 17,000 USDC
Loans outstanding: 15,000 USDC
```

**Default 1: $800 partial default (borrower recovered some assets)**

```
Loss: $800
Alpha TVL before: 2,000
Alpha TVL after: 1,200
Alpha NAV: 1,200 / 2,000 = 0.600

Core NAV: 1.000 (unchanged)
Prime NAV: 1.000 (unchanged)

Alpha holders: 40% loss on their investment
Everyone else: no impact
```

**Default 2: Another $1,500 default hits the same pool**

```
Loss: $1,500
Alpha TVL: 1,200 (remaining from last default)
Alpha absorbs: 1,200 → wiped to ZERO
Alpha NAV: 0 (100% loss from original investment)

Remaining loss: $1,500 - $1,200 = $300
Core TVL: 5,000 → absorbs $300 → drops to 4,700
Core NAV: 4,700 / 5,000 = 0.940

Prime NAV: 1.000 (still unchanged)
```

Alpha holders are fully wiped. Core holders lost 6%. Prime holders: no impact.

**Default 3: $6,000 catastrophic default (extremely unlikely scenario)**

```
Loss: $6,000
Alpha: already wiped (contributes 0)
Core TVL: 4,700 → wiped to ZERO (absorbs 4,700)
Remaining loss: $6,000 - $4,700 = $1,300

Prime TVL: 10,000 → absorbs $1,300 → drops to 8,700
Prime NAV: 8,700 / 10,000 = 0.870

Alpha: 100% loss (already gone)
Core: 100% loss
Prime: 13% loss
```

Even in catastrophic default scenarios, Prime holders retain most of their capital because of the two full tranche buffers beneath them.

---

## 8. What-If Scenarios

### 8.1 What If All Borrowers Repay?

**Technically:** All loans transition from `Active` to `Repaid`. Principal and interest flow back to the Vault Reserve. Yield is distributed via waterfall. All tranches see NAV appreciation according to their target APY.

**Impact on users:** All investors exit at a profit. Prime: ~5% APY. Core: ~8% APY. Alpha: ~15% APY when the waterfall is fully funded.

**Impact on tokens:** All tranche tokens appreciate to their maximum NAV for the period. No tokens are burned until users request withdrawal.

**The pool lifecycle:** After all loans are repaid and all investors have withdrawn, the vault has zero TVL and is effectively dormant. New capital raising begins a new cycle.

### 8.2 What If Some Borrowers Default (Moderate Scenario)?

**Technically:** Loss cascade is triggered for each defaulted loan. The `allocate_loss` instruction runs, deducting from tranches from bottom up. Alpha NAV drops first, then Core if Alpha is insufficient.

**Impact on users:**
- Alpha holders see NAV decline proportionally to their share of loss absorption
- Core holders may be partially impacted if Alpha is wiped
- Prime holders are insulated (likely unaffected in moderate scenarios)

**Impact on tokens:** Alpha tokens fall in price. Core tokens may fall. Prime tokens remain stable. AMM prices for the affected tranche tokens will also fall, reflecting secondary market pricing of the impaired tranche.

### 8.3 What If Many Borrowers Default (Severe Scenario)?

**Technically:** Sequential loss cascades wipe Alpha, then Core, then begin impacting Prime. If Prime NAV drops below a threshold, the protocol admin may pause the vault to prevent further withdrawals while recovery is pursued.

**Impact on users:**
- Alpha: full loss
- Core: full or partial loss
- Prime: partial loss (still better than Core/Alpha, but capital is impaired)

**Impact on tokens:** All tranche token NAVs are below 1.0. The AMM for these tokens will be deeply distressed — buyers may not exist, or will only buy at large discounts. This represents a genuine credit event for the pool.

**Protocol response:** Recovery agents (legal, off-chain) pursue defaulted borrowers. Any recovery flows back into the vault as a `recover_loss` injection, which re-appreciates NAVs in reverse cascade order (Prime first in loss recovery — this compensates them for having been impacted last in a severe scenario).

### 8.4 What If Yield Is Lower Than Expected?

**Technically:** Distributed yield is less than what's needed to hit APY targets. The waterfall still runs but allocation falls short of targets.

**Impact on users:**
- Prime: paid first — will receive close to target APY if total yield covers their allocation
- Core: paid second — may receive partial APY if yield is thin
- Alpha: receives yield after Prime and Core — may receive nothing if yield barely covers those earlier tranches

**Impact on tokens:** NAV appreciation is slower than projected. Alpha tokens in particular may see minimal appreciation or even stagnation if there's a persistent yield shortfall.

**Example:**
```
Expected monthly yield: $10,000
Actual monthly yield: $3,000

Prime target: $4,167 → Gets $3,000 (72% of target)
Core gets: $0
Alpha gets: $0
```

Alpha holders earned nothing for the month. Prime holders earned a partial return. No permanent loss — just delayed yield.

### 8.5 What If Yield Is Higher Than Expected?

**Technically:** Higher yield lets the waterfall fully fund Prime, Core, and Alpha targets.

**Impact on users:** Alpha holders receive the highest target yield. Prime and Core remain lower-risk, lower-target tranches by design.

**Impact on tokens:** Alpha token NAV surges. Prime and Core appreciate steadily at their target rates.

### 8.6 What If a User Exits Early?

**Technically:** The `withdraw` instruction is available at any time (assuming vault is not paused and has liquidity). The user burns their tranche tokens and receives USDC at the current NAV.

**Impact on users:**
- If NAV has appreciated: user exits with a profit proportional to time in pool
- If the vault is in loss: user exits at a loss (NAV below entry price)
- No penalties for early exit in the base implementation (may be added as a feature)

**The liquidity constraint:** Withdrawal can only occur if the Vault Reserve has sufficient USDC. If most capital is deployed to active loans, the reserve may be low. The user's options:
1. Wait for loan repayments to refill the reserve
2. Sell tranche tokens on the AMM for immediate liquidity (at market price, not NAV)

The AMM price may deviate from NAV — in liquid, well-functioning markets they'll be close. In distressed markets, AMM price may be lower than NAV (discount).

### 8.7 What If There Is No Liquidity?

**Technically:** `vault.reserve_balance < withdrawal_amount`. The `withdraw` instruction will fail with an `InsufficientReserve` error.

**Impact on users:** Users cannot withdraw via the standard path. They must either wait or use the AMM.

**The AMM path:** Users sell tranche tokens on the AMM. The AMM has a separate liquidity pool (USDC + tranche tokens) that is independent of the vault reserve. If the AMM has liquidity, users can exit instantly at the AMM price.

**Worst case:** If neither the vault reserve nor the AMM has liquidity — the user is locked in until loans repay. This is the fundamental risk of investing in illiquid credit pools. The protocol's risk disclosures must clearly communicate this.

### 8.8 What If the Pool Is Underutilized?

**Technically:** Capital sits in the Vault Reserve waiting for loans. No yield is being earned on idle capital.

**Impact on users:**
- NAV does not appreciate (no yield flowing in)
- Opportunity cost — capital could be earning elsewhere
- Target APY is not being hit

**Protocol response:**
- The protocol should set utilization targets
- Underutilization may trigger fee reductions or vault closure
- In a healthy credit protocol, underutilization is a temporary state during ramp-up

**The utilization ratio:**
```
Utilization = Total_Deployed_to_Loans / Total_Assets_in_Vault
Healthy: 70-90%
Too high (>90%): Liquidity risk for withdrawals
Too low (<50%): Yield drag — target APY not being hit
```

### 8.9 What If a Borrower Delays Payment?

**Technically:** The loan passes its scheduled repayment date without full payment. The loan status may transition to `Delinquent` (an intermediate state before `Defaulted`).

**Impact on users:** Yield distribution is delayed or reduced for the affected period. NAV appreciation slows. No immediate loss — just a timing mismatch.

**Protocol response:**
- Grace period: 30 days before marking as defaulted (configurable per loan)
- Late fees: additional interest accrues (beneficial to pool)
- Communication: off-chain enforcement begins
- If no payment by maturity + grace: `mark_default` is called on-chain

**Impact on tokens:** Minimal if delay is short and payment eventually arrives. Delinquency without resolution → gradually increasing uncertainty → AMM price begins to discount if news is known.

### 8.10 What If the Pool Keeps Rolling Forever?

**Technically:** As loans mature and are repaid, new loans are originated and disbursed. The vault never closes — it continuously recycles capital.

**Impact on users:** Investors who remain in the pool continue earning yield indefinitely. NAV compounds over time. New investors who enter at higher NAV still earn the same APY on their investment.

**The compounding effect:**
```
Year 1: NAV 1.000 → 1.050 (5% APY)
Year 2: NAV 1.050 → 1.1025 (5% on higher NAV)
Year 5: NAV = 1.000 * (1.05)^5 = 1.2763
```

A 5-year investor quintupled their base investment return. Their tokens have appreciated 27.6%.

**Risk accumulation:** In a perpetually rolling pool, the cumulative credit risk grows. Older, well-performing pools attract more capital and originate more loans. Historical performance doesn't guarantee future performance — new loan cohorts carry their own risk profiles.

### 8.11 What If New Loans Keep Entering?

**Technically:** The vault continuously receives `initialize_loan` and `disburse_loan` calls as new credit is originated. The vault TVL grows, more capital is needed, and fundraising from new investors increases total_shares.

**Impact on users:**
- Existing investors: no dilution (shares are minted at current NAV for new depositors)
- Portfolio diversification improves with more loans
- Risk distribution becomes more granular (no single loan is a large % of the pool)

**Impact on tokens:** As the pool matures and diversifies, tranche token prices should stabilize. A 200-loan pool has very different risk characteristics than a 5-loan pool.

### 8.12 What If Yield Is Simulated vs Real?

**In simulation mode:** `accrue_yield` is called by the admin with synthetic amounts. USDC is effectively created from protocol treasury and injected. This is for demo/testing purposes.

**Difference from real yield:**
- Simulated yield is protocol-funded (not sustainable at scale)
- Real yield is borrower-funded (sustainable, scales with TVL)
- From the token's perspective, NAV appreciates identically
- Users cannot distinguish simulated from real yield on-chain without checking yield source

**The transition:** When real borrowers are onboarded, simulated yield should cease. The risk profile changes — yield is now dependent on borrower creditworthiness, not protocol funding. This must be disclosed clearly to investors.

### 8.13 What If the Oracle/Attestor Is Wrong?

**Technically:** PRISM v1 uses a trusted admin to attest loan performance. If the admin incorrectly marks a loan as repaid (when it isn't), NAV is falsely inflated. If losses are under-reported, NAV is artificially high.

**Impact on users:** Investors may withdraw at inflated NAV, effectively extracting value from remaining investors. Later investors may enter at inflated prices and face larger losses when the true state is recognized.

**Mitigation approaches:**
- Multi-sig admin (requires multiple signatures to call sensitive functions)
- Attestation network (decentralized credit oracles like Chainlink, Tellor, or specialized credit attestors)
- Regular third-party audits of loan portfolio quality
- Proof-of-repayment mechanisms (borrower payments verifiable on-chain)

**v2 roadmap:** Replace single-admin attestation with a decentralized credit committee or oracle network that requires consensus from multiple parties to report credit events.

### 8.14 What If the Smart Contract Fails?

**Technically:** A smart contract failure could mean:
- A bug in the `withdraw` logic that allows overwithdrawal
- A reentrancy-style vulnerability in cashflow distribution
- An overflow/underflow in NAV calculation
- An access control bypass allowing unauthorized loss allocation

**Impact on users:** Funds may be drained, incorrectly distributed, or permanently locked.

**Mitigations in PRISM v1:**
- All math uses Solana's `checked_add`, `checked_sub` etc. (panic on overflow/underflow)
- PDA-based ownership means no external EOA can sign fund movements
- Admin is a multi-sig (Squads Protocol)
- Protocol pause mechanism allows emergency freeze
- Audit required before mainnet (Sec3, OtterSec, or equivalent Solana audit firms)

**Recovery paths:**
- Pause the protocol immediately if anomaly detected
- If funds are locked: upgrade authority can deploy a new program version with a rescue instruction
- If funds are drained: no on-chain recovery — bug bounty, insurance fund, legal action

---

## 9. Edge Cases

### 9.1 Rounding Errors in Distribution

**The problem:** USDC uses 6 decimal places. Shares may be non-integer quantities. Division in NAV calculation can produce recurring decimals that must be truncated.

**Example:**
```
yield_to_distribute = 1 USDC = 1,000,000 lamports
total_shares = 3
shares_per_unit = 333,333 (truncated from 333,333.333...)
leftover = 1 lamport (1,000,000 - 3 * 333,333)
```

**Handling:**
- All math is in integer arithmetic (lamports, not USDC)
- Rounding always floors to protect against protocol insolvency
- Leftover lamports accumulate in a dust account and are distributed in the next cycle
- Over a large pool with many distributions, dust is negligible

### 9.2 Partial Repayments

**The problem:** A borrower repays 60% of their loan but can't pay the rest.

**Technically:**
```
Loan.principal = 100,000
Borrower pays: 60,000 USDC
Loan.amount_repaid = 60,000
Remaining: 40,000 still outstanding

At maturity, if no further payment:
  Loss to allocate = 40,000 (partial default)
  Interest on 60,000 repaid is distributed normally
  Loss cascade runs for the 40,000 shortfall
```

**Impact on tokens:** Only the unrecovered portion triggers NAV impact. Partial repayments reduce the eventual loss — they are better than full defaults.

### 9.3 Timing Mismatch (Cashflow vs Withdrawal)

**The problem:** A user requests withdrawal. The vault reserve doesn't have enough USDC because loans haven't matured yet.

**Example:**
```
Vault reserve: 10,000 USDC
Outstanding loans: 90,000 USDC
User wants to withdraw: 15,000 USDC

Vault.reserve < withdrawal_amount → FAIL
```

**Solutions:**
1. Wait for the next loan repayment (short-term fix)
2. Use the AMM to sell tranche tokens (instant exit at market price)
3. Protocol maintains a minimum reserve ratio (e.g., always keep 10% of TVL in reserve)

**Minimum reserve enforcement (pseudocode):**
```rust
fn withdraw(amount: u64) {
    let new_reserve = vault.reserve - amount;
    let min_reserve = vault.total_assets * MIN_RESERVE_RATIO / 100;
    
    require!(new_reserve >= min_reserve, ErrorCode::BelowMinimumReserve);
    // ... proceed with withdrawal
}
```

### 9.4 Insolvency Scenarios

**Definition:** A vault is insolvent if `total_liabilities > total_assets`. In a credit pool, this can occur if cumulative defaults exceed total TVL.

**Technically:** This means `vault.total_assets = 0` but investors still have outstanding share claims.

```
Scenario: 100% of loans default, loss bucket exhausted, all three tranches wiped

Alpha NAV: 0
Core NAV: 0
Prime NAV: 0

All tranche tokens are now worthless.
The vault is insolvent.
```

**Recovery:** Only possible if off-chain loan recovery is pursued. Any recovered funds are injected into the vault and re-distributed. If recovery is zero, the vault is closed and investors lose their capital.

**Prevention:** Diversification (many small loans across sectors/geographies), credit scoring, loan concentration limits (no single borrower > X% of TVL), external credit insurance.

### 9.5 Tranche Wipeout

**Definition:** A specific tranche's `total_assets` reaches zero due to loss absorption.

**When Alpha is wiped:**
```
alpha.total_assets = 0
alpha.nav_per_share = 0
All Alpha tokens are now worth 0 USDC.
alpha.total_shares still exists on-chain (non-zero).
```

**Post-wipeout behavior:**
- No new withdrawals from Alpha are permitted (you'd receive 0 USDC anyway)
- No new deposits should be accepted to a wiped tranche (or if accepted, they go in at NAV 0 which is undefined behavior)
- The vault should pause the wiped tranche and potentially request Alpha recapitalization before re-opening

**Recapitalization path:**
```
Protocol treasury injects new capital into Alpha tranche
Sets alpha.total_assets = recapitalization_amount
Mints new Alpha tokens at a new reference NAV
```

This effectively resets the Alpha tranche — existing Alpha holders are already fully wiped, and new Alpha capital sets a new baseline.

### 9.6 Liquidity Crunch

**Definition:** Multiple investors want to withdraw simultaneously, and the vault reserve is insufficient for all requests.

**Technically:** Standard bank-run mechanics. All withdrawals succeed only if processed sequentially until reserve is exhausted. After that, remaining requests fail.

**Mitigation strategies:**
- Withdrawal queuing: first-in-first-out queue for withdrawal requests, processed as loan repayments arrive
- Withdrawal gate: maximum withdrawal per period as a % of TVL (e.g., 10% per week)
- Redemption notice period: require 7-day advance notice for large withdrawals (>1% of TVL)

**On-chain implementation:**
```rust
struct WithdrawalQueue {
    requests: Vec<WithdrawalRequest>,
    total_queued: u64
}

struct WithdrawalRequest {
    user: Pubkey,
    shares: u64,
    requested_at: i64,
    expires_at: i64
}
```

When loan repayments arrive, they first service the queue before being counted as general reserve.

---

## 10. Code-Level Explanation

### 10.1 Deposit Logic

```rust
/// Deposit USDC into a specific tranche and receive tranche tokens
pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let tranche = &mut ctx.accounts.tranche;

    // 1. Check protocol is not paused
    require!(!vault.is_paused, ErrorCode::ProtocolPaused);
    
    // 2. Check amount is valid
    require!(amount > 0, ErrorCode::ZeroAmount);

    // 3. Transfer USDC from user to vault reserve
    token::transfer(
        ctx.accounts.transfer_context(),
        amount
    )?;

    // 4. Calculate shares to mint
    // shares = amount / nav_per_share
    // To avoid division precision loss, we use: shares = amount * SCALE / nav_per_share
    let shares_to_mint = if tranche.total_shares == 0 {
        // Genesis deposit: 1 share = 1 USDC (NAV = 1.0)
        amount
    } else {
        // Subsequent deposits: shares proportional to current NAV
        // amount * PRECISION / nav_per_share
        amount
            .checked_mul(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(tranche.nav_per_share)
            .ok_or(ErrorCode::MathOverflow)?
    };

    // 5. Mint tranche tokens to user
    token::mint_to(
        ctx.accounts.mint_context(),
        shares_to_mint
    )?;

    // 6. Update state
    tranche.total_assets = tranche.total_assets
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    
    tranche.total_shares = tranche.total_shares
        .checked_add(shares_to_mint)
        .ok_or(ErrorCode::MathOverflow)?;

    // NAV remains unchanged after deposit (verify integrity)
    // nav = total_assets / total_shares (should equal pre-deposit nav)

    Ok(())
}
```

### 10.2 Minting Tranche Tokens

```rust
/// Internal: mint tranche tokens to user
fn mint_tranche_tokens(
    tranche_mint: &AccountInfo,
    user_token_account: &AccountInfo,
    vault_authority: &AccountInfo,
    amount: u64,
    vault_bump: u8,
) -> Result<()> {
    // The vault authority PDA signs the mint instruction
    // Seeds: ["vault", vault_id.to_le_bytes()]
    let seeds = &[
        b"vault",
        &vault.vault_id.to_le_bytes(),
        &[vault_bump]
    ];
    let signer_seeds = &[&seeds[..]];

    let mint_ctx = CpiContext::new_with_signer(
        token_program,
        MintTo {
            mint: tranche_mint.clone(),
            to: user_token_account.clone(),
            authority: vault_authority.clone(),
        },
        signer_seeds
    );

    token::mint_to(mint_ctx, amount)?;
    Ok(())
}
```

Key point: The vault PDA (a program-derived address) is the mint authority. No human key can mint tranche tokens directly — only the smart contract executing the deposit instruction can authorize minting.

### 10.3 NAV Update Logic

```rust
/// Recalculate NAV per share after any state-changing operation
fn update_nav(tranche: &mut Tranche) -> Result<()> {
    if tranche.total_shares == 0 {
        // If no shares outstanding, reset to default NAV
        tranche.nav_per_share = PRECISION; // 1.0 * 10^6
        return Ok(());
    }

    // nav_per_share = total_assets * PRECISION / total_shares
    tranche.nav_per_share = tranche.total_assets
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(tranche.total_shares)
        .ok_or(ErrorCode::DivisionByZero)?;

    Ok(())
}

// PRECISION = 1_000_000 (6 decimal places, matching USDC)
// If total_assets = 1_050_000 and total_shares = 1_000_000
// nav_per_share = 1_050_000 * 1_000_000 / 1_000_000 = 1_050_000
// Interpreted as 1.050 USDC per share
```

### 10.4 Waterfall Distribution

```rust
/// Distribute yield across tranches in priority order
pub fn distribute_cashflow(
    ctx: Context<DistributeCashflow>,
    amount: u64
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let prime = &mut ctx.accounts.prime_tranche;
    let core = &mut ctx.accounts.core_tranche;
    let alpha = &mut ctx.accounts.alpha_tranche;

    let mut remaining = amount;

    // --- STEP 1: PAY PRIME ------------------------------------------------
    let prime_target = calculate_periodic_yield(
        prime.total_assets,
        prime.apy_bps,
        vault.last_distribution_timestamp,
    )?;

    let prime_allocation = remaining.min(prime_target);
    
    prime.total_assets = prime.total_assets
        .checked_add(prime_allocation)
        .ok_or(ErrorCode::MathOverflow)?;
    
    remaining = remaining
        .checked_sub(prime_allocation)
        .ok_or(ErrorCode::MathUnderflow)?;

    update_nav(prime)?;

    // --- STEP 2: PAY CORE -------------------------------------------------
    if remaining > 0 {
        let core_target = calculate_periodic_yield(
            core.total_assets,
            core.apy_bps,
            vault.last_distribution_timestamp,
        )?;

        let core_allocation = remaining.min(core_target);
        
        core.total_assets = core.total_assets
            .checked_add(core_allocation)
            .ok_or(ErrorCode::MathOverflow)?;
        
        remaining = remaining
            .checked_sub(core_allocation)
            .ok_or(ErrorCode::MathUnderflow)?;

        update_nav(core)?;
    }

    // --- STEP 3: PAY ALPHA ------------------------------------------------
    if remaining > 0 {
        alpha.total_assets = alpha.total_assets
            .checked_add(remaining)
            .ok_or(ErrorCode::MathOverflow)?;
        
        update_nav(alpha)?;
    }

    // Update last distribution timestamp
    vault.last_distribution_timestamp = Clock::get()?.unix_timestamp;

    Ok(())
}

/// Calculate how much yield a tranche should receive for the elapsed period
fn calculate_periodic_yield(
    total_assets: u64,
    apy_bps: u32,           // basis points (500 = 5%)
    last_distribution: i64,
) -> Result<u64> {
    let now = Clock::get()?.unix_timestamp;
    let elapsed_seconds = (now - last_distribution) as u64;
    let seconds_per_year: u64 = 365 * 24 * 60 * 60;

    // yield = principal * apy * (elapsed / year)
    // In integer math: yield = principal * apy_bps * elapsed / (10_000 * year)
    let yield_amount = total_assets
        .checked_mul(apy_bps as u64)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(elapsed_seconds)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000 * seconds_per_year)
        .ok_or(ErrorCode::DivisionByZero)?;

    Ok(yield_amount)
}
```

### 10.5 Loss Allocation

```rust
/// Allocate a credit loss through the cascade: Alpha → Core → Prime
pub fn allocate_loss(
    ctx: Context<AllocateLoss>,
    loss_amount: u64
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let prime = &mut ctx.accounts.prime_tranche;
    let core = &mut ctx.accounts.core_tranche;
    let alpha = &mut ctx.accounts.alpha_tranche;

    let mut remaining_loss = loss_amount;

    // ─── STEP 0: ABSORB FROM LOSS BUCKET FIRST ───────────────────────────
    let loss_bucket_absorption = vault.loss_bucket.min(remaining_loss);
    vault.loss_bucket = vault.loss_bucket
        .checked_sub(loss_bucket_absorption)
        .ok_or(ErrorCode::MathUnderflow)?;
    remaining_loss = remaining_loss
        .checked_sub(loss_bucket_absorption)
        .ok_or(ErrorCode::MathUnderflow)?;

    if remaining_loss == 0 {
        return Ok(()); // Loss fully absorbed by bucket, no tranche impact
    }

    // --- STEP 1: ALPHA ABSORBS -------------------------------------------
    let alpha_absorption = alpha.total_assets.min(remaining_loss);
    alpha.total_assets = alpha.total_assets
        .checked_sub(alpha_absorption)
        .ok_or(ErrorCode::MathUnderflow)?;
    remaining_loss = remaining_loss
        .checked_sub(alpha_absorption)
        .ok_or(ErrorCode::MathUnderflow)?;
    
    update_nav(alpha)?;

    if remaining_loss == 0 {
        return Ok(());
    }

    // --- STEP 2: CORE ABSORBS --------------------------------------------
    let core_absorption = core.total_assets.min(remaining_loss);
    core.total_assets = core.total_assets
        .checked_sub(core_absorption)
        .ok_or(ErrorCode::MathUnderflow)?;
    remaining_loss = remaining_loss
        .checked_sub(core_absorption)
        .ok_or(ErrorCode::MathUnderflow)?;
    
    update_nav(core)?;

    if remaining_loss == 0 {
        return Ok(());
    }

    // --- STEP 3: PRIME ABSORBS (WORST CASE) ------------------------------
    let prime_absorption = prime.total_assets.min(remaining_loss);
    prime.total_assets = prime.total_assets
        .checked_sub(prime_absorption)
        .ok_or(ErrorCode::MathUnderflow)?;
    remaining_loss = remaining_loss
        .checked_sub(prime_absorption)
        .ok_or(ErrorCode::MathUnderflow)?;
    
    update_nav(prime)?;

    // If remaining_loss > 0 at this point, the vault is insolvent
    if remaining_loss > 0 {
        vault.is_insolvent = true;
        // Pause the vault — no withdrawals until admin reviews
        vault.is_paused = true;
        emit!(VaultInsolventEvent {
            vault_id: vault.vault_id,
            unabsorbed_loss: remaining_loss,
            timestamp: Clock::get()?.unix_timestamp
        });
    }

    Ok(())
}
```

### 10.6 Withdrawal Logic

```rust
/// Burn tranche tokens and return USDC to user
pub fn withdraw(
    ctx: Context<Withdraw>,
    shares_to_burn: u64
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let tranche = &mut ctx.accounts.tranche;

    // 1. Guard checks
    require!(!vault.is_paused, ErrorCode::ProtocolPaused);
    require!(shares_to_burn > 0, ErrorCode::ZeroAmount);
    require!(
        ctx.accounts.user_tranche_account.amount >= shares_to_burn,
        ErrorCode::InsufficientShares
    );

    // 2. Calculate USDC to return
    // usdc_out = shares_burned * nav_per_share / PRECISION
    let usdc_out = shares_to_burn
        .checked_mul(tranche.nav_per_share)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(PRECISION)
        .ok_or(ErrorCode::DivisionByZero)?;

    // 3. Enforce minimum reserve ratio
    let new_reserve = vault.reserve_balance
        .checked_sub(usdc_out)
        .ok_or(ErrorCode::InsufficientReserve)?;
    
    let min_reserve = vault.total_assets
        .checked_mul(MIN_RESERVE_BPS as u64)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_000)
        .ok_or(ErrorCode::DivisionByZero)?;
    
    require!(new_reserve >= min_reserve, ErrorCode::BelowMinimumReserve);

    // 4. Burn tranche tokens
    token::burn(
        ctx.accounts.burn_context(),
        shares_to_burn
    )?;

    // 5. Transfer USDC to user
    token::transfer(
        ctx.accounts.transfer_out_context(),
        usdc_out
    )?;

    // 6. Update state
    tranche.total_assets = tranche.total_assets
        .checked_sub(usdc_out)
        .ok_or(ErrorCode::MathUnderflow)?;
    
    tranche.total_shares = tranche.total_shares
        .checked_sub(shares_to_burn)
        .ok_or(ErrorCode::MathUnderflow)?;

    // NAV remains unchanged (numerator and denominator decrease proportionally)
    // Verify: update_nav(tranche) should return same value

    vault.reserve_balance = new_reserve;

    Ok(())
}
```

### 10.7 AMM Swap Logic (Secondary Market)

```rust
/// Swap USDC for tranche tokens on the AMM
/// Uses constant product formula: x * y = k
pub fn swap(
    ctx: Context<Swap>,
    amount_in: u64,
    minimum_amount_out: u64,
    is_buy: bool, // true = buy tranche tokens with USDC, false = sell tranche tokens for USDC
) -> Result<()> {
    let pool = &mut ctx.accounts.amm_pool;

    let (reserve_in, reserve_out) = if is_buy {
        (pool.usdc_reserve, pool.token_reserve)
    } else {
        (pool.token_reserve, pool.usdc_reserve)
    };

    // 1. Apply fee (30 bps = 0.3%)
    let fee_bps: u64 = 30;
    let amount_in_with_fee = amount_in
        .checked_mul(10_000 - fee_bps)
        .ok_or(ErrorCode::MathOverflow)?;

    // 2. Constant product formula: (x + Δx) * (y - Δy) = x * y
    // Δy = y * Δx / (x + Δx)
    // With fee: Δy = y * amount_in_with_fee / (x * 10_000 + amount_in_with_fee)
    let numerator = reserve_out
        .checked_mul(amount_in_with_fee)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let denominator = reserve_in
        .checked_mul(10_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_add(amount_in_with_fee)
        .ok_or(ErrorCode::MathOverflow)?;
    
    let amount_out = numerator
        .checked_div(denominator)
        .ok_or(ErrorCode::DivisionByZero)?;

    // 3. Slippage check
    require!(amount_out >= minimum_amount_out, ErrorCode::SlippageExceeded);

    // 4. Execute transfers and update reserves
    if is_buy {
        pool.usdc_reserve = pool.usdc_reserve.checked_add(amount_in).ok_or(ErrorCode::MathOverflow)?;
        pool.token_reserve = pool.token_reserve.checked_sub(amount_out).ok_or(ErrorCode::MathUnderflow)?;
    } else {
        pool.token_reserve = pool.token_reserve.checked_add(amount_in).ok_or(ErrorCode::MathOverflow)?;
        pool.usdc_reserve = pool.usdc_reserve.checked_sub(amount_out).ok_or(ErrorCode::MathUnderflow)?;
    }

    // 5. Transfer tokens
    // ... (token transfer CPI calls)

    Ok(())
}
```

**Note on AMM price vs NAV:** The AMM price of a tranche token may diverge from its NAV. If the pool is perceived as healthy, AMM price may trade at a slight premium to NAV (demand > supply). If the pool is distressed, AMM price trades at a discount (investors want out quickly). This price signal is valuable — it provides a real-time market assessment of pool quality that is separate from the on-chain NAV accounting.

---

## Appendix A: Error Codes

| Code | Meaning |
|---|---|
| `ProtocolPaused` | Protocol is in emergency pause state |
| `ZeroAmount` | Deposit or withdrawal amount is zero |
| `InsufficientReserve` | Vault reserve below withdrawal requirement |
| `BelowMinimumReserve` | Withdrawal would breach minimum reserve ratio |
| `InsufficientShares` | User does not hold enough tranche tokens |
| `MathOverflow` | Arithmetic overflow in calculation |
| `MathUnderflow` | Arithmetic underflow in calculation |
| `DivisionByZero` | Attempted division by zero |
| `SlippageExceeded` | AMM output below minimum_amount_out |
| `UnauthorizedAdmin` | Caller is not authorized admin |
| `LoanNotActive` | Operation requires loan to be in Active state |
| `VaultInsolvent` | Vault has unabsorbed losses, paused automatically |

---

## Appendix B: Key Constants

| Constant | Value | Meaning |
|---|---|---|
| `PRECISION` | `1_000_000` | 6 decimal place scaling factor |
| `MIN_RESERVE_BPS` | `1_000` | 10% minimum reserve ratio (1000 basis points) |
| `DEFAULT_GRACE_PERIOD` | `2_592_000` | 30 days in seconds |
| `SECONDS_PER_YEAR` | `31_536_000` | 365 days |
| `AMM_FEE_BPS` | `30` | 0.30% swap fee |
| `PRIME_APY_BPS` | `500` | 5.00% target APY for Prime |
| `CORE_APY_BPS` | `800` | 8.00% target APY for Core |
| `ALPHA_APY_BPS` | `1_500` | 15.00% target APY for Alpha |

---

## Appendix C: Account Architecture Summary

```
GlobalConfig (PDA: ["global_config"])
├── admin: Pubkey
├── usdc_mint: Pubkey
├── is_paused: bool
└── oracle_allowlist: Vec<Pubkey>

Vault (PDA: ["vault", vault_id])
├── vault_id: u64
├── total_assets: u64
├── reserve_balance: u64
├── loss_bucket: u64
├── is_paused: bool
├── is_insolvent: bool
└── last_distribution_timestamp: i64

Tranche (PDA: ["tranche", vault_id, tranche_type])
├── vault_id: u64
├── tranche_type: TrancheType (Prime/Core/Alpha)
├── total_assets: u64
├── total_shares: u64
├── nav_per_share: u64
├── apy_bps: u32
└── mint: Pubkey

Loan (PDA: ["loan", vault_id, loan_id])
├── loan_id: u64
├── vault_id: u64
├── borrower: Pubkey
├── principal: u64
├── apr_bps: u32
├── maturity: i64
├── status: LoanStatus
├── disbursed_at: i64
├── amount_repaid: u64
└── repaid_at: i64

AmmPool (PDA: ["amm_pool", tranche_mint])
├── tranche_mint: Pubkey
├── usdc_reserve: u64
├── token_reserve: u64
├── lp_mint: Pubkey
└── fee_bps: u32
```

---

*End of PRISM Protocol System Specification v1.0*

*This document reflects the architecture as implemented in the Solana/Anchor codebase. For the latest state of the contracts, refer to the source code in `/contracts/programs/`. For testing instructions, refer to `docs/testing.md`.*
