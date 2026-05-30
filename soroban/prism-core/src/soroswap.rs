//! Soroswap router client bindings.
//!
//! Soroswap is a Uniswap-V2 CPMM on Stellar Soroban.
//! PRISM uses it for pTranche/USDC liquidity pools and the Trade demo steps.
//!
//! Testnet router:  CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD
//! Mainnet router:  CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH

use soroban_sdk::{contractclient, Address, Env, Vec};

/// Minimal Soroswap router interface — only the two functions PRISM calls.
///
/// The full router also has `swap_tokens_for_exact_tokens` and `remove_liquidity`,
/// which we don't need. Add them here if a later phase requires them.
#[contractclient(name = "SoroswapRouterClient")]
pub trait SoroswapRouterInterface {
    /// Swap an exact amount in for as many tokens out as possible.
    ///
    /// `path` is [token_in, …, token_out]; for a direct pair it is [token_in, token_out].
    /// Returns the amounts at each step in the path (last element = amount received).
    fn swap_exact_tokens_for_tokens(
        env: Env,
        amount_in: i128,
        amount_out_min: i128,
        path: Vec<Address>,
        to: Address,
        deadline: u64,
    ) -> Vec<i128>;

    /// Add liquidity to a token pair.
    ///
    /// The router pulls tokens from `to`'s allowances — the caller must have
    /// approved the router to spend at least `amount_a_desired` of token_a
    /// and at least `amount_b_desired` of token_b before this call.
    ///
    /// Returns `(amount_a_used, amount_b_used, lp_tokens_minted)`.
    fn add_liquidity(
        env: Env,
        token_a: Address,
        token_b: Address,
        amount_a_desired: i128,
        amount_b_desired: i128,
        amount_a_min: i128,
        amount_b_min: i128,
        to: Address,
        deadline: u64,
    ) -> (i128, i128, i128);
}
