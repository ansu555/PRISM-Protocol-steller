use crate::state::{GlobalConfig, Loan, Vault};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(loan_id: u32, principal: u64, apr_bps: u16, maturity_ts: i64, borrower: Pubkey)]
pub struct InitializeLoan<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"config2"], bump, has_one = admin)]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut, seeds = [b"vault", &vault.id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = admin,
        space = 8 + Loan::INIT_SPACE,
        seeds = [b"loan", vault.key().as_ref(), &loan_id.to_le_bytes()],
        bump,
    )]
    pub loan: Account<'info, Loan>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_loan_handler(
    ctx: Context<InitializeLoan>,
    loan_id: u32,
    principal: u64,
    apr_bps: u16,
    maturity_ts: i64,
    borrower: Pubkey,
) -> Result<()> {
    // §9.4 initialize_loan:
    // This defines the underlying debt asset the vault is funding.
    // In the MVP, the loan state is Originated and no USDC is disbursed.
    // The vault keeps all USDC so the waterfall and default cascade can be demonstrated.
    //
    // Validations:
    //   apr_bps must be <= 10000 (100% APR max — sanity check)
    //   maturity_ts must be in the future
    //
    // After creating the loan, we write its PDA address back into vault.loan_pda.
    // This "wires" the full graph: Config → Vault → [Tranches x3, Loan]

    let clock = Clock::get()?;

    require!(
        apr_bps <= 10_000,
        crate::errors::PrismError::InvalidSeverity
    );
    require!(
        maturity_ts > clock.unix_timestamp,
        crate::errors::PrismError::LoanInWrongState
    );

    let loan = &mut ctx.accounts.loan;
    loan.id = loan_id;
    loan.vault = ctx.accounts.vault.key();
    loan.borrower = borrower;
    loan.principal = principal;
    loan.apr_bps = apr_bps;
    loan.origination_ts = clock.unix_timestamp;
    loan.maturity_ts = maturity_ts;
    loan.state = crate::state::LoanState::Originated;
    loan.total_repaid = 0;
    loan.bump = ctx.bumps.loan;

    // Complete the vault → loan pointer so other instructions can find the loan via vault
    let vault = &mut ctx.accounts.vault;
    vault.loan_pda = loan.key();

    Ok(())
}
