use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::errors::AmmError;
use crate::events::SwapExecuted;
use crate::state::{AmmPool, BPS_DENOMINATOR};

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"amm", pool.tranche_mint.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Box<Account<'info, AmmPool>>,

    #[account(mut, constraint = tranche_reserve.key() == pool.tranche_reserve)]
    pub tranche_reserve: Box<Account<'info, TokenAccount>>,
    #[account(mut, constraint = quote_reserve.key() == pool.quote_reserve)]
    pub quote_reserve: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = pool.tranche_mint, token::authority = user)]
    pub user_tranche_ata: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = pool.quote_mint, token::authority = user)]
    pub user_quote_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<Swap>,
    amount_in: u64,
    min_amount_out: u64,
    direction: u8,
) -> Result<()> {
    require!(amount_in > 0, AmmError::PoolNotInitialized);

    let tranche_before = ctx.accounts.tranche_reserve.amount;
    let quote_before = ctx.accounts.quote_reserve.amount;
    require!(
        tranche_before > 0 && quote_before > 0,
        AmmError::PoolNotInitialized
    );

    let (reserve_in, reserve_out) = match direction {
        0 => (tranche_before, quote_before),
        1 => (quote_before, tranche_before),
        _ => return err!(AmmError::PoolNotInitialized),
    };

    let amount_in_less_fee = (amount_in as u128)
        .checked_mul((BPS_DENOMINATOR - ctx.accounts.pool.fee_bps as u64) as u128)
        .ok_or(AmmError::SlippageExceeded)?;
    let numerator = (reserve_out as u128)
        .checked_mul(amount_in_less_fee)
        .ok_or(AmmError::SlippageExceeded)?;
    let denominator = (reserve_in as u128)
        .checked_mul(BPS_DENOMINATOR as u128)
        .ok_or(AmmError::SlippageExceeded)?
        .checked_add(amount_in_less_fee)
        .ok_or(AmmError::SlippageExceeded)?;
    let amount_out =
        u64::try_from(numerator / denominator).map_err(|_| AmmError::SlippageExceeded)?;

    require!(amount_out >= min_amount_out, AmmError::SlippageExceeded);
    require!(amount_out > 0, AmmError::SlippageExceeded);

    let pool = &ctx.accounts.pool;
    let signer_seeds: &[&[&[u8]]] = &[&[b"amm", pool.tranche_mint.as_ref(), &[pool.bump]]];

    if direction == 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_tranche_ata.to_account_info(),
                    to: ctx.accounts.tranche_reserve.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.quote_reserve.to_account_info(),
                    to: ctx.accounts.user_quote_ata.to_account_info(),
                    authority: pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount_out,
        )?;
    } else {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_quote_ata.to_account_info(),
                    to: ctx.accounts.quote_reserve.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount_in,
        )?;
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.tranche_reserve.to_account_info(),
                    to: ctx.accounts.user_tranche_ata.to_account_info(),
                    authority: pool.to_account_info(),
                },
                signer_seeds,
            ),
            amount_out,
        )?;
    }

    let new_tranche_reserve = if direction == 0 {
        tranche_before
            .checked_add(amount_in)
            .ok_or(AmmError::SlippageExceeded)?
    } else {
        tranche_before
            .checked_sub(amount_out)
            .ok_or(AmmError::SlippageExceeded)?
    };
    let new_quote_reserve = if direction == 0 {
        quote_before
            .checked_sub(amount_out)
            .ok_or(AmmError::SlippageExceeded)?
    } else {
        quote_before
            .checked_add(amount_in)
            .ok_or(AmmError::SlippageExceeded)?
    };

    emit!(SwapExecuted {
        user: ctx.accounts.user.key(),
        pool: ctx.accounts.pool.key(),
        direction,
        amount_in,
        amount_out,
        new_tranche_reserve,
        new_quote_reserve,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
