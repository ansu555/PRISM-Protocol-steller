use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

use crate::errors::AmmError;
use crate::events::LiquidityRemoved;
use crate::state::AmmPool;

#[derive(Accounts)]
#[instruction(lp_amount: u64, min_tranche_out: u64, min_quote_out: u64)]
pub struct RemoveLiquidity<'info> {
    pub lp: Signer<'info>,

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

    #[account(mut, constraint = lp_mint.key() == pool.lp_mint)]
    pub lp_mint: Box<Account<'info, Mint>>,

    #[account(mut, token::mint = pool.tranche_mint, token::authority = lp)]
    pub lp_tranche_ata: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = pool.quote_mint, token::authority = lp)]
    pub lp_quote_ata: Box<Account<'info, TokenAccount>>,

    #[account(mut, token::mint = lp_mint, token::authority = lp)]
    pub lp_lp_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(
    ctx: Context<RemoveLiquidity>,
    lp_amount: u64,
    min_tranche_out: u64,
    min_quote_out: u64,
) -> Result<()> {
    require!(lp_amount > 0, AmmError::PoolNotInitialized);

    let supply = ctx.accounts.lp_mint.supply;
    require!(supply > 0, AmmError::PoolNotInitialized);

    let tranche_out = ((ctx.accounts.tranche_reserve.amount as u128)
        .checked_mul(lp_amount as u128)
        .ok_or(AmmError::MinLiquidityViolation)?
        / supply as u128) as u64;
    let quote_out = ((ctx.accounts.quote_reserve.amount as u128)
        .checked_mul(lp_amount as u128)
        .ok_or(AmmError::MinLiquidityViolation)?
        / supply as u128) as u64;

    require!(tranche_out >= min_tranche_out, AmmError::SlippageExceeded);
    require!(quote_out >= min_quote_out, AmmError::SlippageExceeded);

    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.lp_mint.to_account_info(),
                from: ctx.accounts.lp_lp_ata.to_account_info(),
                authority: ctx.accounts.lp.to_account_info(),
            },
        ),
        lp_amount,
    )?;

    let pool = &ctx.accounts.pool;
    let signer_seeds: &[&[&[u8]]] = &[&[b"amm", pool.tranche_mint.as_ref(), &[pool.bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.tranche_reserve.to_account_info(),
                to: ctx.accounts.lp_tranche_ata.to_account_info(),
                authority: pool.to_account_info(),
            },
            signer_seeds,
        ),
        tranche_out,
    )?;

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.quote_reserve.to_account_info(),
                to: ctx.accounts.lp_quote_ata.to_account_info(),
                authority: pool.to_account_info(),
            },
            signer_seeds,
        ),
        quote_out,
    )?;

    emit!(LiquidityRemoved {
        lp: ctx.accounts.lp.key(),
        pool: ctx.accounts.pool.key(),
        lp_amount,
        tranche_out,
        quote_out,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
