use anchor_lang::prelude::*;

#[error_code]
pub enum AmmError {
    #[msg("Pool reserves are empty")]
    PoolNotInitialized,
    #[msg("Swap output below min_amount_out")]
    SlippageExceeded,
    #[msg("fee_bps exceeds MAX_FEE_BPS (1000)")]
    InvalidFee,
    #[msg("add_liquidity ratio doesn't match current pool")]
    RatioMismatch,
    #[msg("First LP must supply > MIN_LIQUIDITY (1000) shares")]
    MinLiquidityViolation,
}
