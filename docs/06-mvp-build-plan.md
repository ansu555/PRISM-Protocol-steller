# PRISM Protocol — MVP Slice & 16-Day Build Plan (Section 6)

**Today:** April 25, 2026 (Day 0 / planning).
**Deadline:** May 11, 2026.
**Working days:** 16.
**Region:** India (eligible for Superteam India tracks including Dodo Payments).

---

## 6.1 The MVP slice — what ships, who powers it

| # | Hero feature | Design layer | Built by us | Partner integration | Demo beat |
|---|---|---|---|---|---|
| 1 | **Tranche Vault** (3 tranches, NAV-per-share) | L2 Structured Credit | `prism_core`: Vault + Tranche × 3 + SPL mints | — | Deposit phase |
| 2 | **Live yield source** (pull-pattern waterfall) | L1 Origination + L11 | `accrue_yield` + waterfall math | Switchboard (oracle path) | Yield phase |
| 3 | **Secondary AMM** (pTRANCHE ↔ USDC) | L6 Secondary Markets | `prism_amm`: 3 pools, swap, admin LP | — | Trade #1, Trade #2 |
| 4 | **Default + Loss Sim** (cascade) | L11 Default Resolution | `trigger_credit_event` + cascade animation | Switchboard (event attestation) | The 40-second moment |
| 5 | **Visual dashboard** (NAV bars, ticker, AMM chart, **Before/After snapshot panel, User PnL view**) | L14 Analytics | Next.js + Tailwind | Dune SIM (event indexing) | Throughout demo |
| 6 | **Strategy presets** (Safe / Balanced / Aggressive) | L15 Strategy Auto | 3 buttons → multi-deposit tx | — | Deposit phase shortcut |

Plus **Cloak** for confidential coupon distribution (off-chain, frontend) and **Ika** for cross-chain borrower (stretch).

---

## 6.2 Hard priority tiers (THIS IS LOAD-BEARING — DO NOT BREAK)

If the build slips, cut from the bottom up. Never sacrifice a higher tier for a lower one.

### 🥇 Tier 1 — Must work perfectly

If these fail, the demo fails.

1. `deposit` — USDC in, pTRANCHE out, NAV correct
2. `accrue_yield` — pull pattern, waterfall distributes correctly
3. `trigger_credit_event` — cascade in correct order, NAVs update

### 🥈 Tier 2 — Demo power

If Tier 1 works but these don't, the demo is muted but salvageable.

4. AMM `swap` — pTRANCHE ↔ USDC
5. Dashboard NAV bars — live, animated on yield/default

### 🥉 Tier 3 — Nice-to-have

If time runs out, drop these without grief.

6. Strategy presets
7. Dune SIM event indexing
8. Cloak shielded payout
9. Switchboard oracle path
10. Ika dWallet borrower
11. Encrypt FHE borrower scoring
12. Dodo Payments fiat onramp (India regional bonus)

---

## 6.3 Team setup paths

### 2-person split (recommended)

| Role | Owns | Days |
|---|---|---|
| **Contracts engineer** | `prism_core`, `prism_amm`, tests, deploy scripts | Days 1–6 lead, integration support 7–14 |
| **Frontend engineer** | Next.js dashboard, wallet, all UI flows, animations, demo recording | Days 1–2 setup parallel, intensive 7–15 |

Parallelization unlocks Phase 2 (UI) starting Day 7 while contracts engineer pivots to AMM and integrations.

### Solo path (adjusted plan)

If solo:
- **70% time on contracts**
- UI = minimal but clean (no fancy animations beyond cascade)
- Drop Tier 3 items 6–12 aggressively
- Focus rule: *make Tier 1 work perfectly before any UI polish*

---

## 6.4 Day-by-day plan

### Phase 1 — Contract foundation (Days 1–5)

| Day | Date | Goal | Definition of Done |
|---|---|---|---|
| 1 | Apr 26 | Scaffold Anchor + Next.js, deploy empty `prism_core` to devnet, wallet connect | Empty program deploys, frontend connects Phantom |
| 2 | Apr 27 | All account structs + 5 init instructions (`config`, `vault`, `tranche` × 3, `loan`) | Init script creates a vault with 3 tranches + 3 SPL mints on devnet |
| 3 | Apr 28 | NAV math (Q64.64), `deposit`, `withdraw` + tests | Deposit USDC → get pTRANCHE; burn → get USDC. NAV holds at 1.0 |
| 4 | Apr 29 | Waterfall math, `accrue_yield` (pull pattern) + tests | After yield, all 3 NAVs tick up by §4.3 expected values |
| 5 | Apr 30 | `trigger_credit_event` with 3 event types + tests + **MINI DEMO CHECKPOINT** | Default test → Alpha NAV→0, Core partial, Prime unchanged |

#### ★ Day 5 Mini Demo Checkpoint ★

**By end of Day 5, must be able to record a CLI / script-only demo of deposit → yield → default.**

This is the safety net. If everything else breaks later — UI bugs, wallet issues, frontend crashes — you can still ship a video showing the core engine works using just `anchor test` output or a TypeScript script narrating each step. Not pretty. But submittable.

```typescript
// Example fallback demo script
await deposit(prime, 1000_000_000)   // 1000 USDC
await deposit(core,   1000_000_000)
await deposit(alpha, 1000_000_000)
console.log("NAVs:", await navsOf(vault))
await accrueYield(60_000_000)          // 60 USDC yield
console.log("After yield:", await navsOf(vault))
await triggerDefault(2500_000_000)     // 2500 USDC loss
console.log("After default:", await navsOf(vault))
```

If you record this with voiceover, you have a viable submission.

### Phase 2 — Frontend + e2e (Days 6–10)

| Day | Date | Goal | Definition of Done |
|---|---|---|---|
| 6 | May 1 | `prism_amm`: pool init, admin LP, swap + tests | Admin seeds pool, swap works in tests |
| 7 | May 2 | Frontend foundation: pages, IDL generation, layout | Dashboard route renders with mock data |
| 8 | May 3 | Deposit + withdraw flows in UI | User deposits / withdraws via UI; balances update |
| 9 | May 4 | Live NAV bars + event ticker on dashboard | NAV bars show on-chain data, update after yield |
| 10 | May 5 | AMM swap UI + price chart + "Market vs NAV" annotation | Swap executes, price updates, premium/discount shown |

**Phase 2 DoD:** End-to-end demo arc works on devnet manually — minus polish.

### Phase 3 — Hero polish + partners (Days 11–13)

| Day | Date | Goal | Definition of Done |
|---|---|---|---|
| 11 | May 6 | Default cascade animation + Strategy presets + **presentation polish** (Before/After snapshot panel, User PnL view, killer-sentence overlay) | Click "Trigger Default" → 6-frame storyboard from §4.5 plays (cascade → Before/After panel → User PnL panel). Click Safe → 3-deposit tx |
| 12 | May 7 | Switchboard integration | Default fires from a Switchboard feed (not just admin). Pitch credibility unlocked |
| 13 | May 8 | Cloak SDK + Dune SIM | Coupon payouts route through `/cloak-pay`. Dashboard reads from Dune webhook |

### Phase 4 — Stretch + polish (Days 14–15)

| Day | Date | Goal | Definition of Done |
|---|---|---|---|
| 14 | May 9 | **Stretch:** Ika dWallet as borrower • bug bash • copy polish • Dodo Payments add (if time) | Full demo runs clean on devnet from a fresh wallet, twice |
| 15 | May 10 | Pitch deck + demo video recording (HARD DEADLINE) | 2:30 video recorded, deck final, README done |

### Phase 5 — Submission (Day 16)

| Day | Date | Goal |
|---|---|---|
| 16 | May 11 | Submit to **Frontier (Colosseum)** + **Encrypt+Ika** + **Cloak** + **Dune SIM** + **Dodo Payments** (India regional). Final test of links |

---

## 6.5 Operational rules (non-negotiable)

1. **IDL sync after every contract change.** Run `anchor build && anchor idl parse` and commit the IDL file. Frontend type drift is the #1 wasted-time trap.
2. **No "understand everything first."** Get `deposit` working end-to-end in 1 day, then iterate. Don't read the entire Anchor book.
3. **Frontend stays simple.** Fetch → display, click → transaction. No Redux, no fancy state. React Query + Anchor IDL is enough.
4. **Test the cascade math 8+ ways.** Q64.64 rounding bugs are silent killers. Hardcode expected NAVs from §4.3 / §4.5 in tests.
5. **Demo recording deadline: Day 15, not Day 16.** Day 16 is for submitting + bug fixes only. Anyone recording on submission day is gambling.

---

## 6.6 Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Anchor learning curve (first time) | High | +2–3 days on Phase 1 | Days 1–2 are budgeted as scaffolding/learning. Use Anchor examples. Ship `deposit` first |
| Q64.64 math bugs | Medium | Default cascade looks wrong | Tests in Phase 1 days 3–5; hardcode expected values |
| Frontend ↔ Anchor IDL drift | Medium | Wasted hours fighting types | Rule #1 above; commit IDL after every build |
| Switchboard devnet feed unstable | Medium | Demo path dies | Admin button is fallback; record using admin if needed |
| Ika SDK pre-mainnet bugs | High | Stretch dies | Already in stretch slot; degrades to mock |
| Demo recording on submission day | High | No video, no submission | **Hard rule: record by Day 15** |
| All UI breaks Day 14–15 | Low | Demo dead | Day 5 CLI checkpoint is the safety net — record a script demo if needed |

---

## 6.7 Submission targets (final list)

| Track | Submit | Prize ceiling |
|---|---|---|
| **Frontier (Colosseum main)** | Always | $30K Grand + $10K × 20 |
| **Encrypt + Ika side track** | Always (primary) | $10K |
| **Cloak side track** | If Day 13 ships | $5K |
| **Dune SIM side track** | Cheap; always | $6K plan |
| **Dodo Payments (Superteam India)** | India eligible — apply if Day 14 has slack | $5K |
| **Regional tracks** | None other relevant | — |

---

## Next: Section 7 — Roadmap

The "what's next" slide for the pitch deck. Phase 1 (shipped at Frontier) → Phase 1.5 (30-day survivability) → Phase 2 (3–6 months) → Phase 3 (institutional).
