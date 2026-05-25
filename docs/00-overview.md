# PRISM Protocol — Master Index

**Project:** PRISM Protocol — full-stack on-chain credit infrastructure on Solana
**Submission target:** Solana Frontier Hackathon (Colosseum) — deadline May 11, 2026
**Status:** Design phase complete. Build phase starts April 26, 2026.

---

## The pitch in one line

> *"PRISM Protocol turns credit into programmable, tradable risk layers — with live loss simulation and real-time market pricing."*

---

## What we're building

A credit vault on Solana with three risk tranches (Prime / Core / Alpha), a yield waterfall that distributes coupon income across them, a default cascade that absorbs losses bottom-up, an AMM for trading tranche tokens (`pPRIME` / `pCORE` / `pALPHA`), and a live dashboard showing all of it in real time.

Five hero features for the demo:

1. **Tranche Vault** — 3 SPL tokens, NAV-per-share accounting
2. **Live Yield Source** — pull-pattern waterfall distribution
3. **Secondary AMM** — constant-product swaps for tranche tokens
4. **Default + Loss Simulation** — the dramatic cascade (the demo's hero moment)
5. **Visual Dashboard** — animated NAV bars, event ticker, AMM price chart

Plus 6th feature: **Strategy presets** (Safe / Balanced / Aggressive) for one-click allocation.

---

## Stack (locked)

| Layer | Choice |
|---|---|
| Smart contracts | **Anchor** (Rust) |
| Chain | **Solana Devnet** (mainnet target Phase 1.5) |
| Frontend | **Next.js + TypeScript + Tailwind** |
| Wallet | **Solana Wallet Adapter** (Phantom / Backpack) |
| SDK | **`@solana/web3.js` + `@coral-xyz/anchor`** |
| Tokens | **Classic SPL tokens** for tranches |
| Two programs | `prism_core` (credit engine) + `prism_amm` (market layer) — separated for blast-radius isolation |

---

## Side track strategy (locked — one build, multiple prize pools)

| Priority | Track | Prize ceiling |
|---|---|---|
| Primary | **Encrypt + Ika** | $10K (RFP literally describes credit infra) |
| Secondary | **Cloak** | $5K (batch disbursement = waterfall payout) |
| Free-roll | **Dune SIM** | $6K plan (analytics dashboard) |
| India regional | **Dodo Payments** | $5K (if Day 14 has slack) |
| Default | **Frontier main pool** | $30K Grand + $10K × 20 |

**Explicitly skipped:** Eitherway, Tether QVAC, Torque, Zerion, MagicBlock, SNS, La Familia, Umbra (overlaps with Cloak).

---

## Locked decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **NAV-per-share model** for tranches | Clean waterfall logic, secondary market trivial, dramatic demo visuals |
| 2 | **Single loan, parameterized seed** for demo | Simplicity; design narrative supports N |
| 3 | **Default trigger:** admin button + Switchboard oracle | Admin = fast demo; oracle = pitch credibility |
| 4 | **Classic SPL tokens** for tranches | Cloak handles privacy at cash-flow layer |
| 5 | **Per-tranche-asset** loss math (not per-share) | Matches NAV model, avoids precision bugs |
| 6 | **Separate AMM Anchor program** | AMM bug ≠ vault failure; modular pitch |
| 7 | **Q64.64 fixed-point** for NAV; 6-decimal USDC | Avoids rounding loss in waterfall |
| 8 | **Admin-simulated borrower** in v1 | Iterate without integration blocker; Ika dWallet plug-in for v2 |
| 9 | **Pull pattern** for `accrue_yield` | Visible borrower→vault USDC flow in one tx |
| 10 | **Admin-only LP** for AMM in MVP | Saves UI work; "permissionless in production" pitch line |
| 11 | **Tokenless through Phase 2** | Clarity > optionality; insurance backstop possibly at Phase 3 |
| 12 | **Demo length: 2:30 max** | Faster = sharper; default cascade gets the longest segment (40s) |
| 13 | **Demo flow:** Setup → Deposit → Yield → Trade #1 → DEFAULT → Trade #2 → Withdraw | Dual-trade structure proves "markets understand risk" |

---

## Document index

| # | Document | Purpose |
|---|---|---|
| 00 | [00-overview.md](00-overview.md) | This file. Master index |
| 01 | [01-sidetrack-strategy.md](01-sidetrack-strategy.md) | Side track shortlist with rationale |
| 02 | [02-domain-model.md](02-domain-model.md) | Entities, accounts, PDA seeds, NAV-per-share spine |
| 03 | [03-layered-architecture.md](03-layered-architecture.md) | 15 layers grouped into 5 domains; partner integration map; pitch deck strategy |
| 04 | [04-data-flows.md](04-data-flows.md) | Sequence diagrams + dashboard storyboard for all 5 user flows + demo arc |
| 05 | [05-anchor-architecture.md](05-anchor-architecture.md) | Instruction signatures, account contexts, error enum, CPI patterns |
| 06 | [06-mvp-build-plan.md](06-mvp-build-plan.md) | MVP slice + 16-day day-by-day plan + Tier 1/2/3 priorities + Day 5 checkpoint |
| 07 | [07-roadmap.md](07-roadmap.md) | Phase 1 → 1.5 → 2 → 3 vision; locked tokenless stance |
| 08 | [08-open-questions.md](08-open-questions.md) | Live log of hand-waved gaps + recommended resolutions |
| 09 | [09-lld-completion.md](09-lld-completion.md) | Closes the LLD gap to 100% — all contexts, handler pseudocode, helpers, tests, frontend tree, partner SDK patterns |
| 10 | [10-scaffolding-day-1.md](10-scaffolding-day-1.md) | Exact files, commands, dependency versions for Day 1 — paste-ready |
| 11 | [11-setup-demo-script.md](11-setup-demo-script.md) | Full TS spec for `scripts/setup-demo.ts` — idempotent, vault_id-parameterized |
| 12 | [12-reference-card.md](12-reference-card.md) | Single-page lookup: constants, PDAs, errors, events, demo wallets, glossary |
| 13 | [13-demo-runbook.md](13-demo-runbook.md) | Day 15 recording day script — second-by-second take guide + fallbacks |
| — | [README.md](README.md) | Agent-oriented entry point — read first |
| — | [CLAUDE.md](CLAUDE.md) | Coding conventions, do's/don'ts, anti-patterns |

---

## What ships at the end of 16 days

**Code**
- 2 Anchor programs deployed to devnet
- 11 instructions in `prism_core`, 4 in `prism_amm`
- 3 SPL mints (`pPRIME`, `pCORE`, `pALPHA`)
- Next.js dashboard with live NAV bars, swap UI, default trigger, strategy presets
- 4 partner integrations: Switchboard, Cloak, Dune SIM, (stretch) Ika

**Submissions**
- Frontier main hackathon
- Encrypt + Ika side track (primary)
- Cloak side track
- Dune SIM side track
- Dodo Payments (Superteam India regional)

**Pitch artifacts**
- 2:30 demo video
- Pitch deck with 2-slide architecture story (system + partners overlay)
- Public README + GitHub repo

---

## Critical rules (do not break)

1. **Tier 1 must work perfectly** — deposit, yield waterfall, default cascade. If these fail, you lose
2. **Day 5 is a hard checkpoint** — Tier 1 working in CLI/script form, even without UI. Safety net for recording
3. **IDL sync after every contract change** — `anchor build && anchor idl parse` and commit
4. **Demo recording deadline: Day 15** — Day 16 is for submitting only
5. **Don't drop a higher tier for a lower one** — strategy presets never come before NAV math working

---

## Day 1 starts April 26, 2026

The design phase is complete. Time to build.
