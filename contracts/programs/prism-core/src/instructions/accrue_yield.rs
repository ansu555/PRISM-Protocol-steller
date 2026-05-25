use crate::errors::PrismError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

#[derive(Accounts)]
pub struct AccrueYield<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"config2"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.state == VaultState::Active @ PrismError::VaultNotActive
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"tranche", vault.key().as_ref(), &[TrancheKind::Prime as u8]],
        bump = tranche_prime.bump,
    )]
    pub tranche_prime: Account<'info, Tranche>,

    #[account(
        mut,
        seeds = [b"tranche", vault.key().as_ref(), &[TrancheKind::Core as u8]],
        bump = tranche_core.bump,
    )]
    pub tranche_core: Account<'info, Tranche>,

    #[account(
        mut,
        seeds = [b"tranche", vault.key().as_ref(), &[TrancheKind::Alpha as u8]],
        bump = tranche_alpha.bump,
    )]
    pub tranche_alpha: Account<'info, Tranche>,

    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump)]
    pub vault_usdc_reserve: Account<'info, TokenAccount>,

    /// The borrower wallet that pays the yield
    pub borrower: Signer<'info>,

    #[account(
        mut,
        token::mint = config.usdc_mint,
        token::authority = borrower.key(),
    )]
    pub borrower_usdc_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn accrue_yield_handler(ctx: Context<AccrueYield>, yield_amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    // 1. Authorization check
    let authority = ctx.accounts.authority.key();
    require!(
        authority == ctx.accounts.config.admin
            || ctx.accounts.config.oracle_allowlist.contains(&authority),
        PrismError::Unauthorized
    );

    // 2. Time elapsed for interest calculation
    let elapsed = clock
        .unix_timestamp
        .saturating_sub(vault.last_yield_timestamp);
    if elapsed == 0 {
        return Ok(());
    }

    // 3. Calculate targets (Waterfall Math)
    let year_seconds: u128 = 365 * 24 * 3600;

    let prime_target = (ctx.accounts.tranche_prime.total_assets as u128)
        .checked_mul(ctx.accounts.tranche_prime.target_apy_bps as u128)
        .ok_or(PrismError::ArithmeticOverflow)?
        .checked_mul(elapsed as u128)
        .ok_or(PrismError::ArithmeticOverflow)?
        / (year_seconds * 10000);

    let core_target = (ctx.accounts.tranche_core.total_assets as u128)
        .checked_mul(ctx.accounts.tranche_core.target_apy_bps as u128)
        .ok_or(PrismError::ArithmeticOverflow)?
        .checked_mul(elapsed as u128)
        .ok_or(PrismError::ArithmeticOverflow)?
        / (year_seconds * 10000);

    // 4. Apply Waterfall
    let mut remaining = yield_amount;

    let prime_take = std::cmp::min(prime_target as u64, remaining);
    remaining -= prime_take;

    let core_take = std::cmp::min(core_target as u64, remaining);
    remaining -= core_take;

    let alpha_take = remaining;

    // 5. Physical Transfer: Borrower -> Vault Reserve
    // Note: Borrower must have signed or delegated to admin in a real scenario.
    // For this test-friendly handler, we use the borrower's signature.
    anchor_spl::token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.borrower_usdc_ata.to_account_info(),
                to: ctx.accounts.vault_usdc_reserve.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            },
        ),
        yield_amount,
    )?;

    // 6. Update Tranche states
    ctx.accounts.tranche_prime.total_assets += prime_take;
    ctx.accounts.tranche_prime.cumulative_yield += prime_take;
    ctx.accounts.tranche_prime.nav_per_share_q = crate::math::q::compute_nav_q(
        ctx.accounts.tranche_prime.total_assets,
        ctx.accounts.tranche_prime.total_supply,
    );
    ctx.accounts.tranche_prime.last_nav_update_ts = clock.unix_timestamp;

    ctx.accounts.tranche_core.total_assets += core_take;
    ctx.accounts.tranche_core.cumulative_yield += core_take;
    ctx.accounts.tranche_core.nav_per_share_q = crate::math::q::compute_nav_q(
        ctx.accounts.tranche_core.total_assets,
        ctx.accounts.tranche_core.total_supply,
    );
    ctx.accounts.tranche_core.last_nav_update_ts = clock.unix_timestamp;

    ctx.accounts.tranche_alpha.total_assets += alpha_take;
    ctx.accounts.tranche_alpha.cumulative_yield += alpha_take;
    ctx.accounts.tranche_alpha.nav_per_share_q = crate::math::q::compute_nav_q(
        ctx.accounts.tranche_alpha.total_assets,
        ctx.accounts.tranche_alpha.total_supply,
    );
    ctx.accounts.tranche_alpha.last_nav_update_ts = clock.unix_timestamp;

    vault.last_yield_timestamp = clock.unix_timestamp;

    Ok(())
}
