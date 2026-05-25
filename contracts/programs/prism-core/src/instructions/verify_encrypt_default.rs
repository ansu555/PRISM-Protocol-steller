use crate::errors::PrismError;
use crate::state::{
    CreditEvent, CreditEventType, EncryptLoanHealth, EncryptStatus, GlobalConfig, Loan, Tranche,
    TrancheKind, Vault, VaultState,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
use anchor_spl::token::{Token, TokenAccount};

/// Encrypt FHE attestation message layout (73 bytes total):
///   b"enc_atts"   (8)  — fixed prefix
///   loan_key      (32) — Loan account pubkey
///   commitment    (32) — score_commitment registered in EncryptLoanHealth
///   result        (1)  — 0x01 = default proven (total_repaid < principal is true)
const MSG_PREFIX: &[u8; 8] = b"enc_atts";
const MSG_LEN: usize = 73;

/// Ed25519 native precompile program id on Solana.
const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

#[derive(Accounts)]
pub struct VerifyEncryptDefault<'info> {
    /// Anyone may relay the oracle-signed attestation. The oracle key itself
    /// is verified against the global allowlist below.
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(seeds = [b"config2"], bump)]
    pub config: Box<Account<'info, GlobalConfig>>,

    pub loan: Account<'info, Loan>,

    #[account(
        mut,
        seeds = [b"encrypt_health", loan.key().as_ref()],
        bump = encrypt_health.bump,
        constraint = encrypt_health.status != EncryptStatus::DefaultProven
            @ PrismError::EncryptAlreadyDefaultProven,
        constraint = encrypt_health.loan == loan.key() @ PrismError::EncryptSignatureInvalid,
    )]
    pub encrypt_health: Account<'info, EncryptLoanHealth>,

    // ── Cascade accounts (mirror TriggerCreditEvent) ───────────────────────
    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
        constraint = vault.state == VaultState::Active @ PrismError::VaultNotActive,
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
        payer = signer,
        space = 8 + CreditEvent::INIT_SPACE,
        seeds = [b"credit_event", vault.key().as_ref(), &vault.credit_event_seq.to_le_bytes()],
        bump,
    )]
    pub credit_event: Box<Account<'info, CreditEvent>>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,

    /// CHECK: only read via ix_sysvar; Solana validates the address.
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn verify_encrypt_default_handler(
    ctx: Context<VerifyEncryptDefault>,
    loss_amount: u64,
    severity_bps: u16,
) -> Result<()> {
    // ── 1. Locate the Ed25519 precompile instruction in this transaction ───
    let sysvar_info = &ctx.accounts.instructions_sysvar;

    let mut ed25519_ix = None;
    for i in 0..10 {
        if let Ok(ix) = ix_sysvar::load_instruction_at_checked(i, sysvar_info) {
            if ix.program_id == ED25519_PROGRAM_ID {
                ed25519_ix = Some(ix);
                break;
            }
        }
    }
    let ix = ed25519_ix.ok_or_else(|| {
        msg!("Encrypt FHE: Ed25519 precompile instruction not found");
        PrismError::EncryptSignatureInvalid
    })?;

    let data = &ix.data;
    require!(data.len() >= 16, PrismError::EncryptSignatureInvalid);

    // Ed25519 precompile data layout: 16-byte header + sig + pk + msg.
    let pk_offset = u16::from_le_bytes(data[6..8].try_into().unwrap()) as usize;
    let msg_offset = u16::from_le_bytes(data[10..12].try_into().unwrap()) as usize;
    let msg_size = u16::from_le_bytes(data[12..14].try_into().unwrap()) as usize;

    let oracle_pk_bytes: [u8; 32] = data[pk_offset..pk_offset + 32].try_into().unwrap();
    let msg_bytes = &data[msg_offset..msg_offset + msg_size];

    // ── 2. Validate oracle key matches the one registered at attach time ───
    let health_ref = &ctx.accounts.encrypt_health;
    if oracle_pk_bytes != health_ref.encrypt_oracle.to_bytes() {
        msg!("Encrypt FHE: oracle pubkey mismatch with registered EncryptLoanHealth");
        return Err(PrismError::EncryptSignatureInvalid.into());
    }

    // Defence-in-depth: re-check the global allowlist.
    let signing_key = Pubkey::from(oracle_pk_bytes);
    require!(
        ctx.accounts.config.oracle_allowlist.contains(&signing_key),
        PrismError::OracleNotAllowlisted
    );

    // ── 3. Validate the 73-byte attestation message ─────────────────────────
    require!(msg_size == MSG_LEN, PrismError::EncryptSignatureInvalid);
    require!(
        &msg_bytes[0..8] == MSG_PREFIX,
        PrismError::EncryptSignatureInvalid
    );

    let attested_loan: [u8; 32] = msg_bytes[8..40].try_into().unwrap();
    if attested_loan != ctx.accounts.loan.key().to_bytes() {
        msg!("Encrypt FHE: loan pubkey mismatch in attestation");
        return Err(PrismError::EncryptSignatureInvalid.into());
    }

    let attested_commitment: [u8; 32] = msg_bytes[40..72].try_into().unwrap();
    if attested_commitment != health_ref.score_commitment {
        msg!("Encrypt FHE: score commitment mismatch");
        return Err(PrismError::EncryptCommitmentMismatch.into());
    }

    let result_byte = msg_bytes[72];
    require!(result_byte == 0x01, PrismError::EncryptDefaultNotProven);

    // ── 4. Mark EncryptLoanHealth as DefaultProven ──────────────────────────
    let clock = Clock::get()?;
    let health = &mut ctx.accounts.encrypt_health;
    health.status = EncryptStatus::DefaultProven;
    health.default_proven_ts = clock.unix_timestamp;

    msg!(
        "PRISM FHE: default proven via Encrypt oracle. commitment={:?}",
        health.score_commitment
    );

    // ── 5. Inline credit-event cascade (mirrors trigger_credit_event_handler) ─
    let vault = &mut ctx.accounts.vault;
    let credit_event = &mut ctx.accounts.credit_event;
    credit_event.vault = vault.key();
    credit_event.seq = vault.credit_event_seq;
    credit_event.event_type = CreditEventType::Default;
    credit_event.loan = vault.loan_pda;
    credit_event.loss_amount = loss_amount;
    credit_event.severity_bps = severity_bps;
    credit_event.timestamp = clock.unix_timestamp;
    credit_event.triggered_by = ctx.accounts.signer.key();
    credit_event.bump = ctx.bumps.credit_event;
    credit_event.recovery_amount = 0;

    let mut remaining_loss = loss_amount;

    let alpha_hit = std::cmp::min(remaining_loss, ctx.accounts.tranche_alpha.total_assets);
    ctx.accounts.tranche_alpha.total_assets -= alpha_hit;
    ctx.accounts.tranche_alpha.cumulative_loss += alpha_hit;
    remaining_loss -= alpha_hit;

    let core_hit = std::cmp::min(remaining_loss, ctx.accounts.tranche_core.total_assets);
    ctx.accounts.tranche_core.total_assets -= core_hit;
    ctx.accounts.tranche_core.cumulative_loss += core_hit;
    remaining_loss -= core_hit;

    let prime_hit = std::cmp::min(remaining_loss, ctx.accounts.tranche_prime.total_assets);
    ctx.accounts.tranche_prime.total_assets -= prime_hit;
    ctx.accounts.tranche_prime.cumulative_loss += prime_hit;

    let vault_id_bytes = vault.id.to_le_bytes();
    let bump_bytes = [vault.bump];
    let vault_seeds: &[&[u8]] = &[b"vault", &vault_id_bytes, &bump_bytes];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.vault_usdc_reserve.to_account_info(),
                to: ctx.accounts.loss_bucket.to_account_info(),
                authority: vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        loss_amount,
    )?;

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

    vault.state = VaultState::Defaulted;
    vault.credit_event_seq += 1;

    Ok(())
}
