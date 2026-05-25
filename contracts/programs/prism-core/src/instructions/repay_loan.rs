use crate::state::{GlobalConfig, Loan, Vault};
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

#[derive(Accounts)]
pub struct RepayLoan<'info> {
    pub borrower: Signer<'info>,

    #[account(seeds = [b"config2"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut, seeds = [b"vault", &vault.id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    #[account(mut, has_one = vault, constraint = loan.borrower == borrower.key())]
    pub loan: Account<'info, Loan>,

    #[account(mut, token::mint = config.usdc_mint, token::authority = borrower)]
    pub borrower_usdc_ata: Account<'info, TokenAccount>,

    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump)]
    pub vault_usdc_reserve: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn repay_loan_handler(ctx: Context<RepayLoan>, amount: u64) -> Result<()> {
    let loan = &mut ctx.accounts.loan;

    // 1. Physical Transfer: Borrower -> Vault Reserve
    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.borrower_usdc_ata.to_account_info(),
                to: ctx.accounts.vault_usdc_reserve.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            },
        ),
        amount,
    )?;

    // 2. Update accounting
    loan.total_repaid += amount;

    if loan.total_repaid >= loan.principal {
        loan.state = crate::state::LoanState::Repaid;
    }

    Ok(())
}
