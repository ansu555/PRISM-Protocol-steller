use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub default_yield_rate_bps: u16,
    pub paused: bool,
    #[max_len(8)]
    pub oracle_allowlist: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub id: u32,
    pub usdc_mint: Pubkey,
    pub usdc_reserve: Pubkey,
    pub loss_bucket: Pubkey,
    pub tranche_pdas: [Pubkey; 3],
    pub loan_pda: Pubkey,
    pub state: VaultState,
    pub total_deposits: u64,
    pub total_loaned: u64,
    pub last_yield_timestamp: i64,
    pub credit_event_seq: u32,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VaultState {
    Active,
    Defaulted,
    Resolved,
}

#[account]
#[derive(InitSpace)]
pub struct Tranche {
    pub vault: Pubkey,
    pub kind: TrancheKind,
    pub mint: Pubkey,
    pub target_apy_bps: u16,
    pub total_assets: u64,
    pub total_supply: u64,
    pub nav_per_share_q: u128,
    pub cumulative_yield: u64,
    pub cumulative_loss: u64,
    pub last_nav_update_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TrancheKind {
    Prime,
    Core,
    Alpha,
}

#[account]
#[derive(InitSpace)]
pub struct Loan {
    pub id: u32,
    pub vault: Pubkey,
    pub borrower: Pubkey,
    pub principal: u64,
    pub apr_bps: u16,
    pub origination_ts: i64,
    pub maturity_ts: i64,
    pub state: LoanState,
    pub total_repaid: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum LoanState {
    Originated,
    Active,
    Repaying,
    Repaid,
    Defaulted,
    Resolved,
}

#[account]
#[derive(InitSpace)]
pub struct CreditEvent {
    pub vault: Pubkey,
    pub seq: u32,
    pub event_type: CreditEventType,
    pub loan: Pubkey,
    pub loss_amount: u64,
    pub recovery_amount: u64,
    pub severity_bps: u16,
    pub timestamp: i64,
    pub triggered_by: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CreditEventType {
    Default,
    PartialLoss,
    Recovery,
}

#[account]
#[derive(InitSpace)]
pub struct IkaCollateral {
    pub loan: Pubkey,
    pub dwallet_id: [u8; 32],
    pub chain_id: u8,
    pub collateral_amount_usd: u64,
    pub status: CollateralStatus,
    pub oracle_pubkey: Pubkey,
    pub locked_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CollateralStatus {
    Pending,
    Locked,
    Released,
    Liquidated,
}

#[account]
#[derive(InitSpace)]
pub struct EncryptLoanHealth {
    pub loan: Pubkey,
    pub score_commitment: [u8; 32],
    pub encrypt_oracle: Pubkey,
    pub status: EncryptStatus,
    pub default_proven_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EncryptStatus {
    Pending,
    Verified,
    DefaultProven,
}

#[account]
#[derive(InitSpace)]
pub struct CloakPayoutRecord {
    pub vault: Pubkey,
    pub cloak_oracle: Pubkey,
    pub batch_id: [u8; 32],           // sha256 of Cloak batch disbursement receipt
    pub total_shielded_amount: u64,   // total USDC shielded across all tranches
    pub yield_epoch_ts: i64,          // timestamp of the yield epoch this covers
    pub status: CloakPayoutStatus,    // Pending → Shielded
    pub confirmed_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CloakPayoutStatus {
    Pending,
    Shielded,
}
