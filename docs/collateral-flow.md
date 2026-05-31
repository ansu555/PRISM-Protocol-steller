# PRISM Protocol — Collateral Flow

## User Flow (Side by Side)

```
BORROWER                                    ADMIN
────────────────────────────────────────────────────────────────────────────────

1. APPLY
   /borrow → fill loan form
   • Amount, term, purpose
   • Signs with Freighter (Stellar)
   • Application saved to DB
                                            /admin/loans → reviews queue
                                            • Sees borrower pubkey, purpose, amount

2. APPROVE
                                            Clicks "Approve"
                                            • Calls init_loan on Stellar Soroban
                                            • Contract assigns sequential ID (0,1,2…)
                                            • DB record updated with on-chain loanId
   Loan status → "Approved"
   Step indicator advances to Step 3

3. LOCK COLLATERAL
   /borrow → Step 3 appears
   • Connects MetaMask (EVM wallet)
   • Selects chain: Ethereum Sepolia
   • Selects token: ETH / USDC / wETH
   • Enters amount (min 120% of loan)

   [ERC-20 only]
   • Clicks "Approve Token"
   • MetaMask pops up → signs approval tx
   • Waits for approval confirmation

   Clicks "Lock Collateral"
   • MetaMask pops up → signs lock tx
   • lock() / lockETH() called on vault
   • Tx confirmed on Ethereum (~12s)
   • UI shows "Waiting for Oracle…"

   [AUTO — no user action]
   Oracle watcher detects CollateralLocked
   event → waits 3 confirmations (~36s)
   → attests to Stellar (see internals below)

   Collateral status → "Attached"
   Step indicator advances to Step 4

4. DISBURSE
                                            Loan detail page updates:
                                            • Collateral badge → green "Attached"
                                            • Disburse button becomes active

                                            Clicks "Disburse Loan"
                                            • Signs with admin Freighter wallet
                                            • disburse_loan called on Stellar
                                            • TUSDC leaves vault → borrower wallet
   TUSDC balance appears in wallet
   Step indicator advances to Step 5

5. REPAY
   /borrow → Step 5 (Repay)
   • Sees: Principal, Repaid, Interest, Total Due
   • Enters repay amount
   • Clicks "Repay"
   • Signs with Freighter
   • repay_loan called on Stellar
   • TUSDC returns to vault

   [AUTO — no user action]
   Oracle detects loan repaid
   → calls release_collateral on Stellar
   → calls release() on EVM vault
   Collateral returned to MetaMask wallet

   Loan closed ✓

── OR IF BORROWER DEFAULTS ─────────────────────────────────────────────────────

                                            /admin/loans → sees overdue loan
                                            Clicks "Propose Liquidation"
                                            • Enters loss_amount + severity_bps
                                            • Oracle signs 0x03 attestation
                                            • liquidate_collateral called on Stellar
                                            • Loss cascade fires → tranche NAV drops
                                            • Gnosis Safe tx proposed on EVM

                                            Admin 2 opens Safe{Wallet} link
                                            • Reviews pending tx
                                            • Co-signs (2-of-3 threshold met)
                                            • Safe executes liquidate() on EVM vault
                                            • Collateral → PRISM treasury wallet

   Loan state → Liquidated on both chains ✓
```

---

## Internal Collateral Flow

### Architecture Overview

```
  Borrower's MetaMask             PRISM Oracle                 Stellar Soroban
  (Ethereum Sepolia)              (Node.js service)            (prism-core contract)
  ─────────────────               ─────────────────            ─────────────────────
  PrismCollateralVault.sol        /evm-collateral-service/     CollateralRecord
  0xd0130A…491fcb                 watcher/src/                 state: Pending|Attached
                                                               |Released|Liquidated
```

---

### Phase A — Locking (Borrower → EVM → Stellar)

```
Step 1: Borrower calls lock() or lockETH() on PrismCollateralVault
─────────────────────────────────────────────────────────────────────
  lock(
    stellarLoanId: uint32,       ← sequential loan ID from Stellar (0,1,2…)
    token: address,              ← ERC-20 contract (USDC, wETH, wBTC…)
    amount: uint256,             ← amount in token's native decimals
    stellarBorrower: string      ← borrower's G-address, stored for oracle
  )

  Contract effects:
  • safeTransferFrom(borrower, vault, amount)  ← tokens locked in escrow
  • _locks[stellarLoanId] = CollateralLock{
      borrower, token, amount,
      state: Locked,
      lockedAt: block.timestamp
    }
  • emit CollateralLocked(stellarLoanId, borrower, token, amount, stellarBorrower, lockedAt)

─────────────────────────────────────────────────────────────────────
Step 2: Oracle watcher detects CollateralLocked event
─────────────────────────────────────────────────────────────────────
  watcher/src/watcher.ts polls getLogs() every 12 seconds
  Event found → checks block confirmations
  testnet: waits 3 confirmations (~36 seconds)
  mainnet: waits 12 confirmations (~3 minutes)

─────────────────────────────────────────────────────────────────────
Step 3: Oracle calls POST /api/collateral-oracle/attest
─────────────────────────────────────────────────────────────────────
  Request body:
  {
    loan_id:          0,                   ← from event
    chain_id:         1,                   ← 1 = ETH (EVM chains)
    asset_address:    "000…1c7D4B…",       ← token address padded to 32 bytes
    amount_usd_micro: "5000000000",        ← raw token amount
    valued_at_ts:     "1748700000",        ← block.timestamp from event
    nonce:            "1748700123456",     ← Date.now() ms, monotonically increasing
    status:           "attached"           ← 0x01
  }

  Server builds the 73-byte col_atts message:
  ┌──────────────────────────────────────────────────────┐
  │ bytes  0..8   b"col_atts"  (ASCII prefix)            │
  │ bytes  8..12  loan_id      (u32 LE)                  │
  │ bytes 12..16  chain_id     (u32 LE)  — 1 = ETH       │
  │ bytes 16..48  asset_address (32 bytes, zero-padded)  │
  │ bytes 48..56  amount_usd_micro (u64 LE)              │
  │ bytes 56..64  valued_at_ts (i64 LE)                  │
  │ bytes 64..72  nonce (u64 LE)                         │
  │ byte  72      status byte  — 0x01 = Attached         │
  └──────────────────────────────────────────────────────┘

  Signs with Ed25519 private key (COLLATERAL_ORACLE_SEED env var)
  Returns: { signature_hex, oracle_pubkey_hex, message_hex }

─────────────────────────────────────────────────────────────────────
Step 4: Oracle calls POST /api/collateral/attach
─────────────────────────────────────────────────────────────────────
  Submits tx to Stellar:
  attach_collateral(
    borrower:      G-address of borrower,
    loan_id:       0,
    oracle_pubkey: 32-byte Ed25519 pubkey
  )

  Soroban effects:
  • Checks oracle_pubkey is in config.oracle_allowlist
  • Checks loan.borrower == borrower
  • Creates CollateralRecord {
      loan_id, borrower, oracle_pubkey,
      chain_id: 0,          ← placeholder (updated in next step)
      asset_address: [0;32], ← placeholder
      amount_usd_micro: 0,   ← placeholder
      status: Pending
    }

─────────────────────────────────────────────────────────────────────
Step 5: Oracle calls POST /api/collateral/verify
─────────────────────────────────────────────────────────────────────
  Submits tx to Stellar:
  verify_collateral(
    relayer:   admin address,
    loan_id:   0,
    message:   73-byte col_atts buffer,
    signature: 64-byte Ed25519 signature
  )

  Soroban effects (parse_and_verify_collateral_message):
  1. Checks message prefix == b"col_atts"
  2. Checks message[8..12] == loan_id
  3. Checks nonce > rec.last_nonce  ← replay protection
  4. Checks status_byte == 0x01     ← expected for verify
  5. env.crypto().ed25519_verify(oracle_pubkey, message, signature)
  6. Parses chain_id, asset_address, amount_usd_micro from message
  7. Mutates CollateralRecord:
     • chain_id         ← 1 (ETH)
     • asset_address    ← token contract padded to 32 bytes
     • amount_usd_micro ← raw amount
     • last_nonce       ← nonce (prevents replay)
     • status           ← Attached

  CollateralRecord.status = Attached
  → disburse_loan is now unblocked
```

---

### Phase B — Release (After Repayment)

```
Borrower repays on Stellar → repay_loan()
        ↓
Oracle detects loan state change → Repaid
        ↓
Oracle signs 0x02 attestation (status=released)
        ↓
POST /api/collateral/release
release_collateral(borrower, loan_id, message_0x02, signature)
CollateralRecord.status → Released
        ↓
Oracle calls release(stellarLoanId) on EVM vault
_locks[loanId].state = Released
safeTransfer(token, borrower, amount)  ← tokens returned to borrower
        ↓
Borrower's MetaMask wallet receives collateral
```

---

### Phase C — Liquidation (On Default)

```
Admin triggers liquidation from /admin/loans/[id]
        ↓
Admin enters: loss_amount (USDC), severity_bps (0-10000)
        ↓
Oracle signs 0x03 attestation (status=liquidated)
        ↓
POST /api/admin/liquidate-collateral
liquidate_collateral(admin, loan_id, message_0x03, signature, loss_amount, severity_bps)

  Soroban effects:
  1. Verifies Ed25519 signature (same as verify flow)
  2. CollateralRecord.status → Liquidated
  3. Fires loss cascade:
     • Distributes loss_amount across tranches by seniority
     • Alpha tranche absorbs first (first loss)
     • Prime tranche absorbs if Alpha wiped
     • NAV drops immediately for LP token holders
        ↓
App generates Gnosis Safe transaction:
  liquidate(stellarLoanId, treasuryAddress)
  → requires 2-of-3 Safe signers

Admin 1: proposes Safe tx → shares link
Admin 2: opens Safe{Wallet} → co-signs
Safe executes:
  _locks[loanId].state = Liquidated
  _transfer(token, treasuryAddress, amount)  ← collateral to PRISM treasury
```

---

## State Machines

### EVM Vault — Lock State
```
Empty → Locked → Released
              ↘ Liquidated
```

### Stellar — Collateral Status
```
(none) → Pending → Attached → Released
                           ↘ Liquidated
```

### Stellar — Loan State
```
Originated → Active → Repaying → Repaid
                    ↘ Defaulted
```

---

## Key Contracts and Addresses

### Ethereum Sepolia (Testnet)
| Contract | Address |
|---|---|
| PrismCollateralVault | `0xd0130A053820F292B1807C246a1074443E491fcb` |
| MockUSDC (6 dec) | `0x12A70376258f53BbAd1d7387bcBA4084df4B4211` |
| MockWETH (18 dec) | `0xC426c75d79D833e9924De6cA26378FDcF49e912C` |
| Admin / Gnosis Safe | `0xCd811e343B71Ab6D24Ebea2fe8150aa42Fe9786A` |

### Stellar Testnet
| Contract | Value |
|---|---|
| prism-core | `NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID` |
| Collateral oracle pubkey | Derived from `COLLATERAL_ORACLE_SEED` |

---

## Trust Model

| Component | Trusted by | Risk if compromised |
|---|---|---|
| PRISM oracle key | Borrowers + Admin | Can forge collateral attestations |
| Gnosis Safe (2-of-3) | Borrowers | Can liquidate without cause (needs 2 signers) |
| EVM vault contract | Everyone | Immutable — no upgrade key |
| Stellar prism-core | Everyone | Immutable — no upgrade key |
| Collateral oracle allowlist | Contract | Admin can add rogue oracle pubkey |

**Mainnet upgrade path:** Replace PRISM oracle key with Wormhole Guardian VAA (19-of-19) to remove oracle trust. Gnosis Safe threshold can increase to 3-of-5 as team grows.
