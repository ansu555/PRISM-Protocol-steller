# PRISM Protocol — Stellar Testnet Testing Guide

End-to-end walkthrough for testing both flows of the live Stellar deployment:

1. **Borrower flow** — admin originates a loan, disburses USDC to a borrower, borrower repays
2. **Consumer (LP) flow** — user deposits USDC into a tranche, receives pTokens, withdraws against NAV

Both flows write real transactions to **Stellar testnet**. You can see every state change live on [stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet/).

---

## Table of contents

1. [Setup (one-time, ~5 minutes)](#setup-one-time-5-minutes)
2. [Reference: deployed addresses](#reference-deployed-addresses)
3. [Pre-flight checks](#pre-flight-checks)
4. [Flow A: Borrower](#flow-a-borrower-end-to-end)
5. [Flow B: Consumer (LP)](#flow-b-consumer-lp-end-to-end)
6. [Verifying on Stellar Expert](#verifying-on-stellar-expert)
7. [Common errors + how to fix](#common-errors--how-to-fix)
8. [What's NOT wired up yet](#whats-not-wired-up-yet)

---

## Setup (one-time, ~5 minutes)

### 1. Install Freighter wallet

The browser extension you'll use to sign Stellar transactions:

- Install from [freighter.app](https://www.freighter.app/)
- Open the extension → **Create wallet** → set a password
- **Save the recovery phrase somewhere safe** (you can't recover the account without it)
- At the top of the Freighter UI, switch the network to **Test Net** (default is Mainnet — this matters)

Your wallet address starts with `G` (56 chars). Note it down.

### 2. Fund the wallet with XLM

Stellar accounts need XLM to exist and pay tx fees. Use **Friendbot** (the testnet faucet):

**Option A — via the app's UI:**
- Boot the dev server (`pnpm dev`)
- Connect Freighter
- Click the **"Testnet Faucet"** button in the topbar

**Option B — direct curl:**

```bash
curl "https://friendbot.stellar.org/?addr=YOUR_G_ADDRESS"
```

After ~5 seconds your Freighter shows ~10,000 XLM. That's enough for ~20,000 transactions.

### 3. Add the TUSDC trustline

This is the protocol's test stablecoin — issued by the deployer wallet so we can mint freely for testing. You need to opt-in to receive it (Stellar requires explicit trust for non-native assets).

**In Freighter:**

1. Click **"Manage Assets"** at the bottom of the assets list
2. **"Add another asset"** → **"Add manually"** (don't pick from the suggested list)
3. Asset code: `TUSDC`
4. Issuer: `GDSIRM73CJE7NMYFJFXFTDVYNNYTPE3J7OPBM7BUJ7RKNMQ45M26HUXO`
5. **"Add asset"** → Freighter pops up a `changeTrust` tx → approve

Cost: ~0.5 XLM goes into Stellar's base reserve (returned if you remove the trustline later).

After it lands you'll see `TUSDC 0` in your Freighter assets list.

### 4. Get TUSDC minted to your wallet

Currently this is a manual step — ask the deployer admin (the person running this repo) to mint you some. The CLI command they run:

```bash
stellar contract invoke \
  --id CDW6NVPNLRJN6SE4A44EHGUM45NEQ2ZCHN2OAXJQV6NRCCCZODS6KOOS \
  --source deployer --network testnet \
  -- mint --to YOUR_G_ADDRESS --amount 5000000000
```

(That's 500 TUSDC. TUSDC has 7 decimals like real Stellar USDC, so 1 TUSDC = 10,000,000 base units.)

A self-serve faucet for TUSDC isn't built into the app yet — see [What's NOT wired up](#whats-not-wired-up-yet).

### 5. Boot the dev server

```bash
cd /home/eshan/workdump/PRISM-Protocol
pnpm dev
```

Open [localhost:3000/dashboard](http://localhost:3000/dashboard). The capital stack should show **"Vault reserve: $1,000.00"** — that's the seed TUSDC sitting in the prism-core contract.

---

## Reference: deployed addresses

Pin these somewhere — every flow references them.

| What | Address | Stellar Expert |
|---|---|---|
| **prism-core** | `CB5ISNJPZDN4XIO6AQEUN2N3ILSQDPY6FTUDT7IXXXHEMGBEAA3LUJNC` | [view](https://stellar.expert/explorer/testnet/contract/CB5ISNJPZDN4XIO6AQEUN2N3ILSQDPY6FTUDT7IXXXHEMGBEAA3LUJNC) |
| **prism-amm** | `CAH22DWPILDNYWXBNY7NTUY75FU2ZMJ63ALL2AJ4TPEHOYFYVEJ3YLPY` | [view](https://stellar.expert/explorer/testnet/contract/CAH22DWPILDNYWXBNY7NTUY75FU2ZMJ63ALL2AJ4TPEHOYFYVEJ3YLPY) |
| **TUSDC** (test USDC SAC) | `CDW6NVPNLRJN6SE4A44EHGUM45NEQ2ZCHN2OAXJQV6NRCCCZODS6KOOS` | [view](https://stellar.expert/explorer/testnet/contract/CDW6NVPNLRJN6SE4A44EHGUM45NEQ2ZCHN2OAXJQV6NRCCCZODS6KOOS) |
| **Admin / deployer** | `GDSIRM73CJE7NMYFJFXFTDVYNNYTPE3J7OPBM7BUJ7RKNMQ45M26HUXO` | [view](https://stellar.expert/explorer/testnet/account/GDSIRM73CJE7NMYFJFXFTDVYNNYTPE3J7OPBM7BUJ7RKNMQ45M26HUXO) |
| TUSDC classic asset | `TUSDC:GDSIRM73CJE7NMYFJFXFTDVYNNYTPE3J7OPBM7BUJ7RKNMQ45M26HUXO` | — |

**Network:** Stellar Testnet (`Test SDF Network ; September 2015`)
**Soroban RPC:** `https://soroban-testnet.stellar.org`
**Horizon:** `https://horizon-testnet.stellar.org`

Override any of these via `NEXT_PUBLIC_*` env vars — see [app/lib/constants.ts](../app/lib/constants.ts).

---

## Pre-flight checks

Before testing either flow, confirm three things on `/dashboard`:

| Check | Expected | If wrong |
|---|---|---|
| Topbar shows your `G…` address | wallet connected | Click "Connect Wallet" → pick Freighter |
| Capital stack header says "Mission Control" with a green LIVE pill | dashboard polling Soroban OK | Hard refresh; check `pnpm dev` console for RPC errors |
| Vault reserve > $0 | prism-core has TUSDC | Ask admin to mint TUSDC to the contract address |

Open your browser dev console (F12) — every Soroban call logs there. If a tx fails on-chain, you'll see the contract error code (`Error(Contract, #N)`) which maps to:

- `#1` VaultNotActive
- `#2` VaultPaused
- `#4` LoanInWrongState
- `#5` InsufficientLiquidity
- `#7` Unauthorized (you're not the admin)
- `#10` ArithmeticOverflow
- `#14` TrancheWipedNoDepositsAllowed
- `#20` BorrowerMismatch
- `#50` AlreadyInitialized

Full list in [soroban/prism-core/src/errors.rs](../soroban/prism-core/src/errors.rs).

---

## Flow A — Borrower (end-to-end)

This is the flow that fully works today. Three on-chain transactions, all signed in Freighter. The whole flow takes ~90 seconds.

**The flow uses two roles:**
- **Admin** — the deployer wallet (`GDSI…HUXO`). Originates and disburses loans.
- **Borrower** — any other wallet with a TUSDC trustline. Receives disbursed USDC, pays it back.

For a solo demo you can use the same wallet for both — just put your own G-address in the borrower field. For a more realistic demo, use two Freighter accounts (Freighter supports multiple).

### Step 1 — Navigate to `/borrow`

You'll see three cards stacked vertically:

- **Step 1 · Originate** (blue) — admin form
- **Step 2 · Disburse** (green) — admin button
- **Step 3 · Repay** (amber) — borrower form

Plus a **"Live loans on chain"** table at the bottom that polls `get_loan` every 8 seconds.

Above the cards, a banner shows which role you're in based on your connected wallet:
- Green "Admin session" if you're the deployer
- Amber "Borrower session" otherwise

### Step 2 — Originate the loan (as admin)

**Connect with the deployer wallet** (`GDSI…HUXO`). If you don't have its secret, you can't originate loans — origination is admin-gated.

> If you control the repo, the deployer secret is the one your `stellar keys` config has stored. Import the secret into Freighter via "Import account" → paste the secret key (`S…`). For a public demo, only one person can play admin.

Fill in the **Originate** form:

| Field | Value | Why |
|---|---|---|
| Loan id (u32) | `1` | Unique on-chain key. The dashboard polls loan id `1` by default, so use this for the easiest demo. |
| Borrower address | your `G…` address | This will receive the disbursed USDC. For solo demo, paste your own. |
| Principal (USDC) | `5` | Will be converted to 50,000,000 base units (7 decimals) and stored on-chain. |
| APR (bps) | `800` | 8% annualized — informational only in v1, doesn't auto-compute interest. |
| Maturity (days from now) | `30` | 30 days. Must be > 0. |

Click **"Originate loan #1"**.

**Freighter pops up** with the tx details. Look at it — you'll see a `prism_core::init_loan` call with your arguments. Click **Approve**.

What happens:
1. App builds the Soroban tx → simulates against `soroban-testnet.stellar.org` → attaches the resource footprint
2. Sends the unsigned tx XDR to Freighter
3. Freighter signs and returns the signed XDR
4. App submits to Soroban RPC, polls `getTransaction` every 1.5s until status = `SUCCESS`
5. Toast: "Loan #1 originated" with a clickable tx hash linking to Stellar Expert

**Verify on-chain:**
- Wait ~5–10 seconds for the indexer to catch up
- The live loans table at the bottom of the page populates with loan #1
- State shows `Originated` (blue pill)
- Or check directly: [https://stellar.expert/explorer/testnet/contract/CB5ISNJPZDN4XIO6AQEUN2N3ILSQDPY6FTUDT7IXXXHEMGBEAA3LUJNC](https://stellar.expert/explorer/testnet/contract/CB5ISNJPZDN4XIO6AQEUN2N3ILSQDPY6FTUDT7IXXXHEMGBEAA3LUJNC) → "Operations" tab shows the `init_loan` call

### Step 3 — Disburse the loan (as admin)

Still connected as the deployer:

Click **"Disburse loan #1"** (the green button in the Step 2 card).

**Freighter pops up** with a `disburse_loan(vault_id=0, loan_id=1)` tx. Approve.

What happens on-chain:
1. Contract reads loan #1 — confirms state is `Originated` and `vault_id == 0`
2. Contract pulls 5 TUSDC from its own balance → transfers to the borrower's address (this is a cross-contract call from prism-core to the TUSDC SAC)
3. Loan state flips: `Originated → Active`
4. Vault `total_loaned` bumps by 5

**Verify:**
- Live loans table updates: state pill turns green, "Active"
- The borrower's Freighter shows `TUSDC` balance increased by 5
- Dashboard's "Vault reserve" drops from 1000 to 995 TUSDC

### Step 4 — Repay the loan (as borrower)

If you used the same wallet for borrower, you can stay connected. Otherwise switch Freighter to the borrower wallet (and make sure it has the TUSDC trustline + balance).

Fill in the **Repay** form:

| Field | Value |
|---|---|
| Loan id | `1` |
| Amount (USDC) | `2.5` |

Click **"Repay 2.5 USDC"**.

**Freighter pops up** with `repay_loan(loan_id=1, amount=25000000)` (2.5 × 10^7). Approve.

What happens:
1. Contract checks `loan.borrower == invoker` — only the named borrower can repay
2. Contract pulls 2.5 TUSDC from borrower's balance → into its own balance
3. `loan.total_repaid` increments to 2.5
4. Since `total_repaid < principal`, state moves from `Active → Repaying`

**Repay the rest:**
- Click again with the same amount → another 2.5 TUSDC moves
- Now `total_repaid (5) >= principal (5)` → state flips to `Repaid`
- Live table shows the green "Repaid" pill

**Tx history:** open Stellar Expert for the borrower's address — you'll see two `prism_core::repay_loan` invocations + the original `disburse_loan` payment in.

### Step 5 — Try the error paths (optional)

These confirm the on-chain validation actually works:

| Try this | Expected error |
|---|---|
| Originate loan #1 again | Toast: "A loan with that id already exists" (`#50 AlreadyInitialized`) |
| Disburse loan #1 again | Toast: "Loan must be in Originated state to disburse" (`#4 LoanInWrongState`) |
| Repay loan #1 from a third wallet that isn't the borrower | Toast / contract error: `BorrowerMismatch` (`#20`) |
| Originate as a non-admin wallet | Soroban auth error: `Unauthorized` (`#7`) |

---

## Flow B — Consumer (LP) end-to-end

**Status (2026-05-26):** the deposit/withdraw UI exists and the on-chain handlers (`deposit`, `withdraw`, `accrue_yield`, `trigger_credit_event`) are deployed, but **tranches aren't initialized yet**, so any deposit will revert with `#51 NotInitialized`.

This section documents the flow **once tranches are init'd**. The work to init them takes about 3 minutes — see [What's NOT wired up](#whats-not-wired-up-yet).

### Step 1 — Init the three tranches (one-time, admin only)

Each tranche needs its own pre-deployed SAC where prism-core is the admin (so the contract can mint/burn pTokens). The CLI sequence:

```bash
DEPLOYER=$(stellar keys address deployer)
CORE=CB5ISNJPZDN4XIO6AQEUN2N3ILSQDPY6FTUDT7IXXXHEMGBEAA3LUJNC

# Deploy three pTranche SACs, each admin = prism-core contract.
# (Use the SAC implementation from soroban-examples or your own minimal one.)
PRIME_PT=$(stellar contract asset deploy --source deployer --network testnet --asset "PPRIME:$DEPLOYER" | tail -1)
CORE_PT=$(stellar contract asset deploy  --source deployer --network testnet --asset "PCORE:$DEPLOYER"  | tail -1)
ALPHA_PT=$(stellar contract asset deploy --source deployer --network testnet --asset "PALPHA:$DEPLOYER" | tail -1)

# Set admin = prism-core for each pTranche so it can mint/burn on deposit/withdraw.
# (Issuer of a classic asset can do this via set_admin on the SAC.)
stellar contract invoke --id "$PRIME_PT" --source deployer --network testnet -- set_admin --new_admin "$CORE"
stellar contract invoke --id "$CORE_PT"  --source deployer --network testnet -- set_admin --new_admin "$CORE"
stellar contract invoke --id "$ALPHA_PT" --source deployer --network testnet -- set_admin --new_admin "$CORE"

# Initialize the three tranches on prism-core (kinds: 0=Prime, 1=Core, 2=Alpha).
# Target APYs in basis points (500=5%, 1000=10%, 2500=25%).
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  init_tranche --vault_id 0 --kind 0 --target_apy_bps 500  --ptoken "$PRIME_PT"
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  init_tranche --vault_id 0 --kind 1 --target_apy_bps 1000 --ptoken "$CORE_PT"
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  init_tranche --vault_id 0 --kind 2 --target_apy_bps 2500 --ptoken "$ALPHA_PT"

echo "Tranches initialized."
```

After this, `/dashboard` shows three tranche rows in the capital stack with target APYs.

### Step 2 — Deposit into a tranche (consumer)

1. Navigate to `/earn` (or `/dashboard` → capital stack)
2. Pick a tranche — for highest APY pick **Alpha (25%)**, for safest pick **Prime (5%)**
3. Enter amount, e.g. `100` (you need ≥ 100 TUSDC in your wallet)
4. Click **Deposit**

**Freighter pops up** with `deposit(user, vault_id=0, kind=2, amount=1000000000)` (100 × 10^7). Approve.

What happens on-chain:
1. Contract calls `deposit_shares(amount, tranche.nav_per_share_q, tranche.total_supply)`
   - First deposit ever: NAV is undefined → shares minted 1:1 (you get 100 pAlpha)
   - Later deposits: shares = `amount × Q_ONE / nav_per_share_q`
2. Contract pulls 100 TUSDC from your wallet → into its own balance
3. Contract calls `mint` on the pAlpha SAC → you receive 100 pAlpha
4. `tranche.total_assets += 100`, `tranche.total_supply += 100`, NAV recomputed
5. `vault.total_deposits += 100`

**Verify:**
- Your Freighter: TUSDC down 100, pAlpha up 100
- Dashboard: Alpha row shows `totalAssets: 100`, NAV `1.000000`
- Vault Capital headline updates

### Step 3 — Accrue yield (admin triggers)

In a real protocol, yield would be paid by the borrower over time. For testing, the admin manually injects yield. On the contract:

```bash
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  accrue_yield --authority "$DEPLOYER" --vault_id 0 --payer "$DEPLOYER" --amount 50000000
```

(That's 5 TUSDC — at year-elapsed it'd target ~25% APY = 25 TUSDC on a 100 Alpha position, but if `last_yield_timestamp` was just set the elapsed time is small.)

What happens:
1. Waterfall split: Prime gets `target_apy × elapsed × Prime.total_assets / year_seconds` → 0 if Prime has no deposits
2. Core gets the same → 0 if no deposits
3. Alpha gets the residual → all 5 TUSDC if only Alpha has assets
4. NAV recomputes: `nav = (total_assets + slice) / total_supply` → e.g. 1.05

Dashboard updates: Alpha's NAV ticks up.

### Step 4 — Withdraw

Back in the app:

1. `/earn` → Alpha tranche → switch to **Withdraw** mode
2. Enter shares, e.g. `50` (half your position)
3. Click **Withdraw**

What happens:
1. Contract computes `payout = shares × nav_per_share_q / Q_ONE` → ~52.5 TUSDC if NAV is 1.05
2. Contract burns 50 pAlpha from your wallet
3. Contract transfers ~52.5 TUSDC from its balance → your wallet
4. NAV recomputed (might shift by 1 unit due to Q64.64 rounding — this is expected)

**Verify:** Freighter shows TUSDC up ~52.5, pAlpha down 50.

### Step 5 — Trigger a credit event (the loss cascade)

This is the wow moment. Admin marks a credit event; Alpha eats the loss first, then Core, then Prime.

```bash
# Trigger a 30 TUSDC partial loss on vault 0
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  trigger_credit_event \
  --authority "$DEPLOYER" \
  --vault_id 0 \
  --event_type 1 \
  --loss_amount 300000000 \
  --severity_bps 3000 \
  --loan_id 1
```

What happens:
1. Reverse waterfall: Alpha total_assets -= min(loss, Alpha.total_assets)
2. Remainder to Core, then Prime
3. NAVs recomputed for all three
4. Vault stays Active for `PartialLoss`; flips to `Defaulted` only for `Default` (event_type=0)

Dashboard immediately reflects: Alpha NAV drops below 1.0 ("cumulative_loss" populated), Prime untouched.

If you withdraw your remaining Alpha shares now, you get back proportionally less TUSDC — that's the on-chain demonstration of risk tranching.

---

## Verifying on Stellar Expert

Every tx hash returned by the app links directly. For each contract, the explorer shows:

**For prism-core ([explorer link](https://stellar.expert/explorer/testnet/contract/CB5ISNJPZDN4XIO6AQEUN2N3ILSQDPY6FTUDT7IXXXHEMGBEAA3LUJNC)):**
- **Operations** tab: every contract invocation (`init_loan`, `deposit`, `accrue_yield`, etc.)
- **Storage** tab: the live `DataKey` entries — `Config`, `Vault(0)`, `Tranche(0, kind)`, `Loan(id)`. Click any to see the decoded XDR.
- **Balances** tab: contract's TUSDC and pToken holdings

**For TUSDC ([explorer link](https://stellar.expert/explorer/testnet/contract/CDW6NVPNLRJN6SE4A44EHGUM45NEQ2ZCHN2OAXJQV6NRCCCZODS6KOOS)):**
- Operations: every mint/transfer (you'll see disbursements + repayments here)
- Holders: who owns TUSDC right now (deployer, prism-core contract, borrowers)

**For your wallet ([template](https://stellar.expert/explorer/testnet/account/YOUR_G_ADDRESS)):**
- Operations: every tx you signed via Freighter
- Balances: XLM, TUSDC, pTranche tokens

---

## Common errors + how to fix

### "Connect a Stellar wallet first"
Freighter isn't connected, or it's set to Mainnet instead of Testnet. Check the Freighter network selector.

### "trustline entry is missing for account"
The recipient hasn't added a trustline for TUSDC (or the pTranche token). See [step 3 of setup](#3-add-the-tusdc-trustline). For pTranche tokens specifically, the user needs to add a trustline for the pPRIME/pCORE/pALPHA asset code with the deployer as issuer before they can deposit.

### "operation invalid on issuer"
You're trying to receive TUSDC into the deployer wallet — but the deployer is the *issuer* of TUSDC and Stellar's classic asset rules forbid the issuer from holding its own asset. Use a different wallet as the recipient.

### "Error(Contract, #4) — LoanInWrongState"
- Disburse called on a loan that's not in `Originated` state
- Repay called on a loan that's not in `Active` or `Repaying` state
- Check the live loans table — the state pill shows the current state

### "Error(Contract, #7) — Unauthorized"
- Trying to originate / disburse / accrue_yield / trigger_credit_event without being the admin wallet
- Switch Freighter to the deployer wallet (`GDSI…HUXO`)

### "Error(Contract, #50) — AlreadyInitialized"
- Loan with that id already exists (origination)
- Tranche with that vault_id+kind already exists (init_tranche)
- Pick a different id, or query existing state first

### "Soroban read failed (get_xxx): account not found"
- Querying state for an entity that doesn't exist yet
- Hooks treat this as "no data" and return `null` — not actually an error, just a hint to init the entity first

### Freighter doesn't pop up
- Extension is locked → unlock it
- Extension lost the page connection → click the Freighter icon, then "Reconnect"

### Tx settles but state didn't change
- Check the toast: did it say success or error?
- Click the tx hash → check the operation result on Stellar Expert. Some txs settle with `INVOKE_HOST_FUNCTION_RESOURCE_LIMIT_EXCEEDED` — the simulation under-allocated; retry with a higher fee.

---

## What's NOT wired up yet

Honest status as of this commit. None of these block the borrower flow demo; some block the consumer flow.

| Feature | Status | Blast radius |
|---|---|---|
| Tranche initialization | **Not done.** Need to deploy 3 pTranche SACs + call `init_tranche` × 3. | Consumer deposit/withdraw flow returns "NotInitialized" until done. |
| TUSDC self-serve faucet in app | Not built. Admin mints manually via CLI. | Every new tester needs the admin to mint TUSDC for them. |
| AMM init_pool UI | Not built. Pools can be initialized via CLI (`prism-amm::init_pool`). | Swap UI errors with "PoolNotInitialized" until done. |
| Encrypt FHE default proof UI | Hook exists ([useEncryptHealth.tsx](../hooks/useEncryptHealth.tsx)) but no form on the borrow page yet. | "Magic moment" demo unavailable through UI. CLI works. |
| Cloak shielded payout UI | Same — hook is live, no form. | CLI works. |
| Admin sidebar action buttons (yield/default/market) | Wired to a no-op context. | The buttons render but don't fire on-chain txs. Trigger via CLI. |
| IKA cross-chain collateral | **Cut for v1.** The borrow page placeholder explains why. | No BTC/ETH collateral. Stellar-native only. |
| Vault enumeration | Probes vault IDs 0..3 because Soroban has no `account.all()`. | `/earn` only shows the vaults whose IDs we probed. Add more probes in [useAllVaults.ts](../hooks/useAllVaults.ts). |
| Type safety in chain-touching components | `ignoreBuildErrors: true` set in [next.config.mjs](../next.config.mjs). | Build passes but TS doesn't catch component-level type drift. Cleanup in a follow-up sweep. |

---

## Quick reference: CLI commands

For when the UI doesn't have a button for what you need:

```bash
DEPLOYER=$(stellar keys address deployer)
CORE=CB5ISNJPZDN4XIO6AQEUN2N3ILSQDPY6FTUDT7IXXXHEMGBEAA3LUJNC
AMM=CAH22DWPILDNYWXBNY7NTUY75FU2ZMJ63ALL2AJ4TPEHOYFYVEJ3YLPY
TUSDC=CDW6NVPNLRJN6SE4A44EHGUM45NEQ2ZCHN2OAXJQV6NRCCCZODS6KOOS

# Read state
stellar contract invoke --id "$CORE" --source deployer --network testnet -- get_config
stellar contract invoke --id "$CORE" --source deployer --network testnet -- get_vault --vault_id 0
stellar contract invoke --id "$CORE" --source deployer --network testnet -- get_loan --loan_id 1
stellar contract invoke --id "$CORE" --source deployer --network testnet -- get_tranche --vault_id 0 --kind 2
stellar contract invoke --id "$TUSDC" --source deployer --network testnet -- balance --id "$DEPLOYER"
stellar contract invoke --id "$TUSDC" --source deployer --network testnet -- balance --id "$CORE"

# Mint TUSDC to a wallet (must have trustline first)
stellar contract invoke --id "$TUSDC" --source deployer --network testnet -- \
  mint --to G_RECIPIENT_ADDRESS --amount 5000000000   # 500 TUSDC

# Fund a wallet with XLM via Friendbot
curl "https://friendbot.stellar.org/?addr=G_RECIPIENT_ADDRESS"

# Originate a loan (admin)
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  init_loan --vault_id 0 --loan_id 2 --borrower G_BORROWER --principal 100000000 \
            --apr_bps 800 --maturity_ts $(( $(date +%s) + 2592000 ))

# Disburse (admin)
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  disburse_loan --vault_id 0 --loan_id 2

# Repay (borrower's secret needs to be configured as a stellar key)
stellar contract invoke --id "$CORE" --source borrower --network testnet -- \
  repay_loan --borrower G_BORROWER --loan_id 2 --amount 50000000

# Trigger a credit event (admin)
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  trigger_credit_event --authority "$DEPLOYER" --vault_id 0 --event_type 1 \
  --loss_amount 300000000 --severity_bps 3000 --loan_id 2

# Accrue yield (admin pays in)
stellar contract invoke --id "$CORE" --source deployer --network testnet -- \
  accrue_yield --authority "$DEPLOYER" --vault_id 0 --payer "$DEPLOYER" --amount 50000000
```

All amounts in TUSDC base units (7 decimals). 1 TUSDC = 10,000,000.

---

## Where to look in the code

| What you're testing | Frontend file | Contract handler |
|---|---|---|
| Borrow page (originate/disburse/repay) | [components/borrower/StellarBorrowForm.tsx](../components/borrower/StellarBorrowForm.tsx) | [soroban/prism-core/src/lib.rs](../soroban/prism-core/src/lib.rs) `init_loan` / `disburse_loan` / `repay_loan` |
| Loan origination | [hooks/useOriginateLoan.tsx](../hooks/useOriginateLoan.tsx) | `init_loan` |
| Disbursement | [hooks/useDisburseLoan.tsx](../hooks/useDisburseLoan.tsx) | `disburse_loan` |
| Repayment | [hooks/useRepayLoan.tsx](../hooks/useRepayLoan.tsx) | `repay_loan` |
| Dashboard polling | [hooks/useVaultState.ts](../hooks/useVaultState.ts) | `get_config`, `get_vault`, `get_tranche`, `get_loan` |
| LP deposit | [hooks/useDeposit.tsx](../hooks/useDeposit.tsx) | `deposit` |
| LP withdraw | (hooks/useDeposit.tsx — same family) | `withdraw` |
| Encrypt FHE default | [hooks/useEncryptHealth.tsx](../hooks/useEncryptHealth.tsx) | `attach_encrypt_score`, `verify_encrypt_default` |
| Cloak shielded payout | [hooks/useCloakPayout.tsx](../hooks/useCloakPayout.tsx) | `record_cloak_payout` |
| Wallet connection | [components/providers/stellar-wallet-provider.tsx](../components/providers/stellar-wallet-provider.tsx) | — (off-chain) |
| Soroban RPC client | [app/lib/stellar.ts](../app/lib/stellar.ts) | — |

---

## Smoke test checklist (5 min)

Run through these in order to confirm everything is working before showing the demo to anyone:

- [ ] `pnpm dev` boots without errors
- [ ] `/dashboard` loads; vault reserve > $0
- [ ] Connect Freighter → topbar shows your G-address
- [ ] Add TUSDC trustline (if first time)
- [ ] Get TUSDC minted to your wallet (admin runs `mint` CLI)
- [ ] Navigate to `/borrow` → see three cards
- [ ] As admin: originate loan #1 → see toast + state pill `Originated`
- [ ] As admin: disburse loan #1 → see toast + state pill `Active` + TUSDC arrives in borrower wallet
- [ ] As borrower: repay 2.5 TUSDC → state pill `Repaying`
- [ ] As borrower: repay 2.5 more → state pill `Repaid`
- [ ] Click any tx hash from the toasts → confirms on Stellar Expert
- [ ] Optional: try repaying with the wrong wallet → see clear `BorrowerMismatch` error

If all 11 boxes check, the borrower flow demo is solid.
