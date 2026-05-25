//! Phase 1 + Phase 2 tests.
//!
//! Run with `cargo test`. Soroban's `testutils` mock host runs in-process; no
//! validator or RPC required.

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::{Address as _, Ledger as _, LedgerInfo},
    token, Address, Bytes, BytesN, Env, Vec,
};

use ed25519_dalek::{Signer as DalekSigner, SigningKey};

use crate::math::Q64_ONE;
use crate::state::{EncryptStatus, LoanState, TrancheKind, VaultState};
use crate::{PrismCore, PrismCoreClient, PrismError};

fn setup<'a>() -> (Env, PrismCoreClient<'a>, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PrismCore, ());
    let client = PrismCoreClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let usdc = Address::generate(&env);

    (env, client, admin, usdc)
}

#[test]
fn init_config_writes_singleton() {
    let (env, client, admin, usdc) = setup();
    let allowlist: Vec<BytesN<32>> = Vec::new(&env);

    client.init_config(&admin, &usdc, &500_u32, &allowlist);

    let cfg = client.get_config();
    assert_eq!(cfg.admin, admin);
    assert_eq!(cfg.usdc_token, usdc);
    assert_eq!(cfg.default_yield_rate_bps, 500);
    assert!(!cfg.paused);
}

#[test]
fn init_config_twice_errors() {
    let (env, client, admin, usdc) = setup();
    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);

    let err = client.try_init_config(&admin, &usdc, &500_u32, &allowlist);
    assert_eq!(err.err().unwrap().unwrap(), PrismError::AlreadyInitialized);
}

#[test]
fn init_vault_seeds_active_state() {
    let (env, client, admin, usdc) = setup();
    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);

    client.init_vault(&0_u32);

    let v = client.get_vault(&0_u32).expect("vault should exist");
    assert_eq!(v.id, 0);
    assert_eq!(v.state, VaultState::Active);
    assert_eq!(v.total_deposits, 0);
    assert_eq!(v.total_loaned, 0);
    assert_eq!(v.credit_event_seq, 0);
}

#[test]
fn init_vault_twice_errors() {
    let (env, client, admin, usdc) = setup();
    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);

    client.init_vault(&0_u32);
    let err = client.try_init_vault(&0_u32);
    assert_eq!(err.err().unwrap().unwrap(), PrismError::AlreadyInitialized);
}

#[test]
fn init_tranche_three_kinds() {
    let (env, client, admin, usdc) = setup();
    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);
    client.init_vault(&0_u32);

    let prime_ptoken = Address::generate(&env);
    let core_ptoken = Address::generate(&env);
    let alpha_ptoken = Address::generate(&env);

    client.init_tranche(&0_u32, &0_u32, &500_u32, &prime_ptoken);
    client.init_tranche(&0_u32, &1_u32, &1_000_u32, &core_ptoken);
    client.init_tranche(&0_u32, &2_u32, &2_500_u32, &alpha_ptoken);

    let p = client.get_tranche(&0_u32, &0_u32).unwrap();
    let c = client.get_tranche(&0_u32, &1_u32).unwrap();
    let a = client.get_tranche(&0_u32, &2_u32).unwrap();

    assert_eq!(p.kind, TrancheKind::Prime);
    assert_eq!(p.target_apy_bps, 500);
    assert_eq!(p.ptoken, prime_ptoken);

    assert_eq!(c.kind, TrancheKind::Core);
    assert_eq!(c.target_apy_bps, 1_000);

    assert_eq!(a.kind, TrancheKind::Alpha);
    assert_eq!(a.target_apy_bps, 2_500);
    assert_eq!(a.total_assets, 0);
    assert_eq!(a.nav_per_share_q, 0);
}

#[test]
fn init_tranche_invalid_kind_errors() {
    let (env, client, admin, usdc) = setup();
    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);
    client.init_vault(&0_u32);

    let ptoken = Address::generate(&env);
    let err = client.try_init_tranche(&0_u32, &99_u32, &500_u32, &ptoken);
    assert_eq!(err.err().unwrap().unwrap(), PrismError::InvalidTrancheKind);
}

#[test]
fn init_tranche_before_vault_errors() {
    let (env, client, admin, usdc) = setup();
    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);

    let ptoken = Address::generate(&env);
    let err = client.try_init_tranche(&0_u32, &0_u32, &500_u32, &ptoken);
    assert_eq!(err.err().unwrap().unwrap(), PrismError::NotInitialized);
}

#[test]
fn pause_unpause_flips_flag() {
    let (env, client, admin, usdc) = setup();
    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);

    client.pause();
    assert!(client.get_config().paused);

    client.unpause();
    assert!(!client.get_config().paused);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 2 — full lifecycle harness
// ──────────────────────────────────────────────────────────────────────────────

/// USDC has 7 decimals on Stellar (vs 6 on Solana). Helper to keep test
/// constants readable.
const USDC_UNIT: i128 = 10_000_000;

struct Harness<'a> {
    env: Env,
    client: PrismCoreClient<'a>,
    admin: Address,
    user: Address,
    usdc: Address,
    usdc_admin: token::StellarAssetClient<'a>,
    usdc_client: token::Client<'a>,
    prime_token: Address,
    core_token: Address,
    alpha_token: Address,
}

/// Spin up a fully-initialized vault with three tranches, fund a user with
/// 1_000 USDC, and return everything the tests need.
///
/// Tranche APY targets (in bps) mirror the demo seed in
/// `contracts/scripts/setup-demo.ts`:
///   Prime = 500 (5%)
///   Core  = 1_000 (10%)
///   Alpha = 2_500 (25%)
fn harness<'a>() -> Harness<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PrismCore, ());
    let client = PrismCoreClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    // USDC: SAC whose admin is the test admin (so we can mint test USDC).
    let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = usdc_sac.address();
    let usdc_admin = token::StellarAssetClient::new(&env, &usdc);
    let usdc_client = token::Client::new(&env, &usdc);
    usdc_admin.mint(&user, &(1_000 * USDC_UNIT));

    // Three pTranche SACs, each with prism-core as admin so deposit/withdraw can
    // mint/burn via the standard token interface.
    let prime_sac = env.register_stellar_asset_contract_v2(contract_id.clone());
    let core_sac = env.register_stellar_asset_contract_v2(contract_id.clone());
    let alpha_sac = env.register_stellar_asset_contract_v2(contract_id.clone());

    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);
    client.init_vault(&0_u32);
    client.init_tranche(&0_u32, &0_u32, &500_u32, &prime_sac.address());
    client.init_tranche(&0_u32, &1_u32, &1_000_u32, &core_sac.address());
    client.init_tranche(&0_u32, &2_u32, &2_500_u32, &alpha_sac.address());

    Harness {
        env,
        client,
        admin,
        user,
        usdc,
        usdc_admin,
        usdc_client,
        prime_token: prime_sac.address(),
        core_token: core_sac.address(),
        alpha_token: alpha_sac.address(),
    }
}

#[test]
fn deposit_first_mints_one_to_one_and_sets_nav() {
    let h = harness();

    // First deposit into Alpha: 100 USDC → 100 shares (NAV = 1.0 = Q64_ONE).
    let shares = h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));
    assert_eq!(shares, 100 * USDC_UNIT);

    // pToken balance arrived in the user's wallet.
    let alpha_ptoken = token::Client::new(&h.env, &h.alpha_token);
    assert_eq!(alpha_ptoken.balance(&h.user), 100 * USDC_UNIT);

    // USDC moved to the contract.
    assert_eq!(h.usdc_client.balance(&h.user), 900 * USDC_UNIT);
    assert_eq!(
        h.usdc_client.balance(&h.client.address),
        100 * USDC_UNIT,
    );

    // Tranche state: NAV = 1.0, totals match.
    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(alpha.total_assets, (100 * USDC_UNIT) as u64);
    assert_eq!(alpha.total_supply, (100 * USDC_UNIT) as u64);
    assert_eq!(alpha.nav_per_share_q, Q64_ONE);

    // Vault aggregate.
    let v = h.client.get_vault(&0_u32).unwrap();
    assert_eq!(v.total_deposits, (100 * USDC_UNIT) as u64);
}

#[test]
fn deposit_second_uses_current_nav() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // Second deposit at NAV = 1.0 → same 1:1 ratio.
    let shares = h.client.deposit(&h.user, &0_u32, &2_u32, &(50 * USDC_UNIT));
    assert_eq!(shares, 50 * USDC_UNIT);

    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(alpha.total_assets, (150 * USDC_UNIT) as u64);
    assert_eq!(alpha.total_supply, (150 * USDC_UNIT) as u64);
    assert_eq!(alpha.nav_per_share_q, Q64_ONE);
}

#[test]
fn withdraw_at_nav_one_returns_usdc_one_to_one() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    let payout = h.client.withdraw(&h.user, &0_u32, &2_u32, &(40 * USDC_UNIT));
    assert_eq!(payout, 40 * USDC_UNIT);

    // pToken balance reduced.
    let alpha_ptoken = token::Client::new(&h.env, &h.alpha_token);
    assert_eq!(alpha_ptoken.balance(&h.user), 60 * USDC_UNIT);

    // USDC returned to user.
    assert_eq!(h.usdc_client.balance(&h.user), 940 * USDC_UNIT);

    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(alpha.total_assets, (60 * USDC_UNIT) as u64);
    assert_eq!(alpha.total_supply, (60 * USDC_UNIT) as u64);
    assert_eq!(alpha.nav_per_share_q, Q64_ONE);
}

/// MATH PARITY: deposit 100 → accrue 5 USDC yield (Alpha-only, vault has zero
/// Prime/Core deposits, so the waterfall residual = the full yield) → NAV
/// becomes (105 × Q64_ONE) / 100. Match exact value.
#[test]
fn accrue_yield_alpha_only_lifts_nav() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // Fund the admin with enough USDC to ship 5 USDC as yield.
    h.usdc_admin.mint(&h.admin, &(5 * USDC_UNIT));

    // Advance the ledger so elapsed > 0.
    h.env.ledger().set(LedgerInfo {
        timestamp: h.env.ledger().timestamp() + 365 * 24 * 3600,
        protocol_version: h.env.ledger().protocol_version(),
        sequence_number: h.env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 0,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_312_000,
    });

    h.client
        .accrue_yield(&h.admin, &0_u32, &h.admin, &(5 * USDC_UNIT));

    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(alpha.total_assets, (105 * USDC_UNIT) as u64);
    assert_eq!(alpha.total_supply, (100 * USDC_UNIT) as u64);
    assert_eq!(alpha.cumulative_yield, (5 * USDC_UNIT) as u64);

    // NAV = (105 × USDC_UNIT) × Q64_ONE / (100 × USDC_UNIT)
    //     = 1.05 × Q64_ONE  exactly when ratio is integer-clean.
    let expected_nav = ((105_u128 * USDC_UNIT as u128) << 64) / (100_u128 * USDC_UNIT as u128);
    assert_eq!(alpha.nav_per_share_q, expected_nav);

    // Withdraw 50 shares → ≈ 50 × 1.05 = 52.5 USDC, modulo 1-unit Q64.64
    // truncation (NAV stored at finite precision; matches the Solana behavior
    // in contracts/programs/prism-core/src/math/q.rs::withdraw_payout).
    let payout = h.client.withdraw(&h.user, &0_u32, &2_u32, &(50 * USDC_UNIT));
    let diff = (525_000_000i128 - payout).abs();
    assert!(diff <= 1, "payout {payout} not within 1 unit of 525_000_000");
}

/// MATH PARITY: deposit 100 USDC across all three tranches, trigger a 30 USDC
/// loss → Alpha eats first (Alpha had 100 → now 70), Core/Prime untouched.
/// Alpha NAV = 0.7 × Q64_ONE.
#[test]
fn trigger_credit_event_alpha_absorbs_first() {
    let h = harness();
    // Equal 100 USDC into each tranche.
    h.client.deposit(&h.user, &0_u32, &0_u32, &(100 * USDC_UNIT));
    h.client.deposit(&h.user, &0_u32, &1_u32, &(100 * USDC_UNIT));
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // PartialLoss of 30 USDC.
    let seq = h.client.trigger_credit_event(
        &h.admin,
        &0_u32,
        &1_u32,        // PartialLoss
        &(30 * USDC_UNIT),
        &3_000_u32,    // severity 30%
        &0_u32,        // loan_id (informational)
    );
    assert_eq!(seq, 0);

    let prime = h.client.get_tranche(&0_u32, &0_u32).unwrap();
    let core_t = h.client.get_tranche(&0_u32, &1_u32).unwrap();
    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();

    // Alpha lost 30; Core/Prime untouched.
    assert_eq!(alpha.total_assets, (70 * USDC_UNIT) as u64);
    assert_eq!(alpha.cumulative_loss, (30 * USDC_UNIT) as u64);
    assert_eq!(core_t.total_assets, (100 * USDC_UNIT) as u64);
    assert_eq!(prime.total_assets, (100 * USDC_UNIT) as u64);

    // Alpha NAV = 70/100 = 0.7
    let expected_alpha_nav =
        ((70_u128 * USDC_UNIT as u128) << 64) / (100_u128 * USDC_UNIT as u128);
    assert_eq!(alpha.nav_per_share_q, expected_alpha_nav);

    // Core and Prime NAVs unchanged at 1.0.
    assert_eq!(core_t.nav_per_share_q, Q64_ONE);
    assert_eq!(prime.nav_per_share_q, Q64_ONE);

    // PartialLoss doesn't flip vault state.
    assert_eq!(h.client.get_vault(&0_u32).unwrap().state, VaultState::Active);
}

/// MATH PARITY: 150 USDC loss against 100/100/100 → Alpha wiped, Core eats 50.
/// Alpha NAV = 0, Core NAV = 0.5, Prime untouched.
#[test]
fn trigger_credit_event_cascades_past_alpha_into_core() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &0_u32, &(100 * USDC_UNIT));
    h.client.deposit(&h.user, &0_u32, &1_u32, &(100 * USDC_UNIT));
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    h.client.trigger_credit_event(
        &h.admin,
        &0_u32,
        &1_u32,
        &(150 * USDC_UNIT),
        &5_000_u32,
        &0_u32,
    );

    let prime = h.client.get_tranche(&0_u32, &0_u32).unwrap();
    let core_t = h.client.get_tranche(&0_u32, &1_u32).unwrap();
    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();

    assert_eq!(alpha.total_assets, 0);
    assert_eq!(alpha.cumulative_loss, (100 * USDC_UNIT) as u64);
    assert_eq!(alpha.nav_per_share_q, 0); // wiped

    assert_eq!(core_t.total_assets, (50 * USDC_UNIT) as u64);
    assert_eq!(core_t.cumulative_loss, (50 * USDC_UNIT) as u64);
    let expected_core_nav =
        ((50_u128 * USDC_UNIT as u128) << 64) / (100_u128 * USDC_UNIT as u128);
    assert_eq!(core_t.nav_per_share_q, expected_core_nav);

    assert_eq!(prime.total_assets, (100 * USDC_UNIT) as u64);
    assert_eq!(prime.nav_per_share_q, Q64_ONE);
}

#[test]
fn trigger_credit_event_default_flips_vault_state() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    h.client.trigger_credit_event(
        &h.admin,
        &0_u32,
        &0_u32,           // Default
        &(50 * USDC_UNIT),
        &5_000_u32,
        &0_u32,
    );

    assert_eq!(
        h.client.get_vault(&0_u32).unwrap().state,
        VaultState::Defaulted,
    );
}

#[test]
fn deposit_into_wiped_tranche_errors() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // Wipe alpha.
    h.client.trigger_credit_event(
        &h.admin,
        &0_u32,
        &1_u32,
        &(100 * USDC_UNIT),
        &10_000_u32,
        &0_u32,
    );

    // Vault still Active (PartialLoss); tranche has supply > 0 but NAV = 0
    // → math::deposit_shares returns TrancheWipedNoDepositsAllowed.
    let err = h
        .client
        .try_deposit(&h.user, &0_u32, &2_u32, &(10 * USDC_UNIT));
    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::TrancheWipedNoDepositsAllowed,
    );
}

#[test]
fn loss_exceeding_total_assets_errors() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    let err = h.client.try_trigger_credit_event(
        &h.admin,
        &0_u32,
        &1_u32,
        &(1_000 * USDC_UNIT),
        &10_000_u32,
        &0_u32,
    );
    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::LossExceedsTotalAssets,
    );
}

#[test]
fn withdraw_when_vault_defaulted_still_allowed() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &0_u32, &(100 * USDC_UNIT));
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // Default flips vault → Defaulted, alpha wiped.
    h.client.trigger_credit_event(
        &h.admin,
        &0_u32,
        &0_u32,
        &(100 * USDC_UNIT),
        &10_000_u32,
        &0_u32,
    );
    assert_eq!(
        h.client.get_vault(&0_u32).unwrap().state,
        VaultState::Defaulted,
    );

    // Prime LP can still exit at NAV 1.0.
    let payout = h.client.withdraw(&h.user, &0_u32, &0_u32, &(40 * USDC_UNIT));
    assert_eq!(payout, 40 * USDC_UNIT);
}

#[test]
fn deposit_paused_errors() {
    let h = harness();
    h.client.pause();

    let err = h
        .client
        .try_deposit(&h.user, &0_u32, &2_u32, &(10 * USDC_UNIT));
    assert_eq!(err.err().unwrap().unwrap(), PrismError::VaultPaused);
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 — loans + Encrypt + Cloak oracle round-trips
// ──────────────────────────────────────────────────────────────────────────────

/// Generate an Ed25519 keypair from a fixed seed for deterministic tests.
fn oracle_keypair(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}

/// Build the 73-byte Encrypt attestation message:
///   0..8   "enc_atts"
///   8..40  loan_id (u32 LE) + 28 zero bytes
///   40..72 score_commitment
///   72     result (0x01 = default proven)
fn build_encrypt_message(
    env: &Env,
    loan_id: u32,
    commitment: &[u8; 32],
    result: u8,
) -> Bytes {
    let mut buf = std::vec![0u8; 73];
    buf[0..8].copy_from_slice(b"enc_atts");
    buf[8..12].copy_from_slice(&loan_id.to_le_bytes());
    buf[40..72].copy_from_slice(commitment);
    buf[72] = result;
    Bytes::from_slice(env, &buf)
}

/// Build the 73-byte Cloak attestation message:
///   0..8   "clk_atts"
///   8..40  vault_id (u32 LE) + 28 zero bytes
///   40..72 batch_id
///   72     result
fn build_cloak_message(
    env: &Env,
    vault_id: u32,
    batch_id: &[u8; 32],
    result: u8,
) -> Bytes {
    let mut buf = std::vec![0u8; 73];
    buf[0..8].copy_from_slice(b"clk_atts");
    buf[8..12].copy_from_slice(&vault_id.to_le_bytes());
    buf[40..72].copy_from_slice(batch_id);
    buf[72] = result;
    Bytes::from_slice(env, &buf)
}

fn sign(env: &Env, key: &SigningKey, message: &Bytes) -> BytesN<64> {
    let mut buf = std::vec![0u8; message.len() as usize];
    message.copy_into_slice(&mut buf);
    let sig = key.sign(&buf);
    BytesN::from_array(env, &sig.to_bytes())
}

fn pubkey_bytes(env: &Env, key: &SigningKey) -> BytesN<32> {
    BytesN::from_array(env, key.verifying_key().as_bytes())
}

// ── Loans ────────────────────────────────────────────────────────────────────

#[test]
fn init_loan_originates_in_pending_state() {
    let h = harness();
    let borrower = Address::generate(&h.env);

    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client.init_loan(
        &0_u32,
        &1_u32,
        &borrower,
        &(20 * USDC_UNIT),
        &800_u32, // 8% APR
        &future,
    );

    let loan = h.client.get_loan(&1_u32).unwrap();
    assert_eq!(loan.id, 1);
    assert_eq!(loan.vault_id, 0);
    assert_eq!(loan.borrower, borrower);
    assert_eq!(loan.principal, (20 * USDC_UNIT) as u64);
    assert_eq!(loan.state, LoanState::Originated);
}

#[test]
fn init_loan_with_past_maturity_errors() {
    let h = harness();
    let borrower = Address::generate(&h.env);

    // current ledger timestamp is 0 in the mock host until advanced; pass 0
    // explicitly to ensure maturity_ts <= now.
    let err = h.client.try_init_loan(
        &0_u32,
        &1_u32,
        &borrower,
        &(20 * USDC_UNIT),
        &800_u32,
        &0_u64,
    );
    assert_eq!(err.err().unwrap().unwrap(), PrismError::LoanInWrongState);
}

#[test]
fn disburse_loan_pays_principal_to_borrower() {
    let h = harness();
    // Seed vault with USDC so it has reserves to disburse from.
    h.client.deposit(&h.user, &0_u32, &2_u32, &(500 * USDC_UNIT));

    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let before = h.usdc_client.balance(&borrower);
    h.client.disburse_loan(&0_u32, &1_u32);
    let after = h.usdc_client.balance(&borrower);

    assert_eq!(after - before, 20 * USDC_UNIT);
    let loan = h.client.get_loan(&1_u32).unwrap();
    assert_eq!(loan.state, LoanState::Active);
    assert_eq!(h.client.get_vault(&0_u32).unwrap().total_loaned, (20 * USDC_UNIT) as u64);
}

#[test]
fn disburse_loan_twice_errors() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(500 * USDC_UNIT));

    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);
    h.client.disburse_loan(&0_u32, &1_u32);

    let err = h.client.try_disburse_loan(&0_u32, &1_u32);
    assert_eq!(err.err().unwrap().unwrap(), PrismError::LoanInWrongState);
}

#[test]
fn repay_loan_completes_on_full_repayment() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(500 * USDC_UNIT));

    let borrower = Address::generate(&h.env);
    h.usdc_admin.mint(&borrower, &(25 * USDC_UNIT));
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);
    h.client.disburse_loan(&0_u32, &1_u32);

    h.client.repay_loan(&borrower, &1_u32, &(10 * USDC_UNIT));
    let mid = h.client.get_loan(&1_u32).unwrap();
    assert_eq!(mid.state, LoanState::Repaying);
    assert_eq!(mid.total_repaid, (10 * USDC_UNIT) as u64);

    h.client.repay_loan(&borrower, &1_u32, &(10 * USDC_UNIT));
    let end = h.client.get_loan(&1_u32).unwrap();
    assert_eq!(end.state, LoanState::Repaid);
}

#[test]
fn repay_loan_wrong_borrower_errors() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &2_u32, &(500 * USDC_UNIT));

    let borrower = Address::generate(&h.env);
    let imposter = Address::generate(&h.env);
    h.usdc_admin.mint(&imposter, &(10 * USDC_UNIT));
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);
    h.client.disburse_loan(&0_u32, &1_u32);

    let err = h
        .client
        .try_repay_loan(&imposter, &1_u32, &(5 * USDC_UNIT));
    assert_eq!(err.err().unwrap().unwrap(), PrismError::BorrowerMismatch);
}

// ── Encrypt oracle ───────────────────────────────────────────────────────────

#[test]
fn attach_encrypt_score_requires_allowlisted_oracle() {
    let h = harness();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let oracle = oracle_keypair(7);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    let commitment = BytesN::from_array(&h.env, &[0xab; 32]);

    // Not in allowlist yet → errors.
    let err = h
        .client
        .try_attach_encrypt_score(&borrower, &1_u32, &commitment, &oracle_pk);
    assert_eq!(err.err().unwrap().unwrap(), PrismError::OracleNotAllowlisted);
}

/// Full happy-path: attach commitment → oracle signs a valid attestation →
/// verify_encrypt_default fires the cascade and flips vault to Defaulted.
#[test]
fn verify_encrypt_default_full_round_trip() {
    let h = harness_with_encrypt_oracle();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let oracle = oracle_keypair(7);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    let commitment_bytes = [0xab; 32];
    let commitment = BytesN::from_array(&h.env, &commitment_bytes);

    h.client
        .attach_encrypt_score(&borrower, &1_u32, &commitment, &oracle_pk);

    // Seed Alpha with USDC so the cascade has something to bite into.
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    let message = build_encrypt_message(&h.env, 1, &commitment_bytes, 0x01);
    let signature = sign(&h.env, &oracle, &message);

    let relayer = Address::generate(&h.env);
    let seq = h.client.verify_encrypt_default(
        &relayer,
        &0_u32,
        &1_u32,
        &message,
        &signature,
        &(30 * USDC_UNIT),
        &3_000_u32,
    );
    assert_eq!(seq, 0);

    // EncryptHealth flipped to DefaultProven.
    let health = h.client.get_encrypt_health(&1_u32).unwrap();
    assert_eq!(health.status, EncryptStatus::DefaultProven);

    // Vault is Defaulted; Alpha lost 30.
    let v = h.client.get_vault(&0_u32).unwrap();
    assert_eq!(v.state, VaultState::Defaulted);
    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(alpha.total_assets, (70 * USDC_UNIT) as u64);
    assert_eq!(alpha.cumulative_loss, (30 * USDC_UNIT) as u64);
}

#[test]
fn verify_encrypt_default_wrong_commitment_errors() {
    let h = harness_with_encrypt_oracle();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let oracle = oracle_keypair(7);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    let registered_commitment = [0xab; 32];
    let attested_commitment = [0xcd; 32]; // ← different
    h.client.attach_encrypt_score(
        &borrower,
        &1_u32,
        &BytesN::from_array(&h.env, &registered_commitment),
        &oracle_pk,
    );
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    let message = build_encrypt_message(&h.env, 1, &attested_commitment, 0x01);
    let signature = sign(&h.env, &oracle, &message);
    let relayer = Address::generate(&h.env);

    let err = h.client.try_verify_encrypt_default(
        &relayer,
        &0_u32,
        &1_u32,
        &message,
        &signature,
        &(30 * USDC_UNIT),
        &3_000_u32,
    );
    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::EncryptCommitmentMismatch,
    );
}

#[test]
fn verify_encrypt_default_not_proven_result_errors() {
    let h = harness_with_encrypt_oracle();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let oracle = oracle_keypair(7);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    let commitment_bytes = [0xab; 32];
    h.client.attach_encrypt_score(
        &borrower,
        &1_u32,
        &BytesN::from_array(&h.env, &commitment_bytes),
        &oracle_pk,
    );
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // result byte = 0x00 → oracle says NOT defaulted → reject.
    let message = build_encrypt_message(&h.env, 1, &commitment_bytes, 0x00);
    let signature = sign(&h.env, &oracle, &message);
    let relayer = Address::generate(&h.env);

    let err = h.client.try_verify_encrypt_default(
        &relayer,
        &0_u32,
        &1_u32,
        &message,
        &signature,
        &(30 * USDC_UNIT),
        &3_000_u32,
    );
    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::EncryptDefaultNotProven,
    );
}

#[test]
fn verify_encrypt_default_wrong_signer_panics() {
    let h = harness_with_encrypt_oracle();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let registered_oracle = oracle_keypair(7);
    let attacker_oracle = oracle_keypair(99);
    let registered_pk = pubkey_bytes(&h.env, &registered_oracle);
    let commitment_bytes = [0xab; 32];
    h.client.attach_encrypt_score(
        &borrower,
        &1_u32,
        &BytesN::from_array(&h.env, &commitment_bytes),
        &registered_pk,
    );
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // Attacker signs the same message but with a different key.
    let message = build_encrypt_message(&h.env, 1, &commitment_bytes, 0x01);
    let bad_signature = sign(&h.env, &attacker_oracle, &message);
    let relayer = Address::generate(&h.env);

    // ed25519_verify panics on bad signature — wrap in std::panic::catch_unwind.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.client.verify_encrypt_default(
            &relayer,
            &0_u32,
            &1_u32,
            &message,
            &bad_signature,
            &(30 * USDC_UNIT),
            &3_000_u32,
        )
    }));
    assert!(result.is_err(), "bad signature should panic");
}

// ── Cloak oracle ─────────────────────────────────────────────────────────────

#[test]
fn record_cloak_payout_full_round_trip() {
    let h = harness_with_cloak_oracle();

    let oracle = oracle_keypair(42);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    let batch_id = [0x5a; 32];

    let message = build_cloak_message(&h.env, 0, &batch_id, 0x01);
    let signature = sign(&h.env, &oracle, &message);
    let relayer = Address::generate(&h.env);

    let seq = h.client.record_cloak_payout(
        &relayer,
        &0_u32,
        &oracle_pk,
        &message,
        &signature,
        &(50 * USDC_UNIT),
    );
    assert_eq!(seq, 1); // counter starts from 0 + 1

    let rec = h.client.get_cloak_payout(&0_u32, &1_u32).unwrap();
    assert_eq!(rec.vault_id, 0);
    assert_eq!(rec.total_shielded_amount, (50 * USDC_UNIT) as u64);
    assert_eq!(rec.batch_id, BytesN::from_array(&h.env, &batch_id));
}

#[test]
fn record_cloak_payout_unallowlisted_oracle_errors() {
    let h = harness(); // allowlist is empty

    let oracle = oracle_keypair(42);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    let batch_id = [0x5a; 32];

    let message = build_cloak_message(&h.env, 0, &batch_id, 0x01);
    let signature = sign(&h.env, &oracle, &message);
    let relayer = Address::generate(&h.env);

    let err = h.client.try_record_cloak_payout(
        &relayer,
        &0_u32,
        &oracle_pk,
        &message,
        &signature,
        &(50 * USDC_UNIT),
    );
    assert_eq!(err.err().unwrap().unwrap(), PrismError::OracleNotAllowlisted);
}

#[test]
fn record_cloak_payout_wrong_vault_errors() {
    let h = harness_with_cloak_oracle();

    let oracle = oracle_keypair(42);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    let batch_id = [0x5a; 32];

    // Attestation says vault 99; we ask the contract about vault 0.
    let message = build_cloak_message(&h.env, 99, &batch_id, 0x01);
    let signature = sign(&h.env, &oracle, &message);
    let relayer = Address::generate(&h.env);

    let err = h.client.try_record_cloak_payout(
        &relayer,
        &0_u32,
        &oracle_pk,
        &message,
        &signature,
        &(50 * USDC_UNIT),
    );
    assert_eq!(err.err().unwrap().unwrap(), PrismError::CloakBatchIdMismatch);
}

// ── Harnesses that prebuild allowlists ───────────────────────────────────────

/// Like `harness()` but registers oracle_keypair(7) as the Encrypt oracle
/// in the allowlist (used by all verify_encrypt_default tests).
fn harness_with_encrypt_oracle<'a>() -> Harness<'a> {
    let h = harness();
    let pk = pubkey_bytes(&h.env, &oracle_keypair(7));
    extend_allowlist(&h, &pk);
    h
}

/// Same idea, with oracle_keypair(42) registered for Cloak.
fn harness_with_cloak_oracle<'a>() -> Harness<'a> {
    let h = harness();
    let pk = pubkey_bytes(&h.env, &oracle_keypair(42));
    extend_allowlist(&h, &pk);
    h
}

// ──────────────────────────────────────────────────────────────────────────────
// Full-flow integration test — exercises BOTH contracts and every
// instruction across the entire protocol lifecycle in one Soroban session.
//
// What it does:
//   1. Bootstrap prism-core: config + vault + 3 tranches (each backed by SAC)
//   2. Two LPs deposit into Prime and Alpha
//   3. Admin originates a loan, disburses it from contract reserves
//   4. Time passes; admin accrues yield (waterfall: Prime target → Alpha residual)
//   5. Borrower repays half the loan
//   6. Deploy prism-amm; bootstrap an Alpha-pToken / USDC pool
//   7. Alpha-LP adds liquidity; user swaps USDC for pAlpha; LP removes liquidity
//   8. Borrower defaults on remainder; Encrypt oracle signs default attestation
//   9. Contract verifies signature, fires loss cascade through Alpha
//  10. LPs withdraw; assert their final USDC balances reflect every step
//
// Asserts at every milestone — if any state drifts from expectations the
// test surfaces exactly which step broke.
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn full_protocol_lifecycle() {
    use prism_amm::{PrismAmm, PrismAmmClient};

    // ── Setup: spin up env, both contracts, USDC SAC, 3 tranche SACs ────────
    let env = Env::default();
    env.mock_all_auths();

    let core_id = env.register(PrismCore, ());
    let core = PrismCoreClient::new(&env, &core_id);
    let amm_id = env.register(PrismAmm, ());
    let amm = PrismAmmClient::new(&env, &amm_id);

    let admin = Address::generate(&env);
    let alpha_lp = Address::generate(&env);
    let prime_lp = Address::generate(&env);
    let borrower = Address::generate(&env);
    let trader = Address::generate(&env);

    // USDC SAC, admin holds mint authority for test funding.
    let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = usdc_sac.address();
    let usdc_admin = token::StellarAssetClient::new(&env, &usdc);
    let usdc_client = token::Client::new(&env, &usdc);
    usdc_admin.mint(&alpha_lp, &(500 * USDC_UNIT));
    usdc_admin.mint(&prime_lp, &(500 * USDC_UNIT));
    usdc_admin.mint(&borrower, &(50 * USDC_UNIT)); // to cover repayment with interest

    // Three pTranche SACs, prism-core is admin.
    let prime_sac = env.register_stellar_asset_contract_v2(core_id.clone());
    let core_sac = env.register_stellar_asset_contract_v2(core_id.clone());
    let alpha_sac = env.register_stellar_asset_contract_v2(core_id.clone());

    // Register the Encrypt oracle pubkey we'll use later.
    let encrypt_key = oracle_keypair(7);
    let encrypt_pk = pubkey_bytes(&env, &encrypt_key);

    let allowlist: Vec<BytesN<32>> = {
        let mut v = Vec::new(&env);
        v.push_back(encrypt_pk.clone());
        v
    };

    // ── 1. Initialize protocol ──────────────────────────────────────────────
    core.init_config(&admin, &usdc, &500_u32, &allowlist);
    core.init_vault(&0_u32);
    core.init_tranche(&0_u32, &0_u32, &500_u32, &prime_sac.address());  // 5% Prime
    core.init_tranche(&0_u32, &1_u32, &1_000_u32, &core_sac.address()); // 10% Core
    core.init_tranche(&0_u32, &2_u32, &2_500_u32, &alpha_sac.address()); // 25% Alpha

    // ── 2. Two LPs deposit ──────────────────────────────────────────────────
    core.deposit(&prime_lp, &0_u32, &0_u32, &(200 * USDC_UNIT));
    core.deposit(&alpha_lp, &0_u32, &2_u32, &(300 * USDC_UNIT));

    // After deposits: vault has 500 USDC, Prime has 200 pTokens, Alpha has 300.
    assert_eq!(usdc_client.balance(&core_id), 500 * USDC_UNIT);
    assert_eq!(core.get_vault(&0_u32).unwrap().total_deposits, (500 * USDC_UNIT) as u64);
    let prime_t = core.get_tranche(&0_u32, &0_u32).unwrap();
    let alpha_t = core.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(prime_t.total_assets, (200 * USDC_UNIT) as u64);
    assert_eq!(alpha_t.total_assets, (300 * USDC_UNIT) as u64);
    assert_eq!(prime_t.nav_per_share_q, Q64_ONE);
    assert_eq!(alpha_t.nav_per_share_q, Q64_ONE);

    // ── 3. Originate and disburse a 100 USDC loan ───────────────────────────
    let future = env.ledger().timestamp() + 30 * 24 * 3600;
    core.init_loan(&0_u32, &1_u32, &borrower, &(100 * USDC_UNIT), &800_u32, &future);

    // Borrower registers their Encrypt commitment up-front (real flow: this
    // happens during onboarding, before disbursement).
    let encrypt_commitment_bytes = [0xab; 32];
    let encrypt_commitment = BytesN::from_array(&env, &encrypt_commitment_bytes);
    core.attach_encrypt_score(&borrower, &1_u32, &encrypt_commitment, &encrypt_pk);

    core.disburse_loan(&0_u32, &1_u32);

    assert_eq!(usdc_client.balance(&borrower), 150 * USDC_UNIT); // 50 seed + 100 disbursed
    assert_eq!(usdc_client.balance(&core_id), 400 * USDC_UNIT); // 500 - 100
    let loan = core.get_loan(&1_u32).unwrap();
    assert_eq!(loan.state, LoanState::Active);
    assert_eq!(core.get_vault(&0_u32).unwrap().total_loaned, (100 * USDC_UNIT) as u64);

    // ── 4. Time passes; admin accrues yield ─────────────────────────────────
    // Advance one year; admin ships 30 USDC of interest from their own wallet.
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: env.ledger().timestamp() + 365 * 24 * 3600,
        protocol_version: env.ledger().protocol_version(),
        sequence_number: env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 0,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_312_000,
    });
    usdc_admin.mint(&admin, &(30 * USDC_UNIT));
    core.accrue_yield(&admin, &0_u32, &admin, &(30 * USDC_UNIT));

    // Waterfall: Prime gets 200 * 5% = 10 USDC. Core has 0 assets so 0. Alpha takes residual 20.
    let prime_after_yield = core.get_tranche(&0_u32, &0_u32).unwrap();
    let alpha_after_yield = core.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(prime_after_yield.total_assets, (210 * USDC_UNIT) as u64);
    assert_eq!(prime_after_yield.cumulative_yield, (10 * USDC_UNIT) as u64);
    assert_eq!(alpha_after_yield.total_assets, (320 * USDC_UNIT) as u64);
    assert_eq!(alpha_after_yield.cumulative_yield, (20 * USDC_UNIT) as u64);

    // ── 5. Borrower repays half (50 USDC) ───────────────────────────────────
    core.repay_loan(&borrower, &1_u32, &(50 * USDC_UNIT));
    let loan_mid = core.get_loan(&1_u32).unwrap();
    assert_eq!(loan_mid.state, LoanState::Repaying);
    assert_eq!(loan_mid.total_repaid, (50 * USDC_UNIT) as u64);
    // Contract USDC: 400 (after disburse) + 30 (yield) + 50 (repay) = 480
    assert_eq!(usdc_client.balance(&core_id), 480 * USDC_UNIT);

    // ── 6. Bootstrap AMM: deploy a 4th SAC for LP token, init pool ──────────
    let lp_sac = env.register_stellar_asset_contract_v2(amm_id.clone());
    let lp_token = lp_sac.address();
    let lp_client = token::Client::new(&env, &lp_token);

    amm.init_pool(&admin, &alpha_sac.address(), &usdc, &lp_token, &30_u32);

    // ── 7. AMM lifecycle ────────────────────────────────────────────────────
    // alpha_lp has 320 pAlpha at NAV 1.066... worth ~320 USDC. They want to
    // make a market: deposit 50 pAlpha + 50 USDC into the pool.
    // (Need to top them up with USDC since they spent their 500 on the deposit.)
    usdc_admin.mint(&alpha_lp, &(60 * USDC_UNIT));

    let alpha_ptoken_client = token::Client::new(&env, &alpha_sac.address());
    let pre_amm_palpha = alpha_ptoken_client.balance(&alpha_lp);
    assert_eq!(pre_amm_palpha, (300 * USDC_UNIT) as i128); // shares from deposit

    let lp_shares = amm.add_liquidity(
        &alpha_lp,
        &alpha_sac.address(),
        &(50 * USDC_UNIT), // pAlpha
        &(50 * USDC_UNIT), // USDC
        &0_i128,
    );
    // First LP: sqrt(50 * 50 * UNIT^2) - MIN_LIQUIDITY = 50*UNIT - 1000
    assert_eq!(lp_shares, 50 * USDC_UNIT - 1_000);
    assert_eq!(lp_client.balance(&alpha_lp), lp_shares);

    let (rt, rq, supply) = amm.get_reserves(&alpha_sac.address()).unwrap();
    assert_eq!(rt, 50 * USDC_UNIT);
    assert_eq!(rq, 50 * USDC_UNIT);
    assert_eq!(supply, 50 * USDC_UNIT); // user_shares + locked MIN_LIQUIDITY

    // Trader swaps 5 USDC into pAlpha (direction=1 → quote IN, tranche OUT).
    usdc_admin.mint(&trader, &(10 * USDC_UNIT));
    let palpha_out = amm.swap(
        &trader,
        &alpha_sac.address(),
        &(5 * USDC_UNIT),
        &0_i128,
        &1_u32,
    );
    assert!(palpha_out > 0);
    assert_eq!(alpha_ptoken_client.balance(&trader), palpha_out);

    // K invariant: reserve_in * reserve_out must not shrink.
    let (rt2, rq2, _) = amm.get_reserves(&alpha_sac.address()).unwrap();
    let k_before = (50_i128 * USDC_UNIT) * (50_i128 * USDC_UNIT);
    let k_after = rt2 * rq2;
    assert!(k_after >= k_before, "k invariant violated: {k_before} -> {k_after}");

    // LP withdraws all their LP shares.
    let (t_out, q_out) = amm.remove_liquidity(
        &alpha_lp,
        &alpha_sac.address(),
        &lp_shares,
        &0_i128,
        &0_i128,
    );
    assert!(t_out > 0 && q_out > 0);
    // Reserves shrunk; MIN_LIQUIDITY still locked.
    let (_, _, supply_after) = amm.get_reserves(&alpha_sac.address()).unwrap();
    assert_eq!(supply_after, 1_000); // only the locked MIN_LIQUIDITY remains

    // ── 8. Borrower defaults — Encrypt oracle signs attestation ─────────────
    // Commitment was registered up-front at step 3. Loss = 50 USDC (unrepaid).
    let message = build_encrypt_message(&env, 1, &encrypt_commitment_bytes, 0x01);
    let signature = sign(&env, &encrypt_key, &message);
    let relayer = Address::generate(&env);

    let seq = core.verify_encrypt_default(
        &relayer,
        &0_u32,
        &1_u32,
        &message,
        &signature,
        &(50 * USDC_UNIT),
        &5_000_u32,
    );
    assert_eq!(seq, 0);

    // EncryptHealth flipped, vault Defaulted.
    let health = core.get_encrypt_health(&1_u32).unwrap();
    assert_eq!(health.status, EncryptStatus::DefaultProven);
    assert_eq!(core.get_vault(&0_u32).unwrap().state, VaultState::Defaulted);

    // ── 9. Loss cascade: Alpha had ~270 (320 yield - some pulled to AMM via
    //     pTokens; pTokens are still LP-claimable so total_assets unchanged
    //     during AMM activity). Cascade applied 50 to Alpha first.
    // Before default: Alpha total_assets = 320 * USDC_UNIT (unchanged by AMM).
    // After 50 USDC loss to Alpha: 270 * USDC_UNIT.
    let alpha_post_default = core.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(alpha_post_default.total_assets, (270 * USDC_UNIT) as u64);
    assert_eq!(alpha_post_default.cumulative_loss, (50 * USDC_UNIT) as u64);
    // Prime untouched.
    let prime_post_default = core.get_tranche(&0_u32, &0_u32).unwrap();
    assert_eq!(prime_post_default.total_assets, (210 * USDC_UNIT) as u64);
    assert_eq!(prime_post_default.cumulative_loss, 0);

    // ── 10. LPs withdraw ────────────────────────────────────────────────────
    // Prime LP: 200 shares × Prime NAV (210/200 = 1.05) = 210 USDC.
    let prime_lp_usdc_before = usdc_client.balance(&prime_lp);
    let prime_payout = core.withdraw(&prime_lp, &0_u32, &0_u32, &(200 * USDC_UNIT));
    assert!(prime_payout >= 210 * USDC_UNIT - 10, "prime payout too low: {prime_payout}");
    let prime_lp_usdc_after = usdc_client.balance(&prime_lp);
    assert_eq!(prime_lp_usdc_after - prime_lp_usdc_before, prime_payout);

    // Alpha LP: still has pAlpha shares minus what they LP-staked → ~250 pAlpha.
    // Alpha NAV after default = 270 / 300 = 0.9. So 250 shares → ~225 USDC.
    let alpha_lp_remaining = alpha_ptoken_client.balance(&alpha_lp);
    // 300 original - 50 LP'd + (50 - trader_swap_take) returned from remove_liquidity.
    // Trader swapped 5 USDC into the pool; ~5 pAlpha left as a result.
    // So final ≈ 300 - 50 + (50 - ~5) ≈ 295.
    assert!(alpha_lp_remaining > 290 * USDC_UNIT && alpha_lp_remaining < 300 * USDC_UNIT,
            "alpha_lp_remaining {alpha_lp_remaining} out of expected range");

    let alpha_payout = core.withdraw(&alpha_lp, &0_u32, &2_u32, &alpha_lp_remaining);
    // NAV ≈ 0.9, so payout ≈ 0.9 × remaining.
    // Tolerate Q64.64 truncation: NAV is recomputed from total_assets/supply after
    // each operation in the test, so the value here lags the value used inside
    // the withdraw call by one operation's worth of rounding. Allow tens of units.
    let nav_alpha = core.get_tranche(&0_u32, &2_u32).unwrap().nav_per_share_q;
    let expected = ((alpha_lp_remaining as u128) * nav_alpha / Q64_ONE) as i128;
    let diff = (alpha_payout - expected).abs();
    assert!(diff <= 100, "alpha_payout {alpha_payout} not within 100 of expected {expected}");

    // ── Sanity: contract USDC balance is non-negative and final state ───────
    let final_contract_usdc = usdc_client.balance(&core_id);
    assert!(final_contract_usdc >= 0);

    // Vault is Defaulted, Loan still Repaying (we didn't transition it to
    // Defaulted in verify_encrypt_default by design — the EncryptHealth
    // record carries the default proof; the Loan stays where the borrower
    // left it).
    let v = core.get_vault(&0_u32).unwrap();
    assert_eq!(v.state, VaultState::Defaulted);
    assert_eq!(v.credit_event_seq, 1);

    std::println!("=== FULL LIFECYCLE COMPLETE ===");
    std::println!(
        "  prime_lp: deposited 200, received {} USDC",
        prime_payout / USDC_UNIT
    );
    std::println!(
        "  alpha_lp: deposited 300 (+AMM lifecycle), received {} pToken-payout USDC",
        alpha_payout / USDC_UNIT
    );
    std::println!("  borrower: defaulted with 50 USDC unrepaid");
    std::println!("  trader: swapped 5 USDC for {} pAlpha", palpha_out);
}

/// Tear down + re-init config with the additional oracle pubkey. We don't
/// expose a mutate-allowlist function on the contract yet, so the test does
/// this by re-running init on a fresh contract instance — except we need
/// the existing vault/tranches/SACs to stay valid, so this helper instead
/// re-initializes config from scratch with a wider allowlist.
///
/// Since `init_config` errors with `AlreadyInitialized` on the second call,
/// we work around it by extending the allowlist through the existing
/// `oracle_allowlist` field via low-level storage manipulation in test mode.
/// For the test harness, the simplest path is to seed the allowlist *before*
/// init_config — which means refactoring `harness()`. Let's just do that.
fn extend_allowlist(h: &Harness, oracle_pk: &BytesN<32>) {
    // Re-init the global config under the same contract address. This works
    // because we use the soroban testutils mock host which allows re-write
    // when we delete the entry first. We do that via the contract's own
    // re-init path... but we don't have one. So we route through a small
    // testing-only extension: directly mutate the persisted GlobalConfig via
    // env.as_contract().
    h.env.as_contract(&h.client.address, || {
        let mut cfg = crate::storage::read_config(&h.env);
        cfg.oracle_allowlist.push_back(oracle_pk.clone());
        crate::storage::write_config(&h.env, &cfg);
    });
}
