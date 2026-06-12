//! On-chain state types + storage layer for prism-core (CosmWasm).
//!
//! Ported from `soroban/prism-core/src/{state,storage}.rs`. Soroban idioms map
//! to CosmWasm as follows:
//!
//! - `Address`            → `Addr`
//! - `BytesN<32>` / `<64>` → `HexBinary` (serializes as a hex string in JSON,
//!                            matching the frontend's existing hex convention)
//! - `u128` NAV / loss     → `Uint128` (string-encoded JSON, JS-safe)
//! - `DataKey` enum        → `cw_storage_plus` `Item` / `Map`
//! - `extend_ttl`          → **dropped** (no storage rent on Cosmos)
//! - SAC token handles     → cw20 contract `Addr` (mint/burn/transfer via msgs)

use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, HexBinary, Uint128};
use cw_storage_plus::{Item, Map};

use crate::error::ContractError;

// ── Global configuration ─────────────────────────────────────────────────────

#[cw_serde]
pub struct GlobalConfig {
    pub admin: Addr,
    /// cw20 USDC contract address (custodied by this contract).
    pub usdc_token: Addr,
    pub default_yield_rate_bps: u32,
    pub paused: bool,
    /// Up to 8 oracle pubkeys (Ed25519 public keys, 32 bytes each, hex-encoded).
    pub oracle_allowlist: Vec<HexBinary>,
}

// ── Vault ────────────────────────────────────────────────────────────────────

#[cw_serde]
pub enum VaultState {
    Active,
    Defaulted,
    Resolved,
}

#[cw_serde]
pub struct Vault {
    pub id: u32,
    pub state: VaultState,
    pub total_deposits: u64,
    pub total_loaned: u64,
    pub last_yield_timestamp: u64,
    pub credit_event_seq: u32,
}

// ── Tranche ──────────────────────────────────────────────────────────────────

#[cw_serde]
#[derive(Copy)]
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

    pub fn as_u32(self) -> u32 {
        self as u32
    }
}

#[cw_serde]
pub struct Tranche {
    pub vault_id: u32,
    pub kind: TrancheKind,
    /// cw20 contract address of the pTranche token (mint/burn handle).
    pub ptoken: Addr,
    pub target_apy_bps: u32,
    pub total_assets: u64,
    pub total_supply: u64,
    /// Q64.64 fixed-point NAV per share. See [crate::math::Q64_ONE].
    pub nav_per_share_q: Uint128,
    pub cumulative_yield: u64,
    pub cumulative_loss: u64,
    pub last_nav_update_ts: u64,
}

// ── Loans ────────────────────────────────────────────────────────────────────

#[cw_serde]
pub enum LoanState {
    Originated,
    Active,
    Repaying,
    Repaid,
    Defaulted,
    Resolved,
}

#[cw_serde]
pub struct Loan {
    pub id: u32,
    pub vault_id: u32,
    pub borrower: Addr,
    pub principal: u64,
    pub apr_bps: u32,
    pub origination_ts: u64,
    pub maturity_ts: u64,
    pub state: LoanState,
    pub total_repaid: u64,
}

// ── Credit events ────────────────────────────────────────────────────────────

#[cw_serde]
pub enum CreditEventType {
    Default,
    PartialLoss,
    Recovery,
}

#[cw_serde]
pub struct CreditEvent {
    pub vault_id: u32,
    pub seq: u32,
    pub event_type: CreditEventType,
    pub loan_id: u32,
    pub loss_amount: u64,
    pub recovery_amount: u64,
    pub severity_bps: u32,
    pub timestamp: u64,
    pub triggered_by: Addr,
}

// ── Encrypt FHE oracle health ────────────────────────────────────────────────

#[cw_serde]
pub enum EncryptStatus {
    Pending,
    Verified,
    DefaultProven,
}

#[cw_serde]
pub struct EncryptLoanHealth {
    pub loan_id: u32,
    /// sha256 commitment of the borrower's Encrypt-sealed credit data.
    pub score_commitment: HexBinary,
    /// Ed25519 pubkey of the Encrypt oracle that signs attestations.
    pub encrypt_oracle: HexBinary,
    pub status: EncryptStatus,
    pub default_proven_ts: u64,
}

// ── PRISM Collateral Oracle ──────────────────────────────────────────────────

#[cw_serde]
pub enum CollateralStatus {
    Pending,
    Attached,
    Released,
    Liquidated,
}

/// 73-byte attestation message layout (unchanged from Soroban — chain-agnostic):
///   bytes  0..8    b"col_atts"
///   bytes  8..12   loan_id (u32 LE)
///   bytes 12..16   chain_id (u32 LE)
///   bytes 16..48   asset_address (32 bytes)
///   bytes 48..56   amount_usd_micro (u64 LE)
///   bytes 56..64   valued_at_ts (i64 LE)
///   bytes 64..72   nonce (u64 LE)
///   byte  72       status (0x01=Attached, 0x02=Released, 0x03=Liquidated)
#[cw_serde]
pub struct CollateralRecord {
    pub loan_id: u32,
    pub borrower: Addr,
    pub oracle_pubkey: HexBinary,
    pub chain_id: u32,
    pub asset_address: HexBinary,
    pub amount_usd_micro: u64,
    pub valued_at_ts: i64,
    pub last_nonce: u64,
    pub status: CollateralStatus,
}

// ── Cloak batch payout ───────────────────────────────────────────────────────

#[cw_serde]
pub enum CloakPayoutStatus {
    Pending,
    Shielded,
}

#[cw_serde]
pub struct CloakPayoutRecord {
    pub vault_id: u32,
    pub cloak_oracle: HexBinary,
    pub batch_id: HexBinary,
    pub total_shielded_amount: u64,
    pub yield_epoch_ts: u64,
    pub status: CloakPayoutStatus,
    pub confirmed_ts: u64,
}

// ──────────────────────────────────────────────────────────────────────────────
// Storage maps (cw-storage-plus). Replaces the Soroban `DataKey` enum.
// ──────────────────────────────────────────────────────────────────────────────

/// Singleton global config.
pub const CONFIG: Item<GlobalConfig> = Item::new("config");
/// Keyed by vault id.
pub const VAULTS: Map<u32, Vault> = Map::new("vaults");
/// Keyed by (vault_id, kind_u32).
pub const TRANCHES: Map<(u32, u32), Tranche> = Map::new("tranches");
/// Keyed by loan id.
pub const LOANS: Map<u32, Loan> = Map::new("loans");
/// Keyed by (vault_id, seq).
pub const CREDIT_EVENTS: Map<(u32, u32), CreditEvent> = Map::new("credit_events");
/// Keyed by loan id.
pub const ENCRYPT_HEALTH: Map<u32, EncryptLoanHealth> = Map::new("encrypt_health");
/// Keyed by (vault_id, seq).
pub const CLOAK_PAYOUTS: Map<(u32, u32), CloakPayoutRecord> = Map::new("cloak_payouts");
/// Cumulative USDC absorbed by the loss cascade per vault. Maintains:
/// reserve == Σ tranche.total_assets + loss_bucket_balance.
pub const LOSS_BUCKET: Map<u32, Uint128> = Map::new("loss_bucket");
/// Monotonic loan id counter.
pub const NEXT_LOAN_ID: Item<u32> = Item::new("next_loan_id");
/// Monotonic cloak payout seq counter, keyed by vault id.
pub const NEXT_CLOAK_SEQ: Map<u32, u32> = Map::new("next_cloak_seq");
/// Collateral record keyed by loan id.
pub const COLLATERAL: Map<u32, CollateralRecord> = Map::new("collateral");

// ── Counter helpers (mirror storage.rs::next_*) ──────────────────────────────

pub fn next_loan_id(storage: &mut dyn cosmwasm_std::Storage) -> Result<u32, ContractError> {
    let cur = NEXT_LOAN_ID.may_load(storage)?.unwrap_or(0);
    let next = cur.saturating_add(1);
    NEXT_LOAN_ID.save(storage, &next)?;
    Ok(next)
}

pub fn next_cloak_seq(
    storage: &mut dyn cosmwasm_std::Storage,
    vault_id: u32,
) -> Result<u32, ContractError> {
    let cur = NEXT_CLOAK_SEQ.may_load(storage, vault_id)?.unwrap_or(0);
    let next = cur.saturating_add(1);
    NEXT_CLOAK_SEQ.save(storage, vault_id, &next)?;
    Ok(next)
}

pub fn read_loss_bucket(storage: &dyn cosmwasm_std::Storage, vault_id: u32) -> Uint128 {
    LOSS_BUCKET
        .may_load(storage, vault_id)
        .unwrap_or(None)
        .unwrap_or_default()
}
