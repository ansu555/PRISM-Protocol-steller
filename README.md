# PRISM Protocol - Documentation Index

Read this first.

This file is the orientation layer for coding agents, reviewers, and contributors entering the PRISM Protocol repo for the first time. It tells you what the project is, what is already locked, which docs matter, and where to look before changing code.

> **2026-05-28 — Hard pivot to Stellar in progress.** PRISM is migrating from Solana to Stellar (Soroban) targeting a Stellar Community Fund grant. Read [stellar-migration-plan.md](stellar-migration-plan.md) before touching contracts or chain-facing frontend code. The numbered architecture docs still apply to the financial model; chain-specific sections in them are obsolete during the migration window.

---

## One-Minute Context

PRISM Protocol is a Solana-based on-chain credit market built for the Solana Frontier Hackathon by Colosseum.

Users deposit USDC into one of three risk tranches:

- `Prime` - lowest-risk layer, paid first, absorbs losses last
- `Core` - intermediate risk and yield layer
- `Alpha` - 15% target-yield layer, first-loss capital

Borrower yield flows through a top-down waterfall:

```text
Prime -> Core -> Alpha
```

Credit losses move through a bottom-up cascade:

```text
Alpha -> Core -> Prime
```

Each tranche has its own SPL token:

```text
pPRIME
pCORE
pALPHA
```

Those tranche tokens trade on a constant-product AMM, so credit risk is not just held to maturity. It can be repriced by the market.

Pitch line:

> PRISM turns credit into programmable, tradable risk layers with live loss simulation and real-time market pricing.

---

## Current Repo State

The project is no longer just a design doc. It now contains:

- Public landing page and blog
- Dashboard simulation
- Admin route
- Borrower route
- IKA collateral flow
- Local IKA test oracle endpoint
- Two Anchor programs:
  - `prism_core`
  - `prism_amm`

Important routes:

| Route | Purpose |
|---|---|
| `/` | Public website |
| `/blog` | Essays and protocol research |
| `/dashboard` | Demo simulation surface |
| `/admin` | Demo admin setup and operations |
| `/borrower` | Loan application and IKA collateral onboarding |
| `/api/ika-test-oracle/attest` | Devnet/local oracle attestation endpoint |

---

## Mandatory Reading Order

Read these in order before making broad changes.

| Step | Doc | Why it matters |
|---|---|---|
| 1 | This file | Orientation and map |
| 2 | [stellar-migration-plan.md](stellar-migration-plan.md) | **Active pivot.** Stellar/Soroban migration plan — supersedes chain-specific sections of the numbered docs |
| 3 | [../README.md](../README.md) | Public repo README and quick start |
| 4 | [../CLAUDE.md](../CLAUDE.md) | Local coding conventions and project rules |
| 5 | [00-overview.md](00-overview.md) | Master architecture and locked decisions (financial model still authoritative) |
| 6 | [12-reference-card.md](12-reference-card.md) | Constants, demo numbers, errors, events (PDA tables obsolete during pivot) |
| 7 | [protocol_explained.md](protocol_explained.md) | Full financial and technical system explanation (chain-agnostic) |
| 8 | [before-mainnet.md](before-mainnet.md) | Demo shortcuts and production blockers (Solana-specific items obsolete) |

After this, read task-specific docs from the tables below.

---

## Fast Lookup

| Question | Read |
|---|---|
| What is PRISM in one page? | [00-overview.md](00-overview.md) |
| Why are we on Stellar and how do we get there? | [stellar-migration-plan.md](stellar-migration-plan.md) |
| What partners survive the pivot? | [stellar-migration-plan.md §5](stellar-migration-plan.md) |
| What gets deleted from the codebase? | [stellar-migration-plan.md §12](stellar-migration-plan.md) |
| What are the exact demo numbers? | [12-reference-card.md](12-reference-card.md) |
| How are contract addresses derived on Stellar? | [stellar-migration-plan.md §6.2](stellar-migration-plan.md) |
| How were PDAs derived (Solana, historical)? | [12-reference-card.md](12-reference-card.md) |
| How does NAV/waterfall/loss math work? | [protocol_explained.md](protocol_explained.md) |
| Which Anchor accounts does an instruction need? | [05-anchor-architecture.md](05-anchor-architecture.md), [09-lld-completion.md](09-lld-completion.md) |
| What changed in the IKA branch? | [contract-integration-progress.md](contract-integration-progress.md) |
| What is unsafe before mainnet? | [before-mainnet.md](before-mainnet.md) |
| How do we test this? | [testing.md](testing.md), [frontend_testing.md](frontend_testing.md) |
| What is the demo recording flow? | [13-demo-runbook.md](13-demo-runbook.md) |
| What is the side-track strategy? | [01-sidetrack-strategy.md](01-sidetrack-strategy.md) |

---

## Core Docs

| Doc | Purpose |
|---|---|
| [00-overview.md](00-overview.md) | Master index, pitch, architecture decisions |
| [01-sidetrack-strategy.md](01-sidetrack-strategy.md) | Hackathon side-track strategy |
| [02-domain-model.md](02-domain-model.md) | Entities, accounts, PDA model, tranche domain |
| [03-layered-architecture.md](03-layered-architecture.md) | Layered system view and partner integration map |
| [04-data-flows.md](04-data-flows.md) | User flows and demo sequence diagrams |
| [05-anchor-architecture.md](05-anchor-architecture.md) | Anchor instruction signatures and contexts |
| [06-mvp-build-plan.md](06-mvp-build-plan.md) | MVP priorities and build phases |
| [07-roadmap.md](07-roadmap.md) | Post-demo roadmap |
| [08-open-questions.md](08-open-questions.md) | Decision log and rationale |
| [09-lld-completion.md](09-lld-completion.md) | Low-level design completion reference |
| [10-scaffolding-day-1.md](10-scaffolding-day-1.md) | Original scaffolding plan |
| [11-setup-demo-script.md](11-setup-demo-script.md) | Demo setup script specification |
| [12-reference-card.md](12-reference-card.md) | Single-page implementation reference |
| [13-demo-runbook.md](13-demo-runbook.md) | Recording-day runbook |

---

## Newer Implementation Docs

| Doc | Purpose |
|---|---|
| [stellar-migration-plan.md](stellar-migration-plan.md) | **Active pivot.** Solana → Stellar (Soroban) migration: architecture, partner status, phases, SCF alignment, cut list |
| [protocol_explained.md](protocol_explained.md) | Complete system specification for developers and auditors |
| [contract-integration-progress.md](contract-integration-progress.md) | Contract, admin, borrower, and IKA integration progress |
| [before-mainnet.md](before-mainnet.md) | Production-readiness checklist and demo shortcuts |
| [ika-audit-2026-05-01.md](ika-audit-2026-05-01.md) | IKA-specific audit notes |
| [ika-frontend-test-plan.md](ika-frontend-test-plan.md) | IKA frontend testing plan |
| [frontend_testing.md](frontend_testing.md) | Frontend testing notes |
| [testing.md](testing.md) | General test strategy |

---

## Non-Negotiable Rules

These rules are repeated across the docs because breaking them causes expensive bugs.

1. Tier 1 behavior must stay correct:
   - deposit
   - yield waterfall
   - default cascade

2. Keep IDLs in sync after contract changes:
   - rebuild Anchor programs
   - update frontend IDL files
   - rerun the app build

3. Do not change locked demo numbers casually. Every USDC in the demo is part of the narrative.

4. Preserve the vault reserve invariant:

```text
vault_usdc_reserve.amount == sum(tranche.total_assets)
```

5. Losses move to the loss bucket. Do not silently delete accounting state.

6. Alpha wipeout is not a bug. It is the demo moment.

7. Demo keypairs and test oracles are devnet-only. Never treat them as production architecture.

---

## What Is Locked

Do not relitigate these unless the user explicitly asks:

- Three tranche model: Prime, Core, Alpha
- NAV-per-share accounting
- Q64.64 fixed-point math
- Separate `prism_core` and `prism_amm` programs
- Classic SPL tranche tokens
- Pull-pattern yield accrual
- Reverse-priority loss cascade
- Tokenless protocol stance through early phases
- Demo arc: setup, deposit, yield, trade, default, reprice, withdraw

Implementation details can change. The financial model should not drift.

---

## What You Can Change Freely

Without asking first, you can usually change:

- Component structure
- CSS and responsive layout
- Internal helper names
- Test scaffolding
- Local utility modules
- Copy that does not alter protocol meaning
- Non-contract UI states

Ask before changing:

- Contract account layout
- PDA seeds
- Demo constants
- Error semantics
- Tranche ordering
- Yield/loss priority
- Production safety assumptions

---

## Build And Verification

From repo root:

```bash
pnpm install
pnpm build
```

For local app development:

```bash
pnpm dev
```

For contract work:

```bash
cd contracts
anchor build
anchor test
```

If a build fails after IKA changes, first check whether these direct dependencies exist in `package.json`:

```text
@ika.xyz/sdk
@mysten/sui
```

The app imports `@mysten/sui/*` directly, so it must be a direct dependency, not only a transitive dependency.

---

## Mainnet Warning

Read [before-mainnet.md](before-mainnet.md) before any production claim.

Current demo shortcuts include:

- Client-side demo keypairs
- Admin demo signing
- Local IKA test oracle
- Devnet USDC
- Devnet program IDs
- Unfinalized IKA dWallet creation flow

This repo is hackathon/devnet infrastructure until those items are fixed and the contracts are audited.

---

## If You Are Lost

Use this sequence:

1. [12-reference-card.md](12-reference-card.md)
2. [protocol_explained.md](protocol_explained.md)
3. [contract-integration-progress.md](contract-integration-progress.md)
4. [before-mainnet.md](before-mainnet.md)
5. [09-lld-completion.md](09-lld-completion.md)

PRISM is simple when you keep the spine in mind:

```text
Deposit into risk layer
Yield waterfalls down
Losses cascade up
Tranche tokens trade
Markets reprice credit risk
```
