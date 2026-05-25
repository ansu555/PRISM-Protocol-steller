# PRISM Protocol — Layered Architecture (Section 3)

**Status:** Locked. Status calls and pitch deck strategy resolved.

The 15 problem-statement layers collapse into 5 architectural domains. Every layer is classified as built / partner-integrated / mocked / roadmap. The same architecture serves as both the system design *and* the pitch deck spine.

---

## 3.1 The five-domain stack

```
┌──────────────────────────────────────────────────────────┐
│                    E. SURFACE                            │
│         Analytics  •  Strategy Automation  •  UI         │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────┐
│                    D. INTEGRITY                          │
│   Trust/Verification  •  Compliance  •  Credit Identity  │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────┐
│                                                          │
│  B. CORE PROTOCOL  ◄────►  C. RISK & MARKETS             │
│  Structured Credit          Risk Pricing                 │
│  Default Resolution         Hedging                      │
│  Margin                     Secondary Market             │
│                             Risk Isolation               │
└──────────────────────────┬───────────────────────────────┘
                           │
┌──────────────────────────┴───────────────────────────────┐
│                    A. SOURCING                           │
│    Origination  •  Cross-Chain  •  Liquidity Bootstrap   │
└──────────────────────────────────────────────────────────┘
```

**Why this grouping wins:**
- *Sourcing* answers judges' first question: "where does credit come from"
- *Core Protocol* and *Risk & Markets* are intentional peers, not stacked — separating credit risk engine from market layer is the modular DeFi argument
- *Integrity* spans both because trust and identity apply to every operation
- *Surface* is what the demo actually shows on screen

---

## 3.2 The 15-layer status grid

Status legend:
- 🟢 **MVP-built** — code ships in the demo
- 🟦 **Partner-integrated** — wired to Encrypt / Ika / Cloak / Switchboard / Dune
- 🟡 **Designed + mocked** — full spec, lightweight UI mock for pitch
- ⚪ **Roadmap** — drawn in design, called out in deck, not built

| # | Layer | Domain | Status | Notes |
|---|---|---|---|---|
| 1 | Credit Origination | A. Sourcing | 🟢 + 🟦 | Admin-simulated borrower v1 → Ika dWallet for cross-chain collateral v1.5 |
| 2 | Programmable Structured Credit | B. Core | 🟢 | The tranche vault. **Hero feature #1** |
| 3 | Dynamic Risk Pricing | C. Risk | 🟡 | Target APY in tranche struct *is* basic pricing. **Market-driven pricing emerges via secondary markets — oracle-driven adjustment is next-layer.** |
| 4 | Verifiable Credit Risk Hedging | C. Risk | ⚪ | CDS-style mechanic in spec; not built |
| 5 | Composable Capital & Margin | B. Core | ⚪ | pTRANCHE-as-collateral roadmap. Mention only |
| 6 | Liquid Secondary Markets | C. Risk | 🟢 | Separate AMM program. **Hero feature #3** |
| 7 | Cross-Chain Liquidity | A. Sourcing | 🟦 | Ika dWallets handle this — we wire, not build |
| 8 | Trust & Verification | D. Integrity | 🟦 | Switchboard oracle for credit events; Cloak viewing keys |
| 9 | Compliance & Legal | D. Integrity | ⚪ | Roadmap only. Mention NeosLegal-style structure in pitch |
| 10 | Credit Identity & Reputation | D. Integrity | 🟦 | Encrypt FHE for confidential borrower scoring |
| 11 | Default Resolution & Recovery | B. Core | 🟢 | CreditEvent + waterfall. `Default \| PartialLoss \| Recovery` types. **Hero feature #4** |
| 12 | Liquidity Bootstrap | A. Sourcing | ⚪ | Demo seeds vault with admin liquidity; no real bootstrap |
| 13 | Risk Isolation | C. Risk | 🟢 | Separate AMM program + vault state machine |
| 14 | Transparency & Analytics | E. Surface | 🟢 + 🟦 | Custom dashboard + Dune SIM data layer. **Hero feature #5** |
| 15 | Strategy Automation | E. Surface | 🟢 | 3 real preset buttons: 🟢 Safe (70% Prime) · 🟡 Balanced (50/30/20) · 🔴 Aggressive (Alpha-heavy) |

**Build coverage:** 8 layers built (🟢), 4 partner-integrated (🟦), 1 mocked (🟡), 4 roadmap (⚪). That's **80% of the spec touched** in some form — credible for 16 days.

---

## 3.3 Status decision rationale

**Why L3 stays mocked (no Pyth integration in MVP):**
Pyth integration is commodity. Judges don't reward "we plugged in price feeds." Our AMM already provides *real* price discovery — that's stronger than oracle-driven "dynamic pricing" because it reflects actual market sentiment about tranche risk, not a fed number.

Pitch line: *"Market-driven pricing emerges via secondary markets — oracle-driven dynamic adjustment is the next layer."*

**Why L15 is real (not mocked):**
Mocked UI = weak. A working preset selector signals "users can interact intelligently with the system." Implementation cost is trivial: three buttons, each calls deposit on a fixed allocation across the three tranches.

```
🟢 Safe       →  70% Prime  /  20% Core  /  10% Alpha
🟡 Balanced   →  50% Prime  /  30% Core  /  20% Alpha
🔴 Aggressive →  20% Prime  /  30% Core  /  50% Alpha
```

No ML, no complex logic. Half a day of work. Pays for itself in pitch impact.

---

## 3.4 Partner integration map

```
SOURCING
   ├─ Layer 1: Origination ────► [Ika dWallet]──► borrower posts BTC/ETH cross-chain
   └─ Layer 7: Cross-chain ────► [Ika MPC network]

CORE PROTOCOL
   ├─ Layer 2: Tranche Vault ──► PRISM Anchor program (hero)
   └─ Layer 11: Default Engine ► PRISM CreditEvent (hero)
                                  │
                                  └─► [Switchboard oracle] triggers + verifies events

RISK & MARKETS
   ├─ Layer 6: AMM ────────────► PRISM AMM program (separate, hero)
   └─ Layer 3: Risk Pricing ───► price discovery via AMM (no oracle in MVP)

INTEGRITY
   ├─ Layer 8: Trust/Verif ────► [Switchboard] event verification
   ├─ Layer 10: Credit Identity ► [Encrypt FHE] confidential borrower scores
   └─ Cash flow privacy ───────► [Cloak] confidential coupon distribution

SURFACE
   ├─ Layer 14: Analytics ─────► PRISM dashboard + [Dune SIM] indexed data
   └─ Layer 15: Strategy Auto ─► 3 preset buttons (Safe / Balanced / Aggressive)
```

Every partner appears exactly once, in exactly the place where the design needed something we'd otherwise have to build.

---

## 3.5 Pitch deck slide strategy

**Two slides, sequenced for impact. Do not combine.**

### Slide 1 — "The System" (clean, conceptual)

Show the 5-domain architecture from §3.1. Clean blocks, no logos.

> **Header:** PRISM is full-stack credit infrastructure
> **Subhead:** Five domains. Fifteen capabilities. One programmable credit primitive.

**Phase this slide answers:** *"Is this idea real?"*

### Slide 2 — "It's Real" (the winning slide)

**Same diagram**, now with partner logos overlaid on the exact layers they power:

| Domain | Logo overlay |
|---|---|
| Sourcing | **Ika** (on Origination + Cross-Chain) |
| Core Protocol → Default | **Switchboard** (on Default Resolution) |
| Integrity → Identity | **Encrypt** (on Credit Identity) |
| Integrity → Cash flow privacy | **Cloak** (on Trust/Verification) |
| Surface → Analytics | **Dune SIM** (on Analytics) |

> **Header:** Every dependency, exactly where we'd otherwise build
> **The killer line:** *"Every external dependency appears exactly where we would otherwise need to build infrastructure ourselves."*

**Phase this slide answers:** *"Did they actually build anything real?"*

**Why two slides, not one:** combining clutters both messages. Sequencing them lets the audience absorb the design first, then watch it become real.

---

## 3.6 MVP build perimeter (concrete scope)

**On-chain (Anchor)**
- 1 PRISM core program: GlobalConfig + Vault + Tranche × 3 + Loan + CreditEvent + waterfall + default math
- 1 PRISM-AMM program: AmmPool × 3 + constant-product swaps
- 3 SPL mints under PRISM authority (pPRIME, pCORE, pALPHA)

**Off-chain**
- Next.js + Solana Wallet Adapter dashboard
- Dune SIM subscription for the analytics view
- 3 preset allocator buttons calling multi-deposit transactions

**Partner integrations** (priority order)
1. **Ika dWallet** as borrower (cross-chain collateral) — primary submission
2. **Switchboard** for default trigger oracle — backstop credibility
3. **Cloak SDK** for confidential coupon payouts — secondary submission
4. **Encrypt FHE** for confidential borrower scoring — stretch; ship if week 2 has slack
5. **Dune SIM** for analytics data — quick add, free-roll prize

**What's intentionally NOT built (and is fine):**
- Hedging (CDS) primitives → designed only
- Margin / collateral composability → roadmap slide only
- Compliance / KYC → narrative only
- Real liquidity bootstrap incentives → admin-seeded liquidity for demo

---

## 3.7 Hero features ↔ architecture map

Every demo click is also a walk through the architecture. This coherence is rare in hackathon submissions.

| Hero feature | Layer | Domain | What judge sees |
|---|---|---|---|
| Tranche Vault | L2 Structured Credit | B. Core | Deposit into 3 risk classes, get 3 different SPL tokens |
| Live Yield Source | L1 Origination + waterfall | A + B | USDC flows in, cascades down through Prime → Core → Alpha |
| Secondary Market | L6 Secondary Markets | C. Risk | Swap pPRIME ↔ USDC; price discovers premium/discount |
| Default + Loss Sim | L11 Default Resolution | B. Core | Click "Trigger Default" → Alpha NAV → 0, Core partial, Prime holds |
| Visual Dashboard | L14 Analytics | E. Surface | Real-time NAV bars, event log, tranche performance |
| (Bonus) Strategy Presets | L15 Strategy Auto | E. Surface | 3 buttons — Safe / Balanced / Aggressive |

---

## Next: Section 4 — Data Flow Diagrams

Sequence diagrams + account-state changes + dashboard rendering for: deposit, yield waterfall, default cascade, trade, withdraw. This becomes the storyboard for the demo video.
