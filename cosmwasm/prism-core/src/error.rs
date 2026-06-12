//! Contract error type. Ported from `soroban/prism-core/src/errors.rs`.
//!
//! Variant *names* are preserved 1:1 so docs, oracle messages, and the
//! frontend error map (`app/lib/errors.ts`) stay meaningful. The numeric
//! discriminants from Soroban are kept in the doc comments for cross-reference,
//! but CosmWasm surfaces errors by string, not by code.

use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    // ── Lifecycle / authorization ─────────────────────────────────────────
    #[error("vault not active")] // 1
    VaultNotActive,
    #[error("vault paused")] // 2
    VaultPaused,
    #[error("invalid tranche kind")] // 3
    InvalidTrancheKind,
    #[error("loan in wrong state")] // 4
    LoanInWrongState,
    #[error("insufficient liquidity")] // 5
    InsufficientLiquidity,
    #[error("slippage exceeded")] // 6
    SlippageExceeded,
    #[error("unauthorized")] // 7
    Unauthorized,

    // ── Math ──────────────────────────────────────────────────────────────
    #[error("arithmetic overflow")] // 10
    ArithmeticOverflow,
    #[error("empty tranche nav")] // 11
    EmptyTrancheNav,
    #[error("invalid severity")] // 12
    InvalidSeverity,
    #[error("loss exceeds total assets")] // 13
    LossExceedsTotalAssets,
    #[error("tranche wiped — no deposits allowed")] // 14
    TrancheWipedNoDepositsAllowed,

    // ── Loans ───────────────────────────────────────────────────────────────
    #[error("borrower mismatch")] // 20
    BorrowerMismatch,

    // ── Encrypt FHE oracle ──────────────────────────────────────────────────
    #[error("encrypt already default-proven")] // 30
    EncryptAlreadyDefaultProven,
    #[error("encrypt signature invalid")] // 31
    EncryptSignatureInvalid,
    #[error("encrypt commitment mismatch")] // 32
    EncryptCommitmentMismatch,
    #[error("encrypt default not proven")] // 33
    EncryptDefaultNotProven,
    #[error("oracle not allowlisted")] // 34
    OracleNotAllowlisted,
    #[error("oracle allowlist full")] // 35
    OracleAllowlistFull,
    #[error("oracle already allowlisted")] // 36
    OracleAlreadyAllowlisted,

    // ── Cloak batch payout ──────────────────────────────────────────────────
    #[error("cloak payout already recorded")] // 40
    CloakPayoutAlreadyRecorded,
    #[error("cloak signature invalid")] // 41
    CloakSignatureInvalid,
    #[error("cloak batch id mismatch")] // 42
    CloakBatchIdMismatch,
    #[error("cloak payout not confirmed")] // 43
    CloakPayoutNotConfirmed,

    // ── PRISM Collateral Oracle ─────────────────────────────────────────────
    #[error("collateral not attached")] // 60
    CollateralNotAttached,
    #[error("collateral already verified")] // 61
    CollateralAlreadyVerified,
    #[error("collateral status mismatch")] // 62
    CollateralStatusMismatch,
    #[error("collateral invalid message")] // 63
    CollateralInvalidMessage,
    #[error("collateral nonce reused")] // 64
    CollateralNonceReused,
    #[error("collateral not verified")] // 65
    CollateralNotVerified,

    // ── Setup ──────────────────────────────────────────────────────────────
    #[error("already initialized")] // 50
    AlreadyInitialized,
    #[error("not initialized")] // 51
    NotInitialized,
}
