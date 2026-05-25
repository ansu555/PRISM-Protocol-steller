//! AMM pool state and constants.
//!
//! Mirrors `contracts/programs/prism-amm/src/state.rs` (Solana).
//!
//! Soroban differences:
//!   - No `tranche_reserve` / `quote_reserve` token-account addresses. The
//!     AMM contract holds both reserves in its own balance via the standard
//!     token interface (`token::Client::balance(&contract_address)`).
//!   - `bump` field dropped (no PDAs).
//!   - `lp_token` is the address of a pre-deployed SAC whose admin is this
//!     contract.

use soroban_sdk::{contracttype, Address};

pub const MIN_LIQUIDITY: i128 = 1_000;
pub const MAX_FEE_BPS: u32 = 1_000;
pub const DEFAULT_FEE_BPS: u32 = 30;
pub const BPS_DENOMINATOR: u128 = 10_000;

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AmmPool {
    pub tranche_token: Address,
    pub quote_token: Address,
    pub lp_token: Address,
    pub fee_bps: u32,
}
