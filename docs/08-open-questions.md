# PRISM Protocol — Open Questions & Hidden Gaps (Section 8)

**Status:** Live. Items resolved get marked ✅ Locked. Items still open need decisions.

This is the honest "what we hand-waved" list. Going through it before Day 1 prevents Day 8 surprises.

---

## Tier 1 — Critical (decide before Day 1)

### 8.1 Borrower mechanics, USDC source, and the cash-accounting mismatch

**What's hand-waved:** I've said "admin-simulated borrower" but the actual money mechanics aren't nailed. Three connected sub-questions:

**(a) Where does yield USDC physically come from?**
- The pull-pattern `accrue_yield` requires `borrower_usdc_ata` to have USDC.
- Does admin pre-fund a borrower wallet at demo setup? Or mint USDC on-demand?

**(b) Do we actually disburse the loan?**
- `disburse_loan` moves USDC from vault → borrower. If we run it, the vault balance drops to ~0 (USDC went out as principal). If we skip it, the loan is fictional and the vault keeps deposits.
- The demo should *visually* show "USDC deposited → USDC went to borrower → yield comes back" for narrative completeness. But that means at default, the principal is gone and the vault doesn't have USDC to pay Prime holders out.

**(c) The cash-accounting mismatch on default**
- After `trigger_credit_event(loss = 2500)`, our accounting says `total_assets` dropped by 2500. But the *actual* USDC didn't move from the vault reserve — only the accounting did. So if a Prime holder withdraws, they pull from a reserve that has *more USDC than total tranche assets sum*. That's wrong.

**Recommended resolution (pick one):**

| Option | Mechanics | Demo realism | Implementation cost |
|---|---|---|---|
| **A. Closed-loop demo (no real disbursement)** | Skip `disburse_loan`. USDC stays in vault. On `accrue_yield`, admin pre-funds a separate borrower wallet from the faucet; pull pulls into vault. On default, also burn the loss USDC (transfer to a `loss_bucket` PDA or admin) so vault reserve = sum of tranche assets always. | Looks real. Accounting is honest. | Low. Add 1 line to `trigger_credit_event` to transfer loss USDC out |
| **B. Full lifecycle demo (disburse for real)** | Run `disburse_loan` after deposits. Vault reserve drops. Borrower then repays principal + yield via `accrue_yield`. On default, principal is gone — Prime gets paid from whatever yield arrived before the default. | Most realistic. | High. Need to coordinate disburse → yield → default timing precisely. Risk: Prime holders can't withdraw if vault is empty post-disburse |
| **C. Fictional accounting demo (skip real USDC)** | Use a fake "USDC" mint we control. `accrue_yield` mints from thin air. On default, admin burns from the reserve. | Less impressive — judges might notice fake USDC | Lowest |

**My pick: Option A.** Closed-loop demo with explicit loss-burn on default. The vault always has a USDC balance equal to the sum of tranche assets — no mismatch. The "borrower" role is just a separate admin-controlled wallet that the faucet pre-funds. Demo looks real, math is honest.

✅ **STATUS: LOCKED (Apr 25, 2026) — Option A.** On default, transfer `loss_amount` USDC from vault reserve to a `loss_bucket` PDA (seed `["loss_bucket", vault]`). Vault reserve invariant: `vault_usdc_reserve.amount == sum(tranche.total_assets)` at all times.

---

### 8.2 Cloak integration — does it actually map to the waterfall?

**What's hand-waved:** I claimed Cloak's batch disbursement *is* the waterfall payout. Re-examining: not really.

- **Cloak's batch disbursement** = transfer USDC from one address to many recipient addresses, with amounts hidden.
- **PRISM's waterfall** = update internal `total_assets` on each tranche PDA. **No USDC moves out to LP wallets.** ERC-4626-style vaults accrue yield as NAV; LPs realize it on withdrawal, not as a periodic payout.

So the natural Cloak fit isn't the waterfall — it's elsewhere.

**Three real fit options:**

| Option | What Cloak does | Effort | Pitch strength |
|---|---|---|---|
| **A. Shielded withdraw** | When user calls `withdraw`, payout USDC routes through Cloak shielded send. LP receives privately. | Low | Decent — "your exit is private" |
| **B. Optional claimable coupon** | Add a separate `claim_coupon` instruction. Periodically, admin calls a "snapshot + distribute" that pushes a percentage of accrued yield to LP wallets via Cloak. NAV decreases proportionally. | Medium | Strong — "your coupons are private" — closer to traditional bond payments |
| **C. Drop Cloak entirely** | Pursue Encrypt-only on the privacy axis. Save 1 day. | Zero | Lose $5K side track |

**My pick: Option A** for MVP. It's a 1-day integration and tells a real privacy story without scope creep. Frame Option B as "Phase 2 — periodic distributions for institutional LPs."

✅ **STATUS: LOCKED (Apr 25, 2026) — Option A.** Shielded withdraw only. The `withdraw` instruction's USDC payout routes through Cloak's shielded-send SDK (frontend integration). Periodic coupon distribution deferred to Phase 2.

---

### 8.3 NAV edge cases — zero-supply, total-wipeout, post-default deposits

**What's hand-waved:** the NAV math has three silent footguns:

**(a) First depositor: `total_supply == 0`**
- `nav_per_share = total_assets / total_supply` = `0 / 0` → undefined.
- **Fix:** if `total_supply == 0`, mint shares 1:1 with USDC at NAV = 1.0. Standard ERC-4626 pattern.

**(b) Total wipeout: `total_assets == 0` after default but `total_supply > 0`**
- All Alpha holders still hold pALPHA tokens; NAV = 0; their tokens are worthless but exist.
- If they call `withdraw`, payout = N × 0 = 0. Tokens burn for nothing. **OK — this is the dramatic demo moment** ("Alpha holder withdraws → gets $0").
- After all alpha tokens burn, both `total_assets` and `total_supply` = 0. Tranche is "reset."

**(c) Deposit into a wiped tranche**
- If Alpha is at NAV = 0 and total_supply > 0, a new depositor would mint at `usdc_in / 0` = ∞ shares.
- **Fix:** explicit guard — if `nav_per_share == 0`, block deposits to that tranche. Require either (i) all existing tokens to burn first (resetting the tranche) or (ii) a Recovery event to lift NAV back above zero.
- Demo doesn't show this case, but design must handle it cleanly.

**Recommended:**
- (a) → handle in `deposit` instruction — `if total_supply == 0 { shares = usdc_in }`.
- (b) → no fix needed; current behavior is correct and demo-positive.
- (c) → return `PrismError::TrancheWipedNoDepositsAllowed` if `nav_per_share == 0 && total_supply > 0`.

✅ **STATUS: LOCKED (Apr 25, 2026).** All three fixes apply.

---

### 8.4 `subordination_floor_bps` — unused field, remove or use?

**What's hand-waved:** the Tranche struct has `subordination_floor_bps` (e.g., Prime 5000, Core 2000, Alpha 0) — but the cascade in §4.5 doesn't use it. It just walks Alpha → Core → Prime consuming `total_assets`.

**Two paths:**

| Option | Description |
|---|---|
| **A. Remove the field** | Cascade is purely "lose your principal first, then move up." Simpler model. Standard waterfall |
| **B. Use the field** | Subordination floor caps how much each tranche can absorb before passing to the next. E.g., Core absorbs at most 30% of vault loss, even if Core still has assets left. More flexible / configurable |

**My pick: Option A — remove.** The simple waterfall is what the demo shows and what the dashboard storyboard (§4.5) animates. Adding floors complicates the math without changing the demo. If we want flexibility later, add it in Phase 2.

✅ **STATUS: LOCKED (Apr 25, 2026).** Field removed from Tranche struct.

---

## Tier 2 — Cleanup (decide during implementation)

### 8.5 Demo numbers consistency

**Locked demo numbers** (revised Apr 25 to reflect 8.21 refinements):

| Quantity | Value | Source |
|---|---|---|
| LP Prime deposit | 5,000 USDC | demo wallet `lp_prime` |
| LP Core deposit | 3,000 USDC | demo wallet `lp_core` |
| LP Alpha deposit | 2,000 USDC | demo wallet `lp_alpha` |
| MM Alpha deposit | 2,000 USDC | demo wallet `mm` (for Trade #2 inventory) |
| MM Core deposit | 500 USDC | demo wallet `mm` |
| Admin Prime AMM seed | 5,000 USDC | for AMM bootstrap |
| Admin Core AMM seed | 1,000 USDC | for AMM bootstrap |
| Admin Alpha AMM seed | 1,000 USDC | for AMM bootstrap |
| **Prime tranche total** | **10,000 USDC** | 5K LP + 5K admin |
| **Core tranche total** | **4,500 USDC** | 3K LP + 0.5K MM + 1K admin |
| **Alpha tranche total** | **5,000 USDC** | 2K LP + 2K MM + 1K admin |
| **Vault total** | **19,500 USDC** | sum of three tranches |
| Yield event | 100 USDC over 30 days | covers Prime 5%, Core 8%, and part of Alpha's 15% target |
| Default loss | 6,500 USDC | wipes Alpha, hits Core ~32% |
| Prime AMM pool | 5,000 + 5,000 | deep — Prime swap feels stable |
| Core AMM pool | 1,000 + 1,000 | thin — allows visible repricing |
| Alpha AMM pool | 1,000 + 1,000 | thin — same |
| Borrower wallet pre-fund | 10,000 USDC | source for `accrue_yield` |

Total devnet USDC needed across demo wallets: ~30,000 (Circle faucet over 1–2 days).

✅ **STATUS: LOCKED (Apr 25, 2026).**

---

### 8.6 Pause behavior — what does it block?

**Recommended:** when `paused == true`, block `deposit`, `withdraw`, `swap`. Allow `accrue_yield`, `trigger_credit_event`, admin instructions to keep running so admin can recover state. Pause is for emergencies, not full halt.

✅ **STATUS: Locking.**

---

### 8.7 Trade #2 mechanics — who is the "market maker"?

**What's hand-waved:** §4.6 says "MM sells pALPHA into pool" but doesn't say who that is.

**Recommended:** add a hidden admin button **"Run Market Reaction"** that, in one transaction, signs an MM swap of (a) some pALPHA → USDC and (b) some pCORE → USDC. Demo presenter clicks this button; AMM prices reprice visibly. Cleaner than coordinating multiple wallets live.

Pre-fund an "MM" wallet at setup with pALPHA and pCORE tokens.

✅ **STATUS: Locking.**

---

### 8.8 Switchboard fallback — what does the UI actually show?

**Recommended:** the admin panel has TWO buttons next to each other:
- **"Trigger Default (Admin)"** — direct admin signer
- **"Trigger Default (Switchboard Feed)"** — reads latest feed value, triggers if condition met

Default to using Switchboard. If the feed fails on demo day, switch to admin button — judges won't notice the difference visually. Both paths emit the same `CreditEvent`.

✅ **STATUS: Locking.**

---

### 8.9 Real-time dashboard data fetching

**Recommended:** poll RPC every 3 seconds via React Query. Use Solana account subscriptions (`connection.onAccountChange`) for the 4 hot accounts (Vault + Tranche × 3) so NAV updates feel instant. No need for Helius gRPC or anything fancy for a 16-day build.

✅ **STATUS: Locking.**

---

### 8.10 Transaction confirmation pattern

**Recommended:** wait for `confirmed` commitment (not `finalized`). Show inline loading state. On confirm, invalidate React Query keys for affected accounts. On error, show toast with raw error message (judges appreciate honesty about what failed).

✅ **STATUS: Locking.**

---

### 8.11 USDC mint choice

**Recommended:** use **Circle's official devnet USDC** mint (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`). Faucet at `https://faucet.circle.com`. More "real" feeling than a custom mint.

Pre-fund the borrower wallet with $10K of devnet USDC at setup so `accrue_yield` always has source funds.

✅ **STATUS: Locking.**

---

## Tier 3 — Operational details (handle as we go)

### 8.12 Demo wallets — how many, what they do

5 wallets needed for the demo:

| Wallet | Role | Pre-funded with |
|---|---|---|
| `admin` | Init, admin actions, default trigger fallback | SOL + extra USDC |
| `borrower` | Source of yield USDC | $10K USDC |
| `lp_prime` | Demo Prime depositor | SOL + $5K USDC |
| `lp_core` | Demo Core depositor | SOL + $3K USDC |
| `lp_alpha` | Demo Alpha depositor | SOL + $2K USDC |
| `mm` | Market maker for Trade #2 | pALPHA + pCORE (minted at setup via admin transfer or initial deposit) |

That's actually 6 wallets. Generate via Solana CLI; commit a setup script that funds them all.

### 8.13 Local validator vs devnet

- **Days 1–5:** local validator for tests (faster). Anchor's `solana-test-validator` ships with this.
- **Day 6+:** deploy to devnet. Switchboard / Cloak / Ika / Dune all live there.

### 8.14 Mainnet vs devnet for the demo video

- **Demo recording:** record on devnet (no risk of real funds, instant feedback).
- **Phase 1.5 mainnet target:** redeploy to mainnet by June 11 per roadmap. Don't need it for hackathon submission.

### 8.15 Multisig admin — Phase 1.5 concern

The demo uses a single admin keypair. Production needs multisig (Squads on Solana is the standard). Note in roadmap as Phase 1.5 work.

### 8.16 Multi-loan support — clean up before scaling

Loan PDA seed is `["loan", vault, loan_id]`. Need a `Vault.next_loan_id` counter. Out of scope for v1 (single loan), but add the field to the Vault struct for future-proofing. Cost: 4 bytes.

### 8.17 IDL TypeScript type post-processing

Anchor IDL → TS types sometimes needs manual fixes (PublicKey vs string conversions, BN vs bigint). Use `@coral-xyz/anchor`'s `Program<IDL>` typing and convert at the boundary. Don't try to use the raw IDL types throughout the frontend.

### 8.18 Recording software

OBS Studio (free) for the 2:30 demo video. Record at 1920×1080. Use a clean wallet UI overlay; hide irrelevant browser chrome.

### 8.19 Faucet rate limits

Devnet SOL faucet caps at 2 SOL per request, 24h cooldown. Use multiple keypairs or `solana airdrop` from a script. USDC faucet (Circle) is per-address daily.

### 8.20 Demo error recovery

If something breaks during recording, **don't restart from scratch.** Re-record the broken segment only and stitch in post. Have a fresh devnet deployment per recording session so state is clean.

---

---

## Tier 1B — Issues found post-locking (decide before Day 6 / Day 10)

### 8.21 — Trade #2 demo physics (CRITICAL)

**The bug:** §4.6 claims pALPHA market price collapses from ~1.00 → ~0.05 when MM dumps tokens after default. **Constant-product math doesn't support that** with the planned pool sizes (5K + 5K) and MM holdings (500 pALPHA). One dump moves price from 1.00 → ~0.83. Visually unimpressive vs the storyboard.

**Cause:** constant-product fundamentally caps single-trade price impact relative to pool reserves. To get to 0.05, MM would need to dump ~95K pALPHA.

**Recommended: Option A — sequential MM sells, scripted as a single admin "Run Market Reaction" button.**

- Pre-fund MM with 1,000 pALPHA (from a 1,000 USDC Alpha deposit at setup) + 500 pCORE
- "Run Market Reaction" button signs **5 sequential `swap(200 pALPHA → USDC)` transactions**
- Each iteration causes a visible price step on the dashboard chart — judges see arb dynamics walking down
- After 5 sells, pALPHA pool price ≈ 0.17 — not literally 0.05 but a clear collapse
- Same pattern for pCORE (3 sells of ~165 each)

**Refinement (per Apr 25 review):** thinner pools + larger MM inventory for a more dramatic but still-honest collapse.

**Locked spec:**
- Pool sizes: **Prime 5K+5K** (stable), **Core 1K+1K** (thin), **Alpha 1K+1K** (thin)
- MM inventory: **2,000 pALPHA + 500 pCORE** (mid-range of 2–3K)
- Trade #2 sequence:
  - 5 sells of 400 pALPHA → pool price walks 1.00 → 0.51 → 0.31 → 0.21 → 0.15 → **0.11**
  - 2 sells of 250 pCORE → 1.00 → 0.64 → **0.44**
  - 1 user sell of 50 pPRIME → 1.00 → **0.98** (stability proven)
- Demo framing: *"Watch how the market reprices this risk in real time."* Feels like panic selling / liquidation.

✅ **STATUS: LOCKED (Apr 25, 2026) — Option A with thinner pools + larger MM.**

### 8.22 — Demo state reset for re-recording

**The problem:** PDA accounts can't be re-initialized. If demo recording fails on Day 15 and we need to re-record on Day 16, `vault_id = 0` PDAs already exist — re-running setup fails.

**Recommended: Option A — sequential `vault_id` parameter.**

- Setup script accepts `vault_id` argument
- First recording uses vault_id 0; re-recording uses vault_id 1; etc.
- Already supported by parameterized seeds (`["vault", vault_id_le_bytes]`)
- Tests use vault_id 99 to avoid colliding with demo state

**Cost:** trivial — design already supports it.

**Bonus pitch line unlocked:** *"The system supports multiple independent credit vaults — this demo just uses one."* Turns a dev workaround into a feature in the deck.

✅ **STATUS: LOCKED (Apr 25, 2026) — Option A.**

---

## Tier 2B — Operational follow-ups (locking as recommended)

### 8.23 — Setup script atomicity

Single TypeScript script runs all 12 init transactions sequentially:
1. `initialize_global_config`
2. `initialize_vault`
3. `initialize_tranche` × 3
4. `initialize_loss_bucket` (token account)
5. `initialize_loan`
6. `initialize_pool` × 3 (AMM)
7. Pre-fund borrower wallet (USDC airdrop)
8. LP wallets deposit (creates pTRANCHE balances)
9. MM wallet deposits (1,000 USDC into Alpha, 500 into Core)
10. Admin seeds AMM pools with pTRANCHE + USDC

Idempotent guards: each step checks if account exists before init. Re-running is safe.

✅ **STATUS: Locking.**

### 8.24 — pTRANCHE token decimals

**6 decimals** — matching USDC. Clean math at NAV=1.0 (1 USDC deposit = 1,000,000 base units → 1,000,000 pTRANCHE base units).

✅ **STATUS: Locking.**

### 8.25 — MM wallet pre-funding amount

- 1,000 USDC into Alpha tranche at setup → 1,000 pALPHA (base unit math: 1,000,000,000 minor units)
- 500 USDC into Core tranche at setup → 500 pCORE
- 0 in Prime (we don't dump pPRIME — Prime price stability is the contrast story)

This means total Alpha tranche size at demo start = `2,000 (lp_alpha) + 1,000 (mm) = 3,000 USDC`. Total Core = `3,000 + 500 = 3,500 USDC`. Adjust §8.5 demo numbers accordingly.

✅ **STATUS: Locking. Will update §8.5 numbers.**

### 8.26 — Dev environment version pinning

| Tool | Version | Locked in |
|---|---|---|
| Anchor | 0.30.x | `Anchor.toml` |
| Solana CLI | 1.18.x | `package.json` engines |
| Node | 20.x | `package.json` engines |
| Rust | stable 1.75+ | `rust-toolchain.toml` |
| Yarn | 1.22+ | `package.json` engines |

✅ **STATUS: Locking.**

### 8.27 — Frontend RPC endpoint

**Helius free tier** for devnet (1M requests/month, better reliability than public RPC). Public Solana RPC as fallback. For demo recording, pre-warm the Helius cache with a few queries before pressing record.

Endpoint: `https://devnet.helius-rpc.com/?api-key=<key>`

✅ **STATUS: Locking.**

### 8.28 — Submission deadline timezone

Confirm before Day 14. Frontier is run by Colosseum (US-based). Likely deadline is **May 11, 2026, 11:59 PM Pacific (07:00 UTC May 12)** — but verify on Colosseum's submission portal.

**Operational rule:** treat the deadline as **May 11, 11:59 PM IST** (which is May 11 1:29 PM Pacific, 9:29 PM UTC) — submit ~10 hours before whatever the actual deadline is. Buffer for unknowns.

✅ **STATUS: Locking. Verify timezone on Colosseum portal by Day 14.**

---

## Summary — Tier 1 LOCKED (Apr 25, 2026) ✅

| # | Question | Locked decision |
|---|---|---|
| 8.1 | Borrower / USDC / accounting model | ✅ Option A — closed-loop demo + loss burn to `loss_bucket` PDA |
| 8.2 | Cloak scope | ✅ Option A — shielded withdraw only |
| 8.3 | NAV edge cases | ✅ All 3 fixes applied (first-deposit, wipeout-allowed, post-wipe deposit blocked) |
| 8.4 | `subordination_floor_bps` | ✅ Removed from Tranche struct |

Items 8.5–8.20 are locked as recommended unless explicitly overridden.

Tier 1 sign-off complete.

---

## Tier 1B LOCKED (Apr 25, 2026) ✅

| # | Question | Locked decision |
|---|---|---|
| 8.21 | Trade #2 demo physics | ✅ Sequential MM sells with thinner pools (Core/Alpha 1K+1K, Prime 5K+5K) + larger MM (2K pALPHA + 500 pCORE). 5 sells of 400 pALPHA → price collapses 1.0 → 0.11 |
| 8.22 | Demo state reset for re-recording | ✅ Sequential `vault_id` parameter. First record = vault 0, retry = vault 1, tests = vault 99 |

Items 8.23–8.28 locked as recommended.

**Design fully ready for Day 1 (April 26, 2026).** All decisions consistent across 02 / 04 / 05 / 06 / 08.
