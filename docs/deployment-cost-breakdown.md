    # PRISM Protocol — Mainnet Deployment Cost Breakdown

**Total requested: 80 XLM**
**Estimated actual spend: ~60–68 XLM**
**Buffer retained by team: ~12–20 XLM**

---

## 1. Contracts to Deploy (8 total)

| # | Contract Name | Type | Description |
|---|---|---|---|
| 1 | `prism-core` | Custom Soroban contract | Tranched credit engine — vaults, tranches, loans, collateral, yield accrual, credit events, oracle attestation, batch payout |
| 2 | `prism-amm` | Custom Soroban contract | Constant-product AMM for tranche pTokens |
| 3 | `pPrime` | Stellar Asset Contract (SAC) | Prime tranche deposit receipt token |
| 4 | `pCore` | Stellar Asset Contract (SAC) | Core tranche deposit receipt token |
| 5 | `pAlpha` | Stellar Asset Contract (SAC) | Alpha tranche deposit receipt token |
| 6 | `lpPrime` | Stellar Asset Contract (SAC) | Prime AMM LP token |
| 7 | `lpCore` | Stellar Asset Contract (SAC) | Core AMM LP token |
| 8 | `lpAlpha` | Stellar Asset Contract (SAC) | Alpha AMM LP token |

---

## 2. Cost Breakdown by Category

### 2A — WASM Upload + Contract Instantiation (dominant fee cost)

> Soroban charges state rent on WASM binaries at `(bytes + 100) × BUMP_HIGH × 0.0000213 stroops`.
> `BUMP_HIGH = 2,073,600 ledgers` (~120 days at 5-sec ledgers).
> Estimates use **unoptimized** WASM sizes (no `wasm-opt -Oz`), which is the safe upper bound for mainnet planning.

| Contract | Estimated WASM size | Upload + instantiate cost |
|---|---|---|
| `prism-core` | ~75 KB (unoptimized) | **0.430 XLM** |
| `prism-amm` | ~30 KB (unoptimized) | **0.174 XLM** |
| `pPrime` (SAC) | ~8 KB | **0.032 XLM** |
| `pCore` (SAC) | ~8 KB | **0.032 XLM** |
| `pAlpha` (SAC) | ~8 KB | **0.032 XLM** |
| `lpPrime` (SAC) | ~8 KB | **0.032 XLM** |
| `lpCore` (SAC) | ~8 KB | **0.032 XLM** |
| `lpAlpha` (SAC) | ~8 KB | **0.032 XLM** |
| **Subtotal** | | **0.796 XLM** |

### 2B — Contract Initialization Transactions (9 calls)

Each `initialize` / `init_*` call writes persistent entries and pays entry-creation fees.

| Transaction | Target contract | Cost |
|---|---|---|
| `initialize` (global config) | `prism-core` | 0.009 XLM |
| `init_vault` | `prism-core` | 0.010 XLM |
| `init_tranche(Prime)` | `prism-core` | 0.010 XLM |
| `init_tranche(Core)` | `prism-core` | 0.010 XLM |
| `init_tranche(Alpha)` | `prism-core` | 0.010 XLM |
| `init_collateral_config` | `prism-core` | 0.008 XLM |
| `initialize` (AMM global) | `prism-amm` | 0.009 XLM |
| `init_pool(Prime)` | `prism-amm` | 0.013 XLM |
| `init_pool(Core+Alpha)` ×2 | `prism-amm` | 0.025 XLM |
| **Subtotal** | | **0.104 XLM** |

### 2C — Demo + Oracle Participant Account Reserves (7 accounts)

Stellar requires every account to hold a **base reserve of 1.0 XLM** (non-spendable, fully recoverable on account merge). Each account needs trustlines for 6 SAC tokens (0.5 XLM each). The oracle relayer needs its own funded account to submit price attestations on-chain.

| Account | Role | Base reserve | Trustlines (6 × 0.5 XLM) | Total |
|---|---|---|---|---|
| `admin` | Admin keypair | 1.0 XLM | 3.0 XLM | 4.0 XLM |
| `senior_1` | Prime/Core LP investor | 1.0 XLM | 3.0 XLM | 4.0 XLM |
| `senior_2` | Second Prime LP (stress test) | 1.0 XLM | 3.0 XLM | 4.0 XLM |
| `junior` | Alpha LP investor | 1.0 XLM | 3.0 XLM | 4.0 XLM |
| `borrower_1` | Primary loan borrower | 1.0 XLM | 3.0 XLM | 4.0 XLM |
| `borrower_2` | Second borrower (collateral demo) | 1.0 XLM | 3.0 XLM | 4.0 XLM |
| `oracle_relayer` | Submits Ed25519 price attestations | 1.0 XLM | 3.0 XLM | 4.0 XLM |
| **Subtotal** | | | | **28.0 XLM** |

> These 28 XLM are **locked reserves, not fees**. They are fully recoverable if accounts are merged after the demo.

### 2D — Protocol Seeding Capital

Initial liquidity deposited into the protocol for the demo simulation to function end-to-end: deposits, yield accrual, loan disbursals, collateral lock/verify/release cycles, and AMM swaps. A larger seeding amount produces realistic NAV movements and meaningful yield numbers for grant reviewers evaluating the protocol.

| Purpose | Amount |
|---|---|
| Prime tranche initial deposit (`senior_1` + `senior_2`) | 8.0 XLM equiv |
| Core tranche initial deposit (`senior_1`) | 4.0 XLM equiv |
| Alpha tranche initial deposit (`junior`) | 3.0 XLM equiv |
| `borrower_1` repayment + interest float | 3.0 XLM equiv |
| `borrower_2` collateral demo float | 2.0 XLM equiv |
| AMM pool seeding (6 pools × ~0.5 XLM) | 3.0 XLM equiv |
| Oracle relayer operating balance | 2.0 XLM equiv |
| **Subtotal** | **25.0 XLM** |

### 2E — Staging Dry-Run Deployment (pre-mainnet rehearsal)

Before the final mainnet deployment we will do one full rehearsal deploy on a freshnet / mainnet staging pass to verify all 9 init transactions succeed and the PDAs are correct. This re-uploads WASM and pays init fees a second time on a throwaway deployment.

| Item | Estimated cost |
|---|---|
| WASM re-upload (8 contracts, throwaway) | 0.80 XLM |
| Init transactions (9 calls) | 0.10 XLM |
| Miscellaneous simulation transactions | 0.50 XLM |
| **Subtotal** | **1.4 XLM** |

### 2F — Extended TTL Rent Buffer (~6 months post-deploy)

Persistent entries expire if not bumped. Each `write_*` call in the contract already extends TTL to 120 days. This budget covers two manual re-bump cycles to keep the demo live for a 6-month grant evaluation window, plus a reserve for failed transactions and retries.

| Item | Estimated cost |
|---|---|
| Re-bump all persistent entries (~30 entries) × 2 cycles | 4.0 XLM |
| Emergency transaction fees (failed txs, retries, oracle re-submissions) | 2.0 XLM |
| **Subtotal** | **6.0 XLM** |

---

## 3. Grand Total

| Category | XLM |
|---|---|
| WASM uploads + contract instantiation (unoptimized) | 0.80 XLM |
| Initialization transactions | 0.10 XLM |
| Demo + oracle participant account reserves (7 accts, recoverable) | 28.00 XLM |
| Protocol seeding capital | 25.00 XLM |
| Staging dry-run deployment | 1.40 XLM |
| Extended TTL rent buffer (6 months) | 6.00 XLM |
| **Estimated total** | **~61.30 XLM** |
| **Requested (with safety margin)** | **80 XLM** |
| **Headroom / unspent buffer** | **~18.70 XLM** |

> The ~19 XLM headroom (~24%) is intentional. Soroban resource fees are estimated from source analysis and `simulateTransaction` RPC — mainnet fees may vary by ±20–30% depending on ledger load. The buffer also covers any additional oracle attestation transactions, collateral verification calls, and integration testing during the grant evaluation period.

---

## 4. Why Fees Are Low But Total Is High

The actual **burned Soroban resource fees** are only ~1.3 XLM total (including staging run). The rest breaks down as:

- **~28 XLM** — account base reserves. Stellar's minimum balance requirement, not fees. Locked in accounts and **100% recoverable** by merging accounts after the demo.
- **~25 XLM** — liquidity seeded *into* the protocol. This is demo capital deployed *as* the protocol, not spent on it. Funds the tranche deposits, AMM pools, and borrower float that make the demo work end-to-end.
- **~6 XLM** — TTL rent buffer covering a 6-month evaluation window with two re-bump cycles.
- **~1.4 XLM** — staging rehearsal to ensure a clean mainnet deployment.

This mirrors why real Soroban deployments cost 30–60 XLM — the execution fees themselves are cheap (~$0.10 total); the bulk is reserves and seeding capital.

---

## 5. Cost Driver: WASM Rent Formula

```
rent_stroops = (wasm_bytes + 100) × BUMP_HIGH × 0.0000213
BUMP_HIGH    = 120 × 17,280 = 2,073,600 ledgers

prism-core (75,000 bytes, unoptimized):
  (75,000 + 100) × 2,073,600 × 0.0000213 = 3,317,540 stroops = 0.332 XLM (rent alone)
  + entry fees, CPU, I/O = ~0.430 XLM total

prism-amm (30,000 bytes, unoptimized):
  (30,000 + 100) × 2,073,600 × 0.0000213 = 1,326,618 stroops = 0.133 XLM (rent alone)
  + entry fees, CPU, I/O = ~0.174 XLM total

Note: running `wasm-opt -Oz` before final deployment can reduce prism-core by ~25–35%,
saving ~0.09–0.14 XLM — the 80 XLM budget intentionally covers the unoptimized case.
```

---

## 6. Per-Function Transaction Cost Reference

| Function | Contract | Est. cost/call | Notes |
|---|---|---|---|
| `deposit` | prism-core | 0.006 XLM | Writes Tranche + Vault |
| `disburse_loan` | prism-core | 0.008 XLM | Writes Loan + Vault + Tranche |
| `repay_loan` | prism-core | 0.007 XLM | Updates Loan + Vault |
| `accrue_yield` | prism-core | 0.009 XLM | Updates all 3 Tranches + Vault |
| `trigger_credit_event` | prism-core | 0.010 XLM | Writes CreditEvent + 3 Tranches |
| `lock_collateral` | prism-core | 0.007 XLM | Writes Collateral (Pending) |
| `verify_collateral` | prism-core | 0.012 XLM | Ed25519 verify (~1M CPU insns) + write |
| `liquidate_collateral` | prism-core | 0.013 XLM | Ed25519 verify + 2 writes |
| `force_liquidate_collateral` | prism-core | 0.006 XLM | No verify; admin bypass |
| `top_up_collateral` | prism-core | 0.006 XLM | Updates Collateral |
| `release_collateral` | prism-core | 0.006 XLM | Updates Collateral + Loan |
| `swap` | prism-amm | 0.008 XLM | Updates pool state |
| `add_liquidity` | prism-amm | 0.009 XLM | Writes pool + mints LP |
| `remove_liquidity` | prism-amm | 0.009 XLM | Burns LP + updates pool |
