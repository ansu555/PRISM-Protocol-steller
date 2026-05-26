

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

