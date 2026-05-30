# Cloak Sidetrack Integration Plan

## Context

PRISM Protocol is submitting to the Solana Frontier Hackathon (deadline May 11, 2026 — **2 days away**). Cloak is the Tier A secondary submission ($5K/$3K/$2K prize). Today is May 9.

**The pitch**: "Institutional credit cash flows can't be public — every coupon payment is permanently indexed on a public ledger. PRISM uses Cloak so LP payouts stay confidential while remaining auditable via viewing keys."

**The structural fit**: Cloak's batch disbursement primitive = PRISM's tranche waterfall payout. After `accrue_yield` distributes yield across Prime/Core/Alpha tranches, the actual USDC transfer to LPs is executed via Cloak's shielded batch system. Payout amounts are hidden from outside observers; each LP receives a viewing key to verify their own amount.

**Integration pattern**: Follow the Encrypt FHE pattern exactly — the Cloak shielding happens off-chain/frontend via their SDK, and the on-chain program records a signed attestation of the batch disbursement result. The 73-byte attestation message mirrors Encrypt's layout.

**Status before this plan**: Zero Cloak code exists. Only marketing text in landing page components.

---

## Architecture

### Attestation Message Layout (73 bytes — mirrors Encrypt's 73-byte pattern)

```
Offset  Length  Field
------  ------  -----
 0       8      prefix: b"clk_atts"
 8      32      vault_key: [u8; 32]     — PRISM vault pubkey
40      32      batch_id: [u8; 32]      — sha256(Cloak batch disbursement receipt)
72       1      result: u8              — 0x01 = batch shielded and confirmed
```

### Two-instruction Solana Transaction (mirrors Encrypt)
- `ix[0]`: Ed25519 native precompile — validates Cloak oracle signature atomically
- `ix[1]`: `record_cloak_payout` — reads `ix[0]` via SYSVAR_INSTRUCTIONS, validates message, creates `CloakPayoutRecord`

---

## Demo Flow

1. Admin → **Initialize** (Cloak oracle pubkey added to `oracle_allowlist` in GlobalConfig)
2. Admin → **Accrue Yield** (standard on-chain waterfall, amounts are currently public)
3. Admin → **"Shield Yield via Cloak"**:
   - Frontend calls Cloak SDK (via `/cloak-send` or batch API from `npx @cloak.dev/claude-skills`)
   - Cloak returns: signed receipt + per-LP viewing keys
   - Frontend calls `/api/cloak-oracle/shield_payout` → returns 64-byte Ed25519 sig + 32-byte oracle pubkey
   - Frontend builds dual-ix tx: Ed25519 precompile + `record_cloak_payout`
   - On-chain: `CloakPayoutRecord` PDA created — status = `Shielded`
4. Dashboard: per-tranche "Yield shielded 🔒 via Cloak" badge; LP clicks to reveal viewing key → decrypts to show their payout amount

---

## Implementation Plan

### Step 1 — Install Cloak Claude Code Skills

```bash
npx @cloak.dev/claude-skills
```

Inspect what `/cloak-shield`, `/cloak-send`, `/cloak-pay`, `/cloak-swap` expose. Adjust `CLOAK_PROGRAM_ID` in constants.ts if a real devnet program ID is available.

---

### Step 2 — On-Chain (Rust / Anchor)

**File: `contracts/programs/prism-core/src/state.rs`**

Add after the `EncryptLoanHealth` block:

```rust
#[account]
#[derive(InitSpace)]
pub struct CloakPayoutRecord {
    pub vault: Pubkey,
    pub cloak_oracle: Pubkey,          // which Cloak oracle attested this
    pub batch_id: [u8; 32],            // sha256(Cloak batch disbursement receipt)
    pub total_shielded_amount: u64,    // total USDC shielded across all tranches
    pub yield_epoch_ts: i64,           // timestamp of the yield epoch this covers
    pub status: CloakPayoutStatus,     // Pending → Shielded
    pub confirmed_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CloakPayoutStatus { Pending, Shielded }
```

**File: `contracts/programs/prism-core/src/errors.rs`**

Add 4 new errors:

```rust
#[error_code]
pub enum PrismError {
    // ... existing errors ...
    #[msg("Cloak payout already recorded for this epoch")]
    CloakPayoutAlreadyRecorded,
    #[msg("Cloak oracle signature invalid")]
    CloakSignatureInvalid,
    #[msg("Cloak batch ID commitment mismatch")]
    CloakBatchIdMismatch,
    #[msg("Cloak payout not yet confirmed")]
    CloakPayoutNotConfirmed,
}
```

**File: `contracts/programs/prism-core/src/pda.rs`**

Add:

```rust
pub fn cloak_payout_pda(vault: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"cloak_payout", vault.as_ref()],
        program_id,
    )
}
```

**New File: `contracts/programs/prism-core/src/instructions/record_cloak_payout.rs`**

Mirrors `verify_encrypt_default.rs`:

```rust
// Reads ix[0] (Ed25519 precompile result) via SYSVAR_INSTRUCTIONS.
// Validates: prefix, vault pubkey, batch_id, result byte.
// Creates CloakPayoutRecord with status = Shielded.
// Constraint: oracle_allowlist must contain cloak_oracle.

pub fn record_cloak_payout_handler(
    ctx: Context<RecordCloakPayout>,
    total_shielded_amount: u64,
) -> Result<()> {
    // 1. Read and validate 73-byte message from instructions sysvar (ix[0])
    // 2. Check prefix == b"clk_atts", vault == ctx.accounts.vault.key(), result == 0x01
    // 3. Check oracle is in allowlist
    // 4. Init/update CloakPayoutRecord
    // 5. Emit CloakPayoutShielded event
}

// Accounts:
//   admin: Signer (must be in oracle_allowlist or be admin)
//   config: GlobalConfig
//   vault: Vault
//   cloak_payout: CloakPayoutRecord (init, seeds=[b"cloak_payout", vault])
//   instructions_sysvar: SYSVAR_INSTRUCTIONS_PUBKEY
//   system_program: System
```

**File: `contracts/programs/prism-core/src/lib.rs`**

Register the new instruction:

```rust
pub fn record_cloak_payout(
    ctx: Context<RecordCloakPayout>,
    total_shielded_amount: u64,
) -> Result<()> {
    instructions::record_cloak_payout::record_cloak_payout_handler(ctx, total_shielded_amount)
}
```

---

### Step 3 — Frontend (TypeScript / Next.js)

**New File: `app/lib/cloak.ts`**

Following `app/lib/encrypt.ts` pattern:

```typescript
// MSG_LEN = 73 (same as encrypt.ts)
// prefix = b"clk_atts"

export function buildCloakAttestationMessage(params: {
  vaultKey: PublicKey;
  batchId: Uint8Array;  // 32 bytes
}): Buffer { /* 73 bytes */ }

export async function fetchCloakAttestation(params: {
  vaultPubkey: string;
  totalShieldedAmount: bigint;
}): Promise<CloakAttestation>  // calls /api/cloak-oracle/shield_payout

export async function buildRecordCloakPayoutTx(params: {
  program: Program<PrismCore>;
  attestation: CloakAttestation;
  vault: PublicKey;
  config: PublicKey;
  totalShieldedAmount: bigint;
}): Promise<Transaction>  // builds Ed25519 ix + record_cloak_payout ix
```

**New File: `app/api/cloak-oracle/shield_payout/route.ts`**

Mock Cloak oracle (mirrors `encrypt-oracle/attest_default/route.ts`):

```typescript
// POST { vault_pubkey, total_shielded_amount }
// → signs 73-byte message with CLOAK_ORACLE_SECRET_SEED
// → returns { signature: number[], oracle_pubkey: string, batch_id: string, viewing_keys: {...} }
//
// viewing_keys structure: { prime: string, core: string, alpha: string }
// Each key encodes the per-tranche payout amount (decryptable by LP for audit)
```

**New File: `app/lib/constants.ts` additions**

```typescript
export const CLOAK_ORACLE_PUBKEY = new PublicKey("...");  // derived from CLOAK_ORACLE_SECRET_SEED
export const CLOAK_PROGRAM_ID = new PublicKey("...");      // Cloak devnet program, TBD after npx install
```

**New File: `app/lib/pda.ts` addition**

```typescript
export function getCloakPayoutPda(vault: PublicKey, programId?: PublicKey): [PublicKey, number]
  // seeds: ['cloak_payout', vault]
```

**New File: `hooks/useCloakPayout.tsx`**

Three hooks (mirror `hooks/useEncryptHealth.tsx`):

```typescript
export function useCloakPayout(vaultPda: PublicKey | undefined)
  // Polls CloakPayoutRecord PDA every 5s via React Query

export function useRecordCloakPayout()
  // useMutation: fetch attestation → build tx → send → invalidate query
  // Returns: { mutate, isLoading, viewingKeys }

export function useCloakViewingKeys()
  // Local state: stores per-tranche viewing keys returned by oracle
  // Allows LP to "decrypt" their payout amount in UI
```

**Modified: `components/simulation/ActionPanel.tsx`**

Admin panel additions (after "Verify Default via FHE" button, ~line 825):

```tsx
{/* Shield Yield via Cloak */}
<Button
  onClick={() => recordCloakPayout.mutate({ vault, totalShieldedAmount })}
  disabled={recordCloakPayout.isLoading || !cloakPayout}
  variant="outline"
>
  {recordCloakPayout.isLoading ? 'Shielding...' : 'Shield Yield via Cloak 🔒'}
</Button>
```

**Modified: `components/simulation/PortfolioDashboard.tsx`**

Add `CloakPayoutBadge` (mirrors `EncryptHealthBadge`):

```tsx
// In ProtocolHealthPanel, add a "Cloak Payout" row:
// Pending:  "🔓 payouts public"
// Shielded: "🔒 shielded via Cloak" + [View Key] button per tranche
//
// Clicking [View Key] → toast with decoded payout amount (from oracle's viewing_key)
```

---

### Step 4 — Verification Script

**New File: `contracts/scripts/test-cloak-flow.js`**

Mirror `contracts/scripts/test-encrypt-flow.js`:

```
$ node contracts/scripts/test-cloak-flow.js
  [PASS] CLOAK_ORACLE_PUBKEY in constants.ts matches oracle key
  [PASS] Message length is 73 bytes (matches MSG_LEN in record_cloak_payout.rs)
  [PASS] Message prefix is "clk_atts"
  [PASS] Message bytes 8..40 = vault pubkey
  [PASS] Message bytes 40..72 = batch_id (sha256 commitment)
  [PASS] Message byte 72 = 0x01 (batch confirmed)
  [PASS] Signature verifies with oracle pubkey
  [PASS] IDL has record_cloak_payout instruction
  [PASS] IDL has CloakPayoutRecord account + CloakPayoutStatus type + 4 errors
  [PASS] prism_core.so built
```

---

## Critical Files

| File | Action | Notes |
|---|---|---|
| `contracts/programs/prism-core/src/state.rs` | MODIFY | Add `CloakPayoutRecord`, `CloakPayoutStatus` |
| `contracts/programs/prism-core/src/errors.rs` | MODIFY | 4 new Cloak errors |
| `contracts/programs/prism-core/src/pda.rs` | MODIFY | `cloak_payout_pda()` |
| `contracts/programs/prism-core/src/lib.rs` | MODIFY | Register `record_cloak_payout` |
| `contracts/programs/prism-core/src/instructions/record_cloak_payout.rs` | NEW | Main on-chain handler |
| `app/lib/cloak.ts` | NEW | Message builder + oracle client + tx builder |
| `app/api/cloak-oracle/shield_payout/route.ts` | NEW | Mock Cloak oracle |
| `hooks/useCloakPayout.tsx` | NEW | React Query hooks |
| `app/lib/pda.ts` | MODIFY | `getCloakPayoutPda()` |
| `app/lib/constants.ts` | MODIFY | `CLOAK_ORACLE_PUBKEY`, `CLOAK_PROGRAM_ID` |
| `components/simulation/ActionPanel.tsx` | MODIFY | "Shield Yield via Cloak" admin button |
| `components/simulation/PortfolioDashboard.tsx` | MODIFY | `CloakPayoutBadge` + viewing keys |
| `contracts/scripts/test-cloak-flow.js` | NEW | End-to-end crypto verification |
| `docs/track_implemenation.md` | MODIFY | Update Cloak status from ⬜ → ✅ |

---

## Execution Order (2 days)

**Day 1 (on-chain first, then TS builder):**
1. `npx @cloak.dev/claude-skills` → inspect SDK surface, lock in `CLOAK_PROGRAM_ID`
2. `state.rs` → `errors.rs` → `pda.rs` → `record_cloak_payout.rs` → `lib.rs`
3. `anchor build` → IDL sync → `test-cloak-flow.js` (all 10+ passing)

**Day 2 (frontend + polish):**
4. `app/lib/cloak.ts` → `app/api/cloak-oracle/shield_payout/route.ts` → `hooks/useCloakPayout.tsx`
5. `ActionPanel.tsx` → `PortfolioDashboard.tsx`
6. End-to-end demo run: Initialize → Accrue Yield → Shield → verify CloakPayoutBadge flips

---

## Verification

1. **Unit crypto test**: `node contracts/scripts/test-cloak-flow.js` — all passes, byte-identical agreement between TS builder and Rust verifier
2. **Anchor test**: `cd contracts && yarn test:skip-build` — no regressions in existing tests
3. **Demo run**: Full UI flow — Initialize → Accrue Yield → Shield Yield via Cloak → badge flips to "🔒 shielded via Cloak"
4. **Viewing key reveal**: Admin/LP clicks [View Key] → toast decodes per-tranche payout amount
5. **Solana Explorer**: tx shows two instructions — `Ed25519SigVerify` + `record_cloak_payout`

---

## Why Cloak is Not a Duplicate of Encrypt

Same Ed25519-via-sysvar plumbing, different jobs:
- **Encrypt**: answers *"is this loan in default?"* — attests a boolean FHE comparison on credit data
- **Cloak**: answers *"were LP payouts executed confidentially?"* — attests a batch shielded disbursement to multiple recipients, hiding individual amounts