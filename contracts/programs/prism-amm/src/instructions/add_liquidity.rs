use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount, Transfer};

use crate::errors::AmmError;
use crate::events::LiquidityAdded;
use crate::state::{AmmPool, MIN_LIQUIDITY};

#[derive(Accounts)]
#[instruction(tranche_amount: u64, quote_amount: u64, min_lp_out: u64)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub lp: Signer<'info>, // admin in MVP

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

    #[account(
        init_if_needed,
        payer = lp,
        associated_token::mint = lp_mint,
        associated_token::authority = lp,
    )]
    pub lp_lp_ata: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<AddLiquidity>,
    tranche_amount: u64,
    quote_amount: u64,
    min_lp_out: u64,
) -> Result<()> {
    require!(
        tranche_amount > 0 && quote_amount > 0,
        AmmError::PoolNotInitialized
    );

    let tranche_reserve_before = ctx.accounts.tranche_reserve.amount;
    let quote_reserve_before = ctx.accounts.quote_reserve.amount;
    let lp_supply = ctx.accounts.lp_mint.supply;

    let lp_shares = if lp_supply == 0 {
        let geometric_mean = integer_sqrt(
            (tranche_amount as u128)
                .checked_mul(quote_amount as u128)
                .ok_or(AmmError::MinLiquidityViolation)?,
        );
        require!(
            geometric_mean > MIN_LIQUIDITY as u128,
            AmmError::MinLiquidityViolation
        );
        geometric_mean
            .checked_sub(MIN_LIQUIDITY as u128)
            .ok_or(AmmError::MinLiquidityViolation)?
    } else {
        require!(
            tranche_reserve_before > 0 && quote_reserve_before > 0,
            AmmError::PoolNotInitialized
        );

        let tranche_side = (tranche_amount as u128)
            .checked_mul(lp_supply as u128)
            .ok_or(AmmError::MinLiquidityViolation)?
            .checked_div(tranche_reserve_before as u128)
            .ok_or(AmmError::PoolNotInitialized)?;
        let quote_side = (quote_amount as u128)
            .checked_mul(lp_supply as u128)
            .ok_or(AmmError::MinLiquidityViolation)?
            .checked_div(quote_reserve_before as u128)
            .ok_or(AmmError::PoolNotInitialized)?;

        tranche_side.min(quote_side)
    };

    require!(lp_shares > 0, AmmError::MinLiquidityViolation);
    require!(lp_shares >= min_lp_out as u128, AmmError::SlippageExceeded);
    let lp_shares = u64::try_from(lp_shares).map_err(|_| AmmError::MinLiquidityViolation)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.lp_tranche_ata.to_account_info(),
                to: ctx.accounts.tranche_reserve.to_account_info(),
                authority: ctx.accounts.lp.to_account_info(),
            },
        ),
        tranche_amount,
    )?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.lp_quote_ata.to_account_info(),
                to: ctx.accounts.quote_reserve.to_account_info(),
                authority: ctx.accounts.lp.to_account_info(),
            },
        ),
        quote_amount,
    )?;

    let pool = &ctx.accounts.pool;
    let signer_seeds: &[&[&[u8]]] = &[&[b"amm", pool.tranche_mint.as_ref(), &[pool.bump]]];
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.lp_mint.to_account_info(),
                to: ctx.accounts.lp_lp_ata.to_account_info(),
                authority: pool.to_account_info(),
            },
            signer_seeds,
        ),
        lp_shares,
    )?;

    emit!(LiquidityAdded {
        lp: ctx.accounts.lp.key(),
        pool: ctx.accounts.pool.key(),
        tranche_amount,
        quote_amount,
        lp_shares_minted: lp_shares,
        timestamp: Clock::get()?.unix_timestamp,
    });

    Ok(())
}

fn integer_sqrt(value: u128) -> u128 {
    if value < 2 {
        return value;
    }

    let mut x = value;
    let mut y = (x + value / x) / 2;
    while y < x {
        x = y;
        y = (x + value / x) / 2;
    }
    x
}
