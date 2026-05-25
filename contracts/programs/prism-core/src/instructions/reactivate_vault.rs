use crate::errors::PrismError;
use crate::state::{GlobalConfig, Vault, VaultState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ReactivateVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"config2"], bump, has_one = admin @ PrismError::Unauthorized)]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Box<Account<'info, Vault>>,
}

pub fn reactivate_vault_handler(ctx: Context<ReactivateVault>) -> Result<()> {
    ctx.accounts.vault.state = VaultState::Active;
    Ok(())
}
