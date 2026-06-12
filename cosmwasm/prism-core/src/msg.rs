//! Instantiate / Execute / Query message schema for prism-core (CosmWasm).
//!
//! Design note vs. Soroban: handlers that took an explicit caller `Address`
//! (`user`, `borrower`, `authority`, `relayer`, `admin`) now derive the caller
//! from `info.sender` — there is no separate signature to pass. Addresses that
//! are *not* the caller (e.g. a loan's `borrower`, the yield `payer`) remain
//! explicit `String` fields and are validated with `deps.api.addr_validate`.
//!
//! Token amounts are `Uint128` (was `i128` on Soroban). Oracle pubkeys,
//! commitments, attestation messages, and signatures are `HexBinary` so the
//! frontend keeps its existing hex-string convention.

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{HexBinary, Uint128};

// Referenced by the `#[returns(...)]` attributes on `QueryMsg` (schema gen).
#[allow(unused_imports)]
use crate::state::{
    CloakPayoutRecord, CollateralRecord, EncryptLoanHealth, GlobalConfig, Loan, Tranche, Vault,
};

#[cw_serde]
pub struct InstantiateMsg {
    /// Admin address. Defaults to `info.sender` if omitted.
    pub admin: Option<String>,
    /// cw20 USDC contract address.
    pub usdc_token: String,
    pub default_yield_rate_bps: u32,
    /// Ed25519 oracle pubkeys (hex), seeds the allowlist.
    pub oracle_allowlist: Vec<HexBinary>,
}

#[cw_serde]
pub enum ExecuteMsg {
    // ── Admin setup ──────────────────────────────────────────────────────
    InitVault {
        vault_id: u32,
    },
    InitTranche {
        vault_id: u32,
        kind: u32,
        target_apy_bps: u32,
        /// cw20 contract address of the pre-deployed pToken (this contract must
        /// be its minter).
        ptoken: String,
    },
    Pause {},
    Unpause {},
    UpdateAdmin {
        new_admin: String,
    },
    AddOracleToAllowlist {
        oracle_pubkey: HexBinary,
    },
    RemoveOracleFromAllowlist {
        oracle_pubkey: HexBinary,
    },
    RotateOracleAllowlistKey {
        old_oracle_pubkey: HexBinary,
        new_oracle_pubkey: HexBinary,
    },

    // ── Core deposit / yield / loss ──────────────────────────────────────
    /// Deposit USDC into a tranche; mint pTokens to the sender.
    /// Requires the sender to have granted this contract a cw20 allowance on
    /// USDC of at least `amount` (pulled via `TransferFrom`).
    Deposit {
        vault_id: u32,
        kind: u32,
        amount: Uint128,
    },
    /// Burn pTokens; pay USDC at NAV. Requires a cw20 allowance on the pToken
    /// of at least `shares` (burned via `BurnFrom`).
    Withdraw {
        vault_id: u32,
        kind: u32,
        shares: Uint128,
    },
    /// Admin distributes yield across tranches via the waterfall. `payer` must
    /// have granted this contract a USDC allowance of at least `amount`.
    AccrueYield {
        vault_id: u32,
        payer: String,
        amount: Uint128,
    },
    /// Admin-triggered loss cascade (Alpha → Core → Prime).
    TriggerCreditEvent {
        vault_id: u32,
        event_type: u32,
        loss_amount: Uint128,
        severity_bps: u32,
        loan_id: u32,
    },

    // ── Loans ────────────────────────────────────────────────────────────
    InitLoan {
        vault_id: u32,
        loan_id: u32,
        borrower: String,
        principal: Uint128,
        apr_bps: u32,
        maturity_ts: u64,
    },
    DisburseLoan {
        vault_id: u32,
        loan_id: u32,
    },
    /// Borrower repays. Requires a USDC allowance of at least `amount`.
    RepayLoan {
        loan_id: u32,
        amount: Uint128,
    },

    // ── Encrypt FHE oracle ───────────────────────────────────────────────
    AttachEncryptScore {
        loan_id: u32,
        commitment: HexBinary,
        encrypt_oracle: HexBinary,
    },
    VerifyEncryptDefault {
        vault_id: u32,
        loan_id: u32,
        message: HexBinary,
        signature: HexBinary,
        loss_amount: Uint128,
        severity_bps: u32,
    },

    // ── Cloak ────────────────────────────────────────────────────────────
    RecordCloakPayout {
        vault_id: u32,
        cloak_oracle: HexBinary,
        message: HexBinary,
        signature: HexBinary,
        total_shielded_amount: Uint128,
    },

    // ── PRISM Collateral Oracle ──────────────────────────────────────────
    AttachCollateral {
        loan_id: u32,
        oracle_pubkey: HexBinary,
    },
    VerifyCollateral {
        loan_id: u32,
        message: HexBinary,
        signature: HexBinary,
    },
    ReleaseCollateral {
        loan_id: u32,
        message: HexBinary,
        signature: HexBinary,
    },
    LiquidateCollateral {
        loan_id: u32,
        message: HexBinary,
        signature: HexBinary,
        loss_amount: Uint128,
        severity_bps: u32,
    },
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(GlobalConfig)]
    GetConfig {},
    #[returns(Option<Vault>)]
    GetVault { vault_id: u32 },
    #[returns(Option<Tranche>)]
    GetTranche { vault_id: u32, kind: u32 },
    #[returns(Option<Loan>)]
    GetLoan { loan_id: u32 },
    #[returns(Option<CollateralRecord>)]
    GetCollateral { loan_id: u32 },
    #[returns(Option<EncryptLoanHealth>)]
    GetEncryptHealth { loan_id: u32 },
    #[returns(Option<CloakPayoutRecord>)]
    GetCloakPayout { vault_id: u32, seq: u32 },
    #[returns(Uint128)]
    GetLossBucketBalance { vault_id: u32 },
    #[returns(bool)]
    IsOracleAllowlisted { oracle_pubkey: HexBinary },
}
