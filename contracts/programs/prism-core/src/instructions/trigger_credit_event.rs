use crate::errors::PrismError;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount};

#[derive(Accounts)]
pub struct TriggerCreditEvent<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"config2"], bump)]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.state == VaultState::Active @ PrismError::VaultNotActive
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        mut,
        seeds = [b"tranche", vault.key().as_ref(), &[TrancheKind::Prime as u8]],
        bump = tranche_prime.bump,
    )]
    pub tranche_prime: Box<Account<'info, Tranche>>,

    #[account(
        mut,
        seeds = [b"tranche", vault.key().as_ref(), &[TrancheKind::Core as u8]],
        bump = tranche_core.bump,
    )]
    pub tranche_core: Box<Account<'info, Tranche>>,

    #[account(
        mut,
        seeds = [b"tranche", vault.key().as_ref(), &[TrancheKind::Alpha as u8]],
        bump = tranche_alpha.bump,
    )]
    pub tranche_alpha: Box<Account<'info, Tranche>>,

    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump)]
    pub vault_usdc_reserve: Box<Account<'info, TokenAccount>>,

    #[account(mut, seeds = [b"loss_bucket", vault.key().as_ref()], bump)]
    pub loss_bucket: Box<Account<'info, TokenAccount>>,

    #[account(
        init,
        payer = authority,
        space = 8 + CreditEvent::INIT_SPACE,
        seeds = [b"credit_event", vault.key().as_ref(), &vault.credit_event_seq.to_le_bytes()],
        bump
    )]
    pub credit_event: Box<Account<'info, CreditEvent>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn trigger_credit_event_handler(
    ctx: Context<TriggerCreditEvent>,
    event_type: u8,
    loss_amount: u64,
    severity_bps: u16,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    // 1. Authorization check
    let authority = ctx.accounts.authority.key();
    require!(
        authority == ctx.accounts.config.admin
            || ctx.accounts.config.oracle_allowlist.contains(&authority),
        PrismError::Unauthorized
    );

    // 2. Initialize CreditEvent
    let credit_event = &mut ctx.accounts.credit_event;
    credit_event.vault = vault.key();
    credit_event.seq = vault.credit_event_seq;
    credit_event.event_type = match event_type {
        0 => CreditEventType::Default,
        1 => CreditEventType::PartialLoss,
        2 => CreditEventType::Recovery,
        _ => return Err(PrismError::InvalidSeverity.into()), // Reuse error for invalid type
    };
    credit_event.loan = vault.loan_pda;
    credit_event.loss_amount = loss_amount;
    credit_event.severity_bps = severity_bps;
    credit_event.timestamp = clock.unix_timestamp;
    credit_event.triggered_by = authority;
    credit_event.bump = ctx.bumps.credit_event;

    // 3. Cascade logic (Reverse Waterfall)
    let mut remaining_loss = loss_amount;

    // Alpha takes the first hit
    let alpha_hit = std::cmp::min(remaining_loss, ctx.accounts.tranche_alpha.total_assets);
    ctx.accounts.tranche_alpha.total_assets -= alpha_hit;
    ctx.accounts.tranche_alpha.cumulative_loss += alpha_hit;
    remaining_loss -= alpha_hit;

    // Core takes the next hit
    let core_hit = std::cmp::min(remaining_loss, ctx.accounts.tranche_core.total_assets);
    ctx.accounts.tranche_core.total_assets -= core_hit;
    ctx.accounts.tranche_core.cumulative_loss += core_hit;
    remaining_loss -= core_hit;

    // Prime takes the final hit
    let prime_hit = std::cmp::min(remaining_loss, ctx.accounts.tranche_prime.total_assets);
    ctx.accounts.tranche_prime.total_assets -= prime_hit;
    ctx.accounts.tranche_prime.cumulative_loss += prime_hit;
    remaining_loss -= prime_hit;

    // 4. Move physical USDC to the loss bucket
    let vault_id_bytes = vault.id.to_le_bytes();
    let bump_bytes = [vault.bump];
    let vault_seeds: &[&[u8]] = &[b"vault", &vault_id_bytes, &bump_bytes];
    let signer = &[vault_seeds];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.vault_usdc_reserve.to_account_info(),
                to: ctx.accounts.loss_bucket.to_account_info(),
                authority: vault.to_account_info(),
            },
            signer,
        ),
        loss_amount,
    )?;

    // 5. Update NAV for all tranches
    ctx.accounts.tranche_alpha.nav_per_share_q = crate::math::q::compute_nav_q(
        ctx.accounts.tranche_alpha.total_assets,
        ctx.accounts.tranche_alpha.total_supply,
    );
    ctx.accounts.tranche_core.nav_per_share_q = crate::math::q::compute_nav_q(
        ctx.accounts.tranche_core.total_assets,
        ctx.accounts.tranche_core.total_supply,
    );
    ctx.accounts.tranche_prime.nav_per_share_q = crate::math::q::compute_nav_q(
        ctx.accounts.tranche_prime.total_assets,
        ctx.accounts.tranche_prime.total_supply,
    );

    // 6. Update Vault state
    if event_type == CreditEventType::Default as u8 {
        vault.state = VaultState::Defaulted;
    }
    vault.credit_event_seq += 1;

    Ok(())
}
