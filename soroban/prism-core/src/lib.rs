//! PRISM Protocol core — tranched credit engine on Soroban.
//!
//! Phase 1 surface: initialization (`init_config`, `init_vault`, `init_tranche`,
//! `pause`/`unpause`, read-only getters).
//!
//! Phase 2 surface: the core deposit/yield/loss loop.
//!   - `deposit(user, vault_id, kind, amount)`
//!   - `withdraw(user, vault_id, kind, shares)`
//!   - `accrue_yield(authority, vault_id, payer, amount)`
//!   - `trigger_credit_event(authority, vault_id, event_type, loss_amount, severity_bps, loan_id)`
//!
//! Phase 3 surface: loans + oracle attestations.
//!   - `init_loan(vault_id, loan_id, borrower, principal, apr_bps, maturity_ts)`
//!   - `disburse_loan(vault_id, loan_id)` — gated on collateral verified if record exists
//!   - `repay_loan(borrower, loan_id, amount)`
//!   - `attach_encrypt_score(borrower, loan_id, commitment, encrypt_oracle)`
//!   - `verify_encrypt_default(relayer, vault_id, loan_id, message, signature, loss_amount, severity_bps)`
//!   - `record_cloak_payout(relayer, vault_id, message, signature, total_shielded_amount)`
//!   - `attach_collateral(borrower, loan_id, oracle_pubkey)` — PRISM Collateral Oracle
//!   - `verify_collateral(relayer, loan_id, message, signature)` — status Pending → Attached
//!   - `release_collateral(borrower, loan_id, message, signature)` — status Attached → Released
//!   - `liquidate_collateral(admin, loan_id, message, signature, loss_amount, severity_bps)` — fires cascade
//!
//! Encrypt + Cloak verification both follow the same pattern: the off-chain
//! oracle signs a fixed-layout attestation, the relayer passes (message, signature),
//! and the contract calls `env.crypto().ed25519_verify` against the oracle pubkey
//! that was registered (or, for Cloak, looked up from the global allowlist).
//! No sysvar parsing, no precompile dance — Soroban handles signature verification
//! as a native host function.
//!
//! Conventions:
//!   - All admin-only entry points start with `cfg.admin.require_auth()`.
//!   - Oracle pubkeys are 32-byte Ed25519 keys (`BytesN<32>`), validated via
//!     `env.crypto().ed25519_verify` in the verify_* handlers (Phase 3).
//!   - Tranche pTokens are external SAC contracts. `prism-core` is set as the
//!     SAC admin off-chain before `init_tranche` is called, so `deposit` and
//!     `withdraw` can mint/burn via the standard token interface.
//!   - The contract instance holds USDC directly (the contract's address is
//!     both the USDC custodian and the loss bucket — no separate PDA needed).

#![no_std]

mod errors;
mod math;
mod reflector;
mod soroswap;
mod state;
mod storage;

#[cfg(test)]
mod tests;

pub use errors::PrismError;
pub use reflector::{Asset as ReflectorAsset, PriceData as ReflectorPriceData};
pub use state::{
    CloakPayoutRecord, CloakPayoutStatus, CollateralRecord, CollateralStatus, CreditEvent,
    CreditEventType, EncryptLoanHealth, EncryptStatus, GlobalConfig, Loan, LoanState, Tranche,
    TrancheKind, Vault, VaultState,
};

use soroban_sdk::{contract, contractimpl, token, vec, Address, Bytes, BytesN, Env, String, Vec};

const MAX_ORACLE_ALLOWLIST_KEYS: u32 = 8;

#[contract]
pub struct PrismCore;

#[contractimpl]
impl PrismCore {
    // ──────────────────────────────────────────────────────────────────────
    // Phase-0 smoke test
    // ──────────────────────────────────────────────────────────────────────

    /// Toolchain / deploy sanity check: returns ["Hello", <to>].
    pub fn hello(env: Env, to: String) -> Vec<String> {
        vec![&env, String::from_str(&env, "Hello"), to]
    }

    // ──────────────────────────────────────────────────────────────────────
    // Initialization
    // ──────────────────────────────────────────────────────────────────────

    /// Initialize protocol global config. Single-shot; subsequent calls error.
    pub fn init_config(
        env: Env,
        admin: Address,
        usdc_token: Address,
        default_yield_rate_bps: u32,
        oracle_allowlist: Vec<BytesN<32>>,
    ) -> Result<(), PrismError> {
        if storage::config_exists(&env) {
            return Err(PrismError::AlreadyInitialized);
        }
        admin.require_auth();

        let cfg = GlobalConfig {
            admin,
            usdc_token,
            default_yield_rate_bps,
            paused: false,
            oracle_allowlist,
        };
        storage::write_config(&env, &cfg);
        Ok(())
    }

    /// Create a new credit vault.
    /// Admin-only. Vault starts in `Active` state with zero balances.
    pub fn init_vault(env: Env, vault_id: u32) -> Result<(), PrismError> {
        let cfg = storage::read_config(&env);
        cfg.admin.require_auth();

        if storage::vault_exists(&env, vault_id) {
            return Err(PrismError::AlreadyInitialized);
        }

        let vault = Vault {
            id: vault_id,
            state: VaultState::Active,
            total_deposits: 0,
            total_loaned: 0,
            last_yield_timestamp: env.ledger().timestamp(),
            credit_event_seq: 0,
        };
        storage::write_vault(&env, &vault);
        Ok(())
    }

    /// Create a tranche (Prime=0, Core=1, Alpha=2) inside an existing vault.
    /// Admin-only. The `ptoken` argument is the Stellar Asset Contract address
    /// of the pre-deployed pTranche token; this contract must be its admin so
    /// it can mint/burn on deposit/withdraw (Phase 2).
    pub fn init_tranche(
        env: Env,
        vault_id: u32,
        kind: u32,
        target_apy_bps: u32,
        ptoken: Address,
    ) -> Result<(), PrismError> {
        let cfg = storage::read_config(&env);
        cfg.admin.require_auth();

        if !storage::vault_exists(&env, vault_id) {
            return Err(PrismError::NotInitialized);
        }

        let tranche_kind = TrancheKind::from_u32(kind).ok_or(PrismError::InvalidTrancheKind)?;

        if storage::tranche_exists(&env, vault_id, tranche_kind) {
            return Err(PrismError::AlreadyInitialized);
        }

        let tranche = Tranche {
            vault_id,
            kind: tranche_kind,
            ptoken,
            target_apy_bps,
            total_assets: 0,
            total_supply: 0,
            nav_per_share_q: 0,
            cumulative_yield: 0,
            cumulative_loss: 0,
            last_nav_update_ts: env.ledger().timestamp(),
        };
        storage::write_tranche(&env, vault_id, tranche_kind, &tranche);
        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────
    // Read-only getters
    // ──────────────────────────────────────────────────────────────────────

    pub fn get_config(env: Env) -> GlobalConfig {
        storage::read_config(&env)
    }

    pub fn get_vault(env: Env, vault_id: u32) -> Option<Vault> {
        storage::read_vault(&env, vault_id)
    }

    pub fn get_tranche(env: Env, vault_id: u32, kind: u32) -> Option<Tranche> {
        let k = TrancheKind::from_u32(kind)?;
        storage::read_tranche(&env, vault_id, k)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Admin lifecycle (pause / unpause)
    // ──────────────────────────────────────────────────────────────────────

    pub fn pause(env: Env) -> Result<(), PrismError> {
        let mut cfg = storage::read_config(&env);
        cfg.admin.require_auth();
        cfg.paused = true;
        storage::write_config(&env, &cfg);
        Ok(())
    }

    pub fn unpause(env: Env) -> Result<(), PrismError> {
        let mut cfg = storage::read_config(&env);
        cfg.admin.require_auth();
        cfg.paused = false;
        storage::write_config(&env, &cfg);
        Ok(())
    }

    /// Transfer contract admin rights to a new address.
    /// Requires the current admin's auth. Irreversible without the new admin's key.
    pub fn update_admin(env: Env, new_admin: Address) -> Result<(), PrismError> {
        let mut cfg = storage::read_config(&env);
        cfg.admin.require_auth();
        cfg.admin = new_admin;
        storage::write_config(&env, &cfg);
        Ok(())
    }

    /// Add an oracle pubkey to the global allowlist.
    ///
    /// Admin-only. Fails if the key is already allowlisted or the list is full.
    pub fn add_oracle_to_allowlist(
        env: Env,
        oracle_pubkey: BytesN<32>,
    ) -> Result<(), PrismError> {
        let mut cfg = storage::read_config(&env);
        cfg.admin.require_auth();

        if cfg.oracle_allowlist.contains(&oracle_pubkey) {
            return Err(PrismError::OracleAlreadyAllowlisted);
        }
        if cfg.oracle_allowlist.len() >= MAX_ORACLE_ALLOWLIST_KEYS {
            return Err(PrismError::OracleAllowlistFull);
        }

        cfg.oracle_allowlist.push_back(oracle_pubkey);
        storage::write_config(&env, &cfg);
        Ok(())
    }

    /// Remove an oracle pubkey from the global allowlist.
    ///
    /// Admin-only. Fails if the key is not currently allowlisted.
    pub fn remove_oracle_from_allowlist(
        env: Env,
        oracle_pubkey: BytesN<32>,
    ) -> Result<(), PrismError> {
        let mut cfg = storage::read_config(&env);
        cfg.admin.require_auth();

        if !cfg.oracle_allowlist.contains(&oracle_pubkey) {
            return Err(PrismError::OracleNotAllowlisted);
        }

        let mut next = Vec::new(&env);
        for i in 0..cfg.oracle_allowlist.len() {
            let key = cfg.oracle_allowlist.get(i).ok_or(PrismError::NotInitialized)?;
            if key != oracle_pubkey {
                next.push_back(key);
            }
        }

        cfg.oracle_allowlist = next;
        storage::write_config(&env, &cfg);
        Ok(())
    }

    /// Atomically replace one allowlisted oracle pubkey with another.
    ///
    /// Admin-only. Useful for key rotation without a two-transaction gap.
    pub fn rotate_oracle_allowlist_key(
        env: Env,
        old_oracle_pubkey: BytesN<32>,
        new_oracle_pubkey: BytesN<32>,
    ) -> Result<(), PrismError> {
        let mut cfg = storage::read_config(&env);
        cfg.admin.require_auth();

        if !cfg.oracle_allowlist.contains(&old_oracle_pubkey) {
            return Err(PrismError::OracleNotAllowlisted);
        }
        if old_oracle_pubkey != new_oracle_pubkey
            && cfg.oracle_allowlist.contains(&new_oracle_pubkey)
        {
            return Err(PrismError::OracleAlreadyAllowlisted);
        }

        let mut next = Vec::new(&env);
        for i in 0..cfg.oracle_allowlist.len() {
            let key = cfg.oracle_allowlist.get(i).ok_or(PrismError::NotInitialized)?;
            if key == old_oracle_pubkey {
                next.push_back(new_oracle_pubkey.clone());
            } else {
                next.push_back(key);
            }
        }

        cfg.oracle_allowlist = next;
        storage::write_config(&env, &cfg);
        Ok(())
    }

    /// Lightweight check for operations tooling.
    pub fn is_oracle_allowlisted(env: Env, oracle_pubkey: BytesN<32>) -> bool {
        let cfg = storage::read_config(&env);
        cfg.oracle_allowlist.contains(&oracle_pubkey)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 2: deposit / withdraw / accrue_yield / trigger_credit_event
    // ──────────────────────────────────────────────────────────────────────

    /// Deposit USDC into a tranche; mint pTokens to the user.
    ///
    /// Mirrors `contracts/programs/prism-core/src/instructions/deposit.rs`.
    /// First deposit mints 1:1 (NAV = 1.0). Subsequent deposits compute
    /// shares = amount × Q_ONE / nav_per_share_q.
    pub fn deposit(
        env: Env,
        user: Address,
        vault_id: u32,
        kind: u32,
        amount: i128,
    ) -> Result<i128, PrismError> {
        user.require_auth();

        let cfg = storage::read_config(&env);
        if cfg.paused {
            return Err(PrismError::VaultPaused);
        }

        let mut vault = storage::read_vault(&env, vault_id).ok_or(PrismError::NotInitialized)?;
        if vault.state != VaultState::Active {
            return Err(PrismError::VaultNotActive);
        }

        let tranche_kind = TrancheKind::from_u32(kind).ok_or(PrismError::InvalidTrancheKind)?;
        let mut tranche = storage::read_tranche(&env, vault_id, tranche_kind)
            .ok_or(PrismError::NotInitialized)?;

        let usdc_amount: u64 = amount
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;

        // 1. Compute shares to mint.
        let shares = math::deposit_shares(usdc_amount, tranche.nav_per_share_q, tranche.total_supply)?;

        // 2. Pull USDC from the user into the contract (USDC is held by the contract itself).
        let usdc = token::Client::new(&env, &cfg.usdc_token);
        usdc.transfer(&user, &env.current_contract_address(), &amount);

        // 3. Mint pTokens to the user (prism-core is the SAC admin).
        let ptoken = token::StellarAssetClient::new(&env, &tranche.ptoken);
        ptoken.mint(&user, &(shares as i128));

        // 4. Update accounting.
        tranche.total_assets = tranche
            .total_assets
            .checked_add(usdc_amount)
            .ok_or(PrismError::ArithmeticOverflow)?;
        tranche.total_supply = tranche
            .total_supply
            .checked_add(shares)
            .ok_or(PrismError::ArithmeticOverflow)?;
        tranche.nav_per_share_q = math::compute_nav_q(tranche.total_assets, tranche.total_supply);
        tranche.last_nav_update_ts = env.ledger().timestamp();
        storage::write_tranche(&env, vault_id, tranche_kind, &tranche);

        vault.total_deposits = vault
            .total_deposits
            .checked_add(usdc_amount)
            .ok_or(PrismError::ArithmeticOverflow)?;
        storage::write_vault(&env, &vault);

        Ok(shares as i128)
    }

    /// Burn pTokens; pay out USDC at current NAV.
    ///
    /// Mirrors `contracts/programs/prism-core/src/instructions/withdraw.rs`.
    /// Allowed when vault is Active or Defaulted (so LPs can exit a written-down tranche).
    /// Returns the USDC amount paid out.
    pub fn withdraw(
        env: Env,
        user: Address,
        vault_id: u32,
        kind: u32,
        shares: i128,
    ) -> Result<i128, PrismError> {
        user.require_auth();

        let cfg = storage::read_config(&env);
        if cfg.paused {
            return Err(PrismError::VaultPaused);
        }

        let mut vault = storage::read_vault(&env, vault_id).ok_or(PrismError::NotInitialized)?;
        match vault.state {
            VaultState::Active | VaultState::Defaulted => {}
            VaultState::Resolved => return Err(PrismError::VaultNotActive),
        }

        let tranche_kind = TrancheKind::from_u32(kind).ok_or(PrismError::InvalidTrancheKind)?;
        let mut tranche = storage::read_tranche(&env, vault_id, tranche_kind)
            .ok_or(PrismError::NotInitialized)?;

        let share_amount: u64 = shares
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;

        // 1. Compute USDC payout at current NAV.
        let payout = math::withdraw_payout(share_amount, tranche.nav_per_share_q)?;

        // 2. Burn the user's pTokens.
        let ptoken = token::Client::new(&env, &tranche.ptoken);
        ptoken.burn(&user, &shares);

        // 3. Pay out USDC (skip if zero — wiped tranche).
        if payout > 0 {
            let usdc = token::Client::new(&env, &cfg.usdc_token);
            usdc.transfer(
                &env.current_contract_address(),
                &user,
                &(payout as i128),
            );
        }

        // 4. Update accounting.
        tranche.total_assets = tranche.total_assets.saturating_sub(payout);
        tranche.total_supply = tranche.total_supply.saturating_sub(share_amount);
        tranche.nav_per_share_q = math::compute_nav_q(tranche.total_assets, tranche.total_supply);
        tranche.last_nav_update_ts = env.ledger().timestamp();
        storage::write_tranche(&env, vault_id, tranche_kind, &tranche);

        vault.total_deposits = vault.total_deposits.saturating_sub(payout);
        storage::write_vault(&env, &vault);

        Ok(payout as i128)
    }

    /// Distribute USDC yield across the three tranches using the waterfall:
    /// Prime fills its time-weighted target APY first, Core next, Alpha takes the residual.
    ///
    /// Mirrors `contracts/programs/prism-core/src/instructions/accrue_yield.rs`.
    /// Caller must be `config.admin` or in `oracle_allowlist`. `payer` is the
    /// borrower-ish address that ships the USDC into the contract (kept
    /// explicit so the auth flow is clear on Soroban).
    pub fn accrue_yield(
        env: Env,
        authority: Address,
        vault_id: u32,
        payer: Address,
        amount: i128,
    ) -> Result<(), PrismError> {
        authority.require_auth();
        // Avoid Soroban's "frame already authorized" error when admin == payer.
        if payer != authority {
            payer.require_auth();
        }

        let cfg = storage::read_config(&env);

        // Authorization: admin OR allowlisted oracle pubkey? Soroban doesn't
        // surface a pubkey for an Address, so we approximate Solana's "admin
        // OR oracle" check by requiring admin. Oracle-driven yield arrives
        // via Phase 3's signature-verified handlers (`verify_encrypt_default`
        // etc.) — those don't need an Address allowlist.
        if authority != cfg.admin {
            return Err(PrismError::Unauthorized);
        }

        let mut vault = storage::read_vault(&env, vault_id).ok_or(PrismError::NotInitialized)?;
        if vault.state != VaultState::Active {
            return Err(PrismError::VaultNotActive);
        }

        let yield_amount: u64 = amount
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;

        let now = env.ledger().timestamp();
        let elapsed = now.saturating_sub(vault.last_yield_timestamp);
        if elapsed == 0 {
            return Ok(());
        }

        let mut prime = storage::read_tranche(&env, vault_id, TrancheKind::Prime)
            .ok_or(PrismError::NotInitialized)?;
        let mut core = storage::read_tranche(&env, vault_id, TrancheKind::Core)
            .ok_or(PrismError::NotInitialized)?;
        let mut alpha = storage::read_tranche(&env, vault_id, TrancheKind::Alpha)
            .ok_or(PrismError::NotInitialized)?;

        // Time-weighted target per tranche:
        //   target = total_assets × apy_bps × elapsed / (year_seconds × 10_000)
        const YEAR_SECONDS: u128 = 365 * 24 * 3600;
        let prime_target = compute_yield_target(prime.total_assets, prime.target_apy_bps, elapsed)?;
        let core_target = compute_yield_target(core.total_assets, core.target_apy_bps, elapsed)?;

        // Waterfall.
        let mut remaining = yield_amount;
        let prime_take = core::cmp::min(prime_target, remaining);
        remaining -= prime_take;
        let core_take = core::cmp::min(core_target, remaining);
        remaining -= core_take;
        let alpha_take = remaining;

        // Pull USDC from payer into the contract.
        let usdc = token::Client::new(&env, &cfg.usdc_token);
        usdc.transfer(&payer, &env.current_contract_address(), &amount);

        apply_yield(&mut prime, prime_take, now)?;
        apply_yield(&mut core, core_take, now)?;
        apply_yield(&mut alpha, alpha_take, now)?;

        storage::write_tranche(&env, vault_id, TrancheKind::Prime, &prime);
        storage::write_tranche(&env, vault_id, TrancheKind::Core, &core);
        storage::write_tranche(&env, vault_id, TrancheKind::Alpha, &alpha);

        vault.last_yield_timestamp = now;
        storage::write_vault(&env, &vault);

        Ok(())
    }

    /// Reverse waterfall: Alpha absorbs first, then Core, then Prime.
    /// On `Default`, vault state flips to `Defaulted`.
    ///
    /// Mirrors `contracts/programs/prism-core/src/instructions/trigger_credit_event.rs`.
    /// `loan_id` is recorded on the event but no loan-state mutation happens here.
    pub fn trigger_credit_event(
        env: Env,
        authority: Address,
        vault_id: u32,
        event_type: u32,
        loss_amount: i128,
        severity_bps: u32,
        loan_id: u32,
    ) -> Result<u32, PrismError> {
        authority.require_auth();

        let cfg = storage::read_config(&env);
        if authority != cfg.admin {
            return Err(PrismError::Unauthorized);
        }

        let mut vault = storage::read_vault(&env, vault_id).ok_or(PrismError::NotInitialized)?;
        if vault.state != VaultState::Active {
            return Err(PrismError::VaultNotActive);
        }

        if severity_bps > 10_000 {
            return Err(PrismError::InvalidSeverity);
        }

        let event_kind = match event_type {
            0 => CreditEventType::Default,
            1 => CreditEventType::PartialLoss,
            2 => CreditEventType::Recovery,
            _ => return Err(PrismError::InvalidSeverity),
        };

        let loss: u64 = loss_amount
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;

        let mut prime = storage::read_tranche(&env, vault_id, TrancheKind::Prime)
            .ok_or(PrismError::NotInitialized)?;
        let mut core_t = storage::read_tranche(&env, vault_id, TrancheKind::Core)
            .ok_or(PrismError::NotInitialized)?;
        let mut alpha = storage::read_tranche(&env, vault_id, TrancheKind::Alpha)
            .ok_or(PrismError::NotInitialized)?;

        // Loss > total vault assets is invalid.
        let total_assets = prime
            .total_assets
            .checked_add(core_t.total_assets)
            .and_then(|x| x.checked_add(alpha.total_assets))
            .ok_or(PrismError::ArithmeticOverflow)?;
        if loss > total_assets {
            return Err(PrismError::LossExceedsTotalAssets);
        }

        // Reverse waterfall: Alpha → Core → Prime.
        let mut remaining = loss;
        let alpha_hit = core::cmp::min(remaining, alpha.total_assets);
        alpha.total_assets -= alpha_hit;
        alpha.cumulative_loss = alpha.cumulative_loss.saturating_add(alpha_hit);
        remaining -= alpha_hit;

        let core_hit = core::cmp::min(remaining, core_t.total_assets);
        core_t.total_assets -= core_hit;
        core_t.cumulative_loss = core_t.cumulative_loss.saturating_add(core_hit);
        remaining -= core_hit;

        let prime_hit = core::cmp::min(remaining, prime.total_assets);
        prime.total_assets -= prime_hit;
        prime.cumulative_loss = prime.cumulative_loss.saturating_add(prime_hit);

        // Refresh NAVs.
        alpha.nav_per_share_q = math::compute_nav_q(alpha.total_assets, alpha.total_supply);
        core_t.nav_per_share_q = math::compute_nav_q(core_t.total_assets, core_t.total_supply);
        prime.nav_per_share_q = math::compute_nav_q(prime.total_assets, prime.total_supply);

        storage::write_tranche(&env, vault_id, TrancheKind::Alpha, &alpha);
        storage::write_tranche(&env, vault_id, TrancheKind::Core, &core_t);
        storage::write_tranche(&env, vault_id, TrancheKind::Prime, &prime);

        // Record the event.
        let seq = vault.credit_event_seq;
        let now = env.ledger().timestamp();
        let event = CreditEvent {
            vault_id,
            seq,
            event_type: event_kind,
            loan_id,
            loss_amount: loss,
            recovery_amount: 0,
            severity_bps,
            timestamp: now,
            triggered_by: authority,
        };
        storage::write_credit_event(&env, &event);

        // Lifecycle: Default flips vault to Defaulted; Recovery flips back to Active.
        match event_kind {
            CreditEventType::Default => vault.state = VaultState::Defaulted,
            CreditEventType::Recovery => vault.state = VaultState::Active,
            CreditEventType::PartialLoss => {}
        }

        vault.credit_event_seq = vault.credit_event_seq.saturating_add(1);
        storage::write_vault(&env, &vault);

        // Maintain the reserve invariant:
        //   usdc_balance == Σ tranche.total_assets + loss_bucket_balance
        // The cascade wrote down tranche.total_assets by exactly `loss`; bump
        // the bucket by the same amount so the accounting stays balanced.
        let prev_bucket = storage::read_loss_bucket_balance(&env, vault_id);
        storage::write_loss_bucket_balance(&env, vault_id, prev_bucket.saturating_add(loss as u128));

        Ok(seq)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 3: loans
    // ──────────────────────────────────────────────────────────────────────

    /// Originate a loan against a vault. Admin-only. No USDC moves yet —
    /// disbursement happens via `disburse_loan` (so admins can verify
    /// off-chain collateral before unlocking funds, even though the IKA
    /// collateral feature itself was dropped).
    ///
    /// Mirrors `contracts/programs/prism-core/src/instructions/initialize_loan.rs`.
    pub fn init_loan(
        env: Env,
        vault_id: u32,
        loan_id: u32,
        borrower: Address,
        principal: i128,
        apr_bps: u32,
        maturity_ts: u64,
    ) -> Result<(), PrismError> {
        let cfg = storage::read_config(&env);
        cfg.admin.require_auth();

        if !storage::vault_exists(&env, vault_id) {
            return Err(PrismError::NotInitialized);
        }
        if storage::read_loan(&env, loan_id).is_some() {
            return Err(PrismError::AlreadyInitialized);
        }
        if apr_bps > 10_000 {
            return Err(PrismError::InvalidSeverity);
        }

        let now = env.ledger().timestamp();
        if maturity_ts <= now {
            return Err(PrismError::LoanInWrongState);
        }

        let principal_u64: u64 = principal
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;

        let loan = Loan {
            id: loan_id,
            vault_id,
            borrower,
            principal: principal_u64,
            apr_bps,
            origination_ts: now,
            maturity_ts,
            state: LoanState::Originated,
            total_repaid: 0,
        };
        storage::write_loan(&env, &loan);
        Ok(())
    }

    /// Disburse a loan: contract sends USDC from its reserve to the borrower.
    /// Admin-only. Loan must be in `Originated` state and vault must be `Active`.
    ///
    /// Mirrors `contracts/programs/prism-core/src/instructions/disburse_loan.rs`,
    /// minus the IKA collateral gate (cut for v1).
    pub fn disburse_loan(env: Env, vault_id: u32, loan_id: u32) -> Result<(), PrismError> {
        let cfg = storage::read_config(&env);
        cfg.admin.require_auth();

        let mut vault = storage::read_vault(&env, vault_id).ok_or(PrismError::NotInitialized)?;
        if vault.state != VaultState::Active {
            return Err(PrismError::VaultNotActive);
        }

        let mut loan = storage::read_loan(&env, loan_id).ok_or(PrismError::NotInitialized)?;
        if loan.vault_id != vault_id {
            return Err(PrismError::BorrowerMismatch);
        }

        // If a collateral record exists for this loan it must be oracle-verified
        // (status = Attached) before funds can be released. A Pending record means
        // attach_collateral was called but verify_collateral has not yet run.
        if let Some(col) = storage::read_collateral(&env, loan_id) {
            if col.status == CollateralStatus::Pending {
                return Err(PrismError::CollateralNotVerified);
            }
        }

        if loan.state != LoanState::Originated {
            return Err(PrismError::LoanInWrongState);
        }

        let principal = loan.principal as i128;
        let usdc = token::Client::new(&env, &cfg.usdc_token);
        usdc.transfer(&env.current_contract_address(), &loan.borrower, &principal);

        loan.state = LoanState::Active;
        vault.total_loaned = vault
            .total_loaned
            .checked_add(loan.principal)
            .ok_or(PrismError::ArithmeticOverflow)?;

        storage::write_loan(&env, &loan);
        storage::write_vault(&env, &vault);
        Ok(())
    }

    /// Borrower repays USDC against a loan. State flips to `Repaid` once
    /// `total_repaid >= principal`.
    ///
    /// Mirrors `contracts/programs/prism-core/src/instructions/repay_loan.rs`.
    pub fn repay_loan(
        env: Env,
        borrower: Address,
        loan_id: u32,
        amount: i128,
    ) -> Result<(), PrismError> {
        borrower.require_auth();

        let cfg = storage::read_config(&env);
        let mut loan = storage::read_loan(&env, loan_id).ok_or(PrismError::NotInitialized)?;
        if loan.borrower != borrower {
            return Err(PrismError::BorrowerMismatch);
        }
        if !matches!(loan.state, LoanState::Active | LoanState::Repaying) {
            return Err(PrismError::LoanInWrongState);
        }

        let pay_u64: u64 = amount
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;

        let usdc = token::Client::new(&env, &cfg.usdc_token);
        usdc.transfer(&borrower, &env.current_contract_address(), &amount);

        loan.total_repaid = loan
            .total_repaid
            .checked_add(pay_u64)
            .ok_or(PrismError::ArithmeticOverflow)?;

        if loan.total_repaid >= loan.principal {
            loan.state = LoanState::Repaid;
        } else {
            loan.state = LoanState::Repaying;
        }

        storage::write_loan(&env, &loan);
        Ok(())
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 3: Encrypt FHE oracle — privacy-preserving default proof
    // ──────────────────────────────────────────────────────────────────────

    /// Borrower registers a sha256 commitment of their Encrypt-sealed credit
    /// data, plus the pubkey of the oracle that will later sign default proofs.
    ///
    /// `encrypt_oracle` must be in `config.oracle_allowlist`. The pubkey is
    /// stored on the per-loan EncryptLoanHealth record and re-validated on
    /// every `verify_encrypt_default` call.
    ///
    /// Mirrors `contracts/programs/prism-core/src/instructions/attach_encrypt_score.rs`.
    pub fn attach_encrypt_score(
        env: Env,
        borrower: Address,
        loan_id: u32,
        commitment: BytesN<32>,
        encrypt_oracle: BytesN<32>,
    ) -> Result<(), PrismError> {
        borrower.require_auth();

        let cfg = storage::read_config(&env);
        if !cfg.oracle_allowlist.contains(&encrypt_oracle) {
            return Err(PrismError::OracleNotAllowlisted);
        }

        let loan = storage::read_loan(&env, loan_id).ok_or(PrismError::NotInitialized)?;
        if loan.borrower != borrower {
            return Err(PrismError::BorrowerMismatch);
        }
        if !matches!(loan.state, LoanState::Originated | LoanState::Active) {
            return Err(PrismError::LoanInWrongState);
        }

        if let Some(existing) = storage::read_encrypt_health(&env, loan_id) {
            if existing.status == EncryptStatus::DefaultProven {
                return Err(PrismError::EncryptAlreadyDefaultProven);
            }
        }

        let health = EncryptLoanHealth {
            loan_id,
            score_commitment: commitment,
            encrypt_oracle,
            status: EncryptStatus::Pending,
            default_proven_ts: 0,
        };
        storage::write_encrypt_health(&env, &health);
        Ok(())
    }

    /// Verify an Encrypt FHE default attestation and fire the loss cascade.
    ///
    /// Attestation message layout (73 bytes), byte-identical to the Solana
    /// version so the off-chain oracle can produce one message for either
    /// chain by just swapping the loan-identifier semantics:
    ///   bytes 0..8    "enc_atts"     prefix
    ///   bytes 8..40   loan_id_padded (loan_id as u32 LE, zero-padded to 32 bytes)
    ///   bytes 40..72  score_commitment (must match attach time)
    ///   byte 72       result (0x01 = default proven)
    ///
    /// On valid signature + valid message:
    ///   1. EncryptLoanHealth → DefaultProven
    ///   2. Reverse-waterfall cascade (Alpha → Core → Prime) for `loss_amount`
    ///   3. Vault → Defaulted, credit_event_seq++
    pub fn verify_encrypt_default(
        env: Env,
        relayer: Address,
        vault_id: u32,
        loan_id: u32,
        message: Bytes,
        signature: BytesN<64>,
        loss_amount: i128,
        severity_bps: u32,
    ) -> Result<u32, PrismError> {
        relayer.require_auth();

        // ── 1. Look up registered oracle pubkey ───────────────────────────
        let mut health = storage::read_encrypt_health(&env, loan_id)
            .ok_or(PrismError::NotInitialized)?;
        if health.status == EncryptStatus::DefaultProven {
            return Err(PrismError::EncryptAlreadyDefaultProven);
        }

        // ── 2. Validate message shape + bind to loan + commitment ─────────
        if message.len() != 73 {
            return Err(PrismError::EncryptSignatureInvalid);
        }
        let prefix = bytes_slice::<8>(&env, &message, 0);
        if prefix != bytesn_from_array(&env, b"enc_atts") {
            return Err(PrismError::EncryptSignatureInvalid);
        }

        let attested_loan_padded = bytes_slice::<32>(&env, &message, 8);
        let expected_loan_padded = loan_id_padded(&env, loan_id);
        if attested_loan_padded != expected_loan_padded {
            return Err(PrismError::EncryptSignatureInvalid);
        }

        let attested_commitment = bytes_slice::<32>(&env, &message, 40);
        if attested_commitment != health.score_commitment {
            return Err(PrismError::EncryptCommitmentMismatch);
        }

        let result_byte = message.get(72).ok_or(PrismError::EncryptSignatureInvalid)?;
        if result_byte != 0x01 {
            return Err(PrismError::EncryptDefaultNotProven);
        }

        // ── 3. Verify signature via Soroban host function ─────────────────
        env.crypto()
            .ed25519_verify(&health.encrypt_oracle, &message, &signature);

        // ── 4. Mark proven + fire cascade ─────────────────────────────────
        let now = env.ledger().timestamp();
        health.status = EncryptStatus::DefaultProven;
        health.default_proven_ts = now;
        storage::write_encrypt_health(&env, &health);

        let mut vault = storage::read_vault(&env, vault_id).ok_or(PrismError::NotInitialized)?;
        if vault.state != VaultState::Active {
            return Err(PrismError::VaultNotActive);
        }

        let loss: u64 = loss_amount
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;
        if severity_bps > 10_000 {
            return Err(PrismError::InvalidSeverity);
        }

        let mut prime = storage::read_tranche(&env, vault_id, TrancheKind::Prime)
            .ok_or(PrismError::NotInitialized)?;
        let mut core_t = storage::read_tranche(&env, vault_id, TrancheKind::Core)
            .ok_or(PrismError::NotInitialized)?;
        let mut alpha = storage::read_tranche(&env, vault_id, TrancheKind::Alpha)
            .ok_or(PrismError::NotInitialized)?;

        let total_assets = prime
            .total_assets
            .checked_add(core_t.total_assets)
            .and_then(|x| x.checked_add(alpha.total_assets))
            .ok_or(PrismError::ArithmeticOverflow)?;
        if loss > total_assets {
            return Err(PrismError::LossExceedsTotalAssets);
        }

        let mut remaining = loss;
        let alpha_hit = core::cmp::min(remaining, alpha.total_assets);
        alpha.total_assets -= alpha_hit;
        alpha.cumulative_loss = alpha.cumulative_loss.saturating_add(alpha_hit);
        remaining -= alpha_hit;

        let core_hit = core::cmp::min(remaining, core_t.total_assets);
        core_t.total_assets -= core_hit;
        core_t.cumulative_loss = core_t.cumulative_loss.saturating_add(core_hit);
        remaining -= core_hit;

        let prime_hit = core::cmp::min(remaining, prime.total_assets);
        prime.total_assets -= prime_hit;
        prime.cumulative_loss = prime.cumulative_loss.saturating_add(prime_hit);

        alpha.nav_per_share_q = math::compute_nav_q(alpha.total_assets, alpha.total_supply);
        core_t.nav_per_share_q = math::compute_nav_q(core_t.total_assets, core_t.total_supply);
        prime.nav_per_share_q = math::compute_nav_q(prime.total_assets, prime.total_supply);

        storage::write_tranche(&env, vault_id, TrancheKind::Alpha, &alpha);
        storage::write_tranche(&env, vault_id, TrancheKind::Core, &core_t);
        storage::write_tranche(&env, vault_id, TrancheKind::Prime, &prime);

        let seq = vault.credit_event_seq;
        let event = CreditEvent {
            vault_id,
            seq,
            event_type: CreditEventType::Default,
            loan_id,
            loss_amount: loss,
            recovery_amount: 0,
            severity_bps,
            timestamp: now,
            triggered_by: relayer,
        };
        storage::write_credit_event(&env, &event);

        vault.state = VaultState::Defaulted;
        vault.credit_event_seq = vault.credit_event_seq.saturating_add(1);
        storage::write_vault(&env, &vault);

        // Maintain reserve invariant (same pattern as trigger_credit_event).
        let prev_bucket = storage::read_loss_bucket_balance(&env, vault_id);
        storage::write_loss_bucket_balance(&env, vault_id, prev_bucket.saturating_add(loss as u128));

        Ok(seq)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 3: Cloak — shielded batch payout attestation
    // ──────────────────────────────────────────────────────────────────────

    /// Record a Cloak batch payout. The oracle attests that a batch of yield
    /// has been shielded into Cloak's privacy pool and fanned out to LPs.
    /// Verification is purely informational — it doesn't move USDC on-chain.
    ///
    /// Attestation message layout (73 bytes):
    ///   bytes 0..8    "clk_atts"     prefix
    ///   bytes 8..40   vault_id_padded (u32 LE, zero-padded to 32 bytes)
    ///   bytes 40..72  batch_id (sha256 of off-chain disbursement receipt)
    ///   byte 72       result (0x01 = batch confirmed)
    ///
    /// The signing pubkey must be in `config.oracle_allowlist`.
    pub fn record_cloak_payout(
        env: Env,
        relayer: Address,
        vault_id: u32,
        cloak_oracle: BytesN<32>,
        message: Bytes,
        signature: BytesN<64>,
        total_shielded_amount: i128,
    ) -> Result<u32, PrismError> {
        relayer.require_auth();

        let cfg = storage::read_config(&env);
        if !cfg.oracle_allowlist.contains(&cloak_oracle) {
            return Err(PrismError::OracleNotAllowlisted);
        }

        if message.len() != 73 {
            return Err(PrismError::CloakSignatureInvalid);
        }
        let prefix = bytes_slice::<8>(&env, &message, 0);
        if prefix != bytesn_from_array(&env, b"clk_atts") {
            return Err(PrismError::CloakSignatureInvalid);
        }

        let attested_vault = bytes_slice::<32>(&env, &message, 8);
        let expected_vault = vault_id_padded(&env, vault_id);
        if attested_vault != expected_vault {
            return Err(PrismError::CloakBatchIdMismatch);
        }

        let batch_id = bytes_slice::<32>(&env, &message, 40);

        let result_byte = message.get(72).ok_or(PrismError::CloakSignatureInvalid)?;
        if result_byte != 0x01 {
            return Err(PrismError::CloakPayoutNotConfirmed);
        }

        env.crypto()
            .ed25519_verify(&cloak_oracle, &message, &signature);

        let vault = storage::read_vault(&env, vault_id).ok_or(PrismError::NotInitialized)?;
        let shielded_u64: u64 = total_shielded_amount
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;

        let now = env.ledger().timestamp();
        let seq = storage::next_cloak_seq(&env, vault_id);
        let record = CloakPayoutRecord {
            vault_id,
            cloak_oracle,
            batch_id,
            total_shielded_amount: shielded_u64,
            yield_epoch_ts: vault.last_yield_timestamp,
            status: CloakPayoutStatus::Shielded,
            confirmed_ts: now,
        };
        storage::write_cloak_payout(&env, vault_id, seq, &record);

        Ok(seq)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 3: PRISM Collateral Oracle (replaces IKA — §6.6)
    // ──────────────────────────────────────────────────────────────────────

    /// Register a PRISM Collateral Oracle pubkey for a loan. Creates a
    /// `CollateralRecord` in `Pending` state. The oracle_pubkey must be in
    /// `config.oracle_allowlist`. This does NOT disburse or lock anything —
    /// disburse_loan remains blocked until `verify_collateral` succeeds.
    pub fn attach_collateral(
        env: Env,
        borrower: Address,
        loan_id: u32,
        oracle_pubkey: BytesN<32>,
    ) -> Result<(), PrismError> {
        borrower.require_auth();

        let cfg = storage::read_config(&env);
        if !cfg.oracle_allowlist.contains(&oracle_pubkey) {
            return Err(PrismError::OracleNotAllowlisted);
        }

        let loan = storage::read_loan(&env, loan_id).ok_or(PrismError::NotInitialized)?;
        if loan.borrower != borrower {
            return Err(PrismError::BorrowerMismatch);
        }
        if !matches!(loan.state, LoanState::Originated | LoanState::Active) {
            return Err(PrismError::LoanInWrongState);
        }

        // Idempotent: if a Pending record already exists, overwrite (allows
        // oracle key rotation before first verification).
        if let Some(existing) = storage::read_collateral(&env, loan_id) {
            if existing.status != CollateralStatus::Pending {
                return Err(PrismError::CollateralAlreadyVerified);
            }
        }

        let rec = CollateralRecord {
            loan_id,
            borrower,
            oracle_pubkey,
            chain_id: 0,
            asset_address: BytesN::from_array(&env, &[0u8; 32]),
            amount_usd_micro: 0,
            valued_at_ts: 0,
            last_nonce: 0,
            status: CollateralStatus::Pending,
        };
        storage::write_collateral(&env, &rec);
        Ok(())
    }

    /// Oracle attests collateral is locked (status byte 0x01). Advances record
    /// from Pending → Attached. After this call `disburse_loan` is unblocked.
    ///
    /// Attestation message layout (73 bytes, §6.6):
    ///   bytes  0..8    b"col_atts"
    ///   bytes  8..12   loan_id (u32 LE)
    ///   bytes 12..16   chain_id (u32 LE)
    ///   bytes 16..48   asset_address (32 bytes)
    ///   bytes 48..56   amount_usd_micro (u64 LE)
    ///   bytes 56..64   valued_at_ts (i64 LE)
    ///   bytes 64..72   nonce (u64 LE)
    ///   byte  72       status (must be 0x01 for verify_collateral)
    pub fn verify_collateral(
        env: Env,
        relayer: Address,
        loan_id: u32,
        message: Bytes,
        signature: BytesN<64>,
    ) -> Result<(), PrismError> {
        relayer.require_auth();

        let mut rec = storage::read_collateral(&env, loan_id)
            .ok_or(PrismError::CollateralNotAttached)?;
        if rec.status != CollateralStatus::Pending {
            return Err(PrismError::CollateralAlreadyVerified);
        }

        parse_and_verify_collateral_message(&env, &mut rec, &message, &signature, 0x01)?;

        rec.status = CollateralStatus::Attached;
        storage::write_collateral(&env, &rec);
        Ok(())
    }

    /// Oracle attests collateral is released (status byte 0x02). Advances
    /// record from Attached → Released. Called on full loan repayment.
    pub fn release_collateral(
        env: Env,
        borrower: Address,
        loan_id: u32,
        message: Bytes,
        signature: BytesN<64>,
    ) -> Result<(), PrismError> {
        borrower.require_auth();

        let mut rec = storage::read_collateral(&env, loan_id)
            .ok_or(PrismError::CollateralNotAttached)?;
        if rec.status != CollateralStatus::Attached {
            return Err(PrismError::CollateralStatusMismatch);
        }

        parse_and_verify_collateral_message(&env, &mut rec, &message, &signature, 0x02)?;

        rec.status = CollateralStatus::Released;
        storage::write_collateral(&env, &rec);
        Ok(())
    }

    /// Admin-triggered liquidation: oracle attests status byte 0x03 and the
    /// loss cascade fires for `loss_amount` against the vault's tranches.
    pub fn liquidate_collateral(
        env: Env,
        admin: Address,
        loan_id: u32,
        message: Bytes,
        signature: BytesN<64>,
        loss_amount: i128,
        severity_bps: u32,
    ) -> Result<u32, PrismError> {
        admin.require_auth();

        let cfg = storage::read_config(&env);
        if admin != cfg.admin {
            return Err(PrismError::Unauthorized);
        }

        let mut rec = storage::read_collateral(&env, loan_id)
            .ok_or(PrismError::CollateralNotAttached)?;
        if rec.status != CollateralStatus::Attached {
            return Err(PrismError::CollateralStatusMismatch);
        }

        parse_and_verify_collateral_message(&env, &mut rec, &message, &signature, 0x03)?;

        rec.status = CollateralStatus::Liquidated;
        storage::write_collateral(&env, &rec);

        // Fire loss cascade (same logic as trigger_credit_event).
        let loan = storage::read_loan(&env, loan_id).ok_or(PrismError::NotInitialized)?;
        let vault_id = loan.vault_id;
        let mut vault =
            storage::read_vault(&env, vault_id).ok_or(PrismError::NotInitialized)?;

        if vault.state != VaultState::Active {
            return Err(PrismError::VaultNotActive);
        }
        if severity_bps > 10_000 {
            return Err(PrismError::InvalidSeverity);
        }

        let loss: u64 = loss_amount
            .try_into()
            .map_err(|_| PrismError::ArithmeticOverflow)?;

        let mut prime = storage::read_tranche(&env, vault_id, TrancheKind::Prime)
            .ok_or(PrismError::NotInitialized)?;
        let mut core_t = storage::read_tranche(&env, vault_id, TrancheKind::Core)
            .ok_or(PrismError::NotInitialized)?;
        let mut alpha = storage::read_tranche(&env, vault_id, TrancheKind::Alpha)
            .ok_or(PrismError::NotInitialized)?;

        let total_assets = prime
            .total_assets
            .checked_add(core_t.total_assets)
            .and_then(|x| x.checked_add(alpha.total_assets))
            .ok_or(PrismError::ArithmeticOverflow)?;
        if loss > total_assets {
            return Err(PrismError::LossExceedsTotalAssets);
        }

        let mut remaining = loss;
        let alpha_hit = core::cmp::min(remaining, alpha.total_assets);
        alpha.total_assets -= alpha_hit;
        alpha.cumulative_loss = alpha.cumulative_loss.saturating_add(alpha_hit);
        remaining -= alpha_hit;

        let core_hit = core::cmp::min(remaining, core_t.total_assets);
        core_t.total_assets -= core_hit;
        core_t.cumulative_loss = core_t.cumulative_loss.saturating_add(core_hit);
        remaining -= core_hit;

        let prime_hit = core::cmp::min(remaining, prime.total_assets);
        prime.total_assets -= prime_hit;
        prime.cumulative_loss = prime.cumulative_loss.saturating_add(prime_hit);

        alpha.nav_per_share_q = math::compute_nav_q(alpha.total_assets, alpha.total_supply);
        core_t.nav_per_share_q = math::compute_nav_q(core_t.total_assets, core_t.total_supply);
        prime.nav_per_share_q = math::compute_nav_q(prime.total_assets, prime.total_supply);

        storage::write_tranche(&env, vault_id, TrancheKind::Alpha, &alpha);
        storage::write_tranche(&env, vault_id, TrancheKind::Core, &core_t);
        storage::write_tranche(&env, vault_id, TrancheKind::Prime, &prime);

        let now = env.ledger().timestamp();
        let seq = vault.credit_event_seq;
        let event = CreditEvent {
            vault_id,
            seq,
            event_type: CreditEventType::Default,
            loan_id,
            loss_amount: loss,
            recovery_amount: 0,
            severity_bps,
            timestamp: now,
            triggered_by: admin,
        };
        storage::write_credit_event(&env, &event);

        vault.state = VaultState::Defaulted;
        vault.credit_event_seq = vault.credit_event_seq.saturating_add(1);
        storage::write_vault(&env, &vault);

        let prev_bucket = storage::read_loss_bucket_balance(&env, vault_id);
        storage::write_loss_bucket_balance(
            &env,
            vault_id,
            prev_bucket.saturating_add(loss as u128),
        );

        Ok(seq)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 3 getters
    // ──────────────────────────────────────────────────────────────────────

    pub fn get_loan(env: Env, loan_id: u32) -> Option<Loan> {
        storage::read_loan(&env, loan_id)
    }

    pub fn get_collateral(env: Env, loan_id: u32) -> Option<CollateralRecord> {
        storage::read_collateral(&env, loan_id)
    }

    pub fn get_encrypt_health(env: Env, loan_id: u32) -> Option<EncryptLoanHealth> {
        storage::read_encrypt_health(&env, loan_id)
    }

    pub fn get_cloak_payout(env: Env, vault_id: u32, seq: u32) -> Option<CloakPayoutRecord> {
        storage::read_cloak_payout(&env, vault_id, seq)
    }

    /// Return the cumulative USDC absorbed by the loss cascade for a vault.
    /// Together with Σ tranche.total_assets, it equals the contract's USDC
    /// reserve: reserve == Σ tranche.total_assets + loss_bucket_balance.
    pub fn get_loss_bucket_balance(env: Env, vault_id: u32) -> u128 {
        storage::read_loss_bucket_balance(&env, vault_id)
    }

    // ──────────────────────────────────────────────────────────────────────
    // Phase 2: Composition — Soroswap liquidity seeding + Reflector price read
    // ──────────────────────────────────────────────────────────────────────

    /// Seed initial USDC + pToken liquidity into a Soroswap pool for one tranche.
    ///
    /// Admin-only. Call once per tranche after the vault has been funded with
    /// deposits and the Soroswap pair has been created (via the Soroswap factory
    /// frontend). The core contract is the LP — it approves the router, calls
    /// `add_liquidity`, and receives LP tokens back to its own address.
    ///
    /// `usdc_min` and `ptoken_min` are slippage guards forwarded to Soroswap;
    /// pass 0 for initial seeding where no pool price exists yet.
    ///
    /// Returns `(usdc_used, ptoken_used, lp_minted)`.
    pub fn seed_pool_liquidity(
        env: Env,
        admin: Address,
        vault_id: u32,
        kind: u32,
        soroswap_router: Address,
        usdc_amount: i128,
        ptoken_amount: i128,
        usdc_min: i128,
        ptoken_min: i128,
    ) -> Result<(i128, i128, i128), PrismError> {
        admin.require_auth();

        let cfg = storage::read_config(&env);
        if admin != cfg.admin {
            return Err(PrismError::Unauthorized);
        }
        if cfg.paused {
            return Err(PrismError::VaultPaused);
        }

        let tranche_kind = TrancheKind::from_u32(kind).ok_or(PrismError::InvalidTrancheKind)?;
        let tranche = storage::read_tranche(&env, vault_id, tranche_kind)
            .ok_or(PrismError::NotInitialized)?;

        // Approve Soroswap router to pull USDC and pToken from this contract.
        // The approval window is 100 ledgers — ample for the single add_liquidity call.
        let expiry = env.ledger().sequence().saturating_add(100);
        let usdc = token::Client::new(&env, &cfg.usdc_token);
        let ptoken = token::Client::new(&env, &tranche.ptoken);
        usdc.approve(
            &env.current_contract_address(),
            &soroswap_router,
            &usdc_amount,
            &expiry,
        );
        ptoken.approve(
            &env.current_contract_address(),
            &soroswap_router,
            &ptoken_amount,
            &expiry,
        );

        // Call Soroswap add_liquidity — router pulls tokens, mints LP tokens to us.
        let router = soroswap::SoroswapRouterClient::new(&env, &soroswap_router);
        let deadline = env.ledger().timestamp().saturating_add(300); // 5-minute window
        let (usdc_used, ptoken_used, lp_minted) = router.add_liquidity(
            &cfg.usdc_token,
            &tranche.ptoken,
            &usdc_amount,
            &ptoken_amount,
            &usdc_min,
            &ptoken_min,
            &env.current_contract_address(),
            &deadline,
        );

        env.events().publish(
            (String::from_str(&env, "seed_pool"), vault_id, kind),
            (usdc_used, ptoken_used, lp_minted),
        );

        Ok((usdc_used, ptoken_used, lp_minted))
    }

    /// Read the most recent Reflector oracle price for a given asset symbol.
    ///
    /// `reflector` is the Reflector oracle contract address.
    /// `asset_symbol` is the ticker string, e.g. "BTC", "ETH", "USDC".
    ///
    /// This is a simulation target — call via `simulateTransaction` from the
    /// frontend to display mark-to-market collateral prices without a tx fee.
    /// Returns `None` if Reflector has no data for the asset.
    pub fn read_reflector_price(
        env: Env,
        reflector: Address,
        asset_symbol: soroban_sdk::Symbol,
    ) -> Option<i128> {
        let client = reflector::ReflectorClient::new(&env, &reflector);
        let asset = reflector::Asset::Other(asset_symbol);
        client.lastprice(&asset).map(|d| d.price)
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

/// Extract an N-byte slice from a Soroban Bytes at offset, as a BytesN<N>.
/// Panics on out-of-bounds — caller must check `bytes.len()` first.
fn bytes_slice<const N: usize>(env: &Env, bytes: &Bytes, offset: u32) -> BytesN<N> {
    let mut buf = [0u8; N];
    for i in 0..N {
        buf[i] = bytes.get(offset + i as u32).unwrap_or(0);
    }
    BytesN::from_array(env, &buf)
}

/// Convert a fixed-size byte array literal into a BytesN<N>.
fn bytesn_from_array<const N: usize>(env: &Env, arr: &[u8; N]) -> BytesN<N> {
    BytesN::from_array(env, arr)
}

/// Pad a u32 loan id into a 32-byte identifier (little-endian u32, zero-padded).
/// Used as the loan binding in Encrypt attestations. On Stellar there's no
/// 32-byte "pubkey" for a loan account — the loan is identified by u32 id —
/// so we encode it deterministically as 4 bytes of LE id + 28 zero bytes.
/// The off-chain oracle does the same.
fn loan_id_padded(env: &Env, loan_id: u32) -> BytesN<32> {
    let mut buf = [0u8; 32];
    buf[0..4].copy_from_slice(&loan_id.to_le_bytes());
    BytesN::from_array(env, &buf)
}

/// Same padding scheme for vault id in Cloak attestations.
fn vault_id_padded(env: &Env, vault_id: u32) -> BytesN<32> {
    let mut buf = [0u8; 32];
    buf[0..4].copy_from_slice(&vault_id.to_le_bytes());
    BytesN::from_array(env, &buf)
}

/// total_assets × apy_bps × elapsed / (year_seconds × 10_000).
/// Saturates at u64::MAX (caller's `min` clamp keeps the value usable).
fn compute_yield_target(total_assets: u64, apy_bps: u32, elapsed: u64) -> Result<u64, PrismError> {
    const YEAR_SECONDS: u128 = 365 * 24 * 3600;
    let numerator = (total_assets as u128)
        .checked_mul(apy_bps as u128)
        .and_then(|x| x.checked_mul(elapsed as u128))
        .ok_or(PrismError::ArithmeticOverflow)?;
    let target = numerator / (YEAR_SECONDS * 10_000);
    if target > u64::MAX as u128 {
        return Err(PrismError::ArithmeticOverflow);
    }
    Ok(target as u64)
}

/// Validate and parse a 73-byte PRISM Collateral Oracle attestation message.
/// Checks: length, prefix, loan_id binding, nonce > last_nonce, expected status byte.
/// On success: mutates `rec` with the parsed fields (chain_id, asset_address,
/// amount_usd_micro, valued_at_ts, last_nonce). Does NOT write to storage.
fn parse_and_verify_collateral_message(
    env: &Env,
    rec: &mut CollateralRecord,
    message: &Bytes,
    signature: &BytesN<64>,
    expected_status_byte: u8,
) -> Result<(), PrismError> {
    if message.len() != 73 {
        return Err(PrismError::CollateralInvalidMessage);
    }
    let prefix = bytes_slice::<8>(env, message, 0);
    if prefix != bytesn_from_array(env, b"col_atts") {
        return Err(PrismError::CollateralInvalidMessage);
    }

    // Bind to loan_id.
    let attested_loan = u32::from_le_bytes({
        let s = bytes_slice::<4>(env, message, 8);
        let mut arr = [0u8; 4];
        s.copy_into_slice(&mut arr);
        arr
    });
    if attested_loan != rec.loan_id {
        return Err(PrismError::CollateralInvalidMessage);
    }

    // Nonce must be strictly greater than last seen (replay protection).
    let nonce = u64::from_le_bytes({
        let s = bytes_slice::<8>(env, message, 64);
        let mut arr = [0u8; 8];
        s.copy_into_slice(&mut arr);
        arr
    });
    if nonce <= rec.last_nonce {
        return Err(PrismError::CollateralNonceReused);
    }

    // Status byte must match the expected transition.
    let status_byte = message.get(72).ok_or(PrismError::CollateralInvalidMessage)?;
    if status_byte != expected_status_byte {
        return Err(PrismError::CollateralStatusMismatch);
    }

    // Verify Ed25519 signature against the registered oracle pubkey.
    env.crypto()
        .ed25519_verify(&rec.oracle_pubkey, message, signature);

    // Parse remaining fields.
    let chain_id = u32::from_le_bytes({
        let s = bytes_slice::<4>(env, message, 12);
        let mut arr = [0u8; 4];
        s.copy_into_slice(&mut arr);
        arr
    });
    let asset_address: BytesN<32> = bytes_slice::<32>(env, message, 16);
    let amount_usd_micro = u64::from_le_bytes({
        let s = bytes_slice::<8>(env, message, 48);
        let mut arr = [0u8; 8];
        s.copy_into_slice(&mut arr);
        arr
    });
    let valued_at_ts = i64::from_le_bytes({
        let s = bytes_slice::<8>(env, message, 56);
        let mut arr = [0u8; 8];
        s.copy_into_slice(&mut arr);
        arr
    });

    rec.chain_id = chain_id;
    rec.asset_address = asset_address;
    rec.amount_usd_micro = amount_usd_micro;
    rec.valued_at_ts = valued_at_ts;
    rec.last_nonce = nonce;
    Ok(())
}

/// Apply a yield slice to a tranche: bump total_assets + cumulative_yield, refresh NAV.
fn apply_yield(tranche: &mut Tranche, slice: u64, now: u64) -> Result<(), PrismError> {
    tranche.total_assets = tranche
        .total_assets
        .checked_add(slice)
        .ok_or(PrismError::ArithmeticOverflow)?;
    tranche.cumulative_yield = tranche
        .cumulative_yield
        .checked_add(slice)
        .ok_or(PrismError::ArithmeticOverflow)?;
    tranche.nav_per_share_q = math::compute_nav_q(tranche.total_assets, tranche.total_supply);
    tranche.last_nav_update_ts = now;
    Ok(())
}
