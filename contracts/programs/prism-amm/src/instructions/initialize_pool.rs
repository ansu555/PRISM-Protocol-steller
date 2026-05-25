use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, InitializeAccount3, InitializeMint2, Mint, Token, TokenAccount};

use crate::state::AmmPool;

#[derive(Accounts)]
#[instruction(fee_bps: u16)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub tranche_mint: Box<Account<'info, Mint>>,
    pub quote_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = admin,
        space = 8 + AmmPool::INIT_SPACE,
        seeds = [b"amm", tranche_mint.key().as_ref()],
        bump,
    )]
    pub pool: Box<Account<'info, AmmPool>>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializePoolReserves<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(mut, seeds = [b"amm", pool.tranche_mint.as_ref()], bump = pool.bump)]
    pub pool: Box<Account<'info, AmmPool>>,

    pub tranche_mint: Box<Account<'info, Mint>>,
    pub quote_mint: Box<Account<'info, Mint>>,

    /// CHECK: PDA is derived and created in the handler as an SPL token account.
    #[account(mut, seeds = [b"amm_tranche", tranche_mint.key().as_ref()], bump)]
    pub tranche_reserve: UncheckedAccount<'info>,

    /// CHECK: PDA is derived and created in the handler as an SPL token account.
    #[account(mut, seeds = [b"amm_quote", tranche_mint.key().as_ref()], bump)]
    pub quote_reserve: UncheckedAccount<'info>,

    /// LP mint, authority = pool PDA
    /// CHECK: PDA is derived and created in the handler as an SPL mint.
    #[account(mut, seeds = [b"amm_lp", tranche_mint.key().as_ref()], bump)]
    pub lp_mint: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializePool>, fee_bps: u16) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    pool.tranche_mint = ctx.accounts.tranche_mint.key();
    pool.quote_mint = ctx.accounts.quote_mint.key();
    pool.fee_bps = fee_bps;
    pool.bump = ctx.bumps.pool;
    Ok(())
}

pub fn reserves_handler(ctx: Context<InitializePoolReserves>) -> Result<()> {
    create_pda_token_account(
        &ctx,
        ctx.accounts.tranche_reserve.to_account_info(),
        ctx.accounts.tranche_mint.to_account_info(),
        b"amm_tranche",
        ctx.bumps.tranche_reserve,
    )?;
    create_pda_token_account(
        &ctx,
        ctx.accounts.quote_reserve.to_account_info(),
        ctx.accounts.quote_mint.to_account_info(),
        b"amm_quote",
        ctx.bumps.quote_reserve,
    )?;
    create_pda_mint(&ctx)?;

    let pool = &mut ctx.accounts.pool;
    pool.tranche_reserve = ctx.accounts.tranche_reserve.key();
    pool.quote_reserve = ctx.accounts.quote_reserve.key();
    pool.lp_mint = ctx.accounts.lp_mint.key();
    Ok(())
}

fn create_pda_token_account<'info>(
    ctx: &Context<InitializePoolReserves<'info>>,
    account: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    seed: &'static [u8],
    bump: u8,
) -> Result<()> {
    let rent = Rent::get()?.minimum_balance(TokenAccount::LEN);
    let tranche_mint = ctx.accounts.tranche_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[seed, tranche_mint.as_ref(), &[bump]]];

    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.admin.to_account_info(),
                to: account.clone(),
            },
            signer_seeds,
        ),
        rent,
        TokenAccount::LEN as u64,
        &ctx.accounts.token_program.key(),
    )?;

    token::initialize_account3(CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        InitializeAccount3 {
            account,
            mint,
            authority: ctx.accounts.pool.to_account_info(),
        },
    ))
}

fn create_pda_mint<'info>(ctx: &Context<InitializePoolReserves<'info>>) -> Result<()> {
    let rent = Rent::get()?.minimum_balance(Mint::LEN);
    let tranche_mint = ctx.accounts.tranche_mint.key();
    let signer_seeds: &[&[&[u8]]] = &[&[b"amm_lp", tranche_mint.as_ref(), &[ctx.bumps.lp_mint]]];

    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::CreateAccount {
                from: ctx.accounts.admin.to_account_info(),
                to: ctx.accounts.lp_mint.to_account_info(),
            },
            signer_seeds,
        ),
        rent,
        Mint::LEN as u64,
        &ctx.accounts.token_program.key(),
    )?;

    token::initialize_mint2(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeMint2 {
                mint: ctx.accounts.lp_mint.to_account_info(),
            },
        ),
        6,
        &ctx.accounts.pool.key(),
        None,
    )
}
