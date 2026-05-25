use crate::errors::PrismError;
use crate::state::{EncryptLoanHealth, EncryptStatus, GlobalConfig, Loan, LoanState};
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

#[derive(Accounts)]
pub struct AttachEncryptScore<'info> {
    /// Borrower signs — only the named borrower can register their credit-score commitment.
    #[account(mut)]
    pub borrower: Signer<'info>,

    #[account(seeds = [b"config2"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        constraint = loan.borrower == borrower.key() @ PrismError::BorrowerMismatch,
        constraint = loan.state == LoanState::Originated || loan.state == LoanState::Active
            @ PrismError::LoanInWrongState,
    )]
    pub loan: Account<'info, Loan>,

    /// CHECK: Manually initialized to handle potential 'already in use' errors.
    #[account(
        mut,
        seeds = [b"encrypt_health", loan.key().as_ref()],
        bump,
    )]
    pub encrypt_health: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Borrower registers an Encrypt FHE credit-score commitment for this loan.
/// The commitment is the sha256 of the borrower's Encrypt-sealed credit data.
pub fn attach_encrypt_score_handler(
    ctx: Context<AttachEncryptScore>,
    commitment: [u8; 32],
    encrypt_oracle: Pubkey,
) -> Result<()> {
    require!(
        ctx.accounts.config.oracle_allowlist.contains(&encrypt_oracle),
        PrismError::OracleNotAllowlisted
    );

    let info = &ctx.accounts.encrypt_health;
    let mut is_new = false;

    if info.data_is_empty() || info.owner == &System::id() {
        let seeds = &[
            b"encrypt_health".as_ref(),
            ctx.accounts.loan.to_account_info().key.as_ref(),
            &[ctx.bumps.encrypt_health],
        ];
        let signer_seeds = &[&seeds[..]];

        let space = 8 + EncryptLoanHealth::INIT_SPACE;
        let lamports = Rent::get()?.minimum_balance(space);

        if info.lamports() < lamports {
            anchor_lang::solana_program::program::invoke_signed(
                &anchor_lang::solana_program::system_instruction::transfer(
                    ctx.accounts.borrower.key,
                    info.key,
                    lamports - info.lamports(),
                ),
                &[
                    ctx.accounts.borrower.to_account_info(),
                    info.clone(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                signer_seeds,
            )?;
        }

        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::allocate(info.key, space as u64),
            &[info.clone(), ctx.accounts.system_program.to_account_info()],
            signer_seeds,
        )?;

        anchor_lang::solana_program::program::invoke_signed(
            &anchor_lang::solana_program::system_instruction::assign(info.key, ctx.program_id),
            &[info.clone(), ctx.accounts.system_program.to_account_info()],
            signer_seeds,
        )?;

        is_new = true;
    }

    let mut health_data = info.try_borrow_mut_data()?;

    if is_new {
        health_data[0..8].copy_from_slice(&EncryptLoanHealth::DISCRIMINATOR);
    }

    let mut health = EncryptLoanHealth::try_deserialize(&mut &health_data[..])?;

    if !is_new {
        require!(
            health.status != EncryptStatus::DefaultProven,
            PrismError::EncryptAlreadyDefaultProven
        );
    }

    health.loan = ctx.accounts.loan.key();
    health.score_commitment = commitment;
    health.encrypt_oracle = encrypt_oracle;
    health.status = EncryptStatus::Pending;
    health.default_proven_ts = 0;
    health.bump = ctx.bumps.encrypt_health;

    health.try_serialize(&mut &mut health_data[..])?;

    Ok(())
}
