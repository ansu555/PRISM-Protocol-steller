//! Reflector oracle client bindings (SEP-40 compatible).
//!
//! Reflector is the decentralized price oracle on Stellar Soroban.
//! PRISM uses it for collateral mark-to-market and Reflector-triggered credit events.
//!
//! Mainnet oracle:  CCYOZJCOPG34LLQQ7N24YXBM7QM2ZKJKR2Z7LSYXQBGKM2KTEOXKBAX
//! Testnet oracle:  set NEXT_PUBLIC_REFLECTOR_CONTRACT_ID to override
//!
//! Reference: https://reflector.network | SEP-40 standard

use soroban_sdk::{contractclient, contracttype, Address, Env, Symbol, Vec};

/// Identifies an asset in the Reflector oracle.
///
/// `Stellar(addr)` is a Soroban token (SAC or SEP-41) identified by its contract address.
/// `Other(sym)` is a non-Stellar asset identified by its ticker symbol ("BTC", "ETH", etc.).
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Asset {
    Stellar(Address),
    Other(Symbol),
}

/// A price observation from the oracle.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PriceData {
    /// Price in the oracle's base asset (usually USDC), scaled by `10^decimals()`.
    pub price: i128,
    /// Unix timestamp of the observation.
    pub timestamp: u64,
}

/// Minimal read-only Reflector oracle interface.
///
/// The full oracle also exposes `prices`, `twap`, `x_last_price`, etc.
/// Add them here as Phase 3 / Phase 4 needs arise.
#[contractclient(name = "ReflectorClient")]
pub trait ReflectorInterface {
    /// Most recent price for the given asset.
    /// Returns `None` if the asset is not tracked by this oracle.
    fn lastprice(env: Env, asset: Asset) -> Option<PriceData>;

    /// Price for the given asset at or before `timestamp`.
    /// Returns `None` if no observation exists in the history window.
    fn price(env: Env, asset: Asset, timestamp: u64) -> Option<PriceData>;

    /// The oracle's base (quote) asset — all prices are denominated in this.
    fn base(env: Env) -> Asset;

    /// Decimal precision: a raw price value of `p` means `p / 10^decimals` in base units.
    fn decimals(env: Env) -> u32;

    /// All assets currently tracked by this oracle instance.
    fn assets(env: Env) -> Vec<Asset>;
}
