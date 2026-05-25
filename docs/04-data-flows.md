# PRISM Protocol — Data Flows & Demo Storyboard (Section 4)

**Status:** Locked. Demo arc = 2:30 max. Dual-trade narrative locked.

This section does double duty: on-chain instruction specs (used by section 5) AND the demo video storyboard.

---
 

## 4.1 Demo arc — final ordering

**Target length:** 2:15–2:30. **Hard ceiling: 2:30.** Not 3 minutes — judges watch 20–50 demos and attention drops after 2 minutes. Faster = sharper.

```
0:00 ──┬── Setup (10s)
       │   "Here's a credit vault with 3 risk tranches"
       │
0:10 ──┼── Deposit (20s)
       │   3 wallets deposit into Prime / Core / Alpha
       │   One uses Strategy preset → "Balanced"
       │
0:30 ──┼── Yield Accrual (20s)
       │   Click "Accrue Yield" — waterfall distributes
       │   All 3 NAVs tick UP
       │
0:50 ──┼── Trade #1 (15s) — establish baseline
       │   Swap pPRIME ↔ USDC at near-NAV
       │   "The market prices tranches near their underlying value"
       │
1:05 ──┼── ★ DEFAULT MOMENT ★ (40s)  ← longest segment, do not rush
       │   Switchboard signs CreditEvent
       │   Alpha NAV → 0
       │   Core NAV drops partially
       │   Prime NAV barely moves
       │
1:45 ──┼── Trade #2 (20s) — market reacts to risk
       │   Click "Run Market Reaction" — 5 Alpha sells, 2 Core sells animate
       │   pALPHA price walks 1.00 → 0.51 → 0.31 → 0.21 → 0.15 → 0.11
       │   pCORE:   1.00 → 0.64 → 0.44
       │   Then user sells 50 pPRIME → 0.98 (stability)
       │
2:05 ──┼── Withdraw (20s) — final proof
       │   Prime holder exits 5,000 pPRIME → $5,020.55 (+0.41%)
       │   Alpha holder exits 2,000 pALPHA → $0.00 (100% loss)
       │
2:25 ──┴── Closing pitch line (10s)
       │   "Today, credit markets are opaque and illiquid.
       │    We just showed how they become programmable, transparent, and tradable."
```

**Total ≈ 2:25–2:30.**

### Presentation polish layer (the 4 upgrades that take this from "good demo" to "winning demo")

Folded into the relevant sections, but called out here so they're not missed:

| # | Upgrade | Where it appears | Why |
|---|---|---|---|
| 1 | **User PnL View (Live)** during default cascade | §4.5 Frame 6 | Real money impact — judges stop thinking "protocol," start thinking "real users gained / lost X dollars" |
| 2 | **Before / After NAV snapshot panel** | §4.5 Frame 5 | Humans understand contrast instantly. Side-by-side comparison is visually obvious, not intellectually heavy |
| 3 | **Killer sentence at default moment** | §4.5 pitch script | *"This is what real credit risk looks like — losses don't disappear, they move."* Pause for 3 seconds. Don't talk over the PnL panel |
| 4 | **Closing line (last 10s)** | §4.7 + §4.1 | *"Today, credit markets are opaque and illiquid. We just showed how they become programmable, transparent, and tradable."* Reframes the entire demo at a higher altitude |

These don't add product surface — they're presentation primitives layered onto the existing flows.

**Phase structure (the narrative arc):**
1. **Teach the system** (Deposit → Yield → Trade #1) — judges understand "this works like a market"
2. **Break the system** (Default) — emotional impact: "oh shit"
3. **Show consequences** (Trade #2) — the *new* killer: "the market understands risk in real time"
4. **Final proof** (Withdraw) — the closing argument: protections were real

**Why Trade #2 is the new dramatic peak:** without it, the demo only proves *the protocol works*. With it, the demo proves *markets understand the protocol*. That's a different — and bigger — claim.

---

## 4.2 Flow A — Deposit  *(20s)*

**Trigger:** User clicks "Deposit 1,000 USDC into Prime" (or one of 3 Strategy presets fires multi-deposit).

**Instruction:** `prism::deposit(vault, tranche_kind, usdc_amount)`

**Sequence**

```
User              PRISM Program           SPL Token             Vault USDC Reserve
  │                    │                      │                          │
  │  deposit(1000)     │                      │                          │
  │───────────────────►│                      │                          │
  │                    │  transfer 1000 USDC  │                          │
  │                    │─────────────────────────────────────────────────►│
  │                    │                      │                          │
  │                    │  shares = 1000 / NAV │                          │
  │                    │  (NAV starts at 1.0) │                          │
  │                    │                      │                          │
  │                    │  mint_to(user,       │                          │
  │                    │     1000 pPRIME)    │                          │
  │                    │─────────────────────►│                          │
  │   1000 pPRIME  ◄──│                      │                          │
  │                    │                      │                          │
  │                    │  emit DepositEvent   │                          │
```

**State changes**

| Account | Before | After |
|---|---|---|
| User USDC ATA | 1000 | 0 |
| Vault USDC reserve | X | X + 1000 |
| User pPRIME ATA | 0 | 1000 / NAV |
| Tranche[Prime].total_assets | A | A + 1000 |
| Tranche[Prime].total_supply | S | S + 1000/NAV |
| Tranche[Prime].nav_per_share_q | unchanged | unchanged |

**Dashboard render**
- User wallet card: pPRIME balance ticks up
- Prime tranche bar: total_assets bar grows; NAV stays flat
- Event ticker: `Deposit · 1,000 USDC → Prime · @user1`

---

## 4.3 Flow B — Yield Accrual (the waterfall)  *(20s)*

**Trigger:** Admin clicks "Accrue Yield" (v1) or Switchboard cron fires (v1.5).

**Instruction:** `prism::accrue_yield(vault, yield_amount)`

**Waterfall math**

```
Given:
  Y = yield_in (USDC arriving from "borrower")
  prime_target = prime.total_assets × prime.target_apy_bps × elapsed / (365d × 10000)
  core_target   = core.total_assets   × core.target_apy_bps   × elapsed / (365d × 10000)

Distribution:
  prime_take = min(prime_target, Y); Y -= prime_take
  core_take   = min(core_target,   Y); Y -= core_take
  alpha_take = Y                      // remaining yield flows to Alpha
```

**Sequence**

```
Admin/Switchboard    PRISM Program          Vault USDC Reserve     Tranche[3]
       │                  │                          │                  │
       │ accrue_yield(Y)  │                          │                  │
       │─────────────────►│                          │                  │
       │                  │  pull Y USDC from        │                  │
       │                  │  borrower (admin proxy)  │                  │
       │                  │─────────────────────────►│                  │
       │                  │                          │                  │
       │                  │  compute waterfall       │                  │
       │                  │  for each tranche:       │                  │
       │                  │    total_assets += take  │                  │
       │                  │    nav_q recomputed      │                  │
       │                  │    last_nav_update_ts    │                  │
       │                  │─────────────────────────────────────────────►│
       │                  │                          │                  │
       │                  │  emit YieldEvent × 3     │                  │
```

**State changes (locked demo numbers, period 30d)**

Tranche sizes per §8.5: Prime 10,000 @ 5%, Core 4,500 @ 8%, Alpha 5,000 @ 15%.

```
prime_target = 10,000 × 0.05 × 30/365 = ~41.1
core_target  =  4,500 × 0.08 × 30/365 = ~29.6
alpha_take   = 100 - 41.1 - 29.6      = ~29.3
```

| Tranche | Take | total_assets before | after | NAV before | NAV after |
|---|---|---|---|---|---|
| Prime | 41.1 | 10,000 | 10,041.1 | 1.0000 | 1.00411 |
| Core | 44.4 | 4,500 | 4,544.4 | 1.0000 | 1.00987 |
| Alpha | 14.5 | 5,000 | 5,014.5 | 1.0000 | 1.00290 |

**Dashboard render**
- All 3 NAV bars **tick UP** (visual win — money flowing into all three risk classes)
- Animated cash-flow arrows: Vault → Prime, Core, Alpha (decreasing thickness for each)
- Event ticker: `Yield Distributed · 100 USDC → S:41.1 M:44.4 E:14.5`
- Cumulative yield counter ticks

---

## 4.4 Flow C — Trade #1: baseline market  *(15s)*

**Trigger:** User clicks "Swap 50 pPRIME → USDC" on the AMM panel.

**Instruction:** `prism_amm::swap(pool, amount_in, min_amount_out)`

**Constant-product math**
```
amount_out = (amount_in × r_quote × (10000 - fee_bps))
           ÷ (10000 × r_tranche + amount_in × (10000 - fee_bps))
```

**Pool seed:** Prime pool = 5,000 pPRIME + 5,000 USDC (deep, stable per §8.5).

**Sequence**

```
User              PRISM-AMM Program     AmmPool                Tranche/USDC Vaults
  │                    │                   │                       │
  │ swap(50, min=49)   │                   │                       │
  │───────────────────►│                   │                       │
  │                    │ pull 50 pPRIME   │                       │
  │                    │──────────────────►│                       │
  │                    │ compute x*y=k     │                       │
  │                    │ pool: 5,050 + 4,950.5 │                   │
  │                    │ output ≈ 49.5 USDC│                       │
  │                    │ check slippage OK │                       │
  │                    │ push USDC to user │                       │
  │   49.5 USDC     ◄──│                   │                       │
  │                    │ update reserves   │                       │
  │                    │ emit SwapEvent    │                       │
```

**Dashboard render**
- AMM price chart: pPRIME/USDC market price ≈ **0.980**
- **Annotation: "Market: 0.980 · NAV: 1.00411 · Discount: 2.4%"**
- Pool reserves bar updates

**Pitch line:** *"The market is pricing pPRIME at a slight discount to NAV — that's risk premium emerging organically. No oracle needed."*

---

## 4.5 Flow D — Default Cascade  *(★ THE MOMENT ★ — 40s)*

**Trigger:** Admin clicks "Trigger Default" or Switchboard oracle attests to a credit event.

**Instruction:** `prism::trigger_credit_event(vault, event_type, loss_amount, severity_bps)`

**Loss application (reverse-priority cascade)**

```
Apply in order Alpha → Core → Prime:
  alpha_loss = min(L, alpha.total_assets); L -= alpha_loss
  alpha.total_assets -= alpha_loss

  core_loss = min(L, core.total_assets); L -= core_loss
  core.total_assets -= core_loss

  prime_loss = L                         // > 0 only if Alpha AND Core both wiped
  prime.total_assets -= prime_loss

For each affected tranche:
  nav_per_share_q = (total_assets × Q64.64) / total_supply
  last_nav_update_ts = now
```

**Sequence**

```
Switchboard       PRISM Program        CreditEvent PDA       Tranche[3]      Vault
   │                  │                       │                    │            │
   │ trigger(L=6500)  │                       │                    │            │
   │─────────────────►│                       │                    │            │
   │                  │  init CreditEvent     │                    │            │
   │                  │  seq=N, Default,      │                    │            │
   │                  │  loss=6500, sev=10000 │                    │            │
   │                  │──────────────────────►│                    │            │
   │                  │                       │                    │            │
   │                  │  apply alpha loss    │                    │            │
   │                  │  (5,014.5) → wiped    │                    │            │
   │                  │  remaining = 1,485.5  │                    │            │
   │                  │──────────────────────────────────────────►│            │
   │                  │                       │                    │            │
   │                  │  apply core loss      │                    │            │
   │                  │  (1,485.5) → ~32% hit │                    │            │
   │                  │──────────────────────────────────────────►│            │
   │                  │                       │                    │            │
   │                  │  remaining = 0        │                    │            │
   │                  │  → Prime untouched   │                    │            │
   │                  │                       │                    │            │
   │                  │  Vault.state=Defaulted│                    │            │
   │                  │────────────────────────────────────────────────────────►│
   │                  │                       │                    │            │
   │                  │  emit CreditEvent     │                    │            │
   │                  │  emit LossApplied × 2 │                    │            │
```

**State changes (Loss = 6,500 on the post-yield state from §4.3)**

| Tranche | total_assets before | loss applied | after | NAV before | NAV after |
|---|---|---|---|---|---|
| Prime | 10,041.1 | 0 | 10,041.1 | 1.00411 | **1.00411** (unchanged) |
| Core | 4,544.4 | 1,485.5 | 3,058.9 | 1.00987 | **0.6798** (down ~32%) |
| Alpha | 5,014.5 | 5,014.5 (full) | 0 | 1.00290 | **0.0000** (wiped) |

**Vault reserve invariant:** simultaneously with the loss application, PRISM transfers `loss_amount` (= 6,500 USDC) from the Vault USDC reserve to the **LossBucket PDA** (`["loss_bucket", vault]`). After the transfer, `vault_usdc_reserve.amount == sum(tranche.total_assets)` (= 13,100.0). Cash matches accounting at all times — no mismatch a Prime holder could exploit on withdrawal.

CreditEvent PDA created:
```
{ seq: 1, event_type: Default, loss_amount: 6500, severity_bps: 10000,
  loan: <pubkey>, triggered_by: <switchboard_pubkey>, timestamp: ... }
```

**Dashboard storyboard — DO NOT RUSH THIS**

```
Frame 0 (post-yield steady state)
  [████████████ Prime 1.00411]
  [████████████ Core   1.00987]
  [████████████ Alpha 1.00290]

Frame 1 — DEFAULT badge flashes red
  CreditEvent ticker: ⚠️ DEFAULT · 6,500 USDC loss · 100% severity

Frame 2 — Alpha drains to zero (animated)
  [████████████ Prime 1.00411]
  [████████████ Core   1.00987]
  [▏           Alpha 0.00000]   ← wiped

Frame 3 — Core drops ~32%
  [████████████ Prime 1.00411]
  [████████     Core   0.6798]   ← partial hit
  [▏           Alpha 0.00000]

Frame 4 — Prime pulses green ("PROTECTED")
  [████████████ Prime 1.00411 ✓ PROTECTED]
  [████████     Core   0.6798]
  [▏           Alpha 0.00000]

Frame 5 — BEFORE / AFTER snapshot panel slides in
  ┌─────────────────────────┬─────────────────────────┐
  │      BEFORE DEFAULT     │      AFTER DEFAULT      │
  ├─────────────────────────┼─────────────────────────┤
  │  Prime NAV   1.00411   │  Prime NAV   1.00411   │  ← unchanged
  │  Core   NAV   1.00987   │  Core   NAV   0.6798    │  ← -32%
  │  Alpha NAV   1.00290   │  Alpha NAV   0.0000    │  ← wiped
  └─────────────────────────┴─────────────────────────┘

Frame 6 — USER PnL VIEW (LIVE) — the moment that hits home
  ┌─────────────────────────────────────────────────────┐
  │   USER PnL — REAL MONEY IMPACT                      │
  ├─────────────────────────────────────────────────────┤
  │   User A   (Prime, $5K deposit)   +$20.55  +0.41%  │  green
  │   User B   (Core,   $3K deposit)   -$960.60  -32%   │  amber
  │   User C   (Alpha, $2K deposit)   -$2,000   -100%  │  red
  ├─────────────────────────────────────────────────────┤
  │   TOTAL LP IMPACT                  -$2,940   -29%   │
  └─────────────────────────────────────────────────────┘
```

**Pitch script overlay during animation:**

> *"Watch the Alpha tranche. Then the Core. The Prime holders are protected — exactly as the contract promised when they deposited."*

[cascade completes, Before/After snapshot slides in, then PnL view]

> *"This is what real credit risk looks like — losses don't disappear, they move."*

**[Pause. Let it land. ~3 seconds of silence.]**

This pause is critical. The PnL panel does the work — judges read three numbers and feel the asymmetry. Don't talk over it.

---

## 4.6 Flow D2 — Trade #2: market reprices  *(15s — the dramatic peak)*

**Trigger:** Admin clicks **"Run Market Reaction"** — a single button that signs a sequence of MM swaps. User then optionally performs a Prime swap to show stability.

**Instruction:** Repeated calls to `prism_amm::swap(pool, amount_in, min_amount_out)`.

**The core insight:** the AMM is constant-product and *does not know* about the default. Pool reserves pre-default still quote near-pre-default prices. **What changes the market price is arbitrage** — a trader who knows pALPHA is now worth zero will dump it into the pool to capture the spread, collapsing pool price toward NAV. Constant-product math means a *single* trade can't crash price by 95% — but a sequence of trades visibly walks price down. That walk is the demo moment.

**Pool seeds (per §8.5):**
- pALPHA pool: **1,000 + 1,000** (thin — allows visible price discovery)
- pCORE pool: **1,000 + 1,000** (same)
- pPRIME pool: **5,000 + 5,000** (deep — Prime should feel stable)

**MM pre-funded inventory (per §8.5):**
- 2,000 pALPHA (from a 2,000 USDC Alpha deposit at setup)
- 500 pCORE (from a 500 USDC Core deposit at setup)

### Trade sequence (locked)

#### Alpha arbitrage — 5 sequential MM sells of 400 pALPHA each

| # | pALPHA in | Pool pALPHA after | Pool USDC after | USDC out to MM | New pool price |
|---|---|---|---|---|---|
| start | — | 1,000 | 1,000 | — | 1.000 |
| 1 | 400 | 1,400 | 714.3 | 285.7 | **0.510** |
| 2 | 400 | 1,800 | 555.6 | 158.7 | **0.309** |
| 3 | 400 | 2,200 | 454.5 | 101.0 | **0.207** |
| 4 | 400 | 2,600 | 384.6 | 69.9 | **0.148** |
| 5 | 400 | 3,000 | 333.3 | 51.3 | **0.111** |

After 5 trades, pALPHA market price = **~0.11** (NAV = 0.00). MM ends up with ~666 USDC for dumping 2,000 pALPHA.

#### Core arbitrage — 2 sequential MM sells of 250 pCORE each

| # | pCORE in | Pool pCORE after | Pool USDC after | USDC out to MM | New pool price |
|---|---|---|---|---|---|
| start | — | 1,000 | 1,000 | — | 1.000 |
| 1 | 250 | 1,250 | 800.0 | 200.0 | **0.640** |
| 2 | 250 | 1,500 | 666.7 | 133.3 | **0.444** |

After 2 trades, pCORE market price = **~0.44** (NAV = 0.6798). Slight overshoot to discount territory — realistic arb behavior.

#### Prime swap — 1 user sell of 50 pPRIME

| # | pPRIME in | Pool pPRIME after | Pool USDC after | USDC out to user | New pool price |
|---|---|---|---|---|---|
| start | — | 5,000 | 5,000 | — | 1.000 |
| 1 | 50 | 5,050 | 4,950.5 | 49.5 | **0.980** |

Prime price barely moves (NAV = 1.00411, market = 0.980 = ~2% discount). Stability demonstrated.

### Sequence (one of the 5 Alpha sells)

```
MarketMaker     PRISM-AMM Program     pALPHA Pool         Dashboard
    │                │                     │                   │
    │ swap(400       │                     │                   │
    │  pALPHA,      │                     │                   │
    │  min=...)      │                     │                   │
    │───────────────►│                     │                   │
    │                │ pull 400 pALPHA    │                   │
    │                │────────────────────►│                   │
    │                │ compute x*y=k       │                   │
    │                │ pool: 1,400+714.3   │                   │
    │                │ output ≈ 285.7 USDC │                   │
    │  285.7 USDC ◄──│                     │                   │
    │                │ update reserves     │                   │
    │                │ emit SwapEvent      │                   │
    │                │────────────────────────────────────────►│
    │                │                     │  AMM price chart  │
    │                │                     │  pALPHA: 0.510   │
```

The same sequence repeats 4 more times under one "Run Market Reaction" admin button — the chart shows price walking down step-by-step.

### Dashboard storyboard

```
Before Trade #2 (post-default, pre-arb)
  AMM price chart:
    pPRIME: 1.000   (NAV 1.00411 — discount ~0.4%)
    pCORE:   1.000   (NAV 0.6798  — premium ~47%)  ← arb gap
    pALPHA: 1.000   (NAV 0.00    — premium ∞)     ← massive arb gap

During "Run Market Reaction" — Alpha (5 sells, animated):
    pALPHA: 1.000 → 0.510 → 0.309 → 0.207 → 0.148 → 0.111
    (each step pulses red on chart; new low printed each click)

During "Run Market Reaction" — Core (2 sells, animated):
    pCORE:   1.000 → 0.640 → 0.444
    (smaller drops; still visible cascade)

After user Prime swap:
    pPRIME: 1.000 → 0.980
    (barely moves; bar pulses GREEN — stability!)
```

### Pitch script

> *"Now watch how the market reprices this risk in real time."*
> [click "Run Market Reaction"]
> *"pALPHA just lost half its value. Then half again. And again."*
> [pause as chart steps down 5 times]
> *"This is panic selling — arbitrageurs collapsing pALPHA toward its true NAV of zero."*
> [Core cascade plays]
> *"pCORE reprices toward its NAV of ~0.68 — partially hit but not destroyed."*
> [Prime swap]
> *"And Prime? Holds steady at NAV. The market understands risk in real time."*

**Why this beats Trade #1 alone:** Trade #1 proves the protocol works. Trade #2 proves **the market understands the protocol** — a different and bigger claim.

---

## 4.7 Flow E — Withdraw (post-default exit)  *(25s)*

**Trigger:** User clicks "Withdraw" on their pTRANCHE position.

**Instruction:** `prism::withdraw(vault, tranche_kind, share_amount)`

**Math**
```
payout_usdc = share_amount × current_nav_per_share_q (in Q64.64 → u64)
```

**Two side-by-side demo cases — both essential:**

| Case | Tranche | Shares | NAV | Payout |
|---|---|---|---|---|
| Prime holder exits | pPRIME | 5,000 | 1.00411 | **5,020.55 USDC** ← profit on 5,000 deposit |
| Alpha holder exits | pALPHA | 2,000 | 0.0000 | **0.00 USDC** ← total loss on 2,000 deposit |

**Sequence** (one withdrawal — same flow runs twice with different tranches)

```
User              PRISM Program        SPL Token         Vault USDC Reserve
  │                    │                   │                     │
  │ withdraw(N)        │                   │                     │
  │───────────────────►│                   │                     │
  │                    │ payout = N × NAV  │                     │
  │                    │                   │                     │
  │                    │ burn N pTRANCHE   │                     │
  │                    │──────────────────►│                     │
  │                    │                   │                     │
  │                    │ transfer payout   │                     │
  │                    │ USDC to user      │                     │
  │                    │────────────────────────────────────────►│
  │   payout USDC   ◄──│                   │                     │
```

**Dashboard render — the closing argument**
- Alpha holder card: large **"withdrew $0.00 of $2,000 deposit · 100% loss"**
- Prime holder card: large **"withdrew $5,020.55 of $5,000 deposit · +0.41% yield"**
- Both visible side-by-side

**Closing pitch line (the last 10 seconds — the line judges remember):**

> *"Today, credit markets are opaque and illiquid.*
> *We just showed how they become programmable, transparent, and tradable."*

Replace the old "Prime protection: real..." line — the new closing reframes the entire demo from "we built a thing" to "we just changed how a multi-trillion-dollar market could work." Higher altitude lands harder.

---

## 4.8 Vault state machine

```
                ┌───────────────┐
                │   Vault       │
                │   Active      │
                └───────┬───────┘
                        │ trigger_credit_event(Default | PartialLoss)
                        ▼
                ┌───────────────┐
                │   Vault       │
                │   Defaulted   │
                └───────┬───────┘
                        │ trigger_credit_event(Recovery)
                        │   (post-recovery proceeds → re-credit assets)
                        ▼
                ┌───────────────┐
                │   Vault       │
                │   Resolved    │
                └───────────────┘
```

## 4.9 Loan state machine

```
                ┌───────────────┐
                │   Loan        │
                │   Originated  │
                └───────┬───────┘
                        │ disburse
                        ▼
                ┌───────────────┐
                │   Loan        │
                │   Active      │
                └───────┬───────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  ┌─────────┐   ┌─────────────┐   ┌─────────┐
  │Repaying │   │  Defaulted  │   │Resolved │
  └─────────┘   └─────────────┘   └─────────┘
```

---

## 4.10 Events (Dune SIM indexes these)

| Event | Emitted by | Used for |
|---|---|---|
| `DepositEvent` | deposit | Dashboard event ticker, TVL chart |
| `WithdrawEvent` | withdraw | Dashboard event ticker, outflow chart |
| `YieldDistributed` | accrue_yield | Per-tranche yield chart, cumulative yield counter |
| `LossApplied` | trigger_credit_event | NAV cascade animation, loss histogram |
| `CreditEventCreated` | trigger_credit_event | CreditEvent log table |
| `SwapExecuted` | amm::swap | AMM price chart, volume tracker |

---

## Next: Section 5 — Anchor Program Architecture

Concrete instruction signatures, account contexts, validation, error types — the part directly translatable to Rust scaffolding.
