//! Storage layout for prism-amm.
//!
//! Pools are keyed by tranche token address (one pool per tranche). We track
//! the LP supply ourselves because the standard Soroban token interface
//! doesn't expose `total_supply` — we'd otherwise have to rely on internal
//! SAC bookkeeping that isn't part of the public client API.

use soroban_sdk::{contracttype, Address, Env};

use crate::state::AmmPool;

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DataKey {
    /// Persistent, keyed by tranche token address.
    Pool(Address),
    /// LP shares outstanding for the pool keyed by tranche token address.
    LpSupply(Address),
}

pub const PERSISTENT_BUMP_LOW: u32 = 90 * 17_280;
pub const PERSISTENT_BUMP_HIGH: u32 = 120 * 17_280;

pub fn pool_key(tranche_token: &Address) -> DataKey {
    DataKey::Pool(tranche_token.clone())
}

pub fn write_pool(env: &Env, pool: &AmmPool) {
    let key = pool_key(&pool.tranche_token);
    env.storage().persistent().set(&key, pool);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}

pub fn read_pool(env: &Env, tranche_token: &Address) -> Option<AmmPool> {
    env.storage().persistent().get(&pool_key(tranche_token))
}

pub fn pool_exists(env: &Env, tranche_token: &Address) -> bool {
    env.storage().persistent().has(&pool_key(tranche_token))
}

pub fn lp_supply_key(tranche_token: &Address) -> DataKey {
    DataKey::LpSupply(tranche_token.clone())
}

pub fn read_lp_supply(env: &Env, tranche_token: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&lp_supply_key(tranche_token))
        .unwrap_or(0)
}

pub fn write_lp_supply(env: &Env, tranche_token: &Address, supply: i128) {
    let key = lp_supply_key(tranche_token);
    env.storage().persistent().set(&key, &supply);
    env.storage()
        .persistent()
        .extend_ttl(&key, PERSISTENT_BUMP_LOW, PERSISTENT_BUMP_HIGH);
}
