# PRISM Protocol

Programmable credit markets on Solana.

PRISM turns credit exposure into transparent, tradable risk layers. Users deposit USDC into Prime, Core, or Alpha tranches, receive tranche tokens, and watch yield, losses, and secondary-market prices update on-chain.

> Credit should not live inside opaque balance sheets. PRISM makes risk explicit, programmable, and market-priced.

---

## What PRISM Is

PRISM Protocol is a full-stack Solana credit-market demo built for the Solana Frontier Hackathon by Colosseum.

It combines:


- An Anchor credit engine, `prism_core`
- A separate Anchor AMM, `prism_amm`
- SPL tranche tokens: `pPRIME`, `pCORE`, `pALPHA`
- A Next.js dashboard for deposits, yield, defaults, AMM exits, and simulation
- Borrower and admin flows for IKA-backed collateral experiments
- A public marketing site and blog for the protocol narrative

The system models a credit vault where capital is pooled, split into risk layers, and repriced through live market activity.

---

## The Core Idea

Traditional credit is huge, but it is still hard to inspect, price, and trade.

Most credit systems ask:

> Which borrower do you trust?

PRISM asks:

> How much risk do you want to take?

Instead of tokenizing every loan into a fragmented market, PRISM pools credit and tokenizes the risk stack.

```text
Credit pool
  -> Prime tranche   lowest risk, paid first, absorbs losses last
  -> Core tranche    balanced risk and yield
  -> Alpha tranche   15% target yield, first-loss capital

Each tranche
  -> NAV accounting
  -> SPL token
  -> AMM market
  -> live price discovery
```

Yield flows top-down:

```text
Prime -> Core -> Alpha
```

Losses flow bottom-up:

```text
Alpha -> Core -> Prime
```

No hidden accounting. No vague risk bucket. The waterfall is the product.

---

## Demo Flow

The live demo is designed around one clear credit-market story:

1. Initialize a vault with three tranche mints.
2. Deposit USDC into Prime, Core, or Alpha.
3. Accrue borrower yield.
4. Distribute yield through the waterfall.
5. Trade tranche tokens on the AMM.
6. Trigger a credit event.
7. Watch Alpha absorb losses first, Core absorb remaining losses, and Prime remain protected.
8. Watch the market reprice risk through AMM exits.

The hero moment:

```text
Losses do not disappear.
They move.
```

---

## Product Surfaces

| Route | Purpose |
|---|---|
| `/` | Public landing page |
| `/blog` | Protocol essays and research notes |
| `/dashboard` | Live vault simulation and action panel |
| `/admin` | Demo admin setup and protocol operations |
| `/borrower` | Borrower application and IKA collateral flow |
| `/api/waitlist` | Waitlist API |
| `/api/ika-test-oracle/attest` | Local/devnet IKA test oracle endpoint |

---

## Architecture

```text
contracts/
  programs/
    prism-core/       credit engine, tranches, loans, collateral, waterfall
    prism-amm/        constant-product tranche markets

app/
  (app)/              dashboard, admin, borrower routes
  blog/               public articles
  api/                waitlist and IKA test oracle routes
  lib/                constants, IDLs, PDA helpers, program builders, IKA client

components/
  landing/            public website
  app-shell/          dashboard shell
  simulation/         demo action panels and vault state views
  admin/              admin setup panel
  borrower/           loan application and collateral onboarding

docs/
  README.md           documentation index, read this first
  00-overview.md      master architecture index
  12-reference-card.md constants, PDA seeds, demo numbers, error codes
```

Two-program design:

| Program | Responsibility |
|---|---|
| `prism_core` | Vaults, tranches, NAV, loans, yield, losses, IKA collateral |
| `prism_amm` | Secondary markets for tranche tokens |

The separation is intentional: an AMM bug should not become a credit-engine failure.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Chain | Solana devnet |
| Contracts | Anchor / Rust |
| Tokens | Classic SPL tokens |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS |
| Wallets | Solana Wallet Adapter |
| Data | React Query |
| IKA integration | `@ika.xyz/sdk`, `@mysten/sui` |
| Database | Postgres for waitlist storage |

---

## Quick Start

Install dependencies:

```bash
pnpm install
```

Create local env:

```bash
cp .env.example .env.local
```

Run the app:

```bash
pnpm dev
```

Open:

```text
http://localhost:3000
```

Build production:

```bash
pnpm build
```

---

## Environment

Minimum frontend variables:

```bash
NEXT_PUBLIC_RPC_URL=
NEXT_PUBLIC_PRISM_CORE_PROGRAM_ID=
NEXT_PUBLIC_PRISM_AMM_PROGRAM_ID=
NEXT_PUBLIC_VAULT_ID=0
NEXT_PUBLIC_USDC_MINT=
```

Optional IKA/demo variables:

```bash
NEXT_PUBLIC_IKA_ORACLE_URL=http://localhost:3000/api/ika-test-oracle
NEXT_PUBLIC_IKA_FULLNODE_URL=https://fullnode.testnet.ika.xyz
NEXT_PUBLIC_IKA_NETWORK=testnet
```

Optional infrastructure variables:

```bash
DATABASE_URL=
HELIUS_API_KEY=
SWITCHBOARD_AGGREGATOR_PUBKEY=
CLOAK_API_ENDPOINT=https://api.cloak.dev
```

Do not put production private keys in frontend env variables.

---

## Contract Work

Anchor lives under `contracts/`.

Common commands:

```bash
cd contracts
anchor build
anchor test
```

After contract changes:

1. Rebuild Anchor programs.
2. Regenerate/update IDLs.
3. Sync frontend IDL files in `app/lib/idl/`.
4. Re-run `pnpm build` from repo root.

IDL drift is one of the fastest ways to break the frontend.

---

## Important Demo Numbers

Locked demo constants live in [docs/12-reference-card.md](docs/12-reference-card.md).

Key values:

| Item | Value |
|---|---:|
| Initial demo vault TVL | 19,500 USDC |
| Yield event | 100 USDC |
| Default loss | 6,500 USDC |
| Prime target APY | 5% |
| Core target APY | 8% |
| Alpha target APY | 15% |
| AMM fee | 30 bps |

The default scenario is designed so Alpha gets wiped, Core takes a visible hit, and Prime stays protected.

---

## IKA Collateral Flow

PRISM includes an experimental IKA integration for cross-chain collateral.

Borrower flow:

1. Borrower applies for a loan.
2. Borrower attaches an IKA dWallet ID.
3. Test oracle signs an attestation.
4. `verify_ika_collateral` verifies the oracle signature through Solana's Ed25519 precompile.
5. Collateral status moves from `Pending` to `Locked`.
6. Admin can disburse the loan once collateral is locked.

This is demo infrastructure. Read [docs/before-mainnet.md](docs/before-mainnet.md) before treating any of it as production-ready.

---

## Documentation Map

Start here:

- [docs/README.md](docs/README.md) - documentation index for coding agents
- [docs/00-overview.md](docs/00-overview.md) - master architecture overview
- [docs/12-reference-card.md](docs/12-reference-card.md) - constants, PDAs, demo numbers
- [docs/protocol_explained.md](docs/protocol_explained.md) - complete system explanation
- [docs/contract-integration-progress.md](docs/contract-integration-progress.md) - IKA and contract integration notes
- [docs/before-mainnet.md](docs/before-mainnet.md) - production safety checklist

For contract work:

- [docs/05-anchor-architecture.md](docs/05-anchor-architecture.md)
- [docs/09-lld-completion.md](docs/09-lld-completion.md)
- [docs/testing.md](docs/testing.md)

For demo and submission:

- [docs/01-sidetrack-strategy.md](docs/01-sidetrack-strategy.md)
- [docs/13-demo-runbook.md](docs/13-demo-runbook.md)
- [docs/ika-audit-2026-05-01.md](docs/ika-audit-2026-05-01.md)

---

## Production Warning

This repository contains demo-oriented code.

Before mainnet:

- Remove client-side demo keypairs.
- Disable or replace the local IKA test oracle.
- Move admin signing to real wallets or multisig.
- Re-deploy programs with production upgrade authority.
- Update USDC mint and program IDs.
- Audit all contracts.
- Read [docs/before-mainnet.md](docs/before-mainnet.md).

Do not use this code with real funds without a full security review.

---

## Status

PRISM is currently a devnet hackathon build with a working full-stack demo surface and ongoing IKA collateral integration.

The goal is not to ship another lending app.

The goal is to prove a primitive:

> A continuous, liquid market for credit risk.
