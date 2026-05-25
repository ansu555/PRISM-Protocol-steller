use crate::errors::PrismError;
use crate::state::{CollateralStatus, GlobalConfig, IkaCollateral, Loan, LoanState, Vault, VaultState};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct LiquidateIkaCollateral<'info> {
    pub admin: Signer<'info>,

    #[account(seeds = [b"config2"], bump, has_one = admin)]
    pub config: Account<'info, GlobalConfig>,

    /// Vault must be Defaulted before admin can liquidate collateral.
    #[account(
        constraint = matches!(vault.state, VaultState::Defaulted | VaultState::Resolved)
            @ PrismError::VaultNotActive,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        has_one = vault,
        constraint = loan.state == LoanState::Defaulted @ PrismError::LoanInWrongState,
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

/// Transition collateral from Locked → Liquidated after a vault default.
///
/// The Liquidated status signals IKA Network to initiate collateral seizure
/// and transfer to the protocol's designated recovery wallet on the respective chain.
pub fn liquidate_ika_collateral_handler(ctx: Context<LiquidateIkaCollateral>) -> Result<()> {
    ctx.accounts.ika_collateral.status = CollateralStatus::Liquidated;
    Ok(())
}
