//! prism-core contract logic (CosmWasm). Ported from
//! `soroban/prism-core/src/lib.rs` — same financial behaviour, CosmWasm idioms.
//!
//! Auth: Soroban `addr.require_auth()` → `info.sender` checks. Token movement:
//! Soroban SAC `token::Client` → cw20 messages returned in the `Response`
//! (deposit/withdraw/yield/repay use the allowance + `TransferFrom`/`BurnFrom`
//! pattern; disburse uses `Transfer` from the contract's own balance).
//! Signatures: Soroban `env.crypto().ed25519_verify` → `deps.api.ed25519_verify`
//! (same raw 32-byte pubkey / 64-byte sig / message — attestation byte layouts
//! are unchanged).

use cosmwasm_std::{
    to_json_binary, Addr, Api, Binary, CosmosMsg, Deps, DepsMut, Env, HexBinary, MessageInfo,
    Response, Storage, Uint128, WasmMsg,
};
use cw2::set_contract_version;
use cw20::Cw20ExecuteMsg;

use crate::error::ContractError;
use crate::math;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::*;

const CONTRACT_NAME: &str = "crates.io:prism-core";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_ORACLE_ALLOWLIST_KEYS: usize = 8;
const YEAR_SECONDS: u128 = 365 * 24 * 3600;

// ──────────────────────────────────────────────────────────────────────────────
// instantiate
// ──────────────────────────────────────────────────────────────────────────────

pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    if CONFIG.may_load(deps.storage)?.is_some() {
        return Err(ContractError::AlreadyInitialized);
    }

    let admin = match msg.admin {
        Some(a) => deps.api.addr_validate(&a)?,
        None => info.sender.clone(),
    };
    let usdc_token = deps.api.addr_validate(&msg.usdc_token)?;

    let cfg = GlobalConfig {
        admin,
        usdc_token,
        default_yield_rate_bps: msg.default_yield_rate_bps,
        paused: false,
        oracle_allowlist: msg.oracle_allowlist,
    };
    CONFIG.save(deps.storage, &cfg)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("admin", cfg.admin))
}

// ──────────────────────────────────────────────────────────────────────────────
// execute dispatch
// ──────────────────────────────────────────────────────────────────────────────

pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::InitVault { vault_id } => init_vault(deps, env, info, vault_id),
        ExecuteMsg::InitTranche {
            vault_id,
            kind,
            target_apy_bps,
            ptoken,
        } => init_tranche(deps, env, info, vault_id, kind, target_apy_bps, ptoken),
        ExecuteMsg::Pause {} => set_paused(deps, info, true),
        ExecuteMsg::Unpause {} => set_paused(deps, info, false),
        ExecuteMsg::UpdateAdmin { new_admin } => update_admin(deps, info, new_admin),
        ExecuteMsg::AddOracleToAllowlist { oracle_pubkey } => {
            add_oracle(deps, info, oracle_pubkey)
        }
        ExecuteMsg::RemoveOracleFromAllowlist { oracle_pubkey } => {
            remove_oracle(deps, info, oracle_pubkey)
        }
        ExecuteMsg::RotateOracleAllowlistKey {
            old_oracle_pubkey,
            new_oracle_pubkey,
        } => rotate_oracle(deps, info, old_oracle_pubkey, new_oracle_pubkey),
        ExecuteMsg::Deposit {
            vault_id,
            kind,
            amount,
        } => deposit(deps, env, info, vault_id, kind, amount),
        ExecuteMsg::Withdraw {
            vault_id,
            kind,
            shares,
        } => withdraw(deps, env, info, vault_id, kind, shares),
        ExecuteMsg::AccrueYield {
            vault_id,
            payer,
            amount,
        } => accrue_yield(deps, env, info, vault_id, payer, amount),
        ExecuteMsg::TriggerCreditEvent {
            vault_id,
            event_type,
            loss_amount,
            severity_bps,
            loan_id,
        } => trigger_credit_event(
            deps, env, info, vault_id, event_type, loss_amount, severity_bps, loan_id,
        ),
        ExecuteMsg::InitLoan {
            vault_id,
            loan_id,
            borrower,
            principal,
            apr_bps,
            maturity_ts,
        } => init_loan(
            deps, env, info, vault_id, loan_id, borrower, principal, apr_bps, maturity_ts,
        ),
        ExecuteMsg::DisburseLoan { vault_id, loan_id } => {
            disburse_loan(deps, env, info, vault_id, loan_id)
        }
        ExecuteMsg::RepayLoan { loan_id, amount } => repay_loan(deps, env, info, loan_id, amount),
        ExecuteMsg::AttachEncryptScore {
            loan_id,
            commitment,
            encrypt_oracle,
        } => attach_encrypt_score(deps, env, info, loan_id, commitment, encrypt_oracle),
        ExecuteMsg::VerifyEncryptDefault {
            vault_id,
            loan_id,
            message,
            signature,
            loss_amount,
            severity_bps,
        } => verify_encrypt_default(
            deps, env, info, vault_id, loan_id, message, signature, loss_amount, severity_bps,
        ),
        ExecuteMsg::RecordCloakPayout {
            vault_id,
            cloak_oracle,
            message,
            signature,
            total_shielded_amount,
        } => record_cloak_payout(
            deps,
            env,
            info,
            vault_id,
            cloak_oracle,
            message,
            signature,
            total_shielded_amount,
        ),
        ExecuteMsg::AttachCollateral {
            loan_id,
            oracle_pubkey,
        } => attach_collateral(deps, env, info, loan_id, oracle_pubkey),
        ExecuteMsg::VerifyCollateral {
            loan_id,
            message,
            signature,
        } => verify_collateral(deps, env, info, loan_id, message, signature),
        ExecuteMsg::ReleaseCollateral {
            loan_id,
            message,
            signature,
        } => release_collateral(deps, env, info, loan_id, message, signature),
        ExecuteMsg::LiquidateCollateral {
            loan_id,
            message,
            signature,
            loss_amount,
            severity_bps,
        } => liquidate_collateral(
            deps, env, info, loan_id, message, signature, loss_amount, severity_bps,
        ),
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// Admin setup
// ──────────────────────────────────────────────────────────────────────────────

fn init_vault(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vault_id: u32,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;

    if VAULTS.has(deps.storage, vault_id) {
        return Err(ContractError::AlreadyInitialized);
    }
    let vault = Vault {
        id: vault_id,
        state: VaultState::Active,
        total_deposits: 0,
        total_loaned: 0,
        last_yield_timestamp: env.block.time.seconds(),
        credit_event_seq: 0,
    };
    VAULTS.save(deps.storage, vault_id, &vault)?;
    Ok(Response::new()
        .add_attribute("action", "init_vault")
        .add_attribute("vault_id", vault_id.to_string()))
}

fn init_tranche(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vault_id: u32,
    kind: u32,
    target_apy_bps: u32,
    ptoken: String,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;

    if !VAULTS.has(deps.storage, vault_id) {
        return Err(ContractError::NotInitialized);
    }
    let tranche_kind = TrancheKind::from_u32(kind).ok_or(ContractError::InvalidTrancheKind)?;
    if TRANCHES.has(deps.storage, (vault_id, tranche_kind.as_u32())) {
        return Err(ContractError::AlreadyInitialized);
    }
    let ptoken = deps.api.addr_validate(&ptoken)?;

    let tranche = Tranche {
        vault_id,
        kind: tranche_kind,
        ptoken,
        target_apy_bps,
        total_assets: 0,
        total_supply: 0,
        nav_per_share_q: Uint128::zero(),
        cumulative_yield: 0,
        cumulative_loss: 0,
        last_nav_update_ts: env.block.time.seconds(),
    };
    TRANCHES.save(deps.storage, (vault_id, tranche_kind.as_u32()), &tranche)?;
    Ok(Response::new()
        .add_attribute("action", "init_tranche")
        .add_attribute("vault_id", vault_id.to_string())
        .add_attribute("kind", kind.to_string()))
}

fn set_paused(deps: DepsMut, info: MessageInfo, paused: bool) -> Result<Response, ContractError> {
    let mut cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;
    cfg.paused = paused;
    CONFIG.save(deps.storage, &cfg)?;
    Ok(Response::new().add_attribute("action", if paused { "pause" } else { "unpause" }))
}

fn update_admin(
    deps: DepsMut,
    info: MessageInfo,
    new_admin: String,
) -> Result<Response, ContractError> {
    let mut cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;
    cfg.admin = deps.api.addr_validate(&new_admin)?;
    CONFIG.save(deps.storage, &cfg)?;
    Ok(Response::new()
        .add_attribute("action", "update_admin")
        .add_attribute("new_admin", cfg.admin))
}

fn add_oracle(
    deps: DepsMut,
    info: MessageInfo,
    oracle_pubkey: HexBinary,
) -> Result<Response, ContractError> {
    let mut cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;
    if cfg.oracle_allowlist.contains(&oracle_pubkey) {
        return Err(ContractError::OracleAlreadyAllowlisted);
    }
    if cfg.oracle_allowlist.len() >= MAX_ORACLE_ALLOWLIST_KEYS {
        return Err(ContractError::OracleAllowlistFull);
    }
    cfg.oracle_allowlist.push(oracle_pubkey);
    CONFIG.save(deps.storage, &cfg)?;
    Ok(Response::new().add_attribute("action", "add_oracle"))
}

fn remove_oracle(
    deps: DepsMut,
    info: MessageInfo,
    oracle_pubkey: HexBinary,
) -> Result<Response, ContractError> {
    let mut cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;
    if !cfg.oracle_allowlist.contains(&oracle_pubkey) {
        return Err(ContractError::OracleNotAllowlisted);
    }
    cfg.oracle_allowlist.retain(|k| k != &oracle_pubkey);
    CONFIG.save(deps.storage, &cfg)?;
    Ok(Response::new().add_attribute("action", "remove_oracle"))
}

fn rotate_oracle(
    deps: DepsMut,
    info: MessageInfo,
    old_oracle_pubkey: HexBinary,
    new_oracle_pubkey: HexBinary,
) -> Result<Response, ContractError> {
    let mut cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;
    if !cfg.oracle_allowlist.contains(&old_oracle_pubkey) {
        return Err(ContractError::OracleNotAllowlisted);
    }
    if old_oracle_pubkey != new_oracle_pubkey
        && cfg.oracle_allowlist.contains(&new_oracle_pubkey)
    {
        return Err(ContractError::OracleAlreadyAllowlisted);
    }
    for k in cfg.oracle_allowlist.iter_mut() {
        if *k == old_oracle_pubkey {
            *k = new_oracle_pubkey.clone();
        }
    }
    CONFIG.save(deps.storage, &cfg)?;
    Ok(Response::new().add_attribute("action", "rotate_oracle"))
}

// ──────────────────────────────────────────────────────────────────────────────
// Deposit / Withdraw / Yield / Loss
// ──────────────────────────────────────────────────────────────────────────────

fn deposit(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vault_id: u32,
    kind: u32,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    if cfg.paused {
        return Err(ContractError::VaultPaused);
    }

    let mut vault = VAULTS
        .may_load(deps.storage, vault_id)?
        .ok_or(ContractError::NotInitialized)?;
    if vault.state != VaultState::Active {
        return Err(ContractError::VaultNotActive);
    }

    let tranche_kind = TrancheKind::from_u32(kind).ok_or(ContractError::InvalidTrancheKind)?;
    let mut tranche = TRANCHES
        .may_load(deps.storage, (vault_id, tranche_kind.as_u32()))?
        .ok_or(ContractError::NotInitialized)?;

    let usdc_amount = to_u64(amount)?;
    let shares = math::deposit_shares(
        usdc_amount,
        tranche.nav_per_share_q.u128(),
        tranche.total_supply,
    )?;

    // 1. Pull USDC from the user into the contract (cw20 allowance + TransferFrom).
    let pull_usdc = cw20_transfer_from(
        &cfg.usdc_token,
        info.sender.as_str(),
        env.contract.address.as_str(),
        amount,
    )?;
    // 2. Mint pTokens to the user.
    let mint_ptoken = cw20_mint(&tranche.ptoken, info.sender.as_str(), Uint128::from(shares))?;

    // 3. Update accounting.
    tranche.total_assets = tranche
        .total_assets
        .checked_add(usdc_amount)
        .ok_or(ContractError::ArithmeticOverflow)?;
    tranche.total_supply = tranche
        .total_supply
        .checked_add(shares)
        .ok_or(ContractError::ArithmeticOverflow)?;
    tranche.nav_per_share_q = nav_q(tranche.total_assets, tranche.total_supply);
    tranche.last_nav_update_ts = env.block.time.seconds();
    TRANCHES.save(deps.storage, (vault_id, tranche_kind.as_u32()), &tranche)?;

    vault.total_deposits = vault
        .total_deposits
        .checked_add(usdc_amount)
        .ok_or(ContractError::ArithmeticOverflow)?;
    VAULTS.save(deps.storage, vault_id, &vault)?;

    Ok(Response::new()
        .add_message(pull_usdc)
        .add_message(mint_ptoken)
        .add_attribute("action", "deposit")
        .add_attribute("shares", shares.to_string()))
}

fn withdraw(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vault_id: u32,
    kind: u32,
    shares: Uint128,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    if cfg.paused {
        return Err(ContractError::VaultPaused);
    }

    let mut vault = VAULTS
        .may_load(deps.storage, vault_id)?
        .ok_or(ContractError::NotInitialized)?;
    match vault.state {
        VaultState::Active | VaultState::Defaulted => {}
        VaultState::Resolved => return Err(ContractError::VaultNotActive),
    }

    let tranche_kind = TrancheKind::from_u32(kind).ok_or(ContractError::InvalidTrancheKind)?;
    let mut tranche = TRANCHES
        .may_load(deps.storage, (vault_id, tranche_kind.as_u32()))?
        .ok_or(ContractError::NotInitialized)?;

    let share_amount = to_u64(shares)?;
    let payout = math::withdraw_payout(share_amount, tranche.nav_per_share_q.u128())?;

    // 1. Burn the user's pTokens (cw20 allowance + BurnFrom).
    let mut msgs: Vec<CosmosMsg> = vec![cw20_burn_from(
        &tranche.ptoken,
        info.sender.as_str(),
        shares,
    )?];
    // 2. Pay out USDC (skip if zero — wiped tranche).
    if payout > 0 {
        msgs.push(cw20_transfer(
            &cfg.usdc_token,
            info.sender.as_str(),
            Uint128::from(payout),
        )?);
    }

    // 3. Update accounting.
    tranche.total_assets = tranche.total_assets.saturating_sub(payout);
    tranche.total_supply = tranche.total_supply.saturating_sub(share_amount);
    tranche.nav_per_share_q = nav_q(tranche.total_assets, tranche.total_supply);
    tranche.last_nav_update_ts = env.block.time.seconds();
    TRANCHES.save(deps.storage, (vault_id, tranche_kind.as_u32()), &tranche)?;

    vault.total_deposits = vault.total_deposits.saturating_sub(payout);
    VAULTS.save(deps.storage, vault_id, &vault)?;

    Ok(Response::new()
        .add_messages(msgs)
        .add_attribute("action", "withdraw")
        .add_attribute("payout", payout.to_string()))
}

#[allow(clippy::too_many_arguments)]
fn accrue_yield(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vault_id: u32,
    payer: String,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;
    let payer = deps.api.addr_validate(&payer)?;

    let mut vault = VAULTS
        .may_load(deps.storage, vault_id)?
        .ok_or(ContractError::NotInitialized)?;
    if vault.state != VaultState::Active {
        return Err(ContractError::VaultNotActive);
    }

    let yield_amount = to_u64(amount)?;
    let now = env.block.time.seconds();
    let elapsed = now.saturating_sub(vault.last_yield_timestamp);
    if elapsed == 0 {
        return Ok(Response::new().add_attribute("action", "accrue_yield_noop"));
    }

    let mut prime = load_tranche(deps.storage, vault_id, TrancheKind::Prime)?;
    let mut core = load_tranche(deps.storage, vault_id, TrancheKind::Core)?;
    let mut alpha = load_tranche(deps.storage, vault_id, TrancheKind::Alpha)?;

    let prime_target = compute_yield_target(prime.total_assets, prime.target_apy_bps, elapsed)?;
    let core_target = compute_yield_target(core.total_assets, core.target_apy_bps, elapsed)?;

    // Waterfall: Prime → Core → Alpha takes residual.
    let mut remaining = yield_amount;
    let prime_take = prime_target.min(remaining);
    remaining -= prime_take;
    let core_take = core_target.min(remaining);
    remaining -= core_take;
    let alpha_take = remaining;

    // Pull USDC from payer into the contract.
    let pull = cw20_transfer_from(
        &cfg.usdc_token,
        payer.as_str(),
        env.contract.address.as_str(),
        amount,
    )?;

    apply_yield(&mut prime, prime_take, now)?;
    apply_yield(&mut core, core_take, now)?;
    apply_yield(&mut alpha, alpha_take, now)?;

    save_tranche(deps.storage, &prime)?;
    save_tranche(deps.storage, &core)?;
    save_tranche(deps.storage, &alpha)?;

    vault.last_yield_timestamp = now;
    VAULTS.save(deps.storage, vault_id, &vault)?;

    Ok(Response::new()
        .add_message(pull)
        .add_attribute("action", "accrue_yield")
        .add_attribute("prime_take", prime_take.to_string())
        .add_attribute("core_take", core_take.to_string())
        .add_attribute("alpha_take", alpha_take.to_string()))
}

#[allow(clippy::too_many_arguments)]
fn trigger_credit_event(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vault_id: u32,
    event_type: u32,
    loss_amount: Uint128,
    severity_bps: u32,
    loan_id: u32,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;

    let mut vault = VAULTS
        .may_load(deps.storage, vault_id)?
        .ok_or(ContractError::NotInitialized)?;
    if vault.state != VaultState::Active {
        return Err(ContractError::VaultNotActive);
    }
    if severity_bps > 10_000 {
        return Err(ContractError::InvalidSeverity);
    }
    let event_kind = match event_type {
        0 => CreditEventType::Default,
        1 => CreditEventType::PartialLoss,
        2 => CreditEventType::Recovery,
        _ => return Err(ContractError::InvalidSeverity),
    };
    let loss = to_u64(loss_amount)?;
    let now = env.block.time.seconds();

    let seq = apply_cascade(
        deps.storage,
        &mut vault,
        vault_id,
        loss,
        severity_bps,
        event_kind,
        loan_id,
        info.sender.clone(),
        now,
    )?;

    Ok(Response::new()
        .add_attribute("action", "trigger_credit_event")
        .add_attribute("seq", seq.to_string()))
}

// ──────────────────────────────────────────────────────────────────────────────
// Loans
// ──────────────────────────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn init_loan(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vault_id: u32,
    loan_id: u32,
    borrower: String,
    principal: Uint128,
    apr_bps: u32,
    maturity_ts: u64,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;

    if !VAULTS.has(deps.storage, vault_id) {
        return Err(ContractError::NotInitialized);
    }
    if LOANS.has(deps.storage, loan_id) {
        return Err(ContractError::AlreadyInitialized);
    }
    if apr_bps > 10_000 {
        return Err(ContractError::InvalidSeverity);
    }
    let now = env.block.time.seconds();
    if maturity_ts <= now {
        return Err(ContractError::LoanInWrongState);
    }
    let borrower = deps.api.addr_validate(&borrower)?;
    let principal_u64 = to_u64(principal)?;

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
    LOANS.save(deps.storage, loan_id, &loan)?;
    Ok(Response::new()
        .add_attribute("action", "init_loan")
        .add_attribute("loan_id", loan_id.to_string()))
}

fn disburse_loan(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    vault_id: u32,
    loan_id: u32,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;

    let mut vault = VAULTS
        .may_load(deps.storage, vault_id)?
        .ok_or(ContractError::NotInitialized)?;
    if vault.state != VaultState::Active {
        return Err(ContractError::VaultNotActive);
    }

    let mut loan = LOANS
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::NotInitialized)?;
    if loan.vault_id != vault_id {
        return Err(ContractError::BorrowerMismatch);
    }

    // Collateral gate: if a record exists it must be verified (Attached+).
    if let Some(col) = COLLATERAL.may_load(deps.storage, loan_id)? {
        if col.status == CollateralStatus::Pending {
            return Err(ContractError::CollateralNotVerified);
        }
    }

    if loan.state != LoanState::Originated {
        return Err(ContractError::LoanInWrongState);
    }

    let send_usdc = cw20_transfer(
        &cfg.usdc_token,
        loan.borrower.as_str(),
        Uint128::from(loan.principal),
    )?;

    loan.state = LoanState::Active;
    vault.total_loaned = vault
        .total_loaned
        .checked_add(loan.principal)
        .ok_or(ContractError::ArithmeticOverflow)?;
    LOANS.save(deps.storage, loan_id, &loan)?;
    VAULTS.save(deps.storage, vault_id, &vault)?;

    Ok(Response::new()
        .add_message(send_usdc)
        .add_attribute("action", "disburse_loan")
        .add_attribute("loan_id", loan_id.to_string()))
}

fn repay_loan(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    loan_id: u32,
    amount: Uint128,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    let mut loan = LOANS
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::NotInitialized)?;
    if loan.borrower != info.sender {
        return Err(ContractError::BorrowerMismatch);
    }
    if !matches!(loan.state, LoanState::Active | LoanState::Repaying) {
        return Err(ContractError::LoanInWrongState);
    }

    let pay_u64 = to_u64(amount)?;
    let pull = cw20_transfer_from(
        &cfg.usdc_token,
        info.sender.as_str(),
        env.contract.address.as_str(),
        amount,
    )?;

    loan.total_repaid = loan
        .total_repaid
        .checked_add(pay_u64)
        .ok_or(ContractError::ArithmeticOverflow)?;
    loan.state = if loan.total_repaid >= loan.principal {
        LoanState::Repaid
    } else {
        LoanState::Repaying
    };
    LOANS.save(deps.storage, loan_id, &loan)?;

    Ok(Response::new()
        .add_message(pull)
        .add_attribute("action", "repay_loan")
        .add_attribute("total_repaid", loan.total_repaid.to_string()))
}

// ──────────────────────────────────────────────────────────────────────────────
// Encrypt FHE oracle
// ──────────────────────────────────────────────────────────────────────────────

fn attach_encrypt_score(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    loan_id: u32,
    commitment: HexBinary,
    encrypt_oracle: HexBinary,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    if !cfg.oracle_allowlist.contains(&encrypt_oracle) {
        return Err(ContractError::OracleNotAllowlisted);
    }
    let loan = LOANS
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::NotInitialized)?;
    if loan.borrower != info.sender {
        return Err(ContractError::BorrowerMismatch);
    }
    if !matches!(loan.state, LoanState::Originated | LoanState::Active) {
        return Err(ContractError::LoanInWrongState);
    }
    if let Some(existing) = ENCRYPT_HEALTH.may_load(deps.storage, loan_id)? {
        if existing.status == EncryptStatus::DefaultProven {
            return Err(ContractError::EncryptAlreadyDefaultProven);
        }
    }
    let health = EncryptLoanHealth {
        loan_id,
        score_commitment: commitment,
        encrypt_oracle,
        status: EncryptStatus::Pending,
        default_proven_ts: 0,
    };
    ENCRYPT_HEALTH.save(deps.storage, loan_id, &health)?;
    Ok(Response::new().add_attribute("action", "attach_encrypt_score"))
}

#[allow(clippy::too_many_arguments)]
fn verify_encrypt_default(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    vault_id: u32,
    loan_id: u32,
    message: HexBinary,
    signature: HexBinary,
    loss_amount: Uint128,
    severity_bps: u32,
) -> Result<Response, ContractError> {
    let mut health = ENCRYPT_HEALTH
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::NotInitialized)?;
    if health.status == EncryptStatus::DefaultProven {
        return Err(ContractError::EncryptAlreadyDefaultProven);
    }

    // Validate message shape + bind to loan + commitment.
    let msg = message.as_slice();
    if msg.len() != 73 {
        return Err(ContractError::EncryptSignatureInvalid);
    }
    if &msg[0..8] != b"enc_atts" {
        return Err(ContractError::EncryptSignatureInvalid);
    }
    let expected_loan = loan_id_padded(loan_id);
    if msg[8..40] != expected_loan {
        return Err(ContractError::EncryptSignatureInvalid);
    }
    if msg[40..72] != *health.score_commitment.as_slice() {
        return Err(ContractError::EncryptCommitmentMismatch);
    }
    if msg[72] != 0x01 {
        return Err(ContractError::EncryptDefaultNotProven);
    }

    verify_ed25519(
        deps.api,
        msg,
        &signature,
        &health.encrypt_oracle,
        ContractError::EncryptSignatureInvalid,
    )?;

    let now = env.block.time.seconds();
    health.status = EncryptStatus::DefaultProven;
    health.default_proven_ts = now;
    ENCRYPT_HEALTH.save(deps.storage, loan_id, &health)?;

    let mut vault = VAULTS
        .may_load(deps.storage, vault_id)?
        .ok_or(ContractError::NotInitialized)?;
    if vault.state != VaultState::Active {
        return Err(ContractError::VaultNotActive);
    }
    if severity_bps > 10_000 {
        return Err(ContractError::InvalidSeverity);
    }
    let loss = to_u64(loss_amount)?;

    let seq = apply_cascade(
        deps.storage,
        &mut vault,
        vault_id,
        loss,
        severity_bps,
        CreditEventType::Default,
        loan_id,
        info.sender.clone(),
        now,
    )?;

    Ok(Response::new()
        .add_attribute("action", "verify_encrypt_default")
        .add_attribute("seq", seq.to_string()))
}

// ──────────────────────────────────────────────────────────────────────────────
// Cloak
// ──────────────────────────────────────────────────────────────────────────────

#[allow(clippy::too_many_arguments)]
fn record_cloak_payout(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    vault_id: u32,
    cloak_oracle: HexBinary,
    message: HexBinary,
    signature: HexBinary,
    total_shielded_amount: Uint128,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    if !cfg.oracle_allowlist.contains(&cloak_oracle) {
        return Err(ContractError::OracleNotAllowlisted);
    }

    let msg = message.as_slice();
    if msg.len() != 73 {
        return Err(ContractError::CloakSignatureInvalid);
    }
    if &msg[0..8] != b"clk_atts" {
        return Err(ContractError::CloakSignatureInvalid);
    }
    let expected_vault = loan_id_padded(vault_id); // same u32-LE + zero pad scheme
    if msg[8..40] != expected_vault {
        return Err(ContractError::CloakBatchIdMismatch);
    }
    let batch_id = HexBinary::from(&msg[40..72]);
    if msg[72] != 0x01 {
        return Err(ContractError::CloakPayoutNotConfirmed);
    }

    verify_ed25519(
        deps.api,
        msg,
        &signature,
        &cloak_oracle,
        ContractError::CloakSignatureInvalid,
    )?;

    let vault = VAULTS
        .may_load(deps.storage, vault_id)?
        .ok_or(ContractError::NotInitialized)?;
    let shielded_u64 = to_u64(total_shielded_amount)?;
    let now = env.block.time.seconds();
    let seq = next_cloak_seq(deps.storage, vault_id)?;
    let record = CloakPayoutRecord {
        vault_id,
        cloak_oracle,
        batch_id,
        total_shielded_amount: shielded_u64,
        yield_epoch_ts: vault.last_yield_timestamp,
        status: CloakPayoutStatus::Shielded,
        confirmed_ts: now,
    };
    CLOAK_PAYOUTS.save(deps.storage, (vault_id, seq), &record)?;

    Ok(Response::new()
        .add_attribute("action", "record_cloak_payout")
        .add_attribute("seq", seq.to_string()))
}

// ──────────────────────────────────────────────────────────────────────────────
// PRISM Collateral Oracle
// ──────────────────────────────────────────────────────────────────────────────

fn attach_collateral(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    loan_id: u32,
    oracle_pubkey: HexBinary,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    if !cfg.oracle_allowlist.contains(&oracle_pubkey) {
        return Err(ContractError::OracleNotAllowlisted);
    }
    let loan = LOANS
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::NotInitialized)?;
    if loan.borrower != info.sender {
        return Err(ContractError::BorrowerMismatch);
    }
    if !matches!(loan.state, LoanState::Originated | LoanState::Active) {
        return Err(ContractError::LoanInWrongState);
    }
    if let Some(existing) = COLLATERAL.may_load(deps.storage, loan_id)? {
        if existing.status != CollateralStatus::Pending {
            return Err(ContractError::CollateralAlreadyVerified);
        }
    }
    let rec = CollateralRecord {
        loan_id,
        borrower: info.sender.clone(),
        oracle_pubkey,
        chain_id: 0,
        asset_address: HexBinary::from(&[0u8; 32]),
        amount_usd_micro: 0,
        valued_at_ts: 0,
        last_nonce: 0,
        status: CollateralStatus::Pending,
    };
    COLLATERAL.save(deps.storage, loan_id, &rec)?;
    Ok(Response::new().add_attribute("action", "attach_collateral"))
}

fn verify_collateral(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    loan_id: u32,
    message: HexBinary,
    signature: HexBinary,
) -> Result<Response, ContractError> {
    let mut rec = COLLATERAL
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::CollateralNotAttached)?;
    if rec.status != CollateralStatus::Pending {
        return Err(ContractError::CollateralAlreadyVerified);
    }
    parse_and_verify_collateral_message(deps.api, &mut rec, message.as_slice(), &signature, 0x01)?;
    rec.status = CollateralStatus::Attached;
    COLLATERAL.save(deps.storage, loan_id, &rec)?;
    Ok(Response::new().add_attribute("action", "verify_collateral"))
}

fn release_collateral(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    loan_id: u32,
    message: HexBinary,
    signature: HexBinary,
) -> Result<Response, ContractError> {
    let mut rec = COLLATERAL
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::CollateralNotAttached)?;
    if rec.borrower != info.sender {
        return Err(ContractError::BorrowerMismatch);
    }
    if rec.status != CollateralStatus::Attached {
        return Err(ContractError::CollateralStatusMismatch);
    }
    parse_and_verify_collateral_message(deps.api, &mut rec, message.as_slice(), &signature, 0x02)?;
    rec.status = CollateralStatus::Released;
    COLLATERAL.save(deps.storage, loan_id, &rec)?;
    Ok(Response::new().add_attribute("action", "release_collateral"))
}

#[allow(clippy::too_many_arguments)]
fn liquidate_collateral(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    loan_id: u32,
    message: HexBinary,
    signature: HexBinary,
    loss_amount: Uint128,
    severity_bps: u32,
) -> Result<Response, ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    only_admin(&cfg, &info.sender)?;

    let mut rec = COLLATERAL
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::CollateralNotAttached)?;
    if rec.status != CollateralStatus::Attached {
        return Err(ContractError::CollateralStatusMismatch);
    }
    parse_and_verify_collateral_message(deps.api, &mut rec, message.as_slice(), &signature, 0x03)?;
    rec.status = CollateralStatus::Liquidated;
    COLLATERAL.save(deps.storage, loan_id, &rec)?;

    let loan = LOANS
        .may_load(deps.storage, loan_id)?
        .ok_or(ContractError::NotInitialized)?;
    let vault_id = loan.vault_id;
    let mut vault = VAULTS
        .may_load(deps.storage, vault_id)?
        .ok_or(ContractError::NotInitialized)?;
    if vault.state != VaultState::Active {
        return Err(ContractError::VaultNotActive);
    }
    if severity_bps > 10_000 {
        return Err(ContractError::InvalidSeverity);
    }
    let loss = to_u64(loss_amount)?;
    let now = env.block.time.seconds();

    let seq = apply_cascade(
        deps.storage,
        &mut vault,
        vault_id,
        loss,
        severity_bps,
        CreditEventType::Default,
        loan_id,
        info.sender.clone(),
        now,
    )?;

    Ok(Response::new()
        .add_attribute("action", "liquidate_collateral")
        .add_attribute("seq", seq.to_string()))
}

// ──────────────────────────────────────────────────────────────────────────────
// query
// ──────────────────────────────────────────────────────────────────────────────

pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> Result<Binary, ContractError> {
    let bin = match msg {
        QueryMsg::GetConfig {} => to_json_binary(&CONFIG.load(deps.storage)?)?,
        QueryMsg::GetVault { vault_id } => {
            to_json_binary(&VAULTS.may_load(deps.storage, vault_id)?)?
        }
        QueryMsg::GetTranche { vault_id, kind } => {
            let val = match TrancheKind::from_u32(kind) {
                Some(k) => TRANCHES.may_load(deps.storage, (vault_id, k.as_u32()))?,
                None => None,
            };
            to_json_binary(&val)?
        }
        QueryMsg::GetLoan { loan_id } => to_json_binary(&LOANS.may_load(deps.storage, loan_id)?)?,
        QueryMsg::GetCollateral { loan_id } => {
            to_json_binary(&COLLATERAL.may_load(deps.storage, loan_id)?)?
        }
        QueryMsg::GetEncryptHealth { loan_id } => {
            to_json_binary(&ENCRYPT_HEALTH.may_load(deps.storage, loan_id)?)?
        }
        QueryMsg::GetCloakPayout { vault_id, seq } => {
            to_json_binary(&CLOAK_PAYOUTS.may_load(deps.storage, (vault_id, seq))?)?
        }
        QueryMsg::GetLossBucketBalance { vault_id } => {
            to_json_binary(&read_loss_bucket(deps.storage, vault_id))?
        }
        QueryMsg::IsOracleAllowlisted { oracle_pubkey } => {
            let cfg = CONFIG.load(deps.storage)?;
            to_json_binary(&cfg.oracle_allowlist.contains(&oracle_pubkey))?
        }
    };
    Ok(bin)
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

fn only_admin(cfg: &GlobalConfig, sender: &Addr) -> Result<(), ContractError> {
    if sender != cfg.admin {
        return Err(ContractError::Unauthorized);
    }
    Ok(())
}

fn to_u64(v: Uint128) -> Result<u64, ContractError> {
    u64::try_from(v.u128()).map_err(|_| ContractError::ArithmeticOverflow)
}

fn nav_q(total_assets: u64, total_supply: u64) -> Uint128 {
    Uint128::new(math::compute_nav_q(total_assets, total_supply))
}

fn load_tranche(
    storage: &dyn Storage,
    vault_id: u32,
    kind: TrancheKind,
) -> Result<Tranche, ContractError> {
    TRANCHES
        .may_load(storage, (vault_id, kind.as_u32()))?
        .ok_or(ContractError::NotInitialized)
}

fn save_tranche(storage: &mut dyn Storage, t: &Tranche) -> Result<(), ContractError> {
    TRANCHES.save(storage, (t.vault_id, t.kind.as_u32()), t)?;
    Ok(())
}

/// u32-LE id, zero-padded to 32 bytes. Used to bind loan/vault id in
/// Encrypt/Cloak attestations (identical scheme to the Soroban version).
fn loan_id_padded(id: u32) -> [u8; 32] {
    let mut buf = [0u8; 32];
    buf[0..4].copy_from_slice(&id.to_le_bytes());
    buf
}

fn compute_yield_target(total_assets: u64, apy_bps: u32, elapsed: u64) -> Result<u64, ContractError> {
    let numerator = (total_assets as u128)
        .checked_mul(apy_bps as u128)
        .and_then(|x| x.checked_mul(elapsed as u128))
        .ok_or(ContractError::ArithmeticOverflow)?;
    let target = numerator / (YEAR_SECONDS * 10_000);
    if target > u64::MAX as u128 {
        return Err(ContractError::ArithmeticOverflow);
    }
    Ok(target as u64)
}

fn apply_yield(tranche: &mut Tranche, slice: u64, now: u64) -> Result<(), ContractError> {
    tranche.total_assets = tranche
        .total_assets
        .checked_add(slice)
        .ok_or(ContractError::ArithmeticOverflow)?;
    tranche.cumulative_yield = tranche
        .cumulative_yield
        .checked_add(slice)
        .ok_or(ContractError::ArithmeticOverflow)?;
    tranche.nav_per_share_q = nav_q(tranche.total_assets, tranche.total_supply);
    tranche.last_nav_update_ts = now;
    Ok(())
}

/// Reverse-waterfall loss cascade (Alpha → Core → Prime), shared by
/// `trigger_credit_event`, `verify_encrypt_default`, `liquidate_collateral`.
/// Writes tranches + credit event + loss bucket, mutates+saves the vault
/// (state transition + seq increment), and returns the recorded `seq`.
#[allow(clippy::too_many_arguments)]
fn apply_cascade(
    storage: &mut dyn Storage,
    vault: &mut Vault,
    vault_id: u32,
    loss: u64,
    severity_bps: u32,
    event_kind: CreditEventType,
    loan_id: u32,
    triggered_by: Addr,
    now: u64,
) -> Result<u32, ContractError> {
    let mut prime = load_tranche(storage, vault_id, TrancheKind::Prime)?;
    let mut core_t = load_tranche(storage, vault_id, TrancheKind::Core)?;
    let mut alpha = load_tranche(storage, vault_id, TrancheKind::Alpha)?;

    let total_assets = prime
        .total_assets
        .checked_add(core_t.total_assets)
        .and_then(|x| x.checked_add(alpha.total_assets))
        .ok_or(ContractError::ArithmeticOverflow)?;
    if loss > total_assets {
        return Err(ContractError::LossExceedsTotalAssets);
    }

    let mut remaining = loss;
    let alpha_hit = remaining.min(alpha.total_assets);
    alpha.total_assets -= alpha_hit;
    alpha.cumulative_loss = alpha.cumulative_loss.saturating_add(alpha_hit);
    remaining -= alpha_hit;

    let core_hit = remaining.min(core_t.total_assets);
    core_t.total_assets -= core_hit;
    core_t.cumulative_loss = core_t.cumulative_loss.saturating_add(core_hit);
    remaining -= core_hit;

    let prime_hit = remaining.min(prime.total_assets);
    prime.total_assets -= prime_hit;
    prime.cumulative_loss = prime.cumulative_loss.saturating_add(prime_hit);

    alpha.nav_per_share_q = nav_q(alpha.total_assets, alpha.total_supply);
    core_t.nav_per_share_q = nav_q(core_t.total_assets, core_t.total_supply);
    prime.nav_per_share_q = nav_q(prime.total_assets, prime.total_supply);

    save_tranche(storage, &alpha)?;
    save_tranche(storage, &core_t)?;
    save_tranche(storage, &prime)?;

    let seq = vault.credit_event_seq;
    let event = CreditEvent {
        vault_id,
        seq,
        event_type: event_kind.clone(),
        loan_id,
        loss_amount: loss,
        recovery_amount: 0,
        severity_bps,
        timestamp: now,
        triggered_by,
    };
    CREDIT_EVENTS.save(storage, (vault_id, seq), &event)?;

    match event_kind {
        CreditEventType::Default => vault.state = VaultState::Defaulted,
        CreditEventType::Recovery => vault.state = VaultState::Active,
        CreditEventType::PartialLoss => {}
    }
    vault.credit_event_seq = vault.credit_event_seq.saturating_add(1);
    VAULTS.save(storage, vault_id, vault)?;

    // Maintain reserve invariant: bump loss bucket by the absorbed loss.
    let prev = read_loss_bucket(storage, vault_id);
    LOSS_BUCKET.save(
        storage,
        vault_id,
        &prev.checked_add(Uint128::from(loss)).map_err(|_| ContractError::ArithmeticOverflow)?,
    )?;

    Ok(seq)
}

/// Validate + parse a 73-byte PRISM Collateral Oracle attestation, mutating
/// `rec` with the parsed fields. Mirrors the Soroban helper byte-for-byte.
fn parse_and_verify_collateral_message(
    api: &dyn Api,
    rec: &mut CollateralRecord,
    msg: &[u8],
    signature: &HexBinary,
    expected_status_byte: u8,
) -> Result<(), ContractError> {
    if msg.len() != 73 {
        return Err(ContractError::CollateralInvalidMessage);
    }
    if &msg[0..8] != b"col_atts" {
        return Err(ContractError::CollateralInvalidMessage);
    }
    let attested_loan = u32::from_le_bytes(msg[8..12].try_into().unwrap());
    if attested_loan != rec.loan_id {
        return Err(ContractError::CollateralInvalidMessage);
    }
    let nonce = u64::from_le_bytes(msg[64..72].try_into().unwrap());
    if nonce <= rec.last_nonce {
        return Err(ContractError::CollateralNonceReused);
    }
    if msg[72] != expected_status_byte {
        return Err(ContractError::CollateralStatusMismatch);
    }

    verify_ed25519(
        api,
        msg,
        signature,
        &rec.oracle_pubkey,
        ContractError::CollateralInvalidMessage,
    )?;

    rec.chain_id = u32::from_le_bytes(msg[12..16].try_into().unwrap());
    rec.asset_address = HexBinary::from(&msg[16..48]);
    rec.amount_usd_micro = u64::from_le_bytes(msg[48..56].try_into().unwrap());
    rec.valued_at_ts = i64::from_le_bytes(msg[56..64].try_into().unwrap());
    rec.last_nonce = nonce;
    Ok(())
}

/// Ed25519 verification against a 32-byte pubkey. Malformed inputs or a bad
/// signature both surface as `on_fail` (Soroban panicked instead — we degrade
/// gracefully to a typed error).
fn verify_ed25519(
    api: &dyn Api,
    message: &[u8],
    signature: &HexBinary,
    pubkey: &HexBinary,
    on_fail: ContractError,
) -> Result<(), ContractError> {
    let ok = api
        .ed25519_verify(message, signature.as_slice(), pubkey.as_slice())
        .unwrap_or(false);
    if !ok {
        return Err(on_fail);
    }
    Ok(())
}

// ── cw20 message builders ────────────────────────────────────────────────────

fn cw20_transfer(
    token: &Addr,
    recipient: &str,
    amount: Uint128,
) -> Result<CosmosMsg, ContractError> {
    Ok(WasmMsg::Execute {
        contract_addr: token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Transfer {
            recipient: recipient.to_string(),
            amount,
        })?,
        funds: vec![],
    }
    .into())
}

fn cw20_transfer_from(
    token: &Addr,
    owner: &str,
    recipient: &str,
    amount: Uint128,
) -> Result<CosmosMsg, ContractError> {
    Ok(WasmMsg::Execute {
        contract_addr: token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::TransferFrom {
            owner: owner.to_string(),
            recipient: recipient.to_string(),
            amount,
        })?,
        funds: vec![],
    }
    .into())
}

fn cw20_mint(token: &Addr, recipient: &str, amount: Uint128) -> Result<CosmosMsg, ContractError> {
    Ok(WasmMsg::Execute {
        contract_addr: token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::Mint {
            recipient: recipient.to_string(),
            amount,
        })?,
        funds: vec![],
    }
    .into())
}

fn cw20_burn_from(token: &Addr, owner: &str, amount: Uint128) -> Result<CosmosMsg, ContractError> {
    Ok(WasmMsg::Execute {
        contract_addr: token.to_string(),
        msg: to_json_binary(&Cw20ExecuteMsg::BurnFrom {
            owner: owner.to_string(),
            amount,
        })?,
        funds: vec![],
    }
    .into())
}
