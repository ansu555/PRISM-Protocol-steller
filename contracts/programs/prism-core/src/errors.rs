use anchor_lang::prelude::*;

#[error_code]
pub enum PrismError {
    #[msg("Vault is not in Active state")]
    VaultNotActive,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Invalid tranche kind")]
    InvalidTrancheKind,
    #[msg("Loan is not in expected state")]
    LoanInWrongState,
    #[msg("Insufficient liquidity in tranche")]
    InsufficientLiquidity,
    #[msg("Slippage exceeded — swap output below min_amount_out")]
    SlippageExceeded,
    #[msg("Unauthorized — caller is neither admin nor allowlisted oracle")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("NAV calculation: division by zero (empty tranche)")]
    EmptyTrancheNav,
    #[msg("CreditEvent severity exceeds 100% (10000 bps)")]
    InvalidSeverity,
    #[msg("Loss amount exceeds total vault assets")]
    LossExceedsTotalAssets,
    #[msg("Borrower account mismatch")]
    BorrowerMismatch,
    #[msg("Tranche has been wiped (NAV = 0); deposits blocked until reset")]
    TrancheWipedNoDepositsAllowed,
    #[msg("Switchboard feed value is older than freshness threshold")]
    OracleStale,
    // ── IKA collateral errors ──────────────────────────────────────────────
    #[msg("IKA collateral is not in Locked state; disbursement blocked")]
    CollateralNotLocked,
    #[msg("Oracle signature invalid or message mismatch")]
    OracleSignatureInvalid,
    #[msg("dWallet ID in attestation does not match registered collateral")]
    DwalletIdMismatch,
    #[msg("Collateral USD value is insufficient to cover loan principal")]
    InsufficientCollateral,
    #[msg("Collateral already locked; cannot re-verify")]
    CollateralAlreadyLocked,
    #[msg("Oracle public key is not in the global allowlist")]
    OracleNotAllowlisted,
    #[msg("Collateral account is already active and cannot be re-attached")]
    CollateralAlreadyActive,
    // ── Encrypt FHE errors ──────────────────────────────────────────────────
    #[msg("Encrypt health is already DefaultProven; cannot re-prove")]
    EncryptAlreadyDefaultProven,
    #[msg("Encrypt oracle signature invalid or message mismatch")]
    EncryptSignatureInvalid,
    #[msg("score_commitment in attestation does not match registered commitment")]
    EncryptCommitmentMismatch,
    #[msg("Encrypt FHE result byte is not 0x01 (default not proven by oracle)")]
    EncryptDefaultNotProven,
    // ── Cloak batch payout errors ───────────────────────────────────────────
    #[msg("Cloak payout already recorded for this vault epoch")]
    CloakPayoutAlreadyRecorded,
    #[msg("Cloak oracle signature invalid or message mismatch")]
    CloakSignatureInvalid,
    #[msg("batch_id in attestation does not match expected commitment")]
    CloakBatchIdMismatch,
    #[msg("Cloak result byte is not 0x01 (batch not confirmed by oracle)")]
    CloakPayoutNotConfirmed,
}
