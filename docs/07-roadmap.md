# PRISM Protocol — Roadmap (Section 7)

**Status:** Locked. Tokenless through Phase 2. Token revisited only at Phase 3, most likely as insurance backstop.

This is the deck closer. Judges ask "will this still exist in 30 days?" and "what's the bigger vision?" — this section answers both without sounding like vaporware.

---

## 7.1 The four phases at a glance

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   PHASE 1        │  │   PHASE 1.5      │  │   PHASE 2        │  │   PHASE 3        │
│   May 11, 2026   │  │   30 days post   │  │   3–6 months     │  │   12+ months     │
│                  │  │                  │  │                  │  │                  │
│   HACKATHON      │  │   SURVIVE        │  │   COMPLETE       │  │   INSTITUTIONAL  │
│   SHIP           │  │   (eligibility)  │  │   THE STACK      │  │   CREDIT INFRA   │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

---

## 7.2 Phase 1 — Shipped at Frontier

What the demo proves:

- ✅ Tranche vault with NAV-per-share accounting
- ✅ Pull-pattern yield waterfall
- ✅ Default cascade with 3 event types (Default / PartialLoss / Recovery)
- ✅ Constant-product AMM for tranche tokens
- ✅ Live dashboard with real-time NAV bars
- ✅ Strategy presets (Safe / Balanced / Aggressive)
- 🟦 Switchboard oracle for credit events
- 🟦 Cloak SDK for confidential coupon distribution
- 🟦 Dune SIM for analytics indexing

**Pitch claim:** *"This isn't a slide deck. The protocol works on Solana devnet today."*

---

## 7.3 Phase 1.5 — The 30-day survivability commitment

This addresses what every hackathon judge asks: *"will this still exist in 30 days?"* Even though we're not in the Eitherway track, the spirit applies — judges remember teams that didn't disappear.

| Item | Why |
|---|---|
| Public devnet deployment, no take-down | Anyone can deposit and try the cascade |
| Discord / Telegram channel | Real users hit issues; we need to hear them |
| Open GitHub issues + roadmap board | Signals momentum |
| Weekly devlog post (X / mirror.xyz) | Cheap distribution |
| Mainnet launch by Day 30 | The real credibility move |

**Pitch claim:** *"By June 11, PRISM is live on Solana mainnet with public docs, an open issue tracker, and a published devlog."*

---

## 7.4 Phase 2 — Complete the stack (3–6 months)

The four ⚪ roadmap layers from §3.2 get filled in, mostly through deeper partner integrations (cheaper than building from scratch):

| Layer | Status now | Phase 2 plan |
|---|---|---|
| **L4 Hedging (CDS market)** | ⚪ Designed | Build a separate `prism_hedge` Anchor program: pTRANCHE-token-staked credit protection sellers, payout on CreditEvent. Pricing via constant-product or Dutch auction |
| **L5 Margin** (pTRANCHE-as-collateral) | ⚪ Designed | Deep integration with **Kamino** — pPRIME is a yield-bearing collateral asset for borrowing on Kamino |
| **L7 Cross-Chain** (real Ika wiring) | 🟦 Designed | Borrowers post BTC / ETH via **Ika dWallets**. PRISM vault underwrites loans secured by real cross-chain collateral |
| **L9 Compliance / Legal** | ⚪ Designed | Launch a permissioned vault using **NeosLegal** wrappers. KYC'd LPs, real RWA originators |
| **L10 Credit Identity** | 🟦 Designed | Full **Encrypt FHE** integration: confidential borrower credit scores stored encrypted, decryptable only by authorized risk committee |
| **L12 Liquidity Bootstrap** | ⚪ Designed | Anchor LP program with fee rebates; partner with **Torque** for retention loops |
| **L15 Strategy Automation** | 🟢 Built | Expand presets into a real strategy SDK — programmable allocation rules, conditional rebalancing |

**Pitch claim:** *"Six months from now, PRISM is the only on-chain credit protocol with cross-chain collateral, encrypted borrower scoring, KYC'd RWA pools, and a CDS-style hedging market — and the architecture you saw today is what makes that possible."*

---

## 7.5 Phase 3 — Institutional credit infrastructure (12+ months)

The long-term vision:

- **Multiple vaults per originator** (RWA invoices, trade finance, fintech consumer credit, on-chain perp funding)
- **Dodo Payments** as fiat on/off-ramp for institutional LPs (India + global)
- **Permissioned + permissionless pools** side-by-side
- **Real-time risk pricing** fed by **Pyth** + on-chain default histories
- **DAO-governed risk parameters** (target APYs, subordination thresholds)
- **Cross-chain markets:** PRISM credit assets traded on Ethereum, Hyperliquid, and other venues via Ika

**Pitch claim:** *"PRISM is what credit looks like when it's a programmable financial primitive — not a bank product."*

---

## 7.6 Token strategy — locked

**PRISM remains tokenless through Phase 2. Token introduction is deferred until a clear utility emerges, most likely as an insurance backstop in Phase 3.**

### Why this is the right call

| Reasoning | Implication |
|---|---|
| **Clarity > optionality in a pitch** | "We'll decide later" reads as not-thought-through. "Intentionally tokenless until there's a real need" reads as disciplined |
| **Most teams lose by forcing a token** | They add fake utility, confuse the story, invite regulatory questions. We do the opposite |
| **Matches the core thesis** | The pitch is "credit infrastructure," not "token ecosystem." A token early dilutes that |
| **Roadmap already supports it naturally** | Phase 1 = working system; Phase 2 = complete stack; Phase 3 = institutional. Token fits cleanly only at Phase 3 |
| **Phase 3 token has clear utility** | Insurance backstop tranche below Alpha — absorbs tail risk in exchange for protocol fees. Aligns with credit risk, not speculative |

### Pitch line (use exactly)

> *"We deliberately avoided introducing a token — because the system should work before incentives are layered on top."*

### What NOT to say

- ❌ "Token coming soon"
- ❌ "Future airdrop for early users"
- ❌ "Governance token in v2"
- ❌ Any vague tokenomics language

If asked directly, the answer is: *"Tokenless through Phase 2. We'll revisit at Phase 3 if and only if an insurance backstop tranche makes sense."*

---

## 7.7 Pitch deck — final roadmap slide

Single slide, three columns, dense but readable:

```
┌─────────────────────────────────────────────────────────────┐
│                  PRISM Roadmap                              │
├─────────────────┬─────────────────┬─────────────────────────┤
│  Phase 1.5      │  Phase 2        │  Phase 3                │
│  30 days        │  3–6 months     │  12+ months             │
├─────────────────┼─────────────────┼─────────────────────────┤
│  • Mainnet      │  • Hedging      │  • Multi-vault          │
│  • Public docs  │    (CDS market) │  • Fiat onramp          │
│  • Devlog       │  • Cross-chain  │    (Dodo Payments)      │
│  • OSS issues   │    collateral   │  • DAO governance       │
│  • Discord      │    (Ika)        │  • Cross-chain markets  │
│                 │  • Encrypted    │  • Pyth risk pricing    │
│                 │    scoring      │  • Insurance backstop   │
│                 │    (Encrypt)    │    token (if needed)    │
│                 │  • KYC pools    │                         │
│                 │  • Kamino       │                         │
│                 │    margin       │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
```

**Closing line for the deck:** *"Phase 1 is the demo. Phases 2 and 3 are why this matters."*

---

## End of system design phase

This is the seventh and final design document. With sections 1–7 locked, the design phase is complete. From April 26 onward, every change is implementation — code, tests, UI, partner integrations, demo recording.

The master index lives at [00-overview.md](00-overview.md).
