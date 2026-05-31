//! Storage layout for prism-core.
//!
//! Soroban has three storage tiers (Instance / Persistent / Temporary). PRISM uses:
//!
//! - **Instance** — `GlobalConfig` only. Accessed on every call; lives with the contract.
//! - **Persistent** — Vaults, Tranches, Loans, CreditEvents, EncryptHealth, CloakPayouts.
//!   Each is keyed by its natural ID(s). Rent paid in XLM; admin functions should
//!   bump TTL on the entities they touch.
//! - **Temporary** — none.
//!
//! Each `DataKey` variant uniquely identifies a stored entity.

use soroban_sdk::{contracttype, Env};

use crate::state::{
    CloakPayoutRecord, CollateralRecord, CreditEvent, EncryptLoanHealth, GlobalConfig, Loan,
    Tranche, TrancheKind, Vault,
};

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DataKey {
    /// Singleton — sits in Instance storage.
    Config,
    /// Persistent, keyed by vault id.
    Vault(u32),
    /// Persistent, keyed by (vault_id, kind_u32).
    Tranche(u32, u32),
    /// Persistent, keyed by loan id.
    Loan(u32),
    /// Persistent, keyed by (vault_id, seq).
    CreditEvent(u32, u32),
    /// Persistent, keyed by loan id.
    EncryptHealth(u32),
    /// Persistent, keyed by (vault_id, batch counter).
    CloakPayout(u32, u32),
    /// u128 tracking cumulative USDC absorbed by the loss cascade for this vault.
    /// Maintains: reserve == Σ tranche.total_assets + loss_bucket_balance.
    LossBucketBalance(u32),
    /// Monotonic counter for loan ids issued by this contract.
    NextLoanId,
    /// Monotonic counter for cloak payout records per vault.
    NextCloakSeq(u32),
    /// PRISM Collateral Oracle record, keyed by loan_id.
    Collateral(u32),
}

// TTL extension thresholds. Soroban data has rent — if not bumped, it expires.
// `BUMP_LOW` is the threshold below which we extend; `BUMP_HIGH` is what we extend to.
//
// Reference: https://developers.stellar.org/docs/build/guides/storage/choosing-the-right-storage
pub const INSTANCE_BUMP_LOW: u32 = 90 * 17_280; // ≈ 90 days at 5-sec ledgers
pub const INSTANCE_BUMP_HIGH: u32 = 120 * 17_280;
pub const PERSISTENT_BUMP_LOW: u32 = 90 * 17_280;
pub const PERSISTENT_BUMP_HIGH: u32 = 120 * 17_280;

// ── Config (Instance) ────────────────────────────────────────────────────────

pub fn config_exists(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Config)
}

pub fn write_config(env: &Env, cfg: &GlobalConfig) {
    env.storage().instance().set(&DataKey::Config, cfg);
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_BUMP_LOW, INSTANCE_BUMP_HIGH);
}

pub fn read_config(env: &Env) -> GlobalConfig {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .expect("config not initialized")
}

// ── Vault (Persistent) ───────────────────────────────────────────────────────

pub fn vault_key(id: u32) -> DataKey {
    DataKey::Vault(id)
}

pub fn write_vault(env: &Env, vault: &Vault) {
    let key = vault_key(vault.id);
    env.storage().persistent().set(&key, vault);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}

pub fn read_vault(env: &Env, id: u32) -> Option<Vault> {
    env.storage().persistent().get(&vault_key(id))
}

pub fn vault_exists(env: &Env, id: u32) -> bool {
    env.storage().persistent().has(&vault_key(id))
}

// ── Tranche (Persistent) ─────────────────────────────────────────────────────

pub fn tranche_key(vault_id: u32, kind: TrancheKind) -> DataKey {
    DataKey::Tranche(vault_id, kind as u32)
}

pub fn write_tranche(env: &Env, vault_id: u32, kind: TrancheKind, tranche: &Tranche) {
    let key = tranche_key(vault_id, kind);
    env.storage().persistent().set(&key, tranche);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}

pub fn read_tranche(env: &Env, vault_id: u32, kind: TrancheKind) -> Option<Tranche> {
    env.storage().persistent().get(&tranche_key(vault_id, kind))
}

pub fn tranche_exists(env: &Env, vault_id: u32, kind: TrancheKind) -> bool {
    env.storage().persistent().has(&tranche_key(vault_id, kind))
}

// ── Loan (Persistent) ────────────────────────────────────────────────────────

pub fn loan_key(id: u32) -> DataKey {
    DataKey::Loan(id)
}

pub fn write_loan(env: &Env, loan: &Loan) {
    let key = loan_key(loan.id);
    env.storage().persistent().set(&key, loan);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}

pub fn read_loan(env: &Env, id: u32) -> Option<Loan> {
    env.storage().persistent().get(&loan_key(id))
}

// ── Credit event (Persistent) ────────────────────────────────────────────────

pub fn write_credit_event(env: &Env, event: &CreditEvent) {
    let key = DataKey::CreditEvent(event.vault_id, event.seq);
    env.storage().persistent().set(&key, event);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}

pub fn read_credit_event(env: &Env, vault_id: u32, seq: u32) -> Option<CreditEvent> {
    env.storage()
        .persistent()
        .get(&DataKey::CreditEvent(vault_id, seq))
}

// ── Encrypt health (Persistent) ──────────────────────────────────────────────

pub fn encrypt_health_key(loan_id: u32) -> DataKey {
    DataKey::EncryptHealth(loan_id)
}

pub fn write_encrypt_health(env: &Env, h: &EncryptLoanHealth) {
    let key = encrypt_health_key(h.loan_id);
    env.storage().persistent().set(&key, h);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}

pub fn read_encrypt_health(env: &Env, loan_id: u32) -> Option<EncryptLoanHealth> {
    env.storage().persistent().get(&encrypt_health_key(loan_id))
}

// ── Cloak payout (Persistent) ────────────────────────────────────────────────

pub fn write_cloak_payout(env: &Env, vault_id: u32, seq: u32, rec: &CloakPayoutRecord) {
    let key = DataKey::CloakPayout(vault_id, seq);
    env.storage().persistent().set(&key, rec);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}

pub fn read_cloak_payout(env: &Env, vault_id: u32, seq: u32) -> Option<CloakPayoutRecord> {
    env.storage()
        .persistent()
        .get(&DataKey::CloakPayout(vault_id, seq))
}

// ── Counters (Persistent) ────────────────────────────────────────────────────

pub fn next_loan_id(env: &Env) -> u32 {
    let cur: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::NextLoanId)
        .unwrap_or(0);
    let next = cur.saturating_add(1);
    env.storage().persistent().set(&DataKey::NextLoanId, &next);
    next
}

pub fn next_cloak_seq(env: &Env, vault_id: u32) -> u32 {
    let cur: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::NextCloakSeq(vault_id))
        .unwrap_or(0);
    let next = cur.saturating_add(1);
    env.storage()
        .persistent()
        .set(&DataKey::NextCloakSeq(vault_id), &next);
    next
}

// ── PRISM Collateral Oracle (Persistent) ────────────────────────────────────

pub fn write_collateral(env: &Env, rec: &CollateralRecord) {
    let key = DataKey::Collateral(rec.loan_id);
    env.storage().persistent().set(&key, rec);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}

pub fn read_collateral(env: &Env, loan_id: u32) -> Option<CollateralRecord> {
    env.storage()
        .persistent()
        .get(&DataKey::Collateral(loan_id))
}

// ── Loss bucket balance (Persistent) ────────────────────────────────────────

pub fn read_loss_bucket_balance(env: &Env, vault_id: u32) -> u128 {
    env.storage()
        .persistent()
        .get(&DataKey::LossBucketBalance(vault_id))
        .unwrap_or(0)
}

pub fn write_loss_bucket_balance(env: &Env, vault_id: u32, balance: u128) {
    let key = DataKey::LossBucketBalance(vault_id);
    env.storage().persistent().set(&key, &balance);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}
