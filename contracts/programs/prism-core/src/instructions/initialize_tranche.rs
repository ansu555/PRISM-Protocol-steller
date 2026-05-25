use crate::state::{GlobalConfig, Tranche, Vault};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

#[derive(Accounts)]
#[instruction(kind: u8, target_apy_bps: u16)]
pub struct InitializeTranche<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(seeds = [b"config2"], bump, has_one = admin)]
    pub config: Account<'info, GlobalConfig>,

    #[account(mut, seeds = [b"vault", &vault.id.to_le_bytes()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,

    #[account(
        init,
        payer = admin,
        space = 8 + Tranche::INIT_SPACE,
        seeds = [b"tranche", vault.key().as_ref(), &[kind]],
        bump,
    )]
    pub tranche: Account<'info, Tranche>,

    /// SPL mint for pTRANCHE token. Mint authority = tranche PDA.
    #[account(
        init,
        payer = admin,
        seeds = [b"mint", vault.key().as_ref(), &[kind]],
        bump,
        mint::decimals = 6,
        mint::authority = tranche,
    )]
    pub tranche_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn initialize_tranche_handler(
    ctx: Context<InitializeTranche>,
    kind: u8,
    target_apy_bps: u16,
) -> Result<()> {
    // §9.4 initialize_tranche:
    // This creates one risk layer (Prime=0, Core=1, Alpha=2).
    // It simultaneously auto-creates the pTRANCHE SPL Mint via Anchor's #[account(init...)]
    // with mint::authority = tranche PDA. This means ONLY this program can mint/burn pTokens.
    //
    // After writing the tranche data, we register this tranche's address back into the
    // vault's tranche_pdas array at position `kind`. This lets the accrue_yield and
    // trigger_credit_event instructions find all three tranches efficiently.

    let clock = Clock::get()?;

    // Convert raw u8 kind to the enum. Anchor's constraint on the PDA seed already
    // ensures kind ∈ {0,1,2} by derivation, but we store the typed enum for clarity.
    let tranche_kind = match kind {
        0 => crate::state::TrancheKind::Prime,
        1 => crate::state::TrancheKind::Core,
        2 => crate::state::TrancheKind::Alpha,
        _ => return Err(crate::errors::PrismError::InvalidTrancheKind.into()),
    };

    let tranche = &mut ctx.accounts.tranche;
    tranche.vault = ctx.accounts.vault.key();
    tranche.kind = tranche_kind;
    tranche.mint = ctx.accounts.tranche_mint.key();
    tranche.target_apy_bps = target_apy_bps;
    tranche.total_assets = 0;
    tranche.total_supply = 0;
    // NAV starts at 0/0 = undefined. First deposit uses 1:1 ratio (handled in deposit.rs)
    tranche.nav_per_share_q = 0;
    tranche.cumulative_yield = 0;
    tranche.cumulative_loss = 0;
    tranche.last_nav_update_ts = clock.unix_timestamp;
    tranche.bump = ctx.bumps.tranche;

    // Register this tranche's PDA address in the vault's lookup array
    // so that accrue_yield and trigger_credit_event can find all three via the vault.
    let vault = &mut ctx.accounts.vault;
    vault.tranche_pdas[kind as usize] = tranche.key();

    Ok(())
}
