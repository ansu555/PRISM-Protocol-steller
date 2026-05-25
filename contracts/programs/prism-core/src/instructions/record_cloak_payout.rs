use crate::errors::PrismError;
use crate::state::{CloakPayoutRecord, CloakPayoutStatus, GlobalConfig, Vault};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions as ix_sysvar;

/// Cloak batch payout attestation message layout (73 bytes total):
///   b"clk_atts"  (8)  — fixed prefix
///   vault_key   (32)  — Vault account pubkey (ties attestation to this vault)
///   batch_id    (32)  — sha256 of Cloak batch disbursement receipt
///   result       (1)  — 0x01 = batch shielded and confirmed
///
/// The real Cloak production flow:
///   1. Admin calls `transact()` from @cloak.dev/sdk with total yield amount
///   2. Cloak shields the USDC into its ZK pool and fans out to LP addresses
///   3. Cloak oracle signs this 73-byte attestation proving the batch executed
///   4. Admin relays the attestation here, completing the on-chain record
///
/// For devnet/demo: the mock oracle at /api/cloak-oracle/shield_payout signs
/// the attestation deterministically using CLOAK_ORACLE_SECRET_SEED.
const MSG_PREFIX: &[u8; 8] = b"clk_atts";
const MSG_LEN: usize = 73;

const ED25519_PROGRAM_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

#[derive(Accounts)]
pub struct RecordCloakPayout<'info> {
    /// Admin or any allowlisted oracle relayer pays for account creation.
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(seeds = [b"config2"], bump)]
    pub config: Box<Account<'info, GlobalConfig>>,

    #[account(seeds = [b"vault", &vault.id.to_le_bytes()], bump = vault.bump)]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        init_if_needed,
        payer = signer,
        space = 8 + CloakPayoutRecord::INIT_SPACE,
        seeds = [b"cloak_payout", vault.key().as_ref()],
        bump,
        constraint = cloak_payout.status != CloakPayoutStatus::Shielded
            @ PrismError::CloakPayoutAlreadyRecorded,
    )]
    pub cloak_payout: Account<'info, CloakPayoutRecord>,

    pub system_program: Program<'info, System>,

    /// CHECK: only read via ix_sysvar; Solana validates the address.
    #[account(address = ix_sysvar::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
}

/// Must be called as instruction index 1 in a tx where index 0 is an
/// Ed25519 native-program instruction containing the Cloak oracle's
/// signature over the 73-byte attestation.
pub fn record_cloak_payout_handler(
    ctx: Context<RecordCloakPayout>,
    total_shielded_amount: u64,
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
        msg!("Cloak: Ed25519 precompile instruction not found");
        PrismError::CloakSignatureInvalid
    })?;

    let data = &ix.data;
    require!(data.len() >= 16, PrismError::CloakSignatureInvalid);

    // Ed25519 precompile data layout: 16-byte header + sig + pk + msg.
    let pk_offset = u16::from_le_bytes(data[6..8].try_into().unwrap()) as usize;
    let msg_offset = u16::from_le_bytes(data[10..12].try_into().unwrap()) as usize;
    let msg_size = u16::from_le_bytes(data[12..14].try_into().unwrap()) as usize;

    let oracle_pk_bytes: [u8; 32] = data[pk_offset..pk_offset + 32].try_into().unwrap();
    let msg_bytes = &data[msg_offset..msg_offset + msg_size];

    // ── 2. Validate oracle key is in the global allowlist ──────────────────
    let signing_key = Pubkey::from(oracle_pk_bytes);
    require!(
        ctx.accounts.config.oracle_allowlist.contains(&signing_key),
        PrismError::OracleNotAllowlisted
    );

    // ── 3. Validate the 73-byte attestation message ────────────────────────
    require!(msg_size == MSG_LEN, PrismError::CloakSignatureInvalid);
    require!(
        &msg_bytes[0..8] == MSG_PREFIX,
        PrismError::CloakSignatureInvalid
    );

    let attested_vault: [u8; 32] = msg_bytes[8..40].try_into().unwrap();
    if attested_vault != ctx.accounts.vault.key().to_bytes() {
        msg!("Cloak: vault pubkey mismatch in attestation");
        return Err(PrismError::CloakSignatureInvalid.into());
    }

    let batch_id: [u8; 32] = msg_bytes[40..72].try_into().unwrap();

    let result_byte = msg_bytes[72];
    require!(result_byte == 0x01, PrismError::CloakPayoutNotConfirmed);

    // ── 4. Write CloakPayoutRecord ─────────────────────────────────────────
    let clock = Clock::get()?;
    let record = &mut ctx.accounts.cloak_payout;
    record.vault = ctx.accounts.vault.key();
    record.cloak_oracle = signing_key;
    record.batch_id = batch_id;
    record.total_shielded_amount = total_shielded_amount;
    record.yield_epoch_ts = ctx.accounts.vault.last_yield_timestamp;
    record.status = CloakPayoutStatus::Shielded;
    record.confirmed_ts = clock.unix_timestamp;
    record.bump = ctx.bumps.cloak_payout;

    msg!(
        "PRISM Cloak: yield shielded via Cloak batch payout. amount={} batch_id={:?}",
        total_shielded_amount,
        batch_id,
    );

    Ok(())
}
