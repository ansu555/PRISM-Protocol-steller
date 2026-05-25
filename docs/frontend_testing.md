# 🖥️ Frontend Simulation & Integration Testing

This document specifies the methodology for using the PRISM frontend as a **Simulation Layer**. The objective is not to validate UI/UX, but to use the browser environment to orchestrate complex, multi-user financial scenarios that are difficult to replicate in isolated unit tests.

---

## 1. Testing Philosophy: The Frontend as a Simulator

In PRISM, the frontend acts as a **High-Level Orchestrator**. While Rust tests validate individual instructions, the frontend simulation validates **Real-World Capital Flow**.

### Primary Objectives:
*   **Multi-User Collision**: Testing what happens when 5+ users interact with the same pool simultaneously.
*   **End-to-End Accounting**: Verifying that the user's wallet accurately reflects the protocol's reported NAV.
*   **Scenario Stress-Testing**: Manually triggering "Black Swan" events (like defaults or bank runs) to observe UI and protocol resilience.

---

## 2. Environment Setup

### Localnet Orchestration
Simulation must occur on **Localnet** to allow for instant state resets and multi-wallet airdrops.

### Multi-Wallet Simulation
To test the "Structured" part of Structured Credit, you must simulate at least three distinct roles:
1.  **Prime Investor (User A)**: Low risk appetite.
2.  **Alpha Investor (User B)**: High risk appetite.
3.  **Borrower (User C)**: The capital consumer.

**Recommendation**: Use a browser extension that supports multiple accounts (e.g., Phantom or Solflare) or a custom testing harness that cycles through a set of local secret keys.

---

## 3. Minimal Functional Requirements (Harness Only)

The testing harness requires these minimal functional "blocks":

*   **Identity Switcher**: A dropdown to instantly switch between "User A", "User B", and "Borrower" identities.
*   **Vault State Dashboard**: A real-time view of `Vault Reserve`, `Loss Bucket Balance`, and `Outstanding Principal`.
*   **Action Panel**:
    *   `Deposit(Amount, Tranche)`: Test capital entry.
    *   `Withdraw(Shares)`: Test capital exit.
    *   `Borrow(Amount)`: Test capital disbursement.
    *   `Repay(Amount)`: Test debt settlement.
*   **Telemetry Log**: A dedicated console window in the UI that prints every balance change.

---

## 4. Multi-User Simulation Scenarios

### Case 1: Proportional Yield Distribution
*   **Setup**: User A deposits 100 USDC; User B deposits 200 USDC into the same Tranche.
*   **Action**: Admin triggers a 30 USDC `accrueYield` event.
*   **Verification**: User A's share value should increase by 10 USDC; User B's by 20 USDC.

### Case 2: The First-Loss Waterfall
*   **Setup**: User A (Prime) and User B (Alpha) both fund a loan.
*   **Action**: Borrower defaults, returning only 50% of the principal.
*   **Verification**: User B's tokens should drop to **0 value**. User A's tokens should remain at **1.00 value** (protected by User B's loss).

### Case 3: Secondary Market Exit (AMM)
*   **Setup**: User A deposits into a 30-day vault.
*   **Action**: User A sells their Tranche Tokens on the AMM immediately.
*   **Verification**: 
    *   User A receives USDC from the AMM Pool.
    *   The Core Vault Reserve remains untouched.
    *   The AMM Pool now holds the Tranche Tokens.

---

## 5. Telemetry & Verification Logic

Every action in the frontend harness MUST log the following delta trace:

```text
[SIMULATION LOG]
Action: User B Deposit (200 USDC)
---------------------------
Wallet Balance:  500 -> 300 (-200)
Tranche Shares:    0 -> 200 (+200)
Vault Reserve:   100 -> 300 (+200)
Current NAV:     1.000000
Tranche Ownership: 66.6%
```

### Verification Checklist:
*   [ ] **Money Conservation**: Did the total USDC in the system increase/decrease incorrectly?
*   [ ] **NAV Precision**: Does `Total_Assets / Total_Shares` match the UI display to 6 decimals?
*   [ ] **Priority Check**: Did the Junior tranche gain value before the Prime target was met? (Should be NO).

---

## 6. Edge Cases to Stress Test

*   **Precision Dust**: Deposit `0.000001` USDC. Verify that the share calculation doesn't round to zero.
*   **Yield Race**: Deposit 100 USDC, trigger yield, then immediately deposit another 100 USDC. Verify the second user didn't "steal" interest from the first.
*   **Empty Vault Swap**: Attempt to swap on the AMM when the pool has 0 liquidity. Verify graceful failure.
*   **Delayed Repayment**: Let the maturity date pass in the simulator (use `anchor.setProvider().connection.requestAirdrop` or similar to simulate time if possible, or just wait). Verify the loan status changes.

---

## 7. Failure Scenarios

The harness must specifically test the frontend's reaction to:
1.  **User Rejection**: User clicks "Cancel" on the Phantom popup. (UI must not hang).
2.  **Insufficient SOL**: User has USDC but 0 SOL for gas. (UI must provide clear error).
3.  **Slippage Hit**: AMM trade exceeds allowed slippage. (Transaction must fail safely).

---

## 8. Success Criteria

A simulation run is considered **SUCCESSFUL** if and only if:
1.  **Zero Value Creation**: No USDC was "spawned" out of thin air.
2.  **Waterfall Integrity**: Prime investors were never diluted by junior losses.
3.  **State Parity**: The On-Chain data matches the UI data 100%.

---

## 9. Simulation Script Example (Pseudo-code)

```javascript
async function runDefaultScenario() {
  await connectWallet("Investor_Prime");
  await deposit(1000, "PRIME");
  
  await connectWallet("Investor_Alpha");
  await deposit(500, "ALPHA");
  
  await connectWallet("Borrower");
  await requestLoan(1200);
  
  await connectWallet("Admin");
  await disburseLoan();
  
  // Simulate 50% Loss
  await connectWallet("Borrower");
  await repayLoan(600); 
  
  await verify({
    prime_nav: 1.0,
    alpha_nav: 0.0,
    vault_reserve: 900 // (300 leftover + 600 repaid)
  });
}
```

---

> [!NOTE]
> This frontend is a **Testing Tool**, not a product. Focus on data accuracy, log verbosity, and the ability to "break" the protocol through weird user behavior.
