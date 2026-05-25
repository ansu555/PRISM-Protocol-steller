# 🧪 PRISM Protocol: Engineering-Grade Testing & Observability Specification

This document serves as the definitive engineering specification for the verification and validation of the PRISM Protocol. In a structured credit environment, testing is the primary defense against systemic financial failure. We prioritize **Capital Correctness** over mere **Instruction Success.**

---

## 1. Introduction: Structured Credit Verification
Testing PRISM is fundamentally different from testing a standard DEX or yield aggregator. We are managing a multi-layered risk waterfall where a single rounding error or state-transition failure can lead to the total collapse of Prime holder protection. 

Our testing objective is to mathematically prove that the protocol preserves value across all borrower lifecycles and market conditions, ensuring that **risk is always correctly priced and distributed.**

---

## 2. Testing Philosophy: Invariant-Driven Development
We follow a strict **Invariant-First** philosophy. A test only passes if the system's global state remains consistent with these four pillars:

1.  **Capital Preservation**: `Sum(Reserves) + Sum(Loans) + Sum(LossBucket) == Sum(InitialDeposits) + Sum(InterestPaid)`.
2.  **NAV Consistency**: The Net Asset Value of a tranche must always equal `(Tranche_Assets / Tranche_Shares)`.
3.  **Waterfall Integrity**: Prime tranches must be filled to their target APY before any yield flows to junior tranches.
4.  **Risk Priority**: Alpha and Core must be depleted to zero before any loss is applied to Prime.

---

## 3. Environment Setup & Execution

### Localnet Synchronization (MANDATORY)
Testing MUST be performed on a local validator. Devnet is unsuitable for financial validation due to non-deterministic clock drift and rate-limiting.

1.  **Initialize Validator**:
    ```bash
    solana-test-validator --reset --mint $(solana address -k contracts/keys/admin.json)
    ```
2.  **Build & Deploy**:
    ```bash
    cd contracts && anchor build && anchor deploy
    ```
3.  **Execute Suite**:
    ```bash
    export ANCHOR_PROVIDER_URL=http://localhost:8899
    export ANCHOR_WALLET=keys/admin.json
    yarn ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
    ```

---

## 4. Observability & Telemetry Framework

Our telemetry system provides **Extreme Visibility** into the protocol's internal state. This is critical because "Silent Failures" (where a TX succeeds but the math is wrong) are the greatest threat to credit systems.

### Layer 1: Narrative Walkthrough
A human-readable explanation of the business logic being tested. 
*   **Purpose**: Contextualizing the financial intent.

### Layer 2: Parameter & PDA Trace
Exposing all raw inputs and derived addresses.
*   **Purpose**: Verifying PDA derivation logic and authority mapping.
```text
► Calling: initializeVault [prism-core]
  🔑 Vault PDA: FDi9m... (Seeds: [b"vault", admin, id])
  🔑 Reserve PDA: 4c317... (Seeds: [b"reserve", vault])
```

### Layer 3: Balance Delta Tracking (The Financial Trail)
Tracking the movement of every lamport and token unit.
*   **Purpose**: Ensuring no "phantom value" is created or lost.
```text
💰 User USDC Before: 100.000000
💰 User USDC After:   50.000000 (-50.000000)
💰 Vault Reserve:     50.000000 (+50.000000)
```

---

## 5. Test Suite Architecture

### `prism-core` (The Credit Engine)

| Step | Instruction | Validation Logic | Failure Mode |
| :--- | :--- | :--- | :--- |
| **1-2** | `InitConfig/Vault` | Authority and Mint binding. | Unauthorized initialization. |
| **3** | `InitTranches` | APY and Mint uniqueness. | Tranche collision / duplicate seeds. |
| **4** | `InitLoan` | Maturity timestamp and principal limits. | Maturity in the past. |
| **5** | `Deposit` | 1:1 Share pricing / liquidity entry. | Under-collateralized minting. |
| **6** | `Disburse` | Liquidity exit to authorized borrower. | Fund leakage to non-borrower. |
| **7** | `AccrueYield` | Waterfall priority (Prime -> Core -> Alpha). | Alpha yield leak. |
| **8** | `Repay` | Debt closure and reserve replenishment. | Double repayment / over-recovery. |
| **9** | `Withdraw` | Share burning and NAV-based payout. | Bank run / liquidity starvation. |

### `prism-amm` (The Liquidity Layer)
*   **Initialize Pool**: Validates constant product invariant $x * y = k$.
*   **Swap**: Validates price impact and 0.3% fee accrual to LPs.
*   **Remove Liquidity**: Validates proportional asset distribution based on LP share.

---

## 6. Financial Invariants (Deep Dive)

### Total Assets Consistency
At no point during a loan lifecycle should the total assets of a vault fluctuate due to anything other than a `Deposit`, `Withdraw`, `YieldAccrual`, or `LossRealization`.

### The NAV Formula
`NAV = (Cash_Reserve + Outstanding_Principal + Accrued_Interest) / Total_Shares`
Our tests perform this calculation off-chain after every transaction and compare it to the program's reported state. Any discrepancy $> 1$ lamport triggers an immediate failure.

---

## 7. "What If" Scenarios (Failure Analysis)

| Scenario | System Response | Investor Impact |
| :--- | :--- | :--- |
| **Default** | Alpha tranche is burned; Loss Bucket is drained. | Prime/Core preserved; Alpha wiped. |
| **Partial Repayment** | Interest is filled via waterfall; Principal is partially settled. | NAV increases; Liquidity remains low. |
| **Delayed Repayment** | Late fees (if applicable) accrue; Maturity flag is tripped. | Increased yield for risk-takers. |
| **Large Bank Run** | Withdrawals succeed up to current Reserve balance. | First-come, first-served liquidity. |
| **AMM Swap Impact** | Price impact increases with trade size. | Secondary market arbitrage opportunity. |

---

## 8. Edge Cases & Precision

### Rounding Errors
We use `u64` for all balance math with a fixed precision of 6 decimals (standard USDC). Our tests validate that rounding always favors the **Vault Reserve** to prevent infinitesimal drain attacks.

### Tranche Wipeout
In extreme default scenarios, the suite validates that the system remains operational even if the Alpha and Core tranches are reduced to zero value.

---

## 9. Code-Level Logic Walkthrough

### Yield Distribution Logic
```rust
fn distribute_yield(amount):
    let prime_due = calculate_target(tranche_prime);
    let paid_prime = min(amount, prime_due);
    let remaining = amount - paid_prime;
    
    let core_due = calculate_target(tranche_core);
    let paid_core = min(remaining, core_due);
    
    let alpha_surplus = remaining - paid_core;
    allocate(tranche_alpha, alpha_surplus);
```

### NAV Calculation
```rust
fn update_nav(vault):
    let total_value = vault.reserve + vault.outstanding_loans;
    vault.nav = total_value / vault.total_shares;
```

---

## 10. Debugging & Error Resolution

### Common Issues:
*   **Stack Overflow (os error 2)**: Caused by large account structs in Anchor. **Fix**: Use `Box<Account>` for larger structs like `Vault` or `AmmPool`.
*   **PDA Mismatch**: Seeds in test must match Rust exactly: `[b"vault", admin.pubkey().as_ref(), id.to_le_bytes().as_ref()]`.
*   **Signer Failure**: Instruction calls like `accrueYield` require the **Borrower** as a signer. Ensure your test provider includes the borrower keypair.

---

## 11. Final Validation Checklist
*   [ ] All 15 tests return `Success`.
*   [ ] Balance Deltas match expected mathematical outcomes to the 6th decimal.
*   [ ] Prime Tranche NAV is always $\geq 1.00$.
*   [ ] Loss Bucket is untouched during "Happy Path" scenarios.
*   [ ] Administrator Pause flag blocks `Deposit` and `Withdraw` calls.

---

> [!IMPORTANT]
> This specification is the **Source of Truth** for PRISM protocol integrity. Any modification to the core logic must be accompanied by a corresponding update to this test specification and the underlying TypeScript suites.
