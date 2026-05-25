//! AMM lifecycle tests — init pool, add liquidity, swap, remove liquidity.
//!
//! Run with `cargo test -p prism-amm`. Uses Soroban's in-process mock host
//! with SACs for tranche / quote / LP tokens.

#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::Address as _, token, Address, Env,
};

use crate::state::{DEFAULT_FEE_BPS, MIN_LIQUIDITY};
use crate::{AmmError, PrismAmm, PrismAmmClient};

const UNIT: i128 = 10_000_000; // 7-decimal token, matches Stellar USDC

struct Harness<'a> {
    env: Env,
    client: PrismAmmClient<'a>,
    contract_id: Address,
    admin: Address,
    lp: Address,
    user: Address,
    tranche_token: Address,
    quote_token: Address,
    lp_token: Address,
    tranche_client: token::Client<'a>,
    quote_client: token::Client<'a>,
    lp_client: token::Client<'a>,
}

fn setup<'a>() -> Harness<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(PrismAmm, ());
    let client = PrismAmmClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let lp = Address::generate(&env);
    let user = Address::generate(&env);

    // Tranche + quote tokens — admin holds mint authority so we can fund users.
    let tranche_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let quote_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let tranche_token = tranche_sac.address();
    let quote_token = quote_sac.address();

    // LP token — the AMM contract is admin so it can mint/burn LP shares.
    let lp_sac = env.register_stellar_asset_contract_v2(contract_id.clone());
    let lp_token = lp_sac.address();

    let tranche_client = token::Client::new(&env, &tranche_token);
    let quote_client = token::Client::new(&env, &quote_token);
    let lp_client = token::Client::new(&env, &lp_token);

    // Fund LP and user with both tokens.
    let tranche_admin = token::StellarAssetClient::new(&env, &tranche_token);
    let quote_admin = token::StellarAssetClient::new(&env, &quote_token);
    tranche_admin.mint(&lp, &(1_000 * UNIT));
    quote_admin.mint(&lp, &(1_000 * UNIT));
    tranche_admin.mint(&user, &(1_000 * UNIT));
    quote_admin.mint(&user, &(1_000 * UNIT));

    Harness {
        env,
        client,
        contract_id,
        admin,
        lp,
        user,
        tranche_token,
        quote_token,
        lp_token,
        tranche_client,
        quote_client,
        lp_client,
    }
}

// ── init_pool ────────────────────────────────────────────────────────────────

#[test]
fn init_pool_writes_pool_state() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    let pool = h.client.get_pool(&h.tranche_token).unwrap();
    assert_eq!(pool.tranche_token, h.tranche_token);
    assert_eq!(pool.quote_token, h.quote_token);
    assert_eq!(pool.lp_token, h.lp_token);
    assert_eq!(pool.fee_bps, DEFAULT_FEE_BPS);
}

#[test]
fn init_pool_twice_errors() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    let err = h.client.try_init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    assert_eq!(err.err().unwrap().unwrap(), AmmError::AlreadyInitialized);
}

#[test]
fn init_pool_rejects_fee_above_max() {
    let h = setup();
    let err = h.client.try_init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &5_000_u32, // > MAX_FEE_BPS (1_000)
    );
    assert_eq!(err.err().unwrap().unwrap(), AmmError::InvalidFee);
}

// ── add_liquidity ────────────────────────────────────────────────────────────

#[test]
fn first_add_liquidity_uses_geometric_mean_minus_min() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );

    // 100 + 100 → sqrt(100 * 100 * UNIT^2) - MIN_LIQUIDITY
    //           = 100 * UNIT - 1_000 = 999_999_000
    let shares = h
        .client
        .add_liquidity(&h.lp, &h.tranche_token, &(100 * UNIT), &(100 * UNIT), &0_i128);
    assert_eq!(shares, 100 * UNIT - MIN_LIQUIDITY);

    // LP holds the shares; MIN_LIQUIDITY is permanently locked at contract address.
    assert_eq!(h.lp_client.balance(&h.lp), 100 * UNIT - MIN_LIQUIDITY);
    assert_eq!(h.lp_client.balance(&h.contract_id), MIN_LIQUIDITY);

    // Pool reserves match what was deposited.
    let (rt, rq, supply) = h.client.get_reserves(&h.tranche_token).unwrap();
    assert_eq!(rt, 100 * UNIT);
    assert_eq!(rq, 100 * UNIT);
    assert_eq!(supply, 100 * UNIT); // user_shares + MIN_LIQUIDITY = (100*UNIT - 1000) + 1000
}

#[test]
fn second_add_liquidity_uses_min_of_two_sides() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    h.client
        .add_liquidity(&h.lp, &h.tranche_token, &(100 * UNIT), &(100 * UNIT), &0_i128);

    let user_shares = h
        .client
        .add_liquidity(&h.user, &h.tranche_token, &(50 * UNIT), &(50 * UNIT), &0_i128);

    // Symmetric deposit → both sides are equal → shares = 50 * UNIT.
    assert_eq!(user_shares, 50 * UNIT);

    // Reserves now 150 + 150.
    let (rt, rq, _supply) = h.client.get_reserves(&h.tranche_token).unwrap();
    assert_eq!(rt, 150 * UNIT);
    assert_eq!(rq, 150 * UNIT);
}

#[test]
fn add_liquidity_zero_amount_errors() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    let err = h
        .client
        .try_add_liquidity(&h.lp, &h.tranche_token, &0_i128, &(100 * UNIT), &0_i128);
    assert_eq!(err.err().unwrap().unwrap(), AmmError::InvalidAmount);
}

#[test]
fn add_liquidity_below_min_liquidity_errors() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    // sqrt(500 * 500) = 500. MIN_LIQUIDITY is 1000 → can't even mint to lock.
    let err = h
        .client
        .try_add_liquidity(&h.lp, &h.tranche_token, &500_i128, &500_i128, &0_i128);
    assert_eq!(err.err().unwrap().unwrap(), AmmError::MinLiquidityViolation);
}

// ── swap ─────────────────────────────────────────────────────────────────────

/// Constant-product invariant under fee:
///   amount_in_after_fee = amount_in * (1 - fee_bps/10_000)
///   amount_out = reserve_out × amount_in_after_fee / (reserve_in × BPS + amount_in_after_fee)
///   k_after >= k_before (fee accumulates inside the pool, so k can only grow)
#[test]
fn swap_tranche_for_quote_preserves_k_invariant() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    h.client
        .add_liquidity(&h.lp, &h.tranche_token, &(1_000 * UNIT), &(1_000 * UNIT), &0_i128);

    let (rt_before, rq_before, _) = h.client.get_reserves(&h.tranche_token).unwrap();
    let k_before = (rt_before as i128) * (rq_before as i128);

    let user_tranche_before = h.tranche_client.balance(&h.user);
    let user_quote_before = h.quote_client.balance(&h.user);

    let amount_in = 10 * UNIT;
    let out = h
        .client
        .swap(&h.user, &h.tranche_token, &amount_in, &0_i128, &0_u32);
    assert!(out > 0, "got 0 out");

    // Constant-product math (fee=30 bps):
    //   reserve_in = reserve_out = 1_000 * UNIT = 10_000_000_000
    //   amount_in_less_fee = 100_000_000 * 9_970 = 997_000_000_000
    //   numerator = 10_000_000_000 * 997_000_000_000 = 9.97e21
    //   denominator = 10_000_000_000 * 10_000 + 997_000_000_000 = 100_997_000_000_000
    //   amount_out = 9.97e21 / 1.00997e14 = 98_715_803  (~9.87 USDC, vs 10 USDC in)
    assert_eq!(out, 98_715_803_i128);

    let (rt_after, rq_after, _) = h.client.get_reserves(&h.tranche_token).unwrap();
    let k_after = (rt_after as i128) * (rq_after as i128);
    assert!(k_after >= k_before, "k must not decrease under fee");

    // User balances reflect the swap.
    assert_eq!(h.tranche_client.balance(&h.user), user_tranche_before - amount_in);
    assert_eq!(h.quote_client.balance(&h.user), user_quote_before + out);
}

#[test]
fn swap_quote_for_tranche_works_symmetrically() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    h.client
        .add_liquidity(&h.lp, &h.tranche_token, &(1_000 * UNIT), &(1_000 * UNIT), &0_i128);

    // Symmetric reserves → swapping quote→tranche should give the same number
    // as swapping tranche→quote for the same input.
    let out = h
        .client
        .swap(&h.user, &h.tranche_token, &(10 * UNIT), &0_i128, &1_u32);
    assert_eq!(out, 98_715_803_i128);
}

#[test]
fn swap_min_amount_out_enforced() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    h.client
        .add_liquidity(&h.lp, &h.tranche_token, &(1_000 * UNIT), &(1_000 * UNIT), &0_i128);

    // Demand more than the swap can deliver → SlippageExceeded.
    let err = h.client.try_swap(
        &h.user,
        &h.tranche_token,
        &(10 * UNIT),
        &(20 * UNIT), // min_out > actual out
        &0_u32,
    );
    assert_eq!(err.err().unwrap().unwrap(), AmmError::SlippageExceeded);
}

#[test]
fn swap_invalid_direction_errors() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    h.client
        .add_liquidity(&h.lp, &h.tranche_token, &(100 * UNIT), &(100 * UNIT), &0_i128);

    let err = h
        .client
        .try_swap(&h.user, &h.tranche_token, &(1 * UNIT), &0_i128, &2_u32);
    assert_eq!(err.err().unwrap().unwrap(), AmmError::InvalidAmount);
}

#[test]
fn swap_against_empty_pool_errors() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    let err = h
        .client
        .try_swap(&h.user, &h.tranche_token, &(1 * UNIT), &0_i128, &0_u32);
    assert_eq!(err.err().unwrap().unwrap(), AmmError::PoolNotInitialized);
}

// ── remove_liquidity ─────────────────────────────────────────────────────────

#[test]
fn remove_liquidity_returns_pro_rata_share() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    let lp_shares = h
        .client
        .add_liquidity(&h.lp, &h.tranche_token, &(100 * UNIT), &(100 * UNIT), &0_i128);

    // Withdraw half.
    let half = lp_shares / 2;
    let (t_out, q_out) = h.client.remove_liquidity(
        &h.lp,
        &h.tranche_token,
        &half,
        &0_i128,
        &0_i128,
    );

    // half / (lp_shares + MIN_LIQUIDITY) ≈ half / (100*UNIT)
    // Both sides started at 100 * UNIT.
    // Expected ≈ 100*UNIT * half / (100*UNIT) = half. But the locked
    // MIN_LIQUIDITY is in supply too, so it's a touch under.
    let supply = 100 * UNIT; // shares + MIN_LIQUIDITY
    let expected = ((100 * UNIT) as u128) * (half as u128) / (supply as u128);
    assert_eq!(t_out as u128, expected);
    assert_eq!(q_out as u128, expected);

    // User pTokens returned.
    let (rt, rq, supply_after) = h.client.get_reserves(&h.tranche_token).unwrap();
    assert_eq!(rt, 100 * UNIT - t_out);
    assert_eq!(rq, 100 * UNIT - q_out);
    assert_eq!(supply_after, supply - half);
}

#[test]
fn remove_liquidity_min_out_enforced() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    let lp_shares = h
        .client
        .add_liquidity(&h.lp, &h.tranche_token, &(100 * UNIT), &(100 * UNIT), &0_i128);

    let err = h.client.try_remove_liquidity(
        &h.lp,
        &h.tranche_token,
        &lp_shares,
        &(200 * UNIT), // demand more than the pool can give back
        &0_i128,
    );
    assert_eq!(err.err().unwrap().unwrap(), AmmError::SlippageExceeded);
}

// ── End-to-end: add → swap → remove ──────────────────────────────────────────

#[test]
fn full_lifecycle_lp_collects_fee_after_swap() {
    let h = setup();
    h.client.init_pool(
        &h.admin,
        &h.tranche_token,
        &h.quote_token,
        &h.lp_token,
        &DEFAULT_FEE_BPS,
    );
    let lp_shares = h
        .client
        .add_liquidity(&h.lp, &h.tranche_token, &(1_000 * UNIT), &(1_000 * UNIT), &0_i128);

    // User swaps 100 tranche → quote. Fee stays in the pool.
    h.client
        .swap(&h.user, &h.tranche_token, &(100 * UNIT), &0_i128, &0_u32);

    // LP withdraws everything they have.
    let lp_tranche_before = h.tranche_client.balance(&h.lp);
    let lp_quote_before = h.quote_client.balance(&h.lp);
    h.client.remove_liquidity(
        &h.lp,
        &h.tranche_token,
        &lp_shares,
        &0_i128,
        &0_i128,
    );
    let lp_tranche_after = h.tranche_client.balance(&h.lp);
    let lp_quote_after = h.quote_client.balance(&h.lp);

    // LP should get back >1000 worth of value because they earned the fee on
    // the user's swap. Pre-deposit they had 1000+1000; let's check they end
    // up with more than 1000+1000-MIN_LIQUIDITY across both sides.
    let total_received = (lp_tranche_after - lp_tranche_before)
        + (lp_quote_after - lp_quote_before);
    let total_deposited = 2_000 * UNIT;
    // The locked MIN_LIQUIDITY (1000) means they can't quite recover the full
    // deposit but the fee should more than cover that for any non-trivial swap.
    assert!(
        total_received > total_deposited - MIN_LIQUIDITY,
        "lp earned less than deposited minus MIN_LIQUIDITY: got {total_received}",
    );
}
