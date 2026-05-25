# PRISM Protocol — Frontier Hackathon Side Track Strategy

**Hackathon:** Solana Frontier (Colosseum), Apr 6 → May 11, 2026
**Decision date:** Apr 25, 2026 (~16 days remaining)
**Strategy:** One codebase, multiple prize pools. Each side track must extend a hero feature already being built — no track adds new product surface.

 
---

## TL;DR

| Priority | Track | Top prize | Rationale |
|---|---|---|---|
| Primary | **Encrypt + Ika** | $10,000 | RFP literally describes credit infra: "multi-chain lending with BTC/RWA collateral" + "encrypted strategy vaults" |
| Secondary | **Cloak** | $5,000 | Batch disbursement primitive *is* the tranche waterfall. Has Claude Code skills → fast integration |
| Free-roll | **Dune SIM** | $6,000 plan | One API call powers the analytics dashboard |
| Conditional | **Dodo Payments** | $5,000 | Only if Superteam India eligible |
| Default | **Frontier main pool** | $30K Grand + $10K × 20 | Same submission qualifies |

**Realistic prize ceiling:** $10K + $5K + $6K + main pool potential = serious ROI on a 16-day build.

---

## Tier S — Primary submission

### Encrypt + Ika ($10K / $3K / $1K / $500 / $500)

**Why this is the primary target.** Their RFP reads like it was written for PRISM:

> *"Multi-chain lending, allowing assets like Bitcoin or RWAs from any chain as collateral for loans on Solana"*
> *"Encrypted strategy vaults"*
> *"Fully confidential DeFi applications for private trading and lending at scale"*

**Hybrid submission plan (use both technologies):**

- **Ika (dWallets / MPC / 2PC-MPC)** — powers cross-chain collateral. A borrower posts BTC via Ika dWallets; PRISM tranche vault on Solana underwrites the loan. This directly addresses the "where does real credit demand come from" problem from the original problem statement.
- **Encrypt (FHE / REFHE)** — powers confidential tranche allocations. Investor positions stay private but waterfall logic still executes correctly. Optional: encrypt loan health so the **"Trigger Default"** moment becomes a real cryptographic reveal — not an admin button.

**Risk hedge:** Build Ika first. If Encrypt FHE proves too slow to integrate by week 2, ship Ika-only and the demo still works.

**Submission constraints:** Devnet acceptable (Encrypt + Ika are themselves pre-mainnet).

---

## Tier A — Secondary submission

### Cloak ($5K / $3K / $2K)

**Why pick Cloak.** Their **batch disbursement primitive** is structurally identical to a tranche waterfall payout — fan a single shielded transaction out to many recipients with confidential amounts. Live on mainnet today. They ship Claude Code slash commands:

```
npx @cloak.dev/claude-skills
```

This installs `/cloak-shield`, `/cloak-send`, `/cloak-pay`, `/cloak-swap` — integration in hours, not days.

**Pitch frame:** *"Institutional credit cash flows can't be public — every coupon payment is permanently indexed on a public ledger. PRISM uses Cloak so LP payouts stay confidential while remaining auditable via viewing keys."*

**Why not Umbra:** Same problem space, no Claude Code tooling, redundant. Pick Cloak.

---

## Tier B — Cheap adds (≤1 day each)

### Dune SIM ($6K Enterprise plan)

One endpoint call → real-time tranche performance + default-rate dashboard data. Almost free to integrate. Free-roll prize.

### Dodo Payments ($5K / $3K / $2K) — conditional

Only worth pursuing if Superteam India eligible (their judging is regional). Pitch: stablecoin on-ramp for borrowers, fits the "real yield from real economic activity" thesis.

### Covalent GoldRush — alternative to Dune SIM

Pick one, not both. Dune SIM has clearer pricing prize.

---

## Tier F — Skip

| Track | Reason |
|---|---|
| **Eitherway** ($5K Grand) | Requires building on their no-code platform — incompatible with custom Anchor program |
| **Tether QVAC** ($10K bonus) | Local AI doesn't fit credit infrastructure naturally; integration would feel forced |
| **Torque** ($1.5K) | Growth/loyalty primitives — not credit logic |
| **Zerion CLI** ($2.5K) | Trading agents — off-thesis |
| **MagicBlock** ($2.5K) | Adds Ephemeral Rollup runtime — too much cognitive overhead for 16 days |
| **SNS** ($1.8K) | Identity is a phase-2 concept; small prize ceiling |
| **La Familia** ($5K) | Spain-only — only if eligible |

---

## How this folds back into the system design

The original problem statement defined 15 layers. Two of them dissolve into side track integrations:

- **Layer 7 (Cross-Chain Liquidity)** → Ika dWallets handle this. We don't build the bridge primitive; we wire to it.
- **Layer 10 (Credit Identity)** → Encrypt FHE handles confidential borrower data. We don't build privacy primitives; we wire to them.

This makes the system design **more credible**, not less, because we're standing on real infrastructure instead of hand-waving in slides.

---

## Open questions

1. Region for regional track eligibility (India? Spain? UAE? Nigeria?)
2. Encrypt+Ika hybrid (use both) vs Ika-only — defaulting to *commit hybrid, build Ika-first* unless told otherwise
3. Whether to apply to Cloak's Claude Code skill installation early to learn their SDK surface before committing
