use crate::errors::PrismError;
use crate::state::{GlobalConfig, Vault};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(vault_id: u32)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"config2"], bump, has_one = admin @ PrismError::Unauthorized)]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(
        init,
        payer = admin,
        space = 8 + Vault::INIT_SPACE,
        seeds = [b"vault".as_ref(), vault_id.to_le_bytes().as_ref()],
        bump,
    )]
    pub vault: Box<Account<'info, Vault>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeVaultReserves<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"config2"], bump, has_one = admin @ PrismError::Unauthorized)]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(mut, seeds = [b"vault", &vault.id.to_le_bytes()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(constraint = usdc_mint.key() == config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    /// Vault USDC reserve token account, authority = vault PDA
    #[account(
        init,
        payer = admin,
        seeds = [b"reserve", vault.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = vault,
    )]
    pub vault_usdc_reserve: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeVaultLossBucket<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"config2"], bump, has_one = admin @ PrismError::Unauthorized)]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(mut, seeds = [b"vault", &vault.id.to_le_bytes()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(constraint = usdc_mint.key() == config.usdc_mint)]
    pub usdc_mint: Box<Account<'info, Mint>>,

    /// Loss bucket token account, authority = vault PDA
    #[account(
        init,
        payer = admin,
        seeds = [b"loss_bucket", vault.key().as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = vault,
    )]
    pub loss_bucket: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_vault_handler(ctx: Context<InitializeVault>, vault_id: u32) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.id = vault_id;
    vault.usdc_mint = ctx.accounts.config.usdc_mint;
    vault.tranche_pdas = [Pubkey::default(); 3];
    vault.loan_pda = Pubkey::default();
    vault.state = crate::state::VaultState::Active;
    vault.total_deposits = 0;
    vault.total_loaned = 0;
    vault.last_yield_timestamp = clock.unix_timestamp;
    vault.credit_event_seq = 0;
    vault.bump = ctx.bumps.vault;

    Ok(())
}

pub fn reserves_handler(ctx: Context<InitializeVaultReserves>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.usdc_reserve = ctx.accounts.vault_usdc_reserve.key();
    Ok(())
}

pub fn loss_bucket_handler(ctx: Context<InitializeVaultLossBucket>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.loss_bucket = ctx.accounts.loss_bucket.key();
    Ok(())
}
