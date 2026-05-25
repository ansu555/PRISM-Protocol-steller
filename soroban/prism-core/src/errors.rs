use soroban_sdk::contracterror;

/// Mirrors the Anchor PrismError variants from the Solana implementation.
/// Codes are sequential starting at 1 (Soroban convention) rather than 6000 (Anchor).
/// The variant *names* are preserved so existing docs and oracle messages remain meaningful.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PrismError {
    // ── Lifecycle / authorization ─────────────────────────────────────────────
    VaultNotActive = 1,
    VaultPaused = 2,
    InvalidTrancheKind = 3,
    LoanInWrongState = 4,
    InsufficientLiquidity = 5,
    SlippageExceeded = 6,
    Unauthorized = 7,

    // ── Math ──────────────────────────────────────────────────────────────────
    ArithmeticOverflow = 10,
    EmptyTrancheNav = 11,
    InvalidSeverity = 12,
    LossExceedsTotalAssets = 13,
    TrancheWipedNoDepositsAllowed = 14,

    // ── Loans ─────────────────────────────────────────────────────────────────
    BorrowerMismatch = 20,

    // ── Encrypt FHE oracle ────────────────────────────────────────────────────
    EncryptAlreadyDefaultProven = 30,
    EncryptSignatureInvalid = 31,
    EncryptCommitmentMismatch = 32,
    EncryptDefaultNotProven = 33,
    OracleNotAllowlisted = 34,

    // ── Cloak batch payout ────────────────────────────────────────────────────
    CloakPayoutAlreadyRecorded = 40,
    CloakSignatureInvalid = 41,
    CloakBatchIdMismatch = 42,
    CloakPayoutNotConfirmed = 43,

    // ── Setup ────────────────────────────────────────────────────────────────
    AlreadyInitialized = 50,
    NotInitialized = 51,
}
