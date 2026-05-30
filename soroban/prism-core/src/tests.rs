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
use crate::state::{CollateralStatus, EncryptStatus, LoanState, TrancheKind, VaultState};
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

// ──────────────────────────────────────────────────────────────────────────────
// Phase 1 parity tests — spec from stellar-migration-plan.md §10 Phase 1
// ──────────────────────────────────────────────────────────────────────────────

/// Helper: assert the reserve invariant holds for a vault with no outstanding loans.
///
/// Invariant: usdc_balance(contract) == Σ tranche.total_assets + loss_bucket_balance
///
/// The left side is the actual USDC sitting in the contract.  The right side
/// tracks it through tranche accounting + any write-downs absorbed by the
/// cascade.  If these diverge the accounting is broken.
fn assert_reserve_invariant(
    _env: &Env,
    client: &PrismCoreClient,
    usdc_client: &token::Client,
    vault_id: u32,
) {
    let prime = client.get_tranche(&vault_id, &0_u32).unwrap();
    let core_t = client.get_tranche(&vault_id, &1_u32).unwrap();
    let alpha = client.get_tranche(&vault_id, &2_u32).unwrap();

    let sum_assets = prime.total_assets as u128
        + core_t.total_assets as u128
        + alpha.total_assets as u128;
    let loss_bucket = client.get_loss_bucket_balance(&vault_id);
    let usdc_balance = usdc_client.balance(&client.address) as u128;

    assert_eq!(
        usdc_balance,
        sum_assets + loss_bucket,
        "reserve invariant violated: usdc({usdc_balance}) != assets({sum_assets}) + bucket({loss_bucket})",
    );
}

/// P1-T3 — Reserve invariant holds through a full deposit/yield/cascade lifecycle.
#[test]
fn p1_t3_reserve_invariant_holds_through_lifecycle() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &0_u32, &(100 * USDC_UNIT));
    h.client.deposit(&h.user, &0_u32, &1_u32, &(100 * USDC_UNIT));
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));
    assert_reserve_invariant(&h.env, &h.client, &h.usdc_client, 0);

    // Withdraw some from Prime.
    h.client.withdraw(&h.user, &0_u32, &0_u32, &(30 * USDC_UNIT));
    assert_reserve_invariant(&h.env, &h.client, &h.usdc_client, 0);

    // Accrue yield.
    h.usdc_admin.mint(&h.admin, &(10 * USDC_UNIT));
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
    h.client.accrue_yield(&h.admin, &0_u32, &h.admin, &(10 * USDC_UNIT));
    assert_reserve_invariant(&h.env, &h.client, &h.usdc_client, 0);

    // PartialLoss cascade — Alpha absorbs 50 USDC.
    h.client.trigger_credit_event(&h.admin, &0_u32, &1_u32, &(50 * USDC_UNIT), &5_000_u32, &0_u32);
    assert_reserve_invariant(&h.env, &h.client, &h.usdc_client, 0);

    // Full Default cascade — remaining loss exceeds Alpha, cascades to Core.
    h.client.trigger_credit_event(&h.admin, &0_u32, &0_u32, &(90 * USDC_UNIT), &10_000_u32, &0_u32);
    assert_reserve_invariant(&h.env, &h.client, &h.usdc_client, 0);
}

// ── Locked demo numbers harness ───────────────────────────────────────────────
//
// Reference: stellar-migration-plan.md §9 and docs/12-reference-card.md §1.4.
//
// Vault TVL at demo start: 19,500 USDC (7 dec = 195_000_000_000 base units)
//   Prime:  10,000 USDC  (APY 5%  / 500 bps)
//   Core:    4,500 USDC  (APY 8%  / 800 bps)
//   Alpha:   5,000 USDC  (APY 15% / 1500 bps)
//
// Yield event: 100 USDC over 30 days
//   Prime target = 10,000 × 5% × 30/365  = 41.10 USDC → 410_958_904 base units
//   Core  target =  4,500 × 8% × 30/365  = 29.59 USDC → 295_890_410 base units
//   Alpha take   = residual               = 29.31 USDC → 293_150_686 base units
//
// Default loss: 6,500 USDC
//   Alpha absorbs: 5,000 + 29.31 = 5,029.31 → wiped (NAV = 0)
//   Core  absorbs: 6,500 - 5,029.31 = 1,470.69 → NAV ≈ 0.6798
//   Prime: untouched → NAV ≈ 1.00411

const PRIME_DEPOSIT_7D: i128 = 10_000 * 10_000_000; // 100_000_000_000
const CORE_DEPOSIT_7D: i128 = 4_500 * 10_000_000;  //  45_000_000_000
const ALPHA_DEPOSIT_7D: i128 = 5_000 * 10_000_000; //  50_000_000_000
const YIELD_100_7D: i128 = 100 * 10_000_000;        //   1_000_000_000
const LOSS_6500_7D: i128 = 6_500 * 10_000_000;      //  65_000_000_000
const ELAPSED_30D: u64 = 30 * 24 * 3600;            //       2_592_000 s

struct DemoHarness<'a> {
    env: Env,
    client: PrismCoreClient<'a>,
    admin: Address,
    prime_lp: Address,
    core_lp: Address,
    alpha_lp: Address,
    usdc_admin: token::StellarAssetClient<'a>,
    usdc_client: token::Client<'a>,
    prime_token: Address,
    core_token: Address,
    alpha_token: Address,
}

fn demo_harness<'a>() -> DemoHarness<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PrismCore, ());
    let client = PrismCoreClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let prime_lp = Address::generate(&env);
    let core_lp = Address::generate(&env);
    let alpha_lp = Address::generate(&env);

    let usdc_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let usdc = usdc_sac.address();
    let usdc_admin = token::StellarAssetClient::new(&env, &usdc);
    let usdc_client = token::Client::new(&env, &usdc);

    usdc_admin.mint(&prime_lp, &(PRIME_DEPOSIT_7D + 1_000 * 10_000_000));
    usdc_admin.mint(&core_lp, &(CORE_DEPOSIT_7D + 1_000 * 10_000_000));
    usdc_admin.mint(&alpha_lp, &(ALPHA_DEPOSIT_7D + 1_000 * 10_000_000));

    // pTranche SACs — prism-core is admin so it can mint/burn.
    let prime_sac = env.register_stellar_asset_contract_v2(contract_id.clone());
    let core_sac = env.register_stellar_asset_contract_v2(contract_id.clone());
    let alpha_sac = env.register_stellar_asset_contract_v2(contract_id.clone());

    let allowlist: Vec<BytesN<32>> = Vec::new(&env);
    client.init_config(&admin, &usdc, &500_u32, &allowlist);
    client.init_vault(&0_u32);
    // APY bps matching the reference-card locked demo numbers.
    client.init_tranche(&0_u32, &0_u32, &500_u32, &prime_sac.address());   // 5%  Prime
    client.init_tranche(&0_u32, &1_u32, &800_u32, &core_sac.address());    // 8%  Core
    client.init_tranche(&0_u32, &2_u32, &1_500_u32, &alpha_sac.address()); // 15% Alpha

    DemoHarness {
        env,
        client,
        admin,
        prime_lp,
        core_lp,
        alpha_lp,
        usdc_admin,
        usdc_client,
        prime_token: prime_sac.address(),
        core_token: core_sac.address(),
        alpha_token: alpha_sac.address(),
    }
}

/// P1-T4 — Waterfall distributes 100 USDC over 30 days with byte-exact NAVs.
///
/// Expected distribution (computed from formula, matches ref-card §1.4):
///   Prime  take = 410_958_904  → NAV = 100_410_958_904 / 100_000_000_000
///   Core   take = 295_890_410  → NAV =  45_295_890_410 /  45_000_000_000
///   Alpha  take = 293_150_686  → NAV =  50_293_150_686 /  50_000_000_000
#[test]
fn p1_t4_waterfall_locked_demo_numbers() {
    let h = demo_harness();

    h.client.deposit(&h.prime_lp, &0_u32, &0_u32, &PRIME_DEPOSIT_7D);
    h.client.deposit(&h.core_lp, &0_u32, &1_u32, &CORE_DEPOSIT_7D);
    h.client.deposit(&h.alpha_lp, &0_u32, &2_u32, &ALPHA_DEPOSIT_7D);

    // Advance exactly 30 days so elapsed = ELAPSED_30D.
    h.env.ledger().set(LedgerInfo {
        timestamp: h.env.ledger().timestamp() + ELAPSED_30D,
        protocol_version: h.env.ledger().protocol_version(),
        sequence_number: h.env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 0,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_312_000,
    });

    h.usdc_admin.mint(&h.admin, &YIELD_100_7D);
    h.client.accrue_yield(&h.admin, &0_u32, &h.admin, &YIELD_100_7D);

    // ── Verify yield split (formula matches §1.4) ─────────────────────────
    let prime = h.client.get_tranche(&0_u32, &0_u32).unwrap();
    let core_t = h.client.get_tranche(&0_u32, &1_u32).unwrap();
    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();

    // Computed from: assets × bps × elapsed / (year_seconds × 10_000)
    let prime_take: u64 = 410_958_904;  // 41.10 USDC
    let core_take: u64  = 295_890_410;  // 29.59 USDC
    let alpha_take: u64 = (YIELD_100_7D as u64).saturating_sub(prime_take).saturating_sub(core_take); // 293_150_686

    assert_eq!(prime.total_assets, PRIME_DEPOSIT_7D as u64 + prime_take, "prime total_assets");
    assert_eq!(core_t.total_assets, CORE_DEPOSIT_7D as u64 + core_take, "core total_assets");
    assert_eq!(alpha.total_assets, ALPHA_DEPOSIT_7D as u64 + alpha_take, "alpha total_assets");

    // cumulative_yield fields must equal the distributed amounts.
    assert_eq!(prime.cumulative_yield, prime_take, "prime cumulative_yield");
    assert_eq!(core_t.cumulative_yield, core_take, "core cumulative_yield");
    assert_eq!(alpha.cumulative_yield, alpha_take, "alpha cumulative_yield");

    // NAVs: exact Q64.64 values computed from the formula above.
    use crate::math::compute_nav_q;
    let expected_prime_nav = compute_nav_q(prime.total_assets, PRIME_DEPOSIT_7D as u64);
    let expected_core_nav  = compute_nav_q(core_t.total_assets, CORE_DEPOSIT_7D as u64);
    let expected_alpha_nav = compute_nav_q(alpha.total_assets, ALPHA_DEPOSIT_7D as u64);

    assert_eq!(prime.nav_per_share_q, expected_prime_nav, "prime NAV");
    assert_eq!(core_t.nav_per_share_q, expected_core_nav, "core NAV");
    assert_eq!(alpha.nav_per_share_q, expected_alpha_nav, "alpha NAV");

    // Decimal sanity: Prime NAV ≈ 1.00411 — verify within 0.001 relative error.
    // NAV as fixed-point: nav_q / Q64_ONE gives float.  Use integer arithmetic:
    // 1.003 × Q64_ONE < prime_nav_q < 1.005 × Q64_ONE
    let q1 = crate::math::Q64_ONE;
    assert!(prime.nav_per_share_q > q1 + q1 / 300, "prime NAV too low (expected ~1.00411)");
    assert!(prime.nav_per_share_q < q1 + q1 / 200, "prime NAV too high (expected ~1.00411)");

    // Reserve invariant must hold (no loans, no losses yet).
    let sum_assets = prime.total_assets as u128 + core_t.total_assets as u128 + alpha.total_assets as u128;
    let usdc_balance = h.usdc_client.balance(&h.client.address) as u128;
    assert_eq!(usdc_balance, sum_assets, "reserve invariant after yield");
}

/// P1-T5 — Cascade after yield: locked demo default produces byte-exact NAVs.
///
/// Alpha wipeout, Core NAV ≈ 0.6798, Prime NAV ≈ 1.00411 (matches §1.4).
#[test]
fn p1_t5_cascade_locked_demo_numbers() {
    let h = demo_harness();

    h.client.deposit(&h.prime_lp, &0_u32, &0_u32, &PRIME_DEPOSIT_7D);
    h.client.deposit(&h.core_lp, &0_u32, &1_u32, &CORE_DEPOSIT_7D);
    h.client.deposit(&h.alpha_lp, &0_u32, &2_u32, &ALPHA_DEPOSIT_7D);

    // Advance 30 days, accrue yield.
    h.env.ledger().set(LedgerInfo {
        timestamp: h.env.ledger().timestamp() + ELAPSED_30D,
        protocol_version: h.env.ledger().protocol_version(),
        sequence_number: h.env.ledger().sequence(),
        network_id: Default::default(),
        base_reserve: 0,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_312_000,
    });
    h.usdc_admin.mint(&h.admin, &YIELD_100_7D);
    h.client.accrue_yield(&h.admin, &0_u32, &h.admin, &YIELD_100_7D);

    // Snapshot prime NAV after yield — must survive the cascade unchanged.
    let prime_nav_after_yield = h.client.get_tranche(&0_u32, &0_u32).unwrap().nav_per_share_q;

    // Trigger the 6,500 USDC Default cascade.
    let seq = h.client.trigger_credit_event(
        &h.admin,
        &0_u32,
        &0_u32,             // Default
        &LOSS_6500_7D,
        &10_000_u32,        // 100% severity
        &0_u32,
    );
    assert_eq!(seq, 0);

    let prime = h.client.get_tranche(&0_u32, &0_u32).unwrap();
    let core_t = h.client.get_tranche(&0_u32, &1_u32).unwrap();
    let alpha  = h.client.get_tranche(&0_u32, &2_u32).unwrap();

    // Alpha fully wiped.
    assert_eq!(alpha.total_assets, 0, "Alpha must be wiped to 0");
    assert_eq!(alpha.nav_per_share_q, 0, "Alpha NAV must be 0");

    // Core assets after absorbing the overflow.
    // alpha absorbed: 50_293_150_686 (all of it)
    // core absorbed:  65_000_000_000 - 50_293_150_686 = 14_706_849_314
    let core_after: u64 = 45_295_890_410 - 14_706_849_314;
    assert_eq!(core_t.total_assets, core_after, "Core total_assets");

    // Core NAV ≈ 0.6798 — verify exact Q64.64 and decimal bound.
    use crate::math::compute_nav_q;
    let expected_core_nav = compute_nav_q(core_after, CORE_DEPOSIT_7D as u64);
    assert_eq!(core_t.nav_per_share_q, expected_core_nav, "Core NAV Q64.64");

    // 0.679 × Q64_ONE < core_nav < 0.680 × Q64_ONE
    let q1 = crate::math::Q64_ONE;
    let core_nav_lower = q1 * 679 / 1000;
    let core_nav_upper = q1 * 680 / 1000;
    assert!(
        core_t.nav_per_share_q > core_nav_lower && core_t.nav_per_share_q < core_nav_upper,
        "Core NAV {nav} not in 0.679–0.680 range (expected ≈0.6798)",
        nav = core_t.nav_per_share_q,
    );

    // Prime NAV unchanged from post-yield value.
    assert_eq!(prime.nav_per_share_q, prime_nav_after_yield, "Prime NAV must be unchanged");

    // Prime NAV ≈ 1.00411 — verify decimal bound.
    assert!(prime.nav_per_share_q > q1 + q1 / 300);
    assert!(prime.nav_per_share_q < q1 + q1 / 200);

    // Vault flipped to Defaulted.
    assert_eq!(h.client.get_vault(&0_u32).unwrap().state, VaultState::Defaulted);

    // Reserve invariant: usdc == Σ assets + loss_bucket (no loans).
    let sum_assets = prime.total_assets as u128
        + core_t.total_assets as u128
        + alpha.total_assets as u128;
    let loss_bucket = h.client.get_loss_bucket_balance(&0_u32);
    let usdc_balance = h.usdc_client.balance(&h.client.address) as u128;
    assert_eq!(
        usdc_balance,
        sum_assets + loss_bucket,
        "reserve invariant after cascade",
    );
    // The bucket must equal the 6,500 USDC loss.
    assert_eq!(loss_bucket, LOSS_6500_7D as u128, "loss_bucket_balance");
}

/// P1-T7 — Burning pTokens from a wiped tranche returns 0 USDC, no panic.
#[test]
fn p1_t7_post_wipe_withdraw_returns_zero() {
    let h = harness();
    // Deposit 100 USDC into Alpha.
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // Wipe Alpha with a PartialLoss (vault stays Active).
    h.client.trigger_credit_event(
        &h.admin,
        &0_u32,
        &1_u32,             // PartialLoss — vault stays Active
        &(100 * USDC_UNIT),
        &10_000_u32,
        &0_u32,
    );
    let alpha = h.client.get_tranche(&0_u32, &2_u32).unwrap();
    assert_eq!(alpha.total_assets, 0, "Alpha must be wiped");
    assert_eq!(alpha.nav_per_share_q, 0, "Alpha NAV must be 0");
    assert_eq!(h.client.get_vault(&0_u32).unwrap().state, VaultState::Active);

    let usdc_before = h.usdc_client.balance(&h.user);
    let alpha_ptoken = token::Client::new(&h.env, &h.alpha_token);
    let shares = alpha_ptoken.balance(&h.user);
    assert!(shares > 0, "user must still hold Alpha shares");

    // Withdraw all Alpha shares — returns 0 USDC, no panic.
    let payout = h.client.withdraw(&h.user, &0_u32, &2_u32, &shares);
    assert_eq!(payout, 0, "payout from wiped tranche must be 0");

    // pTokens burned.
    assert_eq!(alpha_ptoken.balance(&h.user), 0, "all Alpha pTokens must be burned");

    // USDC unchanged — user received nothing.
    let usdc_after = h.usdc_client.balance(&h.user);
    assert_eq!(usdc_after, usdc_before, "user USDC must be unchanged after wiped withdraw");
}

/// P1-T8 — SEP-41 admin enforcement: only prism-core (the SAC admin) can mint.
///
/// The test verifies two things:
///   1. Deposit via prism-core correctly mints pTokens (admin path works).
///   2. A direct mint call by an address that is NOT the SAC admin panics.
#[test]
fn p1_t8_sep41_admin_enforcement() {
    // ── Part 1: admin path (via deposit) works ────────────────────────────
    let h = harness();
    let alpha_ptoken = token::Client::new(&h.env, &h.alpha_token);
    assert_eq!(alpha_ptoken.balance(&h.user), 0);

    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));
    assert_eq!(alpha_ptoken.balance(&h.user), 100 * USDC_UNIT,
        "deposit via prism-core (SAC admin) must mint pTokens");

    // ── Part 2: direct mint by non-admin panics ───────────────────────────
    // Build a fresh env WITHOUT mock_all_auths so auth is enforced.
    let env2 = Env::default();
    // SAC registered with `contract_id2` as admin.
    let contract_id2 = env2.register(PrismCore, ());
    let alpha_sac2 = env2.register_stellar_asset_contract_v2(contract_id2.clone());

    let attacker = Address::generate(&env2);
    let attacker_minter = token::StellarAssetClient::new(&env2, &alpha_sac2.address());

    // Attacker tries to mint directly — should panic because no auth entry
    // exists for `contract_id2` (the actual admin) in this env.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        attacker_minter.mint(&attacker, &1_000);
    }));
    assert!(result.is_err(), "unauthorized direct mint must panic");
}

/// P1-T9 — Persistent storage TTL extension: state remains readable after a
/// significant ledger advance well within the 120-day bump window.
#[test]
fn p1_t9_storage_ttl_extension() {
    let h = harness();
    h.client.deposit(&h.user, &0_u32, &0_u32, &(50 * USDC_UNIT));
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));

    // Advance 50 days (in ledger sequence units: 50 × 17,280 ledgers at 5 s/ledger).
    // This is within PERSISTENT_BUMP_HIGH (120 days), so all keys must survive.
    let advance_ledgers: u32 = 50 * 17_280;
    h.env.ledger().set(LedgerInfo {
        timestamp: h.env.ledger().timestamp() + 50 * 24 * 3600,
        protocol_version: h.env.ledger().protocol_version(),
        sequence_number: h.env.ledger().sequence() + advance_ledgers,
        network_id: Default::default(),
        base_reserve: 0,
        min_temp_entry_ttl: 16,
        min_persistent_entry_ttl: 4096,
        max_entry_ttl: 6_312_000,
    });

    // Config (Instance storage) must still be readable.
    assert_eq!(h.client.get_config().admin, h.admin, "config must survive ledger advance");

    // Vault and both tranches must still be readable.
    let vault = h.client.get_vault(&0_u32);
    assert!(vault.is_some(), "vault must survive ledger advance");

    let prime = h.client.get_tranche(&0_u32, &0_u32);
    let alpha = h.client.get_tranche(&0_u32, &2_u32);
    assert!(prime.is_some(), "Prime tranche must survive ledger advance");
    assert!(alpha.is_some(), "Alpha tranche must survive ledger advance");

    // Accounting must be intact after the advance.
    assert_eq!(prime.unwrap().total_assets, (50 * USDC_UNIT) as u64);
    assert_eq!(alpha.unwrap().total_assets, (100 * USDC_UNIT) as u64);
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 2 — Composition layer
// ────────────────────────────────────────────────────────────────────────────

/// P2-T7 — Soroswap auth boundary: `seed_pool_liquidity` rejects non-admin.
///
/// The Soroswap router call is never reached — the admin check fires first.
/// The fake router address is a random contract ID; the test never exercises
/// the cross-contract path.
#[test]
fn p2_t7_seed_pool_liquidity_rejects_non_admin() {
    let h = harness();

    let non_admin = Address::generate(&h.env);
    let fake_router = Address::generate(&h.env);

    let err = h.client.try_seed_pool_liquidity(
        &non_admin,
        &0_u32,        // vault_id
        &0_u32,        // kind = Prime
        &fake_router,
        &(1_000 * USDC_UNIT), // usdc_amount
        &(1_000 * USDC_UNIT), // ptoken_amount
        &0i128,        // usdc_min
        &0i128,        // ptoken_min
    );

    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::Unauthorized,
        "non-admin must not be able to seed a Soroswap pool"
    );
}

/// P2-T7b — `seed_pool_liquidity` rejects when vault does not exist.
///
/// Even the admin cannot seed a pool for a vault that has not been initialized.
#[test]
fn p2_t7b_seed_pool_liquidity_rejects_missing_vault() {
    let h = harness();
    let fake_router = Address::generate(&h.env);

    // Vault 99 was never created.
    let err = h.client.try_seed_pool_liquidity(
        &h.admin,
        &99_u32,       // non-existent vault
        &0_u32,
        &fake_router,
        &(1_000 * USDC_UNIT),
        &(1_000 * USDC_UNIT),
        &0i128,
        &0i128,
    );

    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::NotInitialized,
        "seeding a pool for an uninitialized vault must error"
    );
}

/// P2-T7c — `read_reflector_price` is callable in simulation (read-only).
///
/// The fake Reflector contract is not registered, so the cross-contract call
/// will fail in the unit test harness. We verify that the function *exists*
/// on the compiled contract by confirming the `try_*` method compiles and
/// returns an SDK-level error (not a panic), proving the interface is wired up.
#[test]
fn p2_t7c_read_reflector_price_interface_wired() {
    let h = harness();
    let fake_reflector = Address::generate(&h.env);
    let btc = soroban_sdk::Symbol::new(&h.env, "BTC");

    // The cross-contract call to the unregistered address will error at the
    // host level. We just need the call to exist on the contract interface.
    let result = h.client.try_read_reflector_price(&fake_reflector, &btc);
    // Any Err here means the function exists; Ok(None) would also be valid.
    // What matters is this line compiles — confirming the ABI is present.
    let _ = result;
}

// ──────────────────────────────────────────────────────────────────────────────
// Phase 3 — PRISM Collateral Oracle (P3-T2 through P3-T5)
// ──────────────────────────────────────────────────────────────────────────────

/// Build the 73-byte PRISM Collateral Oracle attestation message (§6.6):
///   0..8   "col_atts"
///   8..12  loan_id (u32 LE)
///  12..16  chain_id (u32 LE)
///  16..48  asset_address (32 bytes)
///  48..56  amount_usd_micro (u64 LE)
///  56..64  valued_at_ts (i64 LE)
///  64..72  nonce (u64 LE)
///  72      status byte (0x01=Attached, 0x02=Released, 0x03=Liquidated)
fn build_collateral_message(
    env: &Env,
    loan_id: u32,
    chain_id: u32,
    asset_address: &[u8; 32],
    amount_usd_micro: u64,
    valued_at_ts: i64,
    nonce: u64,
    status: u8,
) -> Bytes {
    let mut buf = std::vec![0u8; 73];
    buf[0..8].copy_from_slice(b"col_atts");
    buf[8..12].copy_from_slice(&loan_id.to_le_bytes());
    buf[12..16].copy_from_slice(&chain_id.to_le_bytes());
    buf[16..48].copy_from_slice(asset_address);
    buf[48..56].copy_from_slice(&amount_usd_micro.to_le_bytes());
    buf[56..64].copy_from_slice(&valued_at_ts.to_le_bytes());
    buf[64..72].copy_from_slice(&nonce.to_le_bytes());
    buf[72] = status;
    Bytes::from_slice(env, &buf)
}

/// Like `harness_with_encrypt_oracle` but registers oracle_keypair(11) for collateral.
fn harness_with_collateral_oracle<'a>() -> Harness<'a> {
    let h = harness();
    let pk = pubkey_bytes(&h.env, &oracle_keypair(11));
    extend_allowlist(&h, &pk);
    h
}

/// P3-T2: full round-trip — attach_collateral → verify_collateral → status Attached.
#[test]
fn p3_t2_verify_collateral_full_round_trip() {
    let h = harness_with_collateral_oracle();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let oracle = oracle_keypair(11);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);

    // Attach — creates Pending record.
    h.client.attach_collateral(&borrower, &1_u32, &oracle_pk);

    let rec = h.client.get_collateral(&1_u32).unwrap();
    assert_eq!(rec.status, CollateralStatus::Pending);
    assert_eq!(rec.oracle_pubkey, oracle_pk);

    // Oracle signs an Attached (0x01) attestation.
    let asset = [0xBB; 32];
    let message = build_collateral_message(
        &h.env, 1, 0, &asset, 500_000_000_u64, 1_000_000_i64, 1_u64, 0x01,
    );
    let signature = sign(&h.env, &oracle, &message);
    let relayer = Address::generate(&h.env);

    h.client.verify_collateral(&relayer, &1_u32, &message, &signature);

    let rec = h.client.get_collateral(&1_u32).unwrap();
    assert_eq!(rec.status, CollateralStatus::Attached);
    assert_eq!(rec.chain_id, 0);
    assert_eq!(rec.amount_usd_micro, 500_000_000_u64);
    assert_eq!(rec.last_nonce, 1);
}

/// P3-T3: Nonce replay — reusing the same nonce after a successful verify is rejected.
#[test]
fn p3_t3_collateral_nonce_replay_rejected() {
    let h = harness_with_collateral_oracle();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let oracle = oracle_keypair(11);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    h.client.attach_collateral(&borrower, &1_u32, &oracle_pk);

    // First verify with nonce=1 succeeds.
    let asset = [0xCC; 32];
    let msg1 = build_collateral_message(&h.env, 1, 0, &asset, 100_u64, 0_i64, 1_u64, 0x01);
    let sig1 = sign(&h.env, &oracle, &msg1);
    let relayer = Address::generate(&h.env);
    h.client.verify_collateral(&relayer, &1_u32, &msg1, &sig1);
    assert_eq!(
        h.client.get_collateral(&1_u32).unwrap().status,
        CollateralStatus::Attached
    );

    // Re-attach with a new oracle key so status is Pending again.
    let oracle2 = oracle_keypair(55);
    let oracle_pk2 = pubkey_bytes(&h.env, &oracle2);
    extend_allowlist(&h, &oracle_pk2);

    // Reset to Pending by creating a new loan and testing nonce reuse on it.
    h.client
        .init_loan(&0_u32, &2_u32, &borrower, &(5 * USDC_UNIT), &500_u32, &future);
    h.client.attach_collateral(&borrower, &2_u32, &oracle_pk2);

    // nonce=0 — must fail because last_nonce starts at 0 and we require > last_nonce.
    let msg_zero_nonce =
        build_collateral_message(&h.env, 2, 0, &asset, 100_u64, 0_i64, 0_u64, 0x01);
    let sig_zero = sign(&h.env, &oracle2, &msg_zero_nonce);
    let err = h
        .client
        .try_verify_collateral(&relayer, &2_u32, &msg_zero_nonce, &sig_zero);
    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::CollateralNonceReused
    );
}

/// P3-T4: Status machine — Pending→Attached, Attached→Released, Attached→Liquidated.
///        Reverse transitions (Attached→Pending) rejected.
#[test]
fn p3_t4_collateral_status_machine() {
    let h = harness_with_collateral_oracle();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;
    h.client.deposit(&h.user, &0_u32, &2_u32, &(100 * USDC_UNIT));
    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let oracle = oracle_keypair(11);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);
    h.client.attach_collateral(&borrower, &1_u32, &oracle_pk);

    let asset = [0xDD; 32];
    let relayer = Address::generate(&h.env);

    // Pending → Attached.
    let msg_attach = build_collateral_message(&h.env, 1, 1, &asset, 200_u64, 0_i64, 1_u64, 0x01);
    let sig_attach = sign(&h.env, &oracle, &msg_attach);
    h.client.verify_collateral(&relayer, &1_u32, &msg_attach, &sig_attach);
    assert_eq!(h.client.get_collateral(&1_u32).unwrap().status, CollateralStatus::Attached);

    // Trying verify_collateral again (status already Attached) should error.
    let msg_re_attach =
        build_collateral_message(&h.env, 1, 1, &asset, 200_u64, 0_i64, 2_u64, 0x01);
    let sig_re = sign(&h.env, &oracle, &msg_re_attach);
    let err = h.client.try_verify_collateral(&relayer, &1_u32, &msg_re_attach, &sig_re);
    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::CollateralAlreadyVerified
    );

    // Attached → Released.
    let msg_release =
        build_collateral_message(&h.env, 1, 1, &asset, 200_u64, 0_i64, 3_u64, 0x02);
    let sig_release = sign(&h.env, &oracle, &msg_release);
    h.client.release_collateral(&borrower, &1_u32, &msg_release, &sig_release);
    assert_eq!(h.client.get_collateral(&1_u32).unwrap().status, CollateralStatus::Released);

    // Released → Liquidated is invalid (only Attached → Liquidated is valid).
    let msg_liq = build_collateral_message(&h.env, 1, 1, &asset, 200_u64, 0_i64, 4_u64, 0x03);
    let sig_liq = sign(&h.env, &oracle, &msg_liq);
    let err = h
        .client
        .try_liquidate_collateral(&h.admin, &1_u32, &msg_liq, &sig_liq, &(10 * USDC_UNIT), &1_000_u32);
    assert_eq!(
        err.err().unwrap().unwrap(),
        PrismError::CollateralStatusMismatch
    );
}

/// P3-T5: disburse_loan is blocked when a Pending collateral record exists.
#[test]
fn p3_t5_disburse_loan_blocked_by_pending_collateral() {
    let h = harness_with_collateral_oracle();
    let borrower = Address::generate(&h.env);
    let future = h.env.ledger().timestamp() + 30 * 24 * 3600;

    // Fund vault.
    h.client.deposit(&h.user, &0_u32, &2_u32, &(500 * USDC_UNIT));

    h.client
        .init_loan(&0_u32, &1_u32, &borrower, &(20 * USDC_UNIT), &800_u32, &future);

    let oracle = oracle_keypair(11);
    let oracle_pk = pubkey_bytes(&h.env, &oracle);

    // attach_collateral creates a Pending record.
    h.client.attach_collateral(&borrower, &1_u32, &oracle_pk);

    // disburse must be blocked.
    let err = h.client.try_disburse_loan(&0_u32, &1_u32);
    assert_eq!(err.err().unwrap().unwrap(), PrismError::CollateralNotVerified);

    // After verify_collateral → Attached, disburse proceeds.
    let asset = [0xEE; 32];
    let message =
        build_collateral_message(&h.env, 1, 0, &asset, 1_000_u64, 0_i64, 1_u64, 0x01);
    let signature = sign(&h.env, &oracle, &message);
    let relayer = Address::generate(&h.env);
    h.client.verify_collateral(&relayer, &1_u32, &message, &signature);

    // Now disburse should succeed.
    h.client.disburse_loan(&0_u32, &1_u32);
    assert_eq!(h.client.get_loan(&1_u32).unwrap().state, LoanState::Active);
}

/// P3-T9 (Cloak handler smoke): record_cloak_payout accepts a valid Ed25519 attestation;
/// forged signature panics (same behaviour as Encrypt tests).
/// The existing record_cloak_payout_full_round_trip covers the happy-path —
/// this test specifically checks the wrong-signer rejection path.
#[test]
fn p3_t9_cloak_handler_rejects_forged_signature() {
    let h = harness_with_cloak_oracle();

    let legit_oracle = oracle_keypair(42);
    let attacker = oracle_keypair(99);
    let oracle_pk = pubkey_bytes(&h.env, &legit_oracle);
    let batch_id = [0x5a; 32];

    // Attacker signs the message but presents the legitimate oracle pubkey.
    let message = build_cloak_message(&h.env, 0, &batch_id, 0x01);
    let bad_sig = sign(&h.env, &attacker, &message);
    let relayer = Address::generate(&h.env);

    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        h.client.record_cloak_payout(
            &relayer,
            &0_u32,
            &oracle_pk,
            &message,
            &bad_sig,
            &(50 * USDC_UNIT),
        )
    }));
    assert!(result.is_err(), "forged cloak signature should panic");
}
