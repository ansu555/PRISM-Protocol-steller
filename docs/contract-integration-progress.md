# Contract Integration Progress — 2026-04-30

This document covers everything added in the `feat/contract-integration` branch.
A developer with no prior context on this session should be able to read this file,
understand what was built, reproduce the issues, and know exactly what still needs
to be fixed before the demo.

---

## Table of Contents

1. [What Was Built Today](#1-what-was-built-today)
2. [Repository Layout (new files)](#2-repository-layout-new-files)
3. [Program IDs & On-Chain Addresses](#3-program-ids--on-chain-addresses)
4. [Environment Variables](#4-environment-variables)
5. [How to Run Locally](#5-how-to-run-locally)
6. [Admin Panel — What "Run Full Setup" Does](#6-admin-panel--what-run-full-setup-does)
7. [Borrower Flow — End-to-End](#7-borrower-flow--end-to-end)
8. [IKA Collateral Flow — End-to-End](#8-ika-collateral-flow--end-to-end)
9. [Test Oracle](#9-test-oracle)
10. [Existing Issues (Blocker + Non-Blocker)](#10-existing-issues-blocker--non-blocker)
11. [How to Fix the Blocker](#11-how-to-fix-the-blocker)
12. [Keypair Files](#12-keypair-files)
13. [What Is NOT Done Yet](#13-what-is-not-done-yet)

---

## 1. What Was Built Today

### Solana (Anchor) — `contracts/programs/prism-core`

Four new instructions were added to `prism-core`:

| Instruction | File | Who calls it | What it does |
|---|---|---|---|
| `attach_ika_collateral` | `instructions/attach_ika_collateral.rs` | Borrower (Phantom) | Creates an `IkaCollateral` PDA in `Pending` status. Registers the borrower's dWallet ID, chain (BTC/ETH/SUI), USD value, and oracle pubkey. |
| `verify_ika_collateral` | `instructions/verify_ika_collateral.rs` | Borrower (Phantom) | Reads the Solana native ed25519 precompile output from `ix_sysvar`. Validates the oracle signature over an 81-byte attestation message. Transitions status from `Pending → Locked`. |
| `release_ika_collateral` | `instructions/release_ika_collateral.rs` | Borrower (Phantom) | Called after loan is repaid. Transitions status `Locked → Released`. Signals IKA Network to unlock the dWallet's BTC/ETH. |
| `liquidate_ika_collateral` | `instructions/liquidate_ika_collateral.rs` | Admin | Called on loan default. Transitions `Locked → Liquidated`. |

A new account type `IkaCollateral` was added to `state.rs`:

```rust
pub struct IkaCollateral {
    pub loan:                  Pubkey,
    pub dwallet_id:            [u8; 32],
    pub chain_id:              u8,
    pub collateral_amount_usd: u64,   // micro-USD (6 decimals)
    pub status:                CollateralStatus,
    pub oracle_pubkey:         Pubkey,
    pub locked_ts:             i64,
    pub bump:                  u8,
}

pub enum CollateralStatus { Pending, Locked, Released, Liquidated }
```

PDA seeds: `[b"ika_collateral", loan_pubkey]`

`disburse_loan` was also modified to accept an optional `ika_collateral` account. If present, it requires `status == Locked` before disbursing.

New error codes in `errors.rs`: `CollateralNotLocked`, `OracleSignatureInvalid`, `DwalletIdMismatch`, `InsufficientCollateral`, `CollateralAlreadyLocked`.

### Frontend — Next.js (`app/`)

| File | What it does |
|---|---|
| `hooks/useLoanApplications.tsx` | Off-chain loan application queue stored in `localStorage`. `LoanApplicationProvider` wraps the app. Exports `submit`, `approve`, `reject`, `getByBorrower`. |
| `hooks/useIkaCollateral.tsx` | React Query hooks: `useIkaCollateralAccount` (fetch PDA), `useAttachIkaCollateral`, `useVerifyIkaCollateral`, `useReleaseIkaCollateral`. |
| `components/borrower/LoanApplicationForm.tsx` | Step 1 UI — loan application form. Shows status panel once submitted. |
| `components/borrower/CollateralOnboarding.tsx` | Step 2 UI — IKA dWallet collateral attach/verify/release form. Includes "Create dWallet" section using real IKA SDK. |
| `app/(app)/borrower/page.tsx` | `/borrower` route — three-step layout: Apply → Lock Collateral → Disbursement. |
| `app/api/ika-test-oracle/route.ts` | Local test oracle. Signs the 81-byte attestation with a fixed devnet keypair. Use during development. |
| `app/lib/ika.ts` | Real IKA SDK integration: `createIkaDwallet` (DKG flow), `buildVerifyCollateralTx` (ed25519 + anchor tx), `getOracleAttestation`, `pollOracleAttestation`. |
| `app/lib/pda.ts` | Added `getIkaCollateralPda(loanPubkey)`. |

`AdminPanel.tsx` was also updated:
- Added "Pending Loan Applications" section (Section 4 of the panel).
- `originateLoanForApplicant()` calls `initialize_loan` on-chain for each approved application.
- `disburseLoan()` passes `ikaCollateral: null` (optional account).

Navigation: "Borrow" link added to `app-header.tsx`.

`LoanApplicationProvider` added to `components/providers/app-providers.tsx`.

---

## 2. Repository Layout (new files)

```
contracts/programs/prism-core/src/
  instructions/
    attach_ika_collateral.rs    ← NEW
    verify_ika_collateral.rs    ← NEW
    release_ika_collateral.rs   ← NEW
    liquidate_ika_collateral.rs ← NEW

app/
  lib/
    ika.ts                      ← NEW (real IKA SDK)
  api/
    ika-test-oracle/
      route.ts                  ← NEW (local test oracle)
  (app)/
    borrower/
      page.tsx                  ← NEW

hooks/
  useLoanApplications.tsx       ← NEW
  useIkaCollateral.tsx          ← NEW

components/
  borrower/
    LoanApplicationForm.tsx     ← NEW
    CollateralOnboarding.tsx    ← NEW

contracts/
  deploy.sh                     ← helper deploy script
  deploy_core.sh                ← deploy prism_core only
  fresh_deploy.sh               ← full fresh redeploy with new IDs
  do_deploy.sh                  ← minimal deploy helper
```

---

## 3. Program IDs & On-Chain Addresses

> **Network**: Solana Devnet (`https://api.devnet.solana.com`)

### Program IDs

| Program | ID |
|---|---|
| `prism_core` | `E3g9dfc7Azz9MZcM9vJPeWA8JKN3rrU7k35KBm5chcL6` |
| `prism_amm` | `4y3iZE8WSAJyMrUgnSCDmqzVQru63UF9YU5L74EaUJY3` |

### Key PDAs (derived from program ID + seeds)

| Account | Seeds | Address |
|---|---|---|
| `GlobalConfig` | `[b"config"]` | `5tgMtuBABb6jM4mLVfQuPsJuFJWN82LuvmqeE5ATFgvo` |
| `Vault(id=1)` | `[b"vault", u32_le(1)]` | `8TDuRCL3S6i8zLFrVauP8uHhwErqD1X6aJVDLY28UPYH` |

> **IMPORTANT — known issue**: The `GlobalConfig` at `5tgMtuB…` was initialized in a previous session with the **borrower wallet** (`BDiN6ACb14hhFjpx4GNRDV7gmviGq7jJdueE8UmomrSd`) as `config.admin`, not the actual admin wallet. This causes all admin operations to fail with `ConstraintHasOne`. See [Section 10](#10-existing-issues-blocker--non-blocker) for the fix.

### USDC Mint (devnet)

`CoSmAscHkm3KxFvsd3QvrLzzSX6Ke1qEfGvcWLPG1GJ1`  
(Circle devnet USDC — airdrop from `spl-token mint` or the Circle faucet)

### Test Oracle Keypair

- **Pubkey**: `5nmEq5cNc9yXpK1ySrb4XH65zccBvRK2hwKnEJePjcrf`
- **Seed (hex)**: `fc0dfc6881aee8d6af913f60fff07ab0b1ec16427573ab6d33b3825df3a52820`
- Lives in `app/api/ika-test-oracle/route.ts` — server-side only, never exposed to the browser.

---

## 4. Environment Variables

All in `.env.local` at the project root. Already committed for devnet:

```bash
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_PRISM_CORE_PROGRAM_ID=E3g9dfc7Azz9MZcM9vJPeWA8JKN3rrU7k35KBm5chcL6
NEXT_PUBLIC_PRISM_AMM_PROGRAM_ID=4y3iZE8WSAJyMrUgnSCDmqzVQru63UF9YU5L74EaUJY3
NEXT_PUBLIC_VAULT_ID=1
NEXT_PUBLIC_USDC_MINT=CoSmAscHkm3KxFvsd3QvrLzzSX6Ke1qEfGvcWLPG1GJ1

# IKA test oracle (local, points at /api/ika-test-oracle)
NEXT_PUBLIC_IKA_ORACLE_URL=http://localhost:3000/api/ika-test-oracle
NEXT_PUBLIC_IKA_FULLNODE_URL=https://fullnode.testnet.ika.xyz
NEXT_PUBLIC_IKA_NETWORK=testnet
```

For production swap `NEXT_PUBLIC_IKA_ORACLE_URL` to the real IKA oracle endpoint.

---

## 5. How to Run Locally

### Prerequisites

- Node.js 20+ / Bun
- Phantom wallet browser extension set to **Devnet**
- WSL2 with Anchor CLI and Solana CLI (for contract work only)

### Start the dev server

```bash
cd PRISM-Protocol
bun install        # first time only
bun dev
```

Open http://localhost:3000

---

## 6. Admin Panel — What "Run Full Setup" Does

URL: http://localhost:3000/admin  
Connect your Phantom wallet (must be the wallet that called `initializeGlobalConfig`, see blocker in Section 10).

The **"Run Full Setup"** button executes these five on-chain transactions in order:

### Step 1 — Global Config (`initializeGlobalConfig`)

Creates the singleton `GlobalConfig` PDA at seeds `[b"config"]`.

Stores:
- `admin` = connected Phantom wallet pubkey
- `usdc_mint` = USDC mint address
- `default_yield_rate_bps` = 0 (demo default)
- `oracle_allowlist` = `[admin]`
- `paused` = false

If the PDA already exists, this step is **skipped** (idempotent).

### Step 2 — Vault + Reserves (`initializeVault`, `initializeVaultReserves`, `initializeVaultLossBucket`)

Creates three accounts:

| Account | Seeds | What it holds |
|---|---|---|
| `Vault` | `[b"vault", u32_le(VAULT_ID)]` | All vault metadata, tranche state, credit event sequence |
| `VaultUsdcReserve` | (token account) | Actual USDC held in reserve — the pool deposits flow into here |
| `LossBucket` | (token account) | USDC set aside when a credit event fires |

`VAULT_ID` is read from `NEXT_PUBLIC_VAULT_ID` (currently `1`).

If the vault PDA already exists, the whole step is skipped.

### Step 3 — Tranches (`initializeTranche` × 3)

Creates three tranche accounts and their SPL token mints:

| Tranche | Kind enum | Target APY | Risk |
|---|---|---|---|
| Prime | `0` | 5% (500 bps) | Lowest — paid first in waterfall |
| Core | `1` | 8% (800 bps) | Middle |
| Alpha | `2` | 15% (1500 bps) | Highest — absorbs losses first |

Each tranche has a `TrancheMint` (SPL token). LP deposits receive tranche tokens representing their share.

### Step 4 — Loan (`initializeLoan`)

Creates a demo `Loan` account (ID = 0) with:
- Principal: 20,000 USDC (from the "Loan Parameters" fields)
- APR: 8% (800 bps)
- Maturity: 365 days from now
- Borrower: admin wallet (for demo purposes)

This is a standalone demo loan used for "Disburse Loan / Repay Loan" in Section 3 of the panel. It is separate from loans originated for borrower applications (those use IDs starting from 1).

### Step 5 — AMM Pools (`initializePool` + `initializePoolReserves` × 3)

Creates one AMM pool per tranche token, each with a USDC quote side.
Parameters: 30 bps fee.

Each pool gets:
- `AmmPool` PDA
- `trancheReserve` token account
- `quoteReserve` token account (USDC)
- `lpMint` (LP token for the pool)

---

### Manual mode

Switch to **Manual** in the top-right toggle to run each step individually with custom parameters (loan principal, APR, maturity, yield amount, loss amount).

---

### After Setup — Section 2: Seed Deposits

Deposit USDC into each tranche to seed the reserve. Enter an amount (default 5,000) and click one of the three tranche buttons. Your wallet must hold devnet USDC.

To get devnet USDC: `spl-token mint CoSmAscHkm3KxFvsd3QvrLzzSX6Ke1qEfGvcWLPG1GJ1 <amount> <your-wallet-ATA>`

---

### After Setup — Section 3: Simulate Events

| Button | Instruction | What happens |
|---|---|---|
| **Apply** (yield) | `accrueYield` | Injects USDC yield from admin wallet into the vault. Waterfall distributes to Prime first, then Core, then Alpha. |
| **Disburse Loan** | `disburseLoan` | Transfers USDC from vault reserve to borrower ATA. Optional: passes `ika_collateral` PDA — if present it must be `Locked`. |
| **Repay Loan** | `repayLoan` | Transfers USDC from borrower ATA back to vault reserve. |
| **Trigger Default Event** | `triggerCreditEvent` | Burns USDC from the reserve into the loss bucket. Loss cascades: Alpha absorbs first, then Core, then Prime. |

---

## 7. Borrower Flow — End-to-End

URL: http://localhost:3000/borrower  
Connect any Phantom wallet.

### Step 1 — Apply for a loan

1. Fill in **Loan Amount** (min $1,000, max $500,000 USDC), **Duration** (30/60/90/180 days), and **Purpose**.
2. Click **Submit Loan Application**.
3. The application is saved to `localStorage` under the key `prism_loan_applications` — it is NOT on-chain yet. Off-chain queue only.
4. Status badge shows **Under Review**.

### Step 2 — Admin approves (in /admin)

1. Admin connects their Phantom wallet at `/admin`.
2. Scroll to Section 4 "Pending Loan Applications".
3. Click **Approve & Originate** next to the application.
4. This calls `initialize_loan` on-chain with the borrower's pubkey and requested amount.
5. The application status in localStorage changes to `approved` with a `loanId` attached.

### Step 3 — Back in /borrower

After approval, **Step 2 (Lock Collateral via IKA dWallet)** appears.

---

## 8. IKA Collateral Flow — End-to-End

This is the core new feature. The flow uses IKA Network's 2PC-MPC dWallet system to lock BTC or ETH as loan collateral on a Sui-based chain, then attest that lock to Solana.

### Attach Collateral (`attach_ika_collateral`)

1. In `CollateralOnboarding.tsx`, fill in:
   - **Chain**: Bitcoin or Ethereum
   - **dWallet ID**: 64 hex characters (32 bytes) — the Sui object ID of your IKA dWallet, stripped of `0x`.
     - For testing: use any 64 hex chars, e.g. `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
   - **Collateral Value (USD)**: e.g. `50000`
   - **IKA Oracle Public Key**: click the pre-filled link to auto-fill the test oracle key `5nmEq5cNc9yXpK1ySrb4XH65zccBvRK2hwKnEJePjcrf`

2. Click **Register IKA Collateral**.

3. On-chain, this creates an `IkaCollateral` PDA at seeds `[b"ika_collateral", loan_pubkey]` with:
   - `status = Pending`
   - `dwallet_id`, `chain_id`, `collateral_amount_usd`, `oracle_pubkey` stored

### Verify Collateral (`verify_ika_collateral`)

Once the `IkaCollateral` PDA is `Pending`, a **Verify Collateral Lock** button appears.

1. Click the button.
2. The frontend polls the oracle URL (`NEXT_PUBLIC_IKA_ORACLE_URL/attest`) with the dWallet ID, chain ID, and loan pubkey.
3. The local test oracle (`/api/ika-test-oracle`) responds immediately with a signature over the 81-byte attestation message.
4. The frontend builds a two-instruction Solana transaction:
   - **ix[0]**: `Ed25519Program.createInstructionWithPublicKey(...)` — the native Solana ed25519 precompile validates the oracle signature.
   - **ix[1]**: `verify_ika_collateral` — reads ix[0] via the `instructions` sysvar, re-validates signature fields (oracle pubkey, dWallet ID, chain, amount ≥ registered, loan pubkey), then sets `status = Locked`.
5. Wallet signs and submits. Status changes to **Locked** (green badge).

### Attestation message format (81 bytes)

```
bytes [0..8]   = b"ika_atts"          (ASCII prefix)
bytes [8..40]  = dwallet_id           (32 bytes, raw)
byte  [40]     = chain_id             (1 byte: 0=BTC, 1=ETH, 2=SUI)
bytes [41..49] = collateral_amount_usd (u64 little-endian, micro-USD)
bytes [49..81] = loan_pubkey          (32 bytes, Solana pubkey)
```

The Rust contract and the TypeScript `buildAttestationMessage()` in `app/lib/ika.ts` must produce byte-identical output.

### Release Collateral (`release_ika_collateral`)

After the loan is repaid:

1. Click **Release Collateral (after repayment)**.
2. Calls `release_ika_collateral` on-chain — requires `loan.state == Repaid` and `ika_collateral.status == Locked`.
3. Status changes to **Released**.
4. IKA Network (off-chain) detects the status change and unlocks the dWallet's BTC/ETH.

### Create a real dWallet (optional, production only)

The `CollateralOnboarding` component has a collapsible **"Create a new dWallet on IKA Network"** section.

1. Paste a 32-byte Sui keypair seed (64 hex chars). This keypair pays gas on IKA Network and will own the resulting dWallet.
2. Click **Create dWallet**.
3. Under the hood, `createIkaDwallet()` in `app/lib/ika.ts` runs:
   - Derives `UserShareEncryptionKeys` from the seed.
   - Registers the encryption key on IKA Network (if not already registered).
   - Runs `prepareDKGAsync` (WASM, CPU-intensive, runs in-browser).
   - Submits a Sui transaction via `IkaClient` calling `coordinatorTransactions.requestDWalletDKG`.
   - Extracts the dWallet object ID from the tx result.
4. The dWallet ID is auto-filled into the form.

Requires: SUI + IKA tokens on IKA testnet for gas. The SDK is `@ika.xyz/sdk ^0.3.1`.

---

## 9. Test Oracle

**File**: `app/api/ika-test-oracle/route.ts`  
**Route**: `POST /api/ika-test-oracle/attest`

This simulates the real IKA oracle for local development.

**Request body**:
```json
{
  "dwallet_id": "<64 hex chars>",
  "chain_id": 0,
  "loan_pubkey": "<base58 Solana pubkey>"
}
```

**Response**:
```json
{
  "signature": "<128 hex chars — 64-byte ed25519 sig>",
  "oracle_pubkey": "5nmEq5cNc9yXpK1ySrb4XH65zccBvRK2hwKnEJePjcrf",
  "amount_usd_micro": "50000000000"
}
```

The test oracle always returns `$50,000 USD` regardless of the requested amount. The on-chain `verify_ika_collateral` only requires `attested_amount >= registered_amount`, so if you registered less than $50,000 it will pass.

The oracle always succeeds (no 404 polling delay like the real oracle). To test the real polling behavior, replace `NEXT_PUBLIC_IKA_ORACLE_URL` with the real IKA oracle URL.

---

## 10. Existing Issues (Blocker + Non-Blocker)

### BLOCKER — GlobalConfig initialized with wrong admin

**Symptom**: Running "Full Setup" in the admin panel gives:
```
AnchorError caused by account: config. Error Code: ConstraintSeeds.
Left:  GvxxusBWDH4ksJix9UDaP1LaMoyPgpQGCjHgdDnJr2mX
Right: 5tgMtuBABb6jM4mLVfQuPsJuFJWN82LuvmqeE5ATFgvo
```
or
```
AnchorError: ConstraintHasOne
Left:  <your Phantom wallet>
Right: BDiN6ACb14hhFjpx4GNRDV7gmviGq7jJdueE8UmomrSd
```

**Root cause**: In a previous session, `initializeGlobalConfig` was called with the `borrower.json` wallet (`BDiN6ACb...`) as the signer, so `config.admin = BDiN6ACb...`. The current Phantom wallet (`qJnBaWcB...` — `admin.json`) does not match.

**Impact**: ALL admin instructions (`initializeVault`, `initializeTranche`, `initializeLoan`, `disburseLoan`, `liquidate_ika_collateral`) fail because they all carry `#[account(has_one = admin)]` on the config.

**Fix**: See [Section 11](#11-how-to-fix-the-blocker).

---

### NON-BLOCKER — Rust source uses `b"config2"` seed, on-chain binary uses `b"config"`

**Symptom**: The Rust source files in `contracts/programs/prism-core/src/instructions/*.rs` were patched during the fix attempt to use `b"config2"` instead of `b"config"`. However, the actual deployed binary on devnet was never successfully rebuilt with this change, so it still uses `b"config"`.

**Current state of `pda.ts`**: `Buffer.from('config')` — matching the deployed binary.

**Impact**: No runtime impact since `pda.ts` matches the deployed binary. But the Rust source and the binary are out of sync, which will cause a build inconsistency when you next run `anchor build`.

**Fix**: Either revert all `config2` occurrences in Rust source back to `config` (if keeping the existing program IDs), or do a fresh deploy as described in Section 11.

---

### NON-BLOCKER — `deploy_core.sh` / `do_deploy.sh` run silently in WSL via PowerShell

The `anchor` binary installed by AVM lives at `~/.avm/bin/anchor` which is a shim that doesn't work when invoked by `bash -c` from a non-interactive PowerShell WSL call. As a result, deploy scripts invoked from Claude Code's PowerShell tool silently exit 0 without deploying anything.

**Fix**: Run deploy scripts directly in your WSL terminal.

---

### NON-BLOCKER — `verify_ika_collateral` not yet tested end-to-end

The `verify_ika_collateral` instruction was written and the test oracle was built, but due to the `ConstraintSeeds` / wrong-admin blocker, no full run through attach → verify has been completed on devnet.

The logic has been code-reviewed but not exercised.

---

## 11. How to Fix the Blocker

The cleanest fix is a **fresh program deploy** with new keypairs. This gives you a new `GlobalConfig` PDA (different program ID = different PDA address) with no existing account — you initialize it fresh with your Phantom wallet as admin.

### Option A — Automated script (recommended)

Run in your WSL terminal:

```bash
bash /mnt/c/Users/manov/Desktop/code/PRISM-Protocol/contracts/fresh_deploy.sh
```

This script:
1. Reverts all `config2` → `config` in Rust source
2. Generates two new program keypairs (`contracts/keys/prism_core_new.json`, `contracts/keys/prism_amm_new.json`)
3. Patches `declare_id!` in both `lib.rs` files
4. Patches `Anchor.toml` with new IDs
5. Runs `anchor build` (30–60 seconds)
6. Deploys both programs fresh to devnet
7. Copies IDL files to `app/lib/idl/`
8. Patches `app/lib/constants.ts` with new IDs

After the script prints `=== DONE ===`, update `.env.local` with the new IDs:

```bash
NEXT_PUBLIC_PRISM_CORE_PROGRAM_ID=<new core ID printed by script>
NEXT_PUBLIC_PRISM_AMM_PROGRAM_ID=<new amm ID printed by script>
```

Then restart the dev server and click **Run Full Setup** — it will go through all five steps cleanly.

Note: `fresh_deploy.sh` currently uses `find ~/.avm/versions -name anchor -type f` to locate the anchor binary. If AVM isn't found there, check where your anchor binary actually lives:

```bash
which anchor         # from an interactive WSL shell
find ~/.avm -name anchor -type f
```

If anchor is installed via `cargo install anchor-cli`, it'll be at `~/.cargo/bin/anchor`. Edit the `ANCHOR` line in `fresh_deploy.sh` accordingly.

### Option B — Manual

```bash
# In WSL
cd /mnt/c/.../PRISM-Protocol/contracts

# 1. Revert config seed
find programs/prism-core/src -name "*.rs" -exec sed -i 's/b"config2"/b"config"/g' {} +

# 2. Generate new keypairs
solana-keygen new -o keys/prism_core_new.json --no-bip39-passphrase --force -s
solana-keygen new -o keys/prism_amm_new.json  --no-bip39-passphrase --force -s
CORE_ID=$(solana-keygen pubkey keys/prism_core_new.json)
AMM_ID=$(solana-keygen pubkey  keys/prism_amm_new.json)

# 3. Patch IDs in Rust + Anchor.toml
sed -i "s/E3g9dfc7Azz9MZcM9vJPeWA8JKN3rrU7k35KBm5chcL6/$CORE_ID/g" programs/prism-core/src/lib.rs Anchor.toml
sed -i "s/4y3iZE8WSAJyMrUgnSCDmqzVQru63UF9YU5L74EaUJY3/$AMM_ID/g"  programs/prism-amm/src/lib.rs  Anchor.toml

# 4. Build
anchor build

# 5. Deploy
solana program deploy /mnt/d/prism-target/deploy/prism_core.so \
  --keypair keys/prism_core_new.json --url devnet --upgrade-authority keys/admin.json
solana program deploy /mnt/d/prism-target/deploy/prism_amm.so \
  --keypair keys/prism_amm_new.json  --url devnet --upgrade-authority keys/admin.json

# 6. Sync IDL + constants
cp /mnt/d/prism-target/idl/prism_core.json ../app/lib/idl/prism_core.json
cp /mnt/d/prism-target/idl/prism_amm.json  ../app/lib/idl/prism_amm.json
sed -i "s/E3g9dfc7Azz9MZcM9vJPeWA8JKN3rrU7k35KBm5chcL6/$CORE_ID/g" ../app/lib/constants.ts
sed -i "s/4y3iZE8WSAJyMrUgnSCDmqzVQru63UF9YU5L74EaUJY3/$AMM_ID/g"  ../app/lib/constants.ts
```

---

## 12. Keypair Files

All in `contracts/keys/` — devnet only, never use on mainnet.

| File | Pubkey | Role |
|---|---|---|
| `admin.json` | `qJnBaWcB2Yvd2MSf1s2XweMEd91RHgdG88ad8cAmbDK` | Program upgrade authority. Should be the Phantom wallet used in the admin panel. |
| `borrower.json` | `BDiN6ACb14hhFjpx4GNRDV7gmviGq7jJdueE8UmomrSd` | **Currently stored as `config.admin` on-chain** (wrong — see blocker). |
| `lp_alpha.json` | `BHida35yhRWinuKFBaFhN7TuPCGx7NoAeSZb4tudT5UH` | LP depositor |
| `lp_core.json` | `Dcnjh3rgrcQ2oD9tFdGUKzYYcYBbrXSDXA4iZoVGszjQ` | LP depositor |
| `lp_prime.json` | `wjVgQ7XkajZhs8dBv2rqqqYz9aoFbapSAa3CFACX17x` | LP depositor |
| `mm.json` | `69bYvFaDzC9SnuTbzHkGenshjBGio76XMawdqwHSSSrE` | Market maker |

Most devnet SOL was spent on program data account extensions. Remaining balance across all wallets is minimal. Airdrop more if needed:

```bash
solana airdrop 2 <pubkey> --url devnet
# or use https://faucet.solana.com
```

---

## 13. What Is NOT Done Yet

These items are out of scope for this session but needed before a full demo:

1. **Fresh program deploy** — must be done before any frontend testing works (see blocker above).

2. **End-to-end collateral test** — attach + verify + disburse + repay + release has not been fully run on devnet due to the admin blocker.

3. **Real IKA oracle** — `NEXT_PUBLIC_IKA_ORACLE_URL` is pointed at the local test oracle. For a real demo, wire up the actual IKA oracle endpoint and ensure the oracle pubkey stored in the collateral account matches.

4. **Real dWallet creation** — `createIkaDwallet()` is implemented using the real `@ika.xyz/sdk` but requires a funded Sui keypair on IKA testnet. Untested because it needs IKA testnet SUI tokens.

5. **Loan repayment gating collateral release** — `release_ika_collateral` checks `loan.state == Repaid` but the frontend does not yet show the Release button only when the loan state is actually `Repaid`. A developer would need to fetch the `Loan` account state and conditionally show the button.

6. **USDC faucet** — there is no in-app button to mint devnet USDC. Users need to use the CLI or Circle's faucet to get tokens for deposits and loan disbursement.

7. **Liquidation flow UI** — `liquidate_ika_collateral` exists on-chain but there is no admin panel button for it. Needs to be wired up in `AdminPanel.tsx`.
