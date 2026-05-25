use crate::errors::PrismError;
use crate::state::{CollateralStatus, GlobalConfig, IkaCollateral, Loan, LoanState};
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;

#[derive(Accounts)]
pub struct AttachIkaCollateral<'info> {
    /// The borrower must sign — only the named borrower can attach collateral to their loan.
    #[account(mut)]
    pub borrower: Signer<'info>,

    #[account(seeds = [b"config2"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        constraint = loan.borrower == borrower.key() @ PrismError::BorrowerMismatch,
        constraint = loan.state == LoanState::Originated @ PrismError::LoanInWrongState,
    )]
    pub loan: Account<'info, Loan>,

    /// CHECK: Manually initialized to handle potential 'already in use' errors.
    #[account(
        mut,
        seeds = [b"ika_collateral_v2", loan.key().as_ref()],
        bump,
    )]
    pub ika_collateral: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

/// Register intent to use an IKA dWallet as collateral for `loan`.
pub fn attach_ika_collateral_handler(
    ctx: Context<AttachIkaCollateral>,
    dwallet_id: [u8; 32],
    chain_id: u8,
    collateral_amount_usd: u64,
    oracle_pubkey: Pubkey,
) -> Result<()> {
    require!(chain_id <= 2, PrismError::InvalidTrancheKind);

    require!(
        ctx.accounts.config.oracle_allowlist.contains(&oracle_pubkey),
        PrismError::OracleNotAllowlisted
    );

    let info = &ctx.accounts.ika_collateral;
    let mut is_new = false;

    // Manually handle initialization if account is empty or owned by System Program.
    if info.data_is_empty() || info.owner == &System::id() {
        let seeds = &[
            b"ika_collateral_v2",
            ctx.accounts.loan.to_account_info().key.as_ref(),
            &[ctx.bumps.ika_collateral],
        ];
        let signer_seeds = &[&seeds[..]];

        let space = 8 + IkaCollateral::INIT_SPACE;
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

    // Now deserialize and update the state.
    let mut col_data = info.try_borrow_mut_data()?;
    
    // Write discriminator if new.
    if is_new {
        col_data[0..8].copy_from_slice(&IkaCollateral::DISCRIMINATOR);
    }

    let mut col = IkaCollateral::try_deserialize(&mut &col_data[..])?;

    // If updating an existing account, only allow if it's still Pending.
    if !is_new {
        require!(col.status == CollateralStatus::Pending, PrismError::CollateralAlreadyActive);
    }

    col.loan = ctx.accounts.loan.key();
    col.dwallet_id = dwallet_id;
    col.chain_id = chain_id;
    col.collateral_amount_usd = collateral_amount_usd;
    col.status = CollateralStatus::Pending;
    col.oracle_pubkey = oracle_pubkey;
    col.locked_ts = 0;
    col.bump = ctx.bumps.ika_collateral;

    col.try_serialize(&mut &mut col_data[..])?;

    Ok(())
}
