//! Integration tests (cw-multi-test). Ported from
//! `soroban/prism-core/src/tests.rs`. The locked demo NAV values
//! (`docs/12-reference-card.md` §4.3 / §4.5) are asserted byte-exactly — these
//! are CLAUDE.md hard rule #4.
//!
//! USDC and the three pTokens are real `cw20-base` instances; prism-core is the
//! minter of the pTokens. Deposit/withdraw/yield/repay use the cw20 allowance
//! pattern (the test grants the allowance before calling).

#![cfg(test)]

use cosmwasm_std::{Addr, HexBinary, Uint128};
use cw20::{BalanceResponse, Cw20Coin, Cw20ExecuteMsg, Cw20QueryMsg, MinterResponse};
use cw_multi_test::{App, ContractWrapper, Executor};
use ed25519_dalek::{Signer, SigningKey};

use crate::math::{compute_nav_q, Q64_ONE};
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{
    CollateralStatus, EncryptStatus, LoanState, Tranche, Vault, VaultState,
};

const USDC_UNIT: u128 = 10_000_000; // 7 decimals

// ── Demo locked numbers (ref-card §1.4) ──────────────────────────────────────
const PRIME_DEPOSIT: u128 = 10_000 * USDC_UNIT;
const CORE_DEPOSIT: u128 = 4_500 * USDC_UNIT;
const ALPHA_DEPOSIT: u128 = 5_000 * USDC_UNIT;
const YIELD_100: u128 = 100 * USDC_UNIT;
const LOSS_6500: u128 = 6_500 * USDC_UNIT;
const ELAPSED_30D: u64 = 30 * 24 * 3600;

fn prism_code(app: &mut App) -> u64 {
    let w = ContractWrapper::new(
        crate::contract::execute,
        crate::contract::instantiate,
        crate::contract::query,
    );
    app.store_code(Box::new(w))
}

fn cw20_code(app: &mut App) -> u64 {
    let w = ContractWrapper::new(
        cw20_base::contract::execute,
        cw20_base::contract::instantiate,
        cw20_base::contract::query,
    );
    app.store_code(Box::new(w))
}

struct Harness {
    app: App,
    core: Addr,
    usdc: Addr,
    ptoken: [Addr; 3], // [prime, core, alpha]
    admin: Addr,
}

/// Stand up USDC, prism-core, three pTokens (minted by core), a vault + three
/// tranches. `apy_bps` per tranche. `funded` = (addr, usdc_amount) initial mints.
fn setup(apy_bps: [u32; 3], funded: &[(&str, u128)], oracle_seeds: &[u8]) -> Harness {
    let mut app = App::default();
    let admin = app.api().addr_make("admin");

    let cw20_id = cw20_code(&mut app);
    let prism_id = prism_code(&mut app);

    // USDC cw20 — minter is admin; seed initial balances.
    let initial_balances: Vec<Cw20Coin> = funded
        .iter()
        .map(|(name, amt)| Cw20Coin {
            address: app.api().addr_make(name).to_string(),
            amount: Uint128::new(*amt),
        })
        .collect();
    let usdc = app
        .instantiate_contract(
            cw20_id,
            admin.clone(),
            &cw20_base::msg::InstantiateMsg {
                name: "Test USDC".into(),
                symbol: "TUSDC".into(),
                decimals: 7,
                initial_balances,
                mint: Some(MinterResponse {
                    minter: admin.to_string(),
                    cap: None,
                }),
                marketing: None,
            },
            &[],
            "usdc",
            None,
        )
        .unwrap();

    let oracle_allowlist: Vec<HexBinary> = oracle_seeds
        .iter()
        .map(|s| HexBinary::from(SigningKey::from_bytes(&[*s; 32]).verifying_key().to_bytes().to_vec()))
        .collect();

    let core = app
        .instantiate_contract(
            prism_id,
            admin.clone(),
            &InstantiateMsg {
                admin: Some(admin.to_string()),
                usdc_token: usdc.to_string(),
                default_yield_rate_bps: 500,
                oracle_allowlist,
            },
            &[],
            "prism-core",
            None,
        )
        .unwrap();

    // Three pTokens with prism-core as minter.
    let mut ptoken: Vec<Addr> = vec![];
    for (i, sym) in ["pPRIME", "pCORE", "pALPHA"].iter().enumerate() {
        let t = app
            .instantiate_contract(
                cw20_id,
                admin.clone(),
                &cw20_base::msg::InstantiateMsg {
                    name: format!("Prism {sym}"),
                    symbol: (*sym).into(),
                    decimals: 7,
                    initial_balances: vec![],
                    mint: Some(MinterResponse {
                        minter: core.to_string(),
                        cap: None,
                    }),
                    marketing: None,
                },
                &[],
                *sym,
                None,
            )
            .unwrap();
        let _ = i;
        ptoken.push(t);
    }

    // Vault + three tranches.
    app.execute_contract(admin.clone(), core.clone(), &ExecuteMsg::InitVault { vault_id: 0 }, &[])
        .unwrap();
    for kind in 0u32..3 {
        app.execute_contract(
            admin.clone(),
            core.clone(),
            &ExecuteMsg::InitTranche {
                vault_id: 0,
                kind,
                target_apy_bps: apy_bps[kind as usize],
                ptoken: ptoken[kind as usize].to_string(),
            },
            &[],
        )
        .unwrap();
    }

    Harness {
        app,
        core,
        usdc,
        ptoken: [ptoken[0].clone(), ptoken[1].clone(), ptoken[2].clone()],
        admin,
    }
}

// ── helpers ──────────────────────────────────────────────────────────────────

impl Harness {
    fn addr(&self, name: &str) -> Addr {
        self.app.api().addr_make(name)
    }

    fn increase_allowance(&mut self, owner: &Addr, token: &Addr, amount: u128) {
        self.app
            .execute_contract(
                owner.clone(),
                token.clone(),
                &Cw20ExecuteMsg::IncreaseAllowance {
                    spender: self.core.to_string(),
                    amount: Uint128::new(amount),
                    expires: None,
                },
                &[],
            )
            .unwrap();
    }

    /// Deposit (handles the USDC allowance grant first).
    fn deposit(&mut self, user: &Addr, kind: u32, amount: u128) {
        let usdc = self.usdc.clone();
        self.increase_allowance(user, &usdc, amount);
        self.app
            .execute_contract(
                user.clone(),
                self.core.clone(),
                &ExecuteMsg::Deposit { vault_id: 0, kind, amount: Uint128::new(amount) },
                &[],
            )
            .unwrap();
    }

    fn withdraw(&mut self, user: &Addr, kind: u32, shares: u128) {
        let pt = self.ptoken[kind as usize].clone();
        self.increase_allowance(user, &pt, shares);
        self.app
            .execute_contract(
                user.clone(),
                self.core.clone(),
                &ExecuteMsg::Withdraw { vault_id: 0, kind, shares: Uint128::new(shares) },
                &[],
            )
            .unwrap();
    }

    fn accrue_yield(&mut self, amount: u128) {
        let usdc = self.usdc.clone();
        let admin = self.admin.clone();
        self.increase_allowance(&admin, &usdc, amount);
        self.app
            .execute_contract(
                admin.clone(),
                self.core.clone(),
                &ExecuteMsg::AccrueYield {
                    vault_id: 0,
                    payer: admin.to_string(),
                    amount: Uint128::new(amount),
                },
                &[],
            )
            .unwrap();
    }

    fn advance(&mut self, secs: u64) {
        self.app.update_block(|b| {
            b.time = b.time.plus_seconds(secs);
            b.height += 1;
        });
    }

    fn tranche(&self, kind: u32) -> Tranche {
        self.app
            .wrap()
            .query_wasm_smart::<Option<Tranche>>(
                &self.core,
                &QueryMsg::GetTranche { vault_id: 0, kind },
            )
            .unwrap()
            .unwrap()
    }

    fn vault(&self) -> Vault {
        self.app
            .wrap()
            .query_wasm_smart::<Option<Vault>>(&self.core, &QueryMsg::GetVault { vault_id: 0 })
            .unwrap()
            .unwrap()
    }

    fn loss_bucket(&self) -> Uint128 {
        self.app
            .wrap()
            .query_wasm_smart(&self.core, &QueryMsg::GetLossBucketBalance { vault_id: 0 })
            .unwrap()
    }

    fn cw20_balance(&self, token: &Addr, who: &Addr) -> u128 {
        let r: BalanceResponse = self
            .app
            .wrap()
            .query_wasm_smart(token, &Cw20QueryMsg::Balance { address: who.to_string() })
            .unwrap();
        r.balance.u128()
    }
}

fn nav(total_assets: u64, total_supply: u64) -> Uint128 {
    Uint128::new(compute_nav_q(total_assets, total_supply))
}

// ── Ed25519 attestation builders (byte layouts unchanged from Soroban) ────────

fn signer(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32])
}
fn pubkey_hex(seed: u8) -> HexBinary {
    HexBinary::from(signer(seed).verifying_key().to_bytes().to_vec())
}
fn sign_hex(seed: u8, msg: &[u8]) -> HexBinary {
    HexBinary::from(signer(seed).sign(msg).to_bytes().to_vec())
}

fn collateral_msg(
    loan_id: u32,
    chain_id: u32,
    asset: &[u8; 32],
    amount_usd_micro: u64,
    valued_at_ts: i64,
    nonce: u64,
    status: u8,
) -> Vec<u8> {
    let mut buf = vec![0u8; 73];
    buf[0..8].copy_from_slice(b"col_atts");
    buf[8..12].copy_from_slice(&loan_id.to_le_bytes());
    buf[12..16].copy_from_slice(&chain_id.to_le_bytes());
    buf[16..48].copy_from_slice(asset);
    buf[48..56].copy_from_slice(&amount_usd_micro.to_le_bytes());
    buf[56..64].copy_from_slice(&valued_at_ts.to_le_bytes());
    buf[64..72].copy_from_slice(&nonce.to_le_bytes());
    buf[72] = status;
    buf
}

fn encrypt_msg(loan_id: u32, commitment: &[u8; 32], result: u8) -> Vec<u8> {
    let mut buf = vec![0u8; 73];
    buf[0..8].copy_from_slice(b"enc_atts");
    buf[8..12].copy_from_slice(&loan_id.to_le_bytes());
    buf[40..72].copy_from_slice(commitment);
    buf[72] = result;
    buf
}

fn cloak_msg(vault_id: u32, batch_id: &[u8; 32], result: u8) -> Vec<u8> {
    let mut buf = vec![0u8; 73];
    buf[0..8].copy_from_slice(b"clk_atts");
    buf[8..12].copy_from_slice(&vault_id.to_le_bytes());
    buf[40..72].copy_from_slice(batch_id);
    buf[72] = result;
    buf
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

#[test]
fn deposit_first_mints_one_to_one_and_sets_nav() {
    let mut h = setup([500, 1000, 2500], &[("alice", 1_000 * USDC_UNIT)], &[]);
    let alice = h.addr("alice");
    h.deposit(&alice, 2, 100 * USDC_UNIT);

    assert_eq!(h.cw20_balance(&h.ptoken[2].clone(), &alice), 100 * USDC_UNIT);
    assert_eq!(h.cw20_balance(&h.usdc.clone(), &alice), 900 * USDC_UNIT);
    assert_eq!(h.cw20_balance(&h.usdc.clone(), &h.core.clone()), 100 * USDC_UNIT);

    let alpha = h.tranche(2);
    assert_eq!(alpha.total_assets, (100 * USDC_UNIT) as u64);
    assert_eq!(alpha.total_supply, (100 * USDC_UNIT) as u64);
    assert_eq!(alpha.nav_per_share_q, Uint128::new(Q64_ONE));
    assert_eq!(h.vault().total_deposits, (100 * USDC_UNIT) as u64);
}

#[test]
fn withdraw_at_nav_one_returns_usdc_one_to_one() {
    let mut h = setup([500, 1000, 2500], &[("alice", 1_000 * USDC_UNIT)], &[]);
    let alice = h.addr("alice");
    h.deposit(&alice, 2, 100 * USDC_UNIT);
    h.withdraw(&alice, 2, 40 * USDC_UNIT);

    assert_eq!(h.cw20_balance(&h.ptoken[2].clone(), &alice), 60 * USDC_UNIT);
    assert_eq!(h.cw20_balance(&h.usdc.clone(), &alice), 940 * USDC_UNIT);
    let alpha = h.tranche(2);
    assert_eq!(alpha.total_assets, (60 * USDC_UNIT) as u64);
    assert_eq!(alpha.nav_per_share_q, Uint128::new(Q64_ONE));
}

/// CLAUDE.md hard rule #4 — yield waterfall byte-exact NAVs (ref-card §1.4).
#[test]
fn p1_t4_waterfall_locked_demo_numbers() {
    let mut h = setup(
        [500, 800, 1500],
        &[
            ("prime", PRIME_DEPOSIT + 1_000 * USDC_UNIT),
            ("core", CORE_DEPOSIT + 1_000 * USDC_UNIT),
            ("alpha", ALPHA_DEPOSIT + 1_000 * USDC_UNIT),
            ("admin", 1_000 * USDC_UNIT),
        ],
        &[],
    );
    // NB: "admin" funding above is ignored — admin is addr_make("admin") which
    // already holds USDC via the cw20 mint role; we mint explicitly below.
    let prime = h.addr("prime");
    let core = h.addr("core");
    let alpha = h.addr("alpha");

    h.deposit(&prime, 0, PRIME_DEPOSIT);
    h.deposit(&core, 1, CORE_DEPOSIT);
    h.deposit(&alpha, 2, ALPHA_DEPOSIT);

    // Give admin USDC to ship as yield (admin is the cw20 minter).
    let admin = h.admin.clone();
    let usdc = h.usdc.clone();
    h.app
        .execute_contract(
            admin.clone(),
            usdc.clone(),
            &Cw20ExecuteMsg::Mint { recipient: admin.to_string(), amount: Uint128::new(YIELD_100) },
            &[],
        )
        .unwrap();

    h.advance(ELAPSED_30D);
    h.accrue_yield(YIELD_100);

    let prime_take: u64 = 410_958_904;
    let core_take: u64 = 295_890_410;
    let alpha_take: u64 = (YIELD_100 as u64) - prime_take - core_take;

    let p = h.tranche(0);
    let c = h.tranche(1);
    let a = h.tranche(2);

    assert_eq!(p.total_assets, PRIME_DEPOSIT as u64 + prime_take, "prime assets");
    assert_eq!(c.total_assets, CORE_DEPOSIT as u64 + core_take, "core assets");
    assert_eq!(a.total_assets, ALPHA_DEPOSIT as u64 + alpha_take, "alpha assets");

    assert_eq!(p.cumulative_yield, prime_take);
    assert_eq!(c.cumulative_yield, core_take);
    assert_eq!(a.cumulative_yield, alpha_take);

    assert_eq!(p.nav_per_share_q, nav(p.total_assets, PRIME_DEPOSIT as u64), "prime NAV");
    assert_eq!(c.nav_per_share_q, nav(c.total_assets, CORE_DEPOSIT as u64), "core NAV");
    assert_eq!(a.nav_per_share_q, nav(a.total_assets, ALPHA_DEPOSIT as u64), "alpha NAV");

    // Prime NAV ≈ 1.00411.
    let q1 = Q64_ONE;
    assert!(p.nav_per_share_q.u128() > q1 + q1 / 300);
    assert!(p.nav_per_share_q.u128() < q1 + q1 / 200);

    // Reserve invariant (no losses yet).
    let sum = p.total_assets as u128 + c.total_assets as u128 + a.total_assets as u128;
    assert_eq!(h.cw20_balance(&usdc, &h.core.clone()), sum);
}

/// CLAUDE.md hard rule #4 — cascade byte-exact NAVs + loss bucket (ref-card §1.4).
#[test]
fn p1_t5_cascade_locked_demo_numbers() {
    let mut h = setup(
        [500, 800, 1500],
        &[
            ("prime", PRIME_DEPOSIT),
            ("core", CORE_DEPOSIT),
            ("alpha", ALPHA_DEPOSIT),
        ],
        &[],
    );
    let prime = h.addr("prime");
    let core = h.addr("core");
    let alpha = h.addr("alpha");
    h.deposit(&prime, 0, PRIME_DEPOSIT);
    h.deposit(&core, 1, CORE_DEPOSIT);
    h.deposit(&alpha, 2, ALPHA_DEPOSIT);

    let admin = h.admin.clone();
    let usdc = h.usdc.clone();
    h.app
        .execute_contract(
            admin.clone(),
            usdc.clone(),
            &Cw20ExecuteMsg::Mint { recipient: admin.to_string(), amount: Uint128::new(YIELD_100) },
            &[],
        )
        .unwrap();
    h.advance(ELAPSED_30D);
    h.accrue_yield(YIELD_100);

    let prime_nav_after_yield = h.tranche(0).nav_per_share_q;

    h.app
        .execute_contract(
            admin.clone(),
            h.core.clone(),
            &ExecuteMsg::TriggerCreditEvent {
                vault_id: 0,
                event_type: 0, // Default
                loss_amount: Uint128::new(LOSS_6500),
                severity_bps: 10_000,
                loan_id: 0,
            },
            &[],
        )
        .unwrap();

    let p = h.tranche(0);
    let c = h.tranche(1);
    let a = h.tranche(2);

    assert_eq!(a.total_assets, 0, "Alpha wiped");
    assert_eq!(a.nav_per_share_q, Uint128::zero());

    let core_after: u64 = 45_295_890_410 - 14_706_849_314;
    assert_eq!(c.total_assets, core_after, "core assets");
    assert_eq!(c.nav_per_share_q, nav(core_after, CORE_DEPOSIT as u64));

    let q1 = Q64_ONE;
    assert!(c.nav_per_share_q.u128() > q1 * 679 / 1000 && c.nav_per_share_q.u128() < q1 * 680 / 1000);

    assert_eq!(p.nav_per_share_q, prime_nav_after_yield, "prime NAV unchanged");
    assert_eq!(h.vault().state, VaultState::Defaulted);
    assert_eq!(h.loss_bucket(), Uint128::new(LOSS_6500));

    // Reserve invariant.
    let sum = p.total_assets as u128 + c.total_assets as u128 + a.total_assets as u128;
    assert_eq!(h.cw20_balance(&usdc, &h.core.clone()), sum + h.loss_bucket().u128());
}

#[test]
fn p1_t7_post_wipe_withdraw_returns_zero() {
    let mut h = setup([500, 1000, 2500], &[("alice", 1_000 * USDC_UNIT)], &[]);
    let alice = h.addr("alice");
    h.deposit(&alice, 2, 100 * USDC_UNIT);

    let admin = h.admin.clone();
    h.app
        .execute_contract(
            admin,
            h.core.clone(),
            &ExecuteMsg::TriggerCreditEvent {
                vault_id: 0,
                event_type: 1, // PartialLoss — vault stays Active
                loss_amount: Uint128::new(100 * USDC_UNIT),
                severity_bps: 10_000,
                loan_id: 0,
            },
            &[],
        )
        .unwrap();
    assert_eq!(h.tranche(2).total_assets, 0);
    assert_eq!(h.vault().state, VaultState::Active);

    let usdc_before = h.cw20_balance(&h.usdc.clone(), &alice);
    let shares = h.cw20_balance(&h.ptoken[2].clone(), &alice);
    assert!(shares > 0);
    h.withdraw(&alice, 2, shares);

    assert_eq!(h.cw20_balance(&h.ptoken[2].clone(), &alice), 0);
    assert_eq!(h.cw20_balance(&h.usdc.clone(), &alice), usdc_before, "no USDC paid out");
}

#[test]
fn deposit_into_wiped_tranche_errors() {
    let mut h = setup([500, 1000, 2500], &[("alice", 1_000 * USDC_UNIT)], &[]);
    let alice = h.addr("alice");
    h.deposit(&alice, 2, 100 * USDC_UNIT);
    let admin = h.admin.clone();
    h.app
        .execute_contract(
            admin,
            h.core.clone(),
            &ExecuteMsg::TriggerCreditEvent {
                vault_id: 0,
                event_type: 1,
                loss_amount: Uint128::new(100 * USDC_UNIT),
                severity_bps: 10_000,
                loan_id: 0,
            },
            &[],
        )
        .unwrap();

    let usdc = h.usdc.clone();
    h.increase_allowance(&alice, &usdc, 10 * USDC_UNIT);
    let err = h
        .app
        .execute_contract(
            alice.clone(),
            h.core.clone(),
            &ExecuteMsg::Deposit { vault_id: 0, kind: 2, amount: Uint128::new(10 * USDC_UNIT) },
            &[],
        )
        .unwrap_err();
    assert!(err.root_cause().to_string().contains("tranche wiped"));
}

// ── Loans ──────────────────────────────────────────────────────────────────

#[test]
fn loan_lifecycle_disburse_and_repay() {
    let mut h = setup([500, 1000, 2500], &[("alice", 1_000 * USDC_UNIT), ("bob", 50 * USDC_UNIT)], &[]);
    let alice = h.addr("alice");
    let bob = h.addr("bob");
    h.deposit(&alice, 2, 500 * USDC_UNIT);

    let admin = h.admin.clone();
    let maturity = h.app.block_info().time.seconds() + 30 * 24 * 3600;
    h.app
        .execute_contract(
            admin.clone(),
            h.core.clone(),
            &ExecuteMsg::InitLoan {
                vault_id: 0,
                loan_id: 1,
                borrower: bob.to_string(),
                principal: Uint128::new(20 * USDC_UNIT),
                apr_bps: 800,
                maturity_ts: maturity,
            },
            &[],
        )
        .unwrap();

    let before = h.cw20_balance(&h.usdc.clone(), &bob);
    h.app
        .execute_contract(admin, h.core.clone(), &ExecuteMsg::DisburseLoan { vault_id: 0, loan_id: 1 }, &[])
        .unwrap();
    let after = h.cw20_balance(&h.usdc.clone(), &bob);
    assert_eq!(after - before, 20 * USDC_UNIT);

    // Bob repays in full.
    let usdc = h.usdc.clone();
    h.increase_allowance(&bob, &usdc, 20 * USDC_UNIT);
    h.app
        .execute_contract(
            bob.clone(),
            h.core.clone(),
            &ExecuteMsg::RepayLoan { loan_id: 1, amount: Uint128::new(20 * USDC_UNIT) },
            &[],
        )
        .unwrap();

    let loan: Option<crate::state::Loan> = h
        .app
        .wrap()
        .query_wasm_smart(&h.core, &QueryMsg::GetLoan { loan_id: 1 })
        .unwrap();
    assert_eq!(loan.unwrap().state, LoanState::Repaid);
}

// ── PRISM Collateral Oracle (proves Ed25519 byte-compat with the off-chain signer) ──

#[test]
fn p3_t2_verify_collateral_full_round_trip() {
    let mut h = setup([500, 1000, 2500], &[("alice", 1_000 * USDC_UNIT)], &[11]);
    let alice = h.addr("alice");
    let bob = h.addr("bob");
    h.deposit(&alice, 2, 500 * USDC_UNIT);

    let admin = h.admin.clone();
    let maturity = h.app.block_info().time.seconds() + 30 * 24 * 3600;
    h.app
        .execute_contract(
            admin,
            h.core.clone(),
            &ExecuteMsg::InitLoan {
                vault_id: 0,
                loan_id: 1,
                borrower: bob.to_string(),
                principal: Uint128::new(20 * USDC_UNIT),
                apr_bps: 800,
                maturity_ts: maturity,
            },
            &[],
        )
        .unwrap();

    // Borrower attaches collateral (Pending).
    h.app
        .execute_contract(
            bob.clone(),
            h.core.clone(),
            &ExecuteMsg::AttachCollateral { loan_id: 1, oracle_pubkey: pubkey_hex(11) },
            &[],
        )
        .unwrap();
    let rec: Option<crate::state::CollateralRecord> = h
        .app
        .wrap()
        .query_wasm_smart(&h.core, &QueryMsg::GetCollateral { loan_id: 1 })
        .unwrap();
    assert_eq!(rec.unwrap().status, CollateralStatus::Pending);

    // Oracle signs Attached (0x01) attestation; relayer submits.
    let asset = [0xBB; 32];
    let msg = collateral_msg(1, 0, &asset, 500_000_000, 1_000_000, 1, 0x01);
    let sig = sign_hex(11, &msg);
    let relayer = h.addr("relayer");
    h.app
        .execute_contract(
            relayer,
            h.core.clone(),
            &ExecuteMsg::VerifyCollateral {
                loan_id: 1,
                message: HexBinary::from(msg),
                signature: sig,
            },
            &[],
        )
        .unwrap();

    let rec: crate::state::CollateralRecord = h
        .app
        .wrap()
        .query_wasm_smart::<Option<_>>(&h.core, &QueryMsg::GetCollateral { loan_id: 1 })
        .unwrap()
        .unwrap();
    assert_eq!(rec.status, CollateralStatus::Attached);
    assert_eq!(rec.amount_usd_micro, 500_000_000);
    assert_eq!(rec.last_nonce, 1);
}

#[test]
fn collateral_forged_signature_rejected() {
    let mut h = setup([500, 1000, 2500], &[("alice", 1_000 * USDC_UNIT)], &[11]);
    let alice = h.addr("alice");
    let bob = h.addr("bob");
    h.deposit(&alice, 2, 500 * USDC_UNIT);
    let admin = h.admin.clone();
    let maturity = h.app.block_info().time.seconds() + 30 * 24 * 3600;
    h.app
        .execute_contract(
            admin,
            h.core.clone(),
            &ExecuteMsg::InitLoan {
                vault_id: 0,
                loan_id: 1,
                borrower: bob.to_string(),
                principal: Uint128::new(20 * USDC_UNIT),
                apr_bps: 800,
                maturity_ts: maturity,
            },
            &[],
        )
        .unwrap();
    h.app
        .execute_contract(
            bob.clone(),
            h.core.clone(),
            &ExecuteMsg::AttachCollateral { loan_id: 1, oracle_pubkey: pubkey_hex(11) },
            &[],
        )
        .unwrap();

    let asset = [0xBB; 32];
    let msg = collateral_msg(1, 0, &asset, 500_000_000, 1_000_000, 1, 0x01);
    let bad_sig = sign_hex(99, &msg); // wrong key
    let relayer = h.addr("relayer");
    let err = h
        .app
        .execute_contract(
            relayer,
            h.core.clone(),
            &ExecuteMsg::VerifyCollateral {
                loan_id: 1,
                message: HexBinary::from(msg),
                signature: bad_sig,
            },
            &[],
        )
        .unwrap_err();
    assert!(err.root_cause().to_string().contains("collateral invalid message"));
}

// ── Encrypt oracle ───────────────────────────────────────────────────────────

#[test]
fn verify_encrypt_default_full_round_trip() {
    let mut h = setup([500, 1000, 2500], &[("alice", 1_000 * USDC_UNIT)], &[7]);
    let alice = h.addr("alice");
    let bob = h.addr("bob");
    let admin = h.admin.clone();
    let maturity = h.app.block_info().time.seconds() + 30 * 24 * 3600;
    h.app
        .execute_contract(
            admin,
            h.core.clone(),
            &ExecuteMsg::InitLoan {
                vault_id: 0,
                loan_id: 1,
                borrower: bob.to_string(),
                principal: Uint128::new(20 * USDC_UNIT),
                apr_bps: 800,
                maturity_ts: maturity,
            },
            &[],
        )
        .unwrap();

    let commitment = [0xab; 32];
    h.app
        .execute_contract(
            bob.clone(),
            h.core.clone(),
            &ExecuteMsg::AttachEncryptScore {
                loan_id: 1,
                commitment: HexBinary::from(&commitment),
                encrypt_oracle: pubkey_hex(7),
            },
            &[],
        )
        .unwrap();

    h.deposit(&alice, 2, 100 * USDC_UNIT);

    let msg = encrypt_msg(1, &commitment, 0x01);
    let sig = sign_hex(7, &msg);
    let relayer = h.addr("relayer");
    h.app
        .execute_contract(
            relayer,
            h.core.clone(),
            &ExecuteMsg::VerifyEncryptDefault {
                vault_id: 0,
                loan_id: 1,
                message: HexBinary::from(msg),
                signature: sig,
                loss_amount: Uint128::new(30 * USDC_UNIT),
                severity_bps: 3_000,
            },
            &[],
        )
        .unwrap();

    let health: crate::state::EncryptLoanHealth = h
        .app
        .wrap()
        .query_wasm_smart::<Option<_>>(&h.core, &QueryMsg::GetEncryptHealth { loan_id: 1 })
        .unwrap()
        .unwrap();
    assert_eq!(health.status, EncryptStatus::DefaultProven);
    assert_eq!(h.vault().state, VaultState::Defaulted);
    assert_eq!(h.tranche(2).total_assets, (70 * USDC_UNIT) as u64);
}

// ── Cloak oracle ───────────────────────────────────────────────────────────

#[test]
fn record_cloak_payout_full_round_trip() {
    let mut h = setup([500, 1000, 2500], &[], &[42]);
    let batch_id = [0x5a; 32];
    let msg = cloak_msg(0, &batch_id, 0x01);
    let sig = sign_hex(42, &msg);
    let relayer = h.addr("relayer");
    h.app
        .execute_contract(
            relayer,
            h.core.clone(),
            &ExecuteMsg::RecordCloakPayout {
                vault_id: 0,
                cloak_oracle: pubkey_hex(42),
                message: HexBinary::from(msg),
                signature: sig,
                total_shielded_amount: Uint128::new(50 * USDC_UNIT),
            },
            &[],
        )
        .unwrap();

    let rec: crate::state::CloakPayoutRecord = h
        .app
        .wrap()
        .query_wasm_smart::<Option<_>>(&h.core, &QueryMsg::GetCloakPayout { vault_id: 0, seq: 1 })
        .unwrap()
        .unwrap();
    assert_eq!(rec.total_shielded_amount, (50 * USDC_UNIT) as u64);
    assert_eq!(rec.batch_id, HexBinary::from(&batch_id));
}
