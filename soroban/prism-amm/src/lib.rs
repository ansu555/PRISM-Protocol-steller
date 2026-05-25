//! PRISM Protocol AMM — constant-product market maker for tranche pTokens.
//!
//! Functions:
//!   - `init_pool(admin, tranche_token, quote_token, lp_token, fee_bps)`
//!   - `add_liquidity(lp, tranche_token, tranche_amount, quote_amount, min_lp_out)`
//!   - `remove_liquidity(lp, tranche_token, lp_amount, min_tranche_out, min_quote_out)`
//!   - `swap(user, tranche_token, amount_in, min_amount_out, direction)`
//!   - `get_pool(tranche_token)`, `get_reserves(tranche_token)`
//!
//! Soroban differences vs Solana:
//!   - The AMM contract holds both reserves in its own SAC balance — no
//!     separate "reserve" token accounts.
//!   - LP token is a pre-deployed SAC whose admin is the AMM contract.
//!   - No PDA signing for transfers out: the contract is its own authority.
//!   - LP supply read live from `token::Client::total_supply` (one less
//!     piece of state to keep in sync).

#![no_std]

mod errors;
mod state;
mod storage;

#[cfg(test)]
mod tests;

pub use errors::AmmError;
pub use state::{AmmPool, BPS_DENOMINATOR, DEFAULT_FEE_BPS, MAX_FEE_BPS, MIN_LIQUIDITY};

use soroban_sdk::{contract, contractimpl, token, Address, Env};

#[contract]
pub struct PrismAmm;

#[contractimpl]
impl PrismAmm {
    /// Register a new pool. `admin` must authorise. `lp_token` is a SAC
    /// whose admin is already set to this contract's address (deploy
    /// off-chain, then call `set_admin(this_contract)`).
    ///
    /// `fee_bps` must be in `[0, MAX_FEE_BPS]`. 30 = 0.3% (Uniswap V2).
    pub fn init_pool(
        env: Env,
        admin: Address,
        tranche_token: Address,
        quote_token: Address,
        lp_token: Address,
        fee_bps: u32,
    ) -> Result<(), AmmError> {
        admin.require_auth();

        if storage::pool_exists(&env, &tranche_token) {
            return Err(AmmError::AlreadyInitialized);
        }
        if fee_bps > MAX_FEE_BPS {
            return Err(AmmError::InvalidFee);
        }

        let pool = AmmPool {
            tranche_token,
            quote_token,
            lp_token,
            fee_bps,
        };
        storage::write_pool(&env, &pool);
        Ok(())
    }

    /// Add liquidity. First LP supplies any ratio; subsequent LPs must
    /// match the pool's current ratio (`tranche_amount / quote_amount ==
    /// reserve_tranche / reserve_quote`).
    ///
    /// First LP receives `sqrt(t * q) - MIN_LIQUIDITY` LP shares.
    /// The `MIN_LIQUIDITY` is permanently locked (minted to the contract
    /// address itself) so the pool can never be drained to zero by
    /// withdrawing all shares.
    ///
    /// Returns the LP shares minted to the caller.
    pub fn add_liquidity(
        env: Env,
        lp: Address,
        tranche_token: Address,
        tranche_amount: i128,
        quote_amount: i128,
        min_lp_out: i128,
    ) -> Result<i128, AmmError> {
        lp.require_auth();

        if tranche_amount <= 0 || quote_amount <= 0 {
            return Err(AmmError::InvalidAmount);
        }

        let pool = storage::read_pool(&env, &tranche_token).ok_or(AmmError::PoolNotInitialized)?;

        let this = env.current_contract_address();
        let tranche_client = token::Client::new(&env, &pool.tranche_token);
        let quote_client = token::Client::new(&env, &pool.quote_token);
        let lp_admin = token::StellarAssetClient::new(&env, &pool.lp_token);

        let reserve_tranche_before = tranche_client.balance(&this);
        let reserve_quote_before = quote_client.balance(&this);
        let lp_supply = storage::read_lp_supply(&env, &pool.tranche_token);

        let shares: i128 = if lp_supply == 0 {
            // First LP: shares = sqrt(t * q) - MIN_LIQUIDITY.
            let product = (tranche_amount as u128)
                .checked_mul(quote_amount as u128)
                .ok_or(AmmError::ArithmeticOverflow)?;
            let geometric = integer_sqrt(product) as i128;
            if geometric <= MIN_LIQUIDITY {
                return Err(AmmError::MinLiquidityViolation);
            }
            // MIN_LIQUIDITY is permanently locked to the contract address so
            // total_supply never drops to zero. Without this, an attacker
            // could withdraw all LP and reset the pool ratio (Uniswap V2 fix).
            lp_admin.mint(&this, &MIN_LIQUIDITY);
            geometric - MIN_LIQUIDITY
        } else {
            if reserve_tranche_before == 0 || reserve_quote_before == 0 {
                return Err(AmmError::PoolNotInitialized);
            }
            // shares = min(t * S / reserve_t, q * S / reserve_q)
            let tranche_side = (tranche_amount as u128)
                .checked_mul(lp_supply as u128)
                .ok_or(AmmError::ArithmeticOverflow)?
                / reserve_tranche_before as u128;
            let quote_side = (quote_amount as u128)
                .checked_mul(lp_supply as u128)
                .ok_or(AmmError::ArithmeticOverflow)?
                / reserve_quote_before as u128;
            core::cmp::min(tranche_side, quote_side) as i128
        };

        if shares <= 0 {
            return Err(AmmError::MinLiquidityViolation);
        }
        if shares < min_lp_out {
            return Err(AmmError::SlippageExceeded);
        }

        // Pull tranche + quote into the contract.
        tranche_client.transfer(&lp, &this, &tranche_amount);
        quote_client.transfer(&lp, &this, &quote_amount);

        // Mint LP shares to the user; bump our supply counter.
        lp_admin.mint(&lp, &shares);
        let new_supply = if lp_supply == 0 {
            // First LP: account for both the user's shares and the locked MIN_LIQUIDITY.
            shares + MIN_LIQUIDITY
        } else {
            lp_supply + shares
        };
        storage::write_lp_supply(&env, &pool.tranche_token, new_supply);

        Ok(shares)
    }

    /// Burn `lp_amount` LP shares; pay out a pro-rata slice of both reserves.
    /// `min_tranche_out` / `min_quote_out` enforce slippage protection.
    /// Returns `(tranche_out, quote_out)`.
    pub fn remove_liquidity(
        env: Env,
        lp: Address,
        tranche_token: Address,
        lp_amount: i128,
        min_tranche_out: i128,
        min_quote_out: i128,
    ) -> Result<(i128, i128), AmmError> {
        lp.require_auth();

        if lp_amount <= 0 {
            return Err(AmmError::InvalidAmount);
        }

        let pool = storage::read_pool(&env, &tranche_token).ok_or(AmmError::PoolNotInitialized)?;

        let this = env.current_contract_address();
        let tranche_client = token::Client::new(&env, &pool.tranche_token);
        let quote_client = token::Client::new(&env, &pool.quote_token);
        let lp_client = token::Client::new(&env, &pool.lp_token);

        let supply = storage::read_lp_supply(&env, &pool.tranche_token);
        if supply <= 0 {
            return Err(AmmError::PoolNotInitialized);
        }

        let reserve_t = tranche_client.balance(&this);
        let reserve_q = quote_client.balance(&this);

        let tranche_out = ((reserve_t as u128)
            .checked_mul(lp_amount as u128)
            .ok_or(AmmError::ArithmeticOverflow)?
            / supply as u128) as i128;
        let quote_out = ((reserve_q as u128)
            .checked_mul(lp_amount as u128)
            .ok_or(AmmError::ArithmeticOverflow)?
            / supply as u128) as i128;

        if tranche_out < min_tranche_out || quote_out < min_quote_out {
            return Err(AmmError::SlippageExceeded);
        }

        // Burn LP shares from user; decrement our supply counter.
        lp_client.burn(&lp, &lp_amount);
        storage::write_lp_supply(&env, &pool.tranche_token, supply - lp_amount);

        // Pay out from contract balance to the user. The contract is its own
        // authority on these transfers (no PDA signing required on Soroban).
        if tranche_out > 0 {
            tranche_client.transfer(&this, &lp, &tranche_out);
        }
        if quote_out > 0 {
            quote_client.transfer(&this, &lp, &quote_out);
        }

        Ok((tranche_out, quote_out))
    }

    /// Constant-product swap with `fee_bps` taken on the input.
    ///
    /// `direction`:
    ///   0 → swap tranche IN, quote OUT
    ///   1 → swap quote IN, tranche OUT
    ///
    /// Pricing: `amount_out = reserve_out × amount_in_after_fee / (reserve_in × BPS + amount_in_after_fee)`.
    /// Returns the amount paid out.
    pub fn swap(
        env: Env,
        user: Address,
        tranche_token: Address,
        amount_in: i128,
        min_amount_out: i128,
        direction: u32,
    ) -> Result<i128, AmmError> {
        user.require_auth();

        if amount_in <= 0 {
            return Err(AmmError::InvalidAmount);
        }

        let pool = storage::read_pool(&env, &tranche_token).ok_or(AmmError::PoolNotInitialized)?;

        let this = env.current_contract_address();
        let tranche_client = token::Client::new(&env, &pool.tranche_token);
        let quote_client = token::Client::new(&env, &pool.quote_token);

        let reserve_t = tranche_client.balance(&this);
        let reserve_q = quote_client.balance(&this);
        if reserve_t <= 0 || reserve_q <= 0 {
            return Err(AmmError::PoolNotInitialized);
        }

        let (reserve_in, reserve_out, in_client, out_client) = match direction {
            0 => (reserve_t, reserve_q, &tranche_client, &quote_client),
            1 => (reserve_q, reserve_t, &quote_client, &tranche_client),
            _ => return Err(AmmError::InvalidAmount),
        };

        let fee_complement = (BPS_DENOMINATOR - pool.fee_bps as u128) as u128;
        let amount_in_less_fee = (amount_in as u128)
            .checked_mul(fee_complement)
            .ok_or(AmmError::ArithmeticOverflow)?;
        let numerator = (reserve_out as u128)
            .checked_mul(amount_in_less_fee)
            .ok_or(AmmError::ArithmeticOverflow)?;
        let denominator = (reserve_in as u128)
            .checked_mul(BPS_DENOMINATOR)
            .ok_or(AmmError::ArithmeticOverflow)?
            .checked_add(amount_in_less_fee)
            .ok_or(AmmError::ArithmeticOverflow)?;
        let amount_out = (numerator / denominator) as i128;

        if amount_out <= 0 {
            return Err(AmmError::SlippageExceeded);
        }
        if amount_out < min_amount_out {
            return Err(AmmError::SlippageExceeded);
        }

        // Pull input from user, push output to user.
        in_client.transfer(&user, &this, &amount_in);
        out_client.transfer(&this, &user, &amount_out);

        Ok(amount_out)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Read-only getters
    // ──────────────────────────────────────────────────────────────────────

    pub fn get_pool(env: Env, tranche_token: Address) -> Option<AmmPool> {
        storage::read_pool(&env, &tranche_token)
    }

    /// Returns `(reserve_tranche, reserve_quote, lp_supply)`.
    pub fn get_reserves(env: Env, tranche_token: Address) -> Option<(i128, i128, i128)> {
        let pool = storage::read_pool(&env, &tranche_token)?;
        let this = env.current_contract_address();
        let t = token::Client::new(&env, &pool.tranche_token).balance(&this);
        let q = token::Client::new(&env, &pool.quote_token).balance(&this);
        let s = storage::read_lp_supply(&env, &pool.tranche_token);
        Some((t, q, s))
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/// Integer square root via Newton's method. Used for first-LP geometric mean.
/// Lifted from `contracts/programs/prism-amm/src/instructions/add_liquidity.rs`.
fn integer_sqrt(value: u128) -> u128 {
    if value < 2 {
        return value;
    }
    let mut x = value;
    let mut y = (x + value / x) / 2;
    while y < x {
        x = y;
        y = (x + value / x) / 2;
    }
    x
}
