//! On-chain state types for prism-core.
//!
//! These mirror the Anchor structs in
//! `contracts/programs/prism-core/src/state.rs` but with Soroban idioms:
//!
//! - `Pubkey` → `Address`
//! - `[u8; 32]` → `BytesN<32>`
//! - `Vec<Pubkey>` from std → Soroban's `Vec<Address>` (host-managed)
//! - `bump` fields dropped (Soroban has no PDAs)
//! - Token-account fields (`usdc_reserve`, `loss_bucket`, `tranche_mints`)
//!   dropped: the contract instance *is* the reserve, and per-tranche SAC
//!   token contracts are tracked by their `Address` directly.

use soroban_sdk::{contracttype, Address, BytesN, Vec};

// ── Global configuration ─────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlobalConfig {
    pub admin: Address,
    /// Stellar USDC contract address (Circle-issued SAC).
    pub usdc_token: Address,
    pub default_yield_rate_bps: u32,
    pub paused: bool,
    /// Up to 8 oracle pubkeys (Ed25519 public keys, 32 bytes each).
    /// Used to validate Encrypt and Cloak attestations.
    pub oracle_allowlist: Vec<BytesN<32>>,
}

// ── Vault ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum VaultState {
    Active,
    Defaulted,
    Resolved,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Vault {
    pub id: u32,
    pub state: VaultState,
    pub total_deposits: u64,
    pub total_loaned: u64,
    pub last_yield_timestamp: u64,
    pub credit_event_seq: u32,
}

// ── Tranche ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TrancheKind {
    Prime = 0,
    Core = 1,
    Alpha = 2,
}

impl TrancheKind {
    pub fn from_u32(v: u32) -> Option<Self> {
        match v {
            0 => Some(Self::Prime),
            1 => Some(Self::Core),
            2 => Some(Self::Alpha),
            _ => None,
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Tranche {
    pub vault_id: u32,
    pub kind: TrancheKind,
    /// Stellar Asset Contract address of the pTranche token (mint/burn handle).
    pub ptoken: Address,
    pub target_apy_bps: u32,
    pub total_assets: u64,
    pub total_supply: u64,
    /// Q64.64 fixed-point NAV per share. See [math::Q64_ONE].
    pub nav_per_share_q: u128,
    pub cumulative_yield: u64,
    pub cumulative_loss: u64,
    pub last_nav_update_ts: u64,
}

// ── Loans ────────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LoanState {
    Originated,
    Active,
    Repaying,
    Repaid,
    Defaulted,
    Resolved,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Loan {
    pub id: u32,
    pub vault_id: u32,
    pub borrower: Address,
    pub principal: u64,
    pub apr_bps: u32,
    pub origination_ts: u64,
    pub maturity_ts: u64,
    pub state: LoanState,
    pub total_repaid: u64,
}

// ── Credit events ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CreditEventType {
    Default,
    PartialLoss,
    Recovery,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CreditEvent {
    pub vault_id: u32,
    pub seq: u32,
    pub event_type: CreditEventType,
    pub loan_id: u32,
    pub loss_amount: u64,
    pub recovery_amount: u64,
    pub severity_bps: u32,
    pub timestamp: u64,
    pub triggered_by: Address,
}

// ── Encrypt FHE oracle health ────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum EncryptStatus {
    Pending,
    Verified,
    DefaultProven,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct EncryptLoanHealth {
    pub loan_id: u32,
    /// sha256 commitment of the borrower's Encrypt-sealed credit data.
    pub score_commitment: BytesN<32>,
    /// Ed25519 pubkey of the Encrypt oracle that signs attestations.
    pub encrypt_oracle: BytesN<32>,
    pub status: EncryptStatus,
    pub default_proven_ts: u64,
}

// ── PRISM Collateral Oracle ──────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CollateralStatus {
    /// Registered via attach_collateral but not yet oracle-verified.
    Pending,
    /// Oracle attested status=0x01: collateral locked, disburse allowed.
    Attached,
    /// Oracle attested status=0x02: collateral released on full repayment.
    Released,
    /// Oracle attested status=0x03: collateral liquidated, loss cascade fired.
    Liquidated,
}

/// 73-byte attestation message layout (§6.6 of stellar-migration-plan.md):
///   bytes  0..8    b"col_atts"
///   bytes  8..12   loan_id (u32 LE)
///   bytes 12..16   chain_id (u32 LE)
///   bytes 16..48   asset_address (32 bytes)
///   bytes 48..56   amount_usd_micro (u64 LE)
///   bytes 56..64   valued_at_ts (i64 LE)
///   bytes 64..72   nonce (u64 LE)
///   byte  72       status (0x01=Attached, 0x02=Released, 0x03=Liquidated)
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CollateralRecord {
    pub loan_id: u32,
    pub borrower: Address,
    /// Ed25519 pubkey of the PRISM Collateral Oracle authorised for this loan.
    pub oracle_pubkey: BytesN<32>,
    pub chain_id: u32,
    pub asset_address: BytesN<32>,
    pub amount_usd_micro: u64,
    pub valued_at_ts: i64,
    pub last_nonce: u64,
    pub status: CollateralStatus,
}

// ── Cloak batch payout ───────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CloakPayoutStatus {
    Pending,
    Shielded,
}

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CloakPayoutRecord {
    pub vault_id: u32,
    pub cloak_oracle: BytesN<32>,
    pub batch_id: BytesN<32>,
    pub total_shielded_amount: u64,
    pub yield_epoch_ts: u64,
    pub status: CloakPayoutStatus,
    pub confirmed_ts: u64,
}
