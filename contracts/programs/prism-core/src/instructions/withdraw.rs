use crate::errors::PrismError;
use crate::state::{GlobalConfig, Tranche, Vault, VaultState};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
#[instruction(tranche_kind: u8, share_amount: u64)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(seeds = [b"config2"], bump, constraint = !config.paused @ PrismError::VaultPaused)]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
        constraint = matches!(vault.state, VaultState::Active | VaultState::Defaulted) @ PrismError::VaultNotActive
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

    #[account(mut, token::mint = tranche_mint, token::authority = user)]
    pub user_tranche_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = config.usdc_mint, token::authority = user)]
    pub user_usdc_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn withdraw_handler(
    ctx: Context<Withdraw>,
    _tranche_kind: u8,
    share_amount: u64,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let tranche = &mut ctx.accounts.tranche;
    let clock = Clock::get()?;

    // 1. Calculate how much USDC the shares are worth.
    // Payout = shares * NAV.
    let payout = crate::math::q::withdraw_payout(share_amount, tranche.nav_per_share_q)?;

    // 2. Burn the user's pTokens.
    anchor_spl::token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Burn {
                mint: ctx.accounts.tranche_mint.to_account_info(),
                from: ctx.accounts.user_tranche_ata.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        share_amount,
    )?;

    // 3. Transfer the USDC payout from the Vault Reserve to the user.
    if payout > 0 {
        let vault_id_bytes = vault.id.to_le_bytes();
        let bump_bytes = [vault.bump];
        let vault_seeds: &[&[u8]] = &[b"vault", &vault_id_bytes, &bump_bytes];
        let signer = &[vault_seeds];

        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.vault_usdc_reserve.to_account_info(),
                    to: ctx.accounts.user_usdc_ata.to_account_info(),
                    authority: vault.to_account_info(),
                },
                signer,
            ),
            payout,
        )?;
    }

    // 4. Update the on-chain accounting.
    tranche.total_assets = tranche.total_assets.saturating_sub(payout);
    tranche.total_supply = tranche.total_supply.saturating_sub(share_amount);

    // Refresh the NAV.
    tranche.nav_per_share_q =
        crate::math::q::compute_nav_q(tranche.total_assets, tranche.total_supply);
    tranche.last_nav_update_ts = clock.unix_timestamp;

    vault.total_deposits = vault.total_deposits.saturating_sub(payout);

    Ok(())
}
