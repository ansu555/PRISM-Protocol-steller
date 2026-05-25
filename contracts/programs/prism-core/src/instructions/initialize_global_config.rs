use crate::state::GlobalConfig;
use anchor_lang::prelude::*;
use anchor_spl::token::Mint;

#[derive(Accounts)]
pub struct InitializeGlobalConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [b"config2"],
        bump,
    )]
    pub config: Account<'info, GlobalConfig>,

    pub usdc_mint: Account<'info, Mint>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_global_config_handler(
    ctx: Context<InitializeGlobalConfig>,
    default_yield_rate_bps: u16,
    oracle_allowlist: Vec<Pubkey>,
) -> Result<()> {
    // §9.4 initialize_global_config:
    // 1. Set config.admin = the signer's pubkey
    // 2. Set config.usdc_mint = the mint we are using for all USDC flows
    // 3. Set config.default_yield_rate_bps = protocol default (e.g. 500 = 5%)
    // 4. Set config.paused = false (vault starts active)
    // 5. Store oracle allowlist (up to 8 Pubkeys that can trigger credit events)
    // 6. Store the canonical PDA bump so future instructions can verify the PDA without re-deriving it
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.usdc_mint = ctx.accounts.usdc_mint.key();
    config.default_yield_rate_bps = default_yield_rate_bps;
    config.paused = false;
    config.oracle_allowlist = oracle_allowlist;
    config.bump = ctx.bumps.config;
    Ok(())
}
