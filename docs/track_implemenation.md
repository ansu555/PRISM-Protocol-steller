# Implementation Plan: Detailed Sidetrack Integration

This document provides a deep dive into the "sidetrack" technologies being integrated into PRISM Protocol for the Solana Frontier Hackathon.

**Status legend:** ✅ Shipped · 🟡 Partial · ⬜ Planned

---

## 1. IKA Network (formerly dWallet) — ✅ Shipped
**Category:** Cross-Chain Credit Infrastructure
**Goal:** Enable native BTC and RWA collateral for Solana loans.

### What it is
IKA is a decentralized MPC (Multi-Party Computation) network that allows users to create **dWallets**. These are non-custodial wallets that exist on any chain (BTC, Ethereum, etc.) but are controlled by logic on another chain (Solana). 
- **Google Search:** [Ika Network dWallet Solana](https://www.google.com/search?q=Ika+Network+dWallet+Solana)
- **Reference:** [ika.xyz](https://ika.xyz)

### Code Structure & Snippet
We will add `collateral_metadata` to the `Loan` account to store the dWallet address and verify the collateral state.

**Proposed State Change (`state.rs`):**
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct IkaCollateral {
    pub dwallet_id: [u8; 32],     // Unique dWallet identifier
    pub chain_id: u8,             // 1 = BTC, 2 = ETH, etc.
    pub amount: u64,              // Amount locked in dWallet
    pub last_verified_ts: i64,
}

pub struct Loan {
    // ... existing fields
    pub ika_collateral: Option<IkaCollateral>,
}
```

---

## 2. Encrypt (FHE / REFHE) — ✅ Shipped
**Category:** Confidential DeFi · Privacy-Preserving Credit Logic
**Goal:** Replace the admin-controlled "Trigger Default" button with a cryptographic reveal — the Encrypt FHE oracle proves `total_repaid < principal` homomorphically and the on-chain program atomically fires the loss cascade.

### What it is
Encrypt is a Fully Homomorphic Encryption (FHE / REFHE) protocol for Solana. It lets an off-chain oracle run computations on encrypted borrower data and produce a signed attestation proving a boolean condition (e.g. "this loan is in default") without ever revealing the underlying numbers.
- **Reference:** `npx @cloak.dev/claude-skills` (Encrypt is part of the Frontier privacy track)

### How it works in PRISM
The integration mirrors IKA's sysvar-reading pattern exactly, but with a different message layout. Two transactions land in sequence:

1. **Borrower attaches a commitment** — calls `attach_encrypt_score(commitment, encrypt_oracle)`. The commitment is `sha256(Encrypt-sealed credit data)`. Status: `Pending`.
2. **Admin calls "Verify Default via FHE"** — frontend hits the Encrypt oracle, gets a 73-byte attestation, then sends a single Solana tx with TWO instructions:
   - `ix[0]` Ed25519 native precompile (Solana validates the oracle sig atomically)
   - `ix[1]` `verify_encrypt_default(loss_amount, severity_bps)` (reads `ix[0]` via the instructions sysvar, validates the message, marks status `DefaultProven`, and inlines the credit-event cascade — same logic as `trigger_credit_event`)

### Attestation message layout (73 bytes — must match `verify_encrypt_default.rs`)
```
Offset  Length  Field
------  ------  -----
 0       8      prefix: b"enc_atts"
 8      32      loan_key: [u8; 32]          — Loan account pubkey
40      32      score_commitment: [u8; 32]  — sha256 of Encrypt-sealed data
72       1      result: u8                  — 0x01 = default proven
```

### Files shipped

#### On-chain (Rust / Anchor)
- [contracts/programs/prism-core/src/state.rs](../contracts/programs/prism-core/src/state.rs) — added `EncryptLoanHealth` account + `EncryptStatus` enum (`Pending` / `Verified` / `DefaultProven`)
- [contracts/programs/prism-core/src/instructions/attach_encrypt_score.rs](../contracts/programs/prism-core/src/instructions/attach_encrypt_score.rs) — borrower registers FHE commitment
- [contracts/programs/prism-core/src/instructions/verify_encrypt_default.rs](../contracts/programs/prism-core/src/instructions/verify_encrypt_default.rs) — sysvar read + loss cascade
- [contracts/programs/prism-core/src/errors.rs](../contracts/programs/prism-core/src/errors.rs) — 4 new errors (`EncryptAlreadyDefaultProven`, `EncryptSignatureInvalid`, `EncryptCommitmentMismatch`, `EncryptDefaultNotProven`)
- [contracts/programs/prism-core/src/lib.rs](../contracts/programs/prism-core/src/lib.rs) — exposed both new instructions
- [contracts/programs/prism-core/src/pda.rs](../contracts/programs/prism-core/src/pda.rs) — `encrypt_health_pda(loan)` helper

#### Frontend (TypeScript / Next.js)
- [app/lib/encrypt.ts](../app/lib/encrypt.ts) — message builder, oracle HTTP client, dual-instruction tx builder
- [app/api/encrypt-oracle/attest_default/route.ts](../app/api/encrypt-oracle/attest_default/route.ts) — mock FHE oracle that signs the 73-byte attestation
- [hooks/useEncryptHealth.tsx](../hooks/useEncryptHealth.tsx) — `useEncryptHealth`, `useVerifyEncryptDefault`, `useAttachEncryptScore` React Query hooks
- [components/simulation/ActionPanel.tsx](../components/simulation/ActionPanel.tsx) — "Attach FHE Score" (borrower) and "Verify Default via FHE" (admin) buttons; oracle pubkey wired into `initialize_global_config` allowlist
- [components/simulation/PortfolioDashboard.tsx](../components/simulation/PortfolioDashboard.tsx) — `EncryptHealthBadge` showing `🔒 encrypted` → `⚠️ default proven`
- [app/lib/pda.ts](../app/lib/pda.ts), [app/lib/constants.ts](../app/lib/constants.ts) — `getEncryptHealthPda`, `ENCRYPT_ORACLE_PUBKEY`

### Code: shipped on-chain account
```rust
#[account]
#[derive(InitSpace)]
pub struct EncryptLoanHealth {
    pub loan: Pubkey,
    pub score_commitment: [u8; 32],   // sha256 of Encrypt-sealed credit data
    pub encrypt_oracle: Pubkey,       // which FHE oracle attested this
    pub status: EncryptStatus,        // Pending → Verified → DefaultProven
    pub default_proven_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EncryptStatus { Pending, Verified, DefaultProven }
```

### Code: shipped frontend tx builder
```typescript
// app/lib/encrypt.ts
export async function buildVerifyEncryptDefaultTx(params: {
  program: Program<PrismCore>;
  attestation: EncryptAttestation;  // 64-byte sig + 32-byte oracle pk + commitment
  /* ...vault, tranches, reserve, lossBucket, creditEvent PDAs... */
  lossAmount: bigint;
  severityBps: number;
}): Promise<Transaction> {
  const message = buildEncryptAttestationMessage({ /* 73 bytes */ });

  const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
    publicKey: attestation.oraclePubkey.toBytes(),
    message: new Uint8Array(message),
    signature: new Uint8Array(attestation.signature),
  });

  const verifyIx = await program.methods
    .verifyEncryptDefault(new BN(lossAmount.toString()), severityBps)
    .accounts({ /* ...all cascade accounts + instructionsSysvar... */ })
    .instruction();

  return new Transaction().add(ed25519Ix, verifyIx);
}
```

### Demo flow
1. Admin → **Initialize** (the `ENCRYPT_ORACLE_PUBKEY` lands in `oracle_allowlist`)
2. Borrower → **Disburse**, then skip Repay (creates default condition)
3. Borrower → **Attach FHE Score** (registers `sha256(borrower_pubkey)` as the demo commitment, status = `Pending`)
4. Admin → **Verify Default via FHE** — calls `/api/encrypt-oracle/attest_default`, builds dual-ix tx, on-chain validation atomically marks `DefaultProven` and cascades losses Alpha → Core → Prime
5. Dashboard "Loan health (FHE)" row flips from `🔒 encrypted` → `⚠️ default proven`
6. Solana Explorer shows two instructions in the tx: `Ed25519SigVerify` + `verify_encrypt_default`

### Verification
End-to-end crypto test at [contracts/scripts/test-encrypt-flow.js](../contracts/scripts/test-encrypt-flow.js) — proves byte-identical agreement between the TS message builder, mock signer, and Rust verifier:
```
$ node contracts/scripts/test-encrypt-flow.js
  [PASS] ENCRYPT_ORACLE_PUBKEY in constants.ts matches mock oracle key
  [PASS] Message length is 73 bytes (matches MSG_LEN in verify_encrypt_default.rs)
  [PASS] Message prefix is "enc_atts"
  [PASS] Message bytes 8..40 = loan pubkey
  [PASS] Message bytes 40..72 = score commitment
  [PASS] Message byte 72 = 0x01 (default proven)
  [PASS] Signature verifies with oracle pubkey
  [PASS] IDL has attach_encrypt_score / verify_encrypt_default instructions
  [PASS] IDL has EncryptLoanHealth account + EncryptStatus type + 4 errors
  [PASS] prism_core.so built (623 KB)
  ... 19 passed, 0 failed
```

### Why Encrypt is *not* a duplicate of IKA
Same Ed25519-via-sysvar plumbing, different jobs:
- **IKA** answers *"where does the collateral come from?"* — attests cross-chain BTC/ETH lock value
- **Encrypt** answers *"how do we prove default privately?"* — attests a boolean FHE comparison, never revealing repayment amounts

---

## 3. Cloak — ✅ Shipped
**Category:** Privacy & Confidentiality
**Goal:** Shield institutional yield distributions.

### What it is
Cloak is a privacy-first infrastructure layer for Solana that uses Zero-Knowledge Proofs (ZKP) to enable "shielded" accounts and transactions. It allows for "Batch Disbursement," where one transaction fans out to multiple recipients with confidential amounts.
- **Google Search:** [Cloak.ag Solana Privacy SDK](https://www.google.com/search?q=Cloak.ag+Solana+Privacy+SDK)
- **Reference:** [cloak.ag](https://cloak.ag)

### Shipped integration
PRISM now follows the same attestation pattern used by Encrypt:
1. Frontend obtains a Cloak oracle attestation for a batch payout (`/api/cloak-oracle/shield_payout`).
2. Frontend sends a dual-instruction transaction:
   - `ix[0]` Ed25519 precompile
   - `ix[1]` `record_cloak_payout`
3. On-chain program validates the 73-byte `clk_atts` message via `SYSVAR_INSTRUCTIONS` and stores a `CloakPayoutRecord`.
4. Dashboard shows `🔒 shielded via Cloak` and supports per-tranche viewing-key reveal.

### Files shipped
- On-chain: `record_cloak_payout.rs`, `CloakPayoutRecord`, `CloakPayoutStatus`, Cloak errors, `cloak_payout_pda`.
- Frontend: `app/lib/cloak.ts`, `hooks/useCloakPayout.tsx`, `/api/cloak-oracle/shield_payout`, ActionPanel button, PortfolioDashboard badge.
- Verification: `contracts/scripts/test-cloak-flow.js`.

---

## 4. Dune SIM (Echo) — 🟡 Partial
**Category:** Real-Time Analytics
**Goal:** Power the high-fidelity protocol dashboard.

### What it is
Dune SIM is a real-time developer platform providing low-latency APIs to query Solana state (PDAs, account balances, etc.) without building a custom indexer.
- **Google Search:** [Dune Sim Solana API](https://www.google.com/search?q=Dune+Sim+Solana+API)
- **Reference:** [dune.com/sim](https://dune.com/sim)

### Code Structure & Snippet
A frontend service to fetch tranche-specific metrics directly from Dune's simulation layer.

**Proposed Implementation (`dune-service.ts`):**
```typescript
const DUNE_SIM_URL = "https://api.dune.com/api/v1/sim/solana";

export async function fetchTrancheStats(vaultId: string) {
  const response = await fetch(`${DUNE_SIM_URL}/vault/${vaultId}/tranches`, {
    headers: { "X-Dune-API-Key": process.env.DUNE_API_KEY }
  });
  return response.json(); // Returns real-time NAV and yield stats
}
```

---

## 5. Dodo Payments — ✅ Shipped
**Category:** Fiat On-ramp & Global Payments
**Goal:** Borrower repayments via local fiat/stablecoins.

### What it is
Dodo Payments is a Merchant of Record (MoR) platform that supports crypto (USDC on Solana) and fiat payments. It handles tax compliance and regional payment methods (UPI in India, cards globally).
- **Google Search:** [Dodo Payments Solana Integration](https://www.google.com/search?q=Dodo+Payments+Solana+Integration)
- **Reference:** [dodopayments.com](https://dodopayments.com)

### Code Structure & Snippet
Integration in the repayment UI to generate a checkout session for the borrower.

**Proposed Integration (`repayment-component.tsx`):**
```typescript
import { DodoPayments } from "@dodopayments/sdk";

const handleRepay = async (loanId: string, amount: number) => {
  const session = await dodo.checkout.create({
    amount,
    currency: "USD",
    payment_methods: ["crypto", "upi", "card"],
    metadata: { loanId, network: "solana" }
  });
  window.location.href = session.url; // Redirect to checkout
};
```

---

## File Changes Summary

### [Component] PRISM Core (Rust) — shipped
- [MODIFY] ✅ `state.rs`: `IkaCollateral`, `EncryptLoanHealth`, `EncryptStatus`, `CloakPayoutRecord`, `CloakPayoutStatus`
- [MODIFY] ✅ `errors.rs`: 4 IKA errors + 4 Encrypt errors + 4 Cloak errors
- [MODIFY] ✅ `lib.rs`: Registered `attach_ika_collateral`, `verify_ika_collateral`, `verify_and_disburse`, `release_ika_collateral`, `liquidate_ika_collateral`, `attach_encrypt_score`, `verify_encrypt_default`, `record_cloak_payout`
- [MODIFY] ✅ `pda.rs`: `encrypt_health_pda`, `cloak_payout_pda`
- [NEW]    ✅ `instructions/attach_ika_collateral.rs`, `verify_ika_collateral.rs`, `verify_and_disburse.rs`, `release_ika_collateral.rs`, `liquidate_ika_collateral.rs`
- [NEW]    ✅ `instructions/attach_encrypt_score.rs`, `verify_encrypt_default.rs`
- [NEW]    ✅ `instructions/record_cloak_payout.rs`

### [Component] PRISM App (React/TS) — shipped
- [NEW]    ✅ `app/lib/ika.ts`: dWallet integration + Ed25519 attestation
- [NEW]    ✅ `app/lib/encrypt.ts`: 73-byte attestation + dual-ix tx builder
- [NEW]    ✅ `app/api/ika-test-oracle/attest/route.ts`: mock IKA oracle
- [NEW]    ✅ `app/api/encrypt-oracle/attest_default/route.ts`: mock Encrypt FHE oracle
- [NEW]    ✅ `app/lib/cloak.ts`: Cloak attestation builder + tx builder
- [NEW]    ✅ `app/api/cloak-oracle/shield_payout/route.ts`: mock Cloak oracle
- [NEW]    ✅ `hooks/useEncryptHealth.tsx`, `hooks/useIkaCollateral.tsx`, `hooks/useCloakPayout.tsx`
- [MODIFY] ✅ `app/lib/constants.ts`, `app/lib/pda.ts`: Cloak oracle + PDA helpers
- [MODIFY] ✅ `components/simulation/ActionPanel.tsx`: "Shield Yield via Cloak" admin control
- [MODIFY] ✅ `components/simulation/PortfolioDashboard.tsx`: `EncryptHealthBadge` + `CloakPayoutBadge`
- [MODIFY] ✅ `components/borrower/CollateralOnboarding.tsx`: dWallet creation flow
- [NEW]    🟡 `app/api/dune/route.ts`: Dune SIM proxy (partial)
- [NEW]    ✅ `app/api/dodo/`: Dodo Payments checkout + webhook
- [NEW]    ✅ `contracts/scripts/test-cloak-flow.js`: Cloak crypto verification

## Verification Plan
1. **IKA**: ✅ Mock dWallet attestations signed by `IKA_TEST_ORACLE_SECRET_SEED`; on-chain `verify_ika_collateral` reads them via instructions sysvar.
2. **Encrypt**: ✅ End-to-end crypto test at `contracts/scripts/test-encrypt-flow.js` (19/19 pass) — proves the 73-byte attestation is byte-identical between the TS builder, mock FHE oracle signer, and Rust verifier.
3. **Cloak**: ✅ End-to-end crypto test at `contracts/scripts/test-cloak-flow.js` validates 73-byte message layout, Ed25519 signature, IDL entries, and built program artifact.
4. **Dune**: 🟡 Validate API responses against local cluster state.
5. **Dodo**: ✅ Sandbox webhook + LP investment fiat flow tested end-to-end.
