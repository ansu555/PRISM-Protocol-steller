use crate::errors::PrismError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(tranche_kind: u8, usdc_amount: u64)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [b"config2"], bump, constraint = !config.paused @ PrismError::VaultPaused)]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.state == VaultState::Active @ PrismError::VaultNotActive
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        seeds = [b"tranche", vault.key().as_ref(), &[tranche_kind]],
        bump = tranche.bump,
    )]
    pub tranche: Box<Account<'info, Tranche>>,

    #[account(
        mut,
        seeds = [b"mint", vault.key().as_ref(), &[tranche_kind]],
        bump,
    )]
    pub tranche_mint: Box<Account<'info, Mint>>,

    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump)]
    pub vault_usdc_reserve: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = config.usdc_mint,
        token::authority = user,
    )]
    pub user_usdc_ata: Box<Account<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = tranche_mint,
        associated_token::authority = user,
    )]
    pub user_tranche_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn deposit_handler(ctx: Context<Deposit>, tranche_kind: u8, usdc_amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let tranche = &mut ctx.accounts.tranche;
    let clock = Clock::get()?;

    // 1. Calculate how many shares (pTokens) the user should get.
    // If this is the first deposit, shares = usdc_amount.
    // Otherwise, shares = usdc_amount / nav_per_share.
    let shares =
        crate::math::q::deposit_shares(usdc_amount, tranche.nav_per_share_q, tranche.total_supply)?;

    // 2. Transfer USDC from user wallet to the Vault Reserve.
    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.user_usdc_ata.to_account_info(),
                to: ctx.accounts.vault_usdc_reserve.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        usdc_amount,
    )?;

    // 3. Mint pTokens to the user.
    // Since the Tranche PDA is the mint authority, we must sign with its seeds.
    let vault_key = vault.key();
    let seeds = &[
        b"tranche",
        vault_key.as_ref(),
        &[tranche_kind],
        &[tranche.bump],
    ];
    let signer = &[&seeds[..]];

    anchor_spl::token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::MintTo {
                mint: ctx.accounts.tranche_mint.to_account_info(),
                to: ctx.accounts.user_tranche_ata.to_account_info(),
                authority: tranche.to_account_info(),
            },
            signer,
        ),
        shares,
    )?;

    // 4. Update the on-chain accounting.
    tranche.total_assets += usdc_amount;
    tranche.total_supply += shares;

    // Refresh the NAV.
    tranche.nav_per_share_q =
        crate::math::q::compute_nav_q(tranche.total_assets, tranche.total_supply);
    tranche.last_nav_update_ts = clock.unix_timestamp;

    vault.total_deposits += usdc_amount;

    Ok(())
}
