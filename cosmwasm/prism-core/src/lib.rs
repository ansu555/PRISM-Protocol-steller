//! PRISM Protocol core — tranched credit engine on XION (CosmWasm).
//!
//! Ported from the Soroban implementation (`soroban/prism-core`). Same financial
//! model — deposit/withdraw at NAV, yield waterfall (Prime → Core → Alpha),
//! reverse loss cascade (Alpha → Core → Prime), loans, and the three Ed25519
//! oracle attestation flows (Collateral / Encrypt / Cloak). The attestation
//! byte layouts are unchanged, so the off-chain signers are reused verbatim.

pub mod contract;
pub mod error;
pub mod math;
pub mod msg;
pub mod state;

#[cfg(test)]
mod tests;

pub use error::ContractError;

use cosmwasm_std::{
    entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response,
};

use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    contract::instantiate(deps, env, info, msg)
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    contract::execute(deps, env, info, msg)
}

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> Result<Binary, ContractError> {
    contract::query(deps, env, msg)
}
