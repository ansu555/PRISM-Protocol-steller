use crate::errors::PrismError;
use crate::state::{CollateralStatus, GlobalConfig, IkaCollateral, Loan, LoanState, Vault};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;
use anchor_spl::token::{Token, TokenAccount};

const MSG_PREFIX: &[u8; 8] = b"ika_atts";
const MSG_LEN: usize = 81;
const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

/// Combined atomic instruction: verify IKA oracle attestation AND disburse loan
/// in a single transaction, callable by the borrower alone.
///
/// Prerequisites (set by admin offline):
///   - Loan is in `Originated` state
///   - IkaCollateral account exists in `Pending` state
///
/// The tx must be structured as:
///   ix[n]  Ed25519Program (native precompile — oracle sig)
///   ix[n+1] verify_and_disburse (this instruction)
#[derive(Accounts)]
pub struct VerifyAndDisburse<'info> {
    /// Borrower initiates — no admin needed after loan origination.
    pub borrower: Signer<'info>,

    #[account(seeds = [b"config2"], bump)]
    pub config: Account<'info, GlobalConfig>,

    #[account(
        mut,
        seeds = [b"vault", &vault.id.to_le_bytes()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        has_one = vault,
        constraint = loan.borrower == borrower.key() @ PrismError::BorrowerMismatch,
        constraint = loan.state == LoanState::Originated @ PrismError::LoanInWrongState,
    )]
    pub loan: Account<'info, Loan>,

    #[account(
        mut,
        seeds = [b"ika_collateral_v2", loan.key().as_ref()],
        bump = ika_collateral.bump,
        constraint = ika_collateral.status == CollateralStatus::Pending
            @ PrismError::CollateralAlreadyLocked,
        constraint = ika_collateral.loan == loan.key() @ PrismError::DwalletIdMismatch,
    )]
    pub ika_collateral: Account<'info, IkaCollateral>,

    #[account(mut, seeds = [b"reserve", vault.key().as_ref()], bump)]
    pub vault_usdc_reserve: Account<'info, TokenAccount>,

    #[account(mut, token::mint = config.usdc_mint, token::authority = borrower)]
    pub borrower_usdc_ata: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    /// CHECK: only read via ix_sysvar; Solana validates the address.
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn verify_and_disburse_handler(ctx: Context<VerifyAndDisburse>) -> Result<()> {
    // ── 1. Find and parse the Ed25519 precompile instruction ────────────────
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
        msg!("Ed25519 instruction not found in the first 10 instructions");
        PrismError::OracleSignatureInvalid
    })?;

    let data = &ix.data;
    require!(data.len() >= 16, PrismError::OracleSignatureInvalid);

    let pk_offset  = u16::from_le_bytes(data[6..8].try_into().unwrap())   as usize;
    let msg_offset = u16::from_le_bytes(data[10..12].try_into().unwrap()) as usize;
    let msg_size   = u16::from_le_bytes(data[12..14].try_into().unwrap()) as usize;

    let oracle_pk_bytes: [u8; 32] = data[pk_offset..pk_offset + 32].try_into().unwrap();
    let msg_bytes = &data[msg_offset..msg_offset + msg_size];

    // ── 2. Validate oracle key ───────────────────────────────────────────────
    let col = &ctx.accounts.ika_collateral;
    require!(
        oracle_pk_bytes == col.oracle_pubkey.to_bytes(),
        PrismError::OracleSignatureInvalid
    );
    let signing_key = Pubkey::from(oracle_pk_bytes);
    require!(
        ctx.accounts.config.oracle_allowlist.contains(&signing_key),
        PrismError::OracleNotAllowlisted
    );

    // ── 3. Validate attestation message fields ───────────────────────────────
    require!(msg_size == MSG_LEN, PrismError::OracleSignatureInvalid);
    require!(&msg_bytes[0..8] == MSG_PREFIX, PrismError::OracleSignatureInvalid);

    let attested_dwallet: [u8; 32] = msg_bytes[8..40].try_into().unwrap();
    require!(attested_dwallet == col.dwallet_id, PrismError::DwalletIdMismatch);
    require!(msg_bytes[40] == col.chain_id, PrismError::OracleSignatureInvalid);

    let attested_amount = u64::from_le_bytes(msg_bytes[41..49].try_into().unwrap());
    require!(attested_amount >= col.collateral_amount_usd, PrismError::InsufficientCollateral);

    let attested_loan: [u8; 32] = msg_bytes[49..81].try_into().unwrap();
    require!(
        attested_loan == ctx.accounts.loan.key().to_bytes(),
        PrismError::OracleSignatureInvalid
    );

    // ── 4. Lock collateral ───────────────────────────────────────────────────
    let col = &mut ctx.accounts.ika_collateral;
    col.status = CollateralStatus::Locked;
    col.locked_ts = Clock::get()?.unix_timestamp;
    col.collateral_amount_usd = attested_amount;

    // ── 5. Disburse — vault PDA signs the token transfer ────────────────────
    let vault = &ctx.accounts.vault;
    let vault_id_bytes = vault.id.to_le_bytes();
    let bump_bytes = [vault.bump];
    let vault_seeds: &[&[u8]] = &[b"vault", &vault_id_bytes, &bump_bytes];

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.vault_usdc_reserve.to_account_info(),
                to: ctx.accounts.borrower_usdc_ata.to_account_info(),
                authority: vault.to_account_info(),
            },
            &[vault_seeds],
        ),
        ctx.accounts.loan.principal,
    )?;

    // ── 6. Advance loan state ────────────────────────────────────────────────
    let vault = &mut ctx.accounts.vault;
    let loan = &mut ctx.accounts.loan;
    loan.state = LoanState::Active;
    vault.total_loaned += loan.principal;

    Ok(())
}
