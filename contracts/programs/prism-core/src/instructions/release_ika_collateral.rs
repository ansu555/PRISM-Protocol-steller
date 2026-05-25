use crate::errors::PrismError;
use crate::state::{CollateralStatus, IkaCollateral, Loan, LoanState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct ReleaseIkaCollateral<'info> {
    /// Anyone may trigger release once the loan is provably Repaid.
    pub signer: Signer<'info>,

    #[account(
        constraint = loan.state == LoanState::Repaid @ PrismError::LoanInWrongState,
    )]
    pub loan: Account<'info, Loan>,

    #[account(
        mut,
        seeds = [b"ika_collateral_v2", loan.key().as_ref()],
        bump = ika_collateral.bump,
        constraint = ika_collateral.status == CollateralStatus::Locked
            @ PrismError::CollateralNotLocked,
    )]
    pub ika_collateral: Account<'info, IkaCollateral>,
}

/// Transition collateral from Locked → Released after full loan repayment.
///
/// This on-chain record is the authoritative signal to IKA Network to
/// unlock the dWallet and release the borrower's BTC/ETH.
pub fn release_ika_collateral_handler(ctx: Context<ReleaseIkaCollateral>) -> Result<()> {
    ctx.accounts.ika_collateral.status = CollateralStatus::Released;
    Ok(())
}
