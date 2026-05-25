use anchor_lang::prelude::*;

#[event]
pub struct SwapExecuted {
    pub user: Pubkey,
    pub pool: Pubkey,
    pub direction: u8, // 0 = TrancheToQuote, 1 = QuoteToTranche
    pub amount_in: u64,
    pub amount_out: u64,
    pub new_tranche_reserve: u64,
    pub new_quote_reserve: u64,
    pub timestamp: i64,
}

#[event]
pub struct LiquidityAdded {
    pub lp: Pubkey,
    pub pool: Pubkey,
    pub tranche_amount: u64,
    pub quote_amount: u64,
    pub lp_shares_minted: u64,
    pub timestamp: i64,
}

#[event]
pub struct LiquidityRemoved {
    pub lp: Pubkey,
    pub pool: Pubkey,
    pub lp_amount: u64,
    pub tranche_out: u64,
    pub quote_out: u64,
    pub timestamp: i64,
}
