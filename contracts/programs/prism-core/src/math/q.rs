use crate::errors::PrismError;
/// Q64.64 fixed-point representation: u128 where the high 64 bits are the
/// integer part and the low 64 bits are the fractional part.
/// Range: [0, 2^64) with 2^-64 precision.
use anchor_lang::prelude::*;

pub const Q64_SHIFT: u32 = 64;
pub const Q64_ONE: u128 = 1u128 << Q64_SHIFT;

/// Convert u64 → Q64.64
pub fn u64_to_q(x: u64) -> u128 {
    (x as u128) << Q64_SHIFT
}

/// Convert Q64.64 → u64 (truncate fractional part)
pub fn q_to_u64(q: u128) -> Result<u64> {
    let int_part = q >> Q64_SHIFT;
    if int_part > u64::MAX as u128 {
        return Err(PrismError::ArithmeticOverflow.into());
    }
    Ok(int_part as u64)
}

/// Multiply two u64s, divide by a third, returning Q64.64.
/// Used for: shares = usdc_in × Q_ONE / nav_per_share_q
pub fn mul_div_q(a: u64, b_q: u128, denom_q: u128) -> Result<u128> {
    if denom_q == 0 {
        return Err(PrismError::EmptyTrancheNav.into());
    }
    // (a as u128) × b_q can overflow u128 in extreme cases; use u256 path or
    // staged multiplication. For demo numbers (a < 1e10, b_q < 2^96), u128 is safe.
    let product = (a as u128)
        .checked_mul(b_q)
        .ok_or(PrismError::ArithmeticOverflow)?;
    Ok(product / denom_q)
}

/// Compute new nav_per_share_q from total_assets and total_supply.
/// Returns 0 if total_supply == 0 (caller must handle the first-deposit case).
pub fn compute_nav_q(total_assets: u64, total_supply: u64) -> u128 {
    if total_supply == 0 {
        return 0;
    }
    // nav_q = (total_assets × Q_ONE) / total_supply
    ((total_assets as u128) << Q64_SHIFT) / (total_supply as u128)
}

/// Compute shares to mint for a deposit:
///   if total_supply == 0: shares = usdc_in (1:1 at NAV = 1.0)
///   else:                 shares = usdc_in × Q_ONE / nav_per_share_q
pub fn deposit_shares(usdc_in: u64, nav_q: u128, total_supply: u64) -> Result<u64> {
    if total_supply == 0 {
        return Ok(usdc_in);
    }
    if nav_q == 0 {
        return Err(PrismError::TrancheWipedNoDepositsAllowed.into());
    }
    let shares_q = ((usdc_in as u128) << Q64_SHIFT) / nav_q;
    if shares_q > u64::MAX as u128 {
        return Err(PrismError::ArithmeticOverflow.into());
    }
    Ok(shares_q as u64)
}

/// Compute USDC payout for a withdraw:
///   payout = shares × nav_per_share_q / Q_ONE
pub fn withdraw_payout(shares: u64, nav_q: u128) -> Result<u64> {
    let payout_q = (shares as u128)
        .checked_mul(nav_q)
        .ok_or(PrismError::ArithmeticOverflow)?;
    let payout = payout_q >> Q64_SHIFT;
    if payout > u64::MAX as u128 {
        return Err(PrismError::ArithmeticOverflow.into());
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
        // 1000 USDC assets, 1000 shares → NAV = 1.0 = Q64_ONE
        let nav = compute_nav_q(1_000_000_000, 1_000_000_000);
        assert_eq!(nav, Q64_ONE);
    }

    #[test]
    fn test_deposit_shares_first_deposit() {
        // First deposit: 1:1
        let shares = deposit_shares(1_000_000, 0, 0).unwrap();
        assert_eq!(shares, 1_000_000);
    }
}
