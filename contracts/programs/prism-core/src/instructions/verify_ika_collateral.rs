use crate::errors::PrismError;
use crate::state::{CollateralStatus, GlobalConfig, IkaCollateral, Loan};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;

/// Oracle attestation message layout (81 bytes total):
///   b"ika_atts" (8)  — fixed prefix
///   dwallet_id (32)  — IKA dWallet identifier
///   chain_id   (1)   — 0=BTC, 1=ETH, 2=SUI
///   amount_usd (8)   — micro-USD, little-endian u64
///   loan_key   (32)  — the Loan account pubkey
const MSG_PREFIX: &[u8; 8] = b"ika_atts";
const MSG_LEN: usize = 81;

/// ed25519 native precompile address on Solana.
const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

#[derive(Accounts)]
pub struct VerifyIkaCollateral<'info> {
    /// Anyone may relay the oracle-signed attestation to the chain.
    pub signer: Signer<'info>,

    /// Read oracle_allowlist to validate the signer's key.
    #[account(seeds = [b"config2"], bump)]
    pub config: Account<'info, GlobalConfig>,

    pub loan: Account<'info, Loan>,

    #[account(
        mut,
        seeds = [b"ika_collateral_v2", loan.key().as_ref()],
        bump = ika_collateral.bump,
        constraint = ika_collateral.status == CollateralStatus::Pending
            @ PrismError::CollateralAlreadyLocked,
    )]
    pub ika_collateral: Account<'info, IkaCollateral>,

    /// CHECK: we only read this via ix_sysvar; Solana validates the address.
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

pub fn verify_ika_collateral_handler(ctx: Context<VerifyIkaCollateral>) -> Result<()> {
    let sysvar_info = &ctx.accounts.instructions_sysvar;
    
    // Scan the first 10 instructions to find the Ed25519 proof.
    // This avoids the unreliable load_current_index_checked function.
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
        msg!("Error: Ed25519 instruction not found in the first 10 instructions");
        PrismError::OracleSignatureInvalid
    })?;

    let data = &ix.data;
    require!(data.len() >= 16, PrismError::OracleSignatureInvalid);
    
    let pk_offset = u16::from_le_bytes(data[6..8].try_into().unwrap()) as usize;
    let msg_offset = u16::from_le_bytes(data[10..12].try_into().unwrap()) as usize;
    let msg_size = u16::from_le_bytes(data[12..14].try_into().unwrap()) as usize;

    let oracle_pk_bytes: [u8; 32] = data[pk_offset..pk_offset + 32].try_into().unwrap();
    let msg_bytes = &data[msg_offset..msg_offset + msg_size];

    let col = &ctx.accounts.ika_collateral;
    if oracle_pk_bytes != col.oracle_pubkey.to_bytes() {
        msg!("Error: Oracle public key mismatch");
        return Err(PrismError::OracleSignatureInvalid.into());
    }

    // Defence-in-depth: re-check the allowlist even if attach already validated it.
    // Protects against future oracle_pubkey mutation bugs or direct account writes.
    let signing_key = Pubkey::from(oracle_pk_bytes);
    require!(
        ctx.accounts.config.oracle_allowlist.contains(&signing_key),
        PrismError::OracleNotAllowlisted
    );

    if msg_size != MSG_LEN {
        msg!("Error: Message length mismatch. Expected {}, got {}", MSG_LEN, msg_size);
        return Err(PrismError::OracleSignatureInvalid.into());
    }

    if &msg_bytes[0..8] != MSG_PREFIX {
        msg!("Error: Message prefix mismatch");
        return Err(PrismError::OracleSignatureInvalid.into());
    }

    let attested_dwallet: [u8; 32] = msg_bytes[8..40].try_into().unwrap();
    if attested_dwallet != col.dwallet_id {
        msg!("Error: dWallet ID mismatch");
        return Err(PrismError::DwalletIdMismatch.into());
    }

    if msg_bytes[40] != col.chain_id {
        msg!("Error: Chain ID mismatch");
        return Err(PrismError::OracleSignatureInvalid.into());
    }

    let attested_amount = u64::from_le_bytes(msg_bytes[41..49].try_into().unwrap());
    if attested_amount < col.collateral_amount_usd {
        msg!("Error: Insufficient collateral. Attested: {}, Required: {}", attested_amount, col.collateral_amount_usd);
        return Err(PrismError::InsufficientCollateral.into());
    }

    let attested_loan: [u8; 32] = msg_bytes[49..81].try_into().unwrap();
    if attested_loan != ctx.accounts.loan.key().to_bytes() {
        msg!("Error: Loan pubkey mismatch in attestation");
        return Err(PrismError::OracleSignatureInvalid.into());
    }

    // Success!
    let col = &mut ctx.accounts.ika_collateral;
    col.status = CollateralStatus::Locked;
    col.locked_ts = Clock::get()?.unix_timestamp;
    col.collateral_amount_usd = attested_amount;

    Ok(())
}
