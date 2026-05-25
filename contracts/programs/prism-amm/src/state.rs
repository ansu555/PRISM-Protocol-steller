use anchor_lang::prelude::*;

/// Constants — mirror 12-reference-card.md §1.1
pub const MIN_LIQUIDITY: u64 = 1_000;
pub const MAX_FEE_BPS: u16 = 1_000;
pub const DEFAULT_FEE_BPS: u16 = 30;
pub const BPS_DENOMINATOR: u64 = 10_000;

#[account]
#[derive(InitSpace)]
pub struct AmmPool {
    pub tranche_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub tranche_reserve: Pubkey,
    pub quote_reserve: Pubkey,
    pub lp_mint: Pubkey,
    pub fee_bps: u16,
    pub bump: u8,
}
