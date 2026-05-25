use soroban_sdk::contracterror;

/// Mirrors `contracts/programs/prism-amm/src/errors.rs` (Solana).
/// Codes start at 1 (Soroban convention).
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AmmError {
    PoolNotInitialized = 1,
    SlippageExceeded = 2,
    InvalidFee = 3,
    RatioMismatch = 4,
    MinLiquidityViolation = 5,
    AlreadyInitialized = 6,
    InvalidAmount = 7,
    ArithmeticOverflow = 8,
}
