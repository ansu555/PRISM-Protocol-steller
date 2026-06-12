//! Math primitives ported **verbatim** from the Soroban implementation.
//!
//! See [docs/12-reference-card.md](../../../docs/12-reference-card.md) §4.3 / §4.5
//! for the reference values the parity tests assert against.
//!
//! This module is pure Rust — identical to `soroban/prism-core/src/math.rs`.
//! Only the error type import path changed (`crate::errors` → `crate::error`).

use crate::error::ContractError;

pub const Q64_SHIFT: u32 = 64;
pub const Q64_ONE: u128 = 1u128 << Q64_SHIFT;

/// Convert u64 → Q64.64.
pub fn u64_to_q(x: u64) -> u128 {
    (x as u128) << Q64_SHIFT
}

/// Convert Q64.64 → u64 (truncate fractional part).
pub fn q_to_u64(q: u128) -> Result<u64, ContractError> {
    let int_part = q >> Q64_SHIFT;
    if int_part > u64::MAX as u128 {
        return Err(ContractError::ArithmeticOverflow);
    }
    Ok(int_part as u64)
}

/// Multiply a u64 by a Q64.64, divide by a Q64.64 denominator.
/// Used for: shares = usdc_in × Q_ONE / nav_per_share_q.
pub fn mul_div_q(a: u64, b_q: u128, denom_q: u128) -> Result<u128, ContractError> {
    if denom_q == 0 {
        return Err(ContractError::EmptyTrancheNav);
    }
    let product = (a as u128)
        .checked_mul(b_q)
        .ok_or(ContractError::ArithmeticOverflow)?;
    Ok(product / denom_q)
}

/// Compute new nav_per_share_q from total_assets and total_supply.
/// Returns 0 if total_supply == 0 (caller must handle the first-deposit case).
pub fn compute_nav_q(total_assets: u64, total_supply: u64) -> u128 {
    if total_supply == 0 {
        return 0;
    }
    ((total_assets as u128) << Q64_SHIFT) / (total_supply as u128)
}

/// Compute shares to mint for a deposit:
///   if total_supply == 0: shares = usdc_in (1:1 at NAV = 1.0)
///   else:                 shares = usdc_in × Q_ONE / nav_per_share_q
pub fn deposit_shares(usdc_in: u64, nav_q: u128, total_supply: u64) -> Result<u64, ContractError> {
    if total_supply == 0 {
        return Ok(usdc_in);
    }
    if nav_q == 0 {
        return Err(ContractError::TrancheWipedNoDepositsAllowed);
    }
    let shares_q = ((usdc_in as u128) << Q64_SHIFT) / nav_q;
    if shares_q > u64::MAX as u128 {
        return Err(ContractError::ArithmeticOverflow);
    }
    Ok(shares_q as u64)
}

/// Compute USDC payout for a withdraw:
///   payout = shares × nav_per_share_q / Q_ONE
pub fn withdraw_payout(shares: u64, nav_q: u128) -> Result<u64, ContractError> {
    let payout_q = (shares as u128)
        .checked_mul(nav_q)
        .ok_or(ContractError::ArithmeticOverflow)?;
    let payout = payout_q >> Q64_SHIFT;
    if payout > u64::MAX as u128 {
        return Err(ContractError::ArithmeticOverflow);
    }
    Ok(payout as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_nav_q_with_zero_supply() {
        assert_eq!(compute_nav_q(1_000_000, 0), 0);
    }

    #[test]
    fn test_compute_nav_q_one_to_one() {
        let nav = compute_nav_q(1_000_000_000, 1_000_000_000);
        assert_eq!(nav, Q64_ONE);
    }

    #[test]
    fn test_deposit_shares_first_deposit() {
        let shares = deposit_shares(1_000_000, 0, 0).unwrap();
        assert_eq!(shares, 1_000_000);
    }

    #[test]
    fn test_deposit_shares_against_blocked_wiped_tranche() {
        let err = deposit_shares(1_000_000, 0, 5_000_000).unwrap_err();
        assert!(matches!(err, ContractError::TrancheWipedNoDepositsAllowed));
    }

    #[test]
    fn test_round_trip_deposit_then_withdraw_at_nav_one() {
        let shares = deposit_shares(1_000_000, Q64_ONE, 5_000_000).unwrap();
        assert_eq!(shares, 1_000_000);
        let payout = withdraw_payout(shares, Q64_ONE).unwrap();
        assert_eq!(payout, 1_000_000);
    }
}
