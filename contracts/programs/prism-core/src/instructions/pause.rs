use crate::state::GlobalConfig;
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    pub admin: Signer<'info>,

    #[account(mut, seeds = [b"config2"], bump, has_one = admin)]
    pub config: Account<'info, GlobalConfig>,
}

pub fn pause_handler(ctx: Context<Pause>) -> Result<()> {
    // §9.4 pause: Admin-only emergency circuit breaker.
    // When paused, deposit and withdraw instructions will fail with VaultPaused.
    // Useful if we discover a bug mid-demo or post-launch.
    ctx.accounts.config.paused = true;
    Ok(())
}

pub fn unpause_handler(ctx: Context<Pause>) -> Result<()> {
    ctx.accounts.config.paused = false;
    Ok(())
}
