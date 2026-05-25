use crate::errors::PrismError;
use crate::state::{CollateralStatus, GlobalConfig, IkaCollateral, Loan, LoanState, Vault};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

#[derive(Accounts)]
pub struct DisburseLoan<'info> {
    pub admin: Signer<'info>,

    #[account(seeds = [b"config2"], bump, has_one = admin)]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut, seeds = [b"vault", &vault.id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    #[account(mut, has_one = vault, constraint = loan.state == LoanState::Originated)]
    pub loan: Account<'info, Loan>,

    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump)]
    pub vault_usdc_reserve: Account<'info, TokenAccount>,

    #[account(mut, token::mint = config.usdc_mint, token::authority = loan.borrower)]
    pub borrower_usdc_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    /// Optional IKA collateral PDA.  If provided, must be in Locked state.
    /// Pass SystemProgram when not using IKA collateral.
    pub ika_collateral: Option<Account<'info, IkaCollateral>>,
}

pub fn disburse_loan_handler(ctx: Context<DisburseLoan>) -> Result<()> {
    // If IKA collateral was provided, it must be oracle-verified (Locked).
    if let Some(col) = &ctx.accounts.ika_collateral {
        require!(
            col.status == CollateralStatus::Locked,
            PrismError::CollateralNotLocked
        );
        require!(col.loan == ctx.accounts.loan.key(), PrismError::DwalletIdMismatch);
    }

    let vault = &mut ctx.accounts.vault;
    let loan = &mut ctx.accounts.loan;
    let principal = loan.principal;

    let vault_id_bytes = vault.id.to_le_bytes();
    let bump_bytes = [vault.bump];
    let vault_seeds: &[&[u8]] = &[b"vault", &vault_id_bytes, &bump_bytes];
    let signer = &[vault_seeds];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.vault_usdc_reserve.to_account_info(),
                to: ctx.accounts.borrower_usdc_ata.to_account_info(),
                authority: vault.to_account_info(),
            },
            signer,
        ),
        principal,
    )?;

    loan.state = LoanState::Active;
    vault.total_loaned += principal;

    Ok(())
}
