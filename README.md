# PRISM Protocol

Programmable credit markets on Stellar.

PRISM turns credit exposure into transparent, tradable risk layers. Users deposit USDC into Prime, Core, or Alpha tranches, receive tranche tokens, and watch yield, losses, and secondary-market prices update on-chain.

> Credit should not live inside opaque balance sheets. PRISM makes risk explicit, programmable, and market-priced.

---

## What PRISM Is

PRISM Protocol is a full-stack Stellar credit-market demo built on the Soroban smart contract platform.

It combines:

- A Soroban credit engine, `prism_core`
- A separate Soroban AMM, `prism_amm`
- Stellar asset tranche tokens: `pPRIME`, `pCORE`, `pALPHA`
- A Next.js dashboard for deposits, yield, defaults, AMM exits, and simulation
- Borrower and admin flows for collateral experiments
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
  -> Stellar asset token
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
| `/borrower` | Borrower application and collateral flow |
| `/api/waitlist` | Waitlist API |

---

## Architecture

```text
soroban/
  prism-core/       credit engine, tranches, loans, collateral, waterfall
  prism-amm/        constant-product tranche markets

app/
  (app)/              dashboard, admin, borrower routes
  blog/               public articles
  api/                waitlist routes
  lib/                constants, program builders, Stellar client

components/
  landing/            public website
  app-shell/          dashboard shell
  simulation/         demo action panels and vault state views
  admin/              admin setup panel
  borrower/           loan application and collateral onboarding

docs/
  README.md           documentation index
```

Two-contract design:

| Contract | Responsibility |
|---|---|
| `prism_core` | Vaults, tranches, NAV, loans, yield, losses, collateral |
| `prism_amm` | Secondary markets for tranche tokens |

The separation is intentional: an AMM bug should not become a credit-engine failure.

---

## Tech Stack

| Layer | Stack |
|---|---|
| Chain | Stellar testnet (Soroban) |
| Contracts | Soroban / Rust |
| Tokens | Stellar assets (SAC) |
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS |
| Wallets | Freighter / Stellar wallet kit |
| Data | React Query |
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
NEXT_PUBLIC_STELLAR_RPC_URL=
NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=
NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID=
NEXT_PUBLIC_PRISM_AMM_CONTRACT_ID=
NEXT_PUBLIC_VAULT_ID=0
NEXT_PUBLIC_USDC_ASSET=
```

Optional infrastructure variables:

```bash
DATABASE_URL=
```

Do not put production secret keys in frontend env variables.

---

## Contract Work

Soroban contracts live under `soroban/`.

Common commands:

```bash
cd soroban
stellar contract build
stellar contract test
```

After contract changes:

1. Rebuild Soroban contracts.
2. Regenerate/update contract bindings.
3. Sync frontend contract files.
4. Re-run `pnpm build` from repo root.

Contract binding drift is one of the fastest ways to break the frontend.

---

## Important Demo Numbers

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

## Documentation Map

Start here:

- [docs/README.md](docs/README.md) - documentation index
- [docs/00-overview.md](docs/00-overview.md) - master architecture overview
- [docs/12-reference-card.md](docs/12-reference-card.md) - constants, demo numbers

---

## Production Warning

This repository contains demo-oriented code.

Before mainnet:

- Remove client-side demo keypairs.
- Move admin signing to real wallets or multisig.
- Re-deploy contracts with production upgrade authority.
- Update asset codes and contract IDs.
- Audit all contracts.

Do not use this code with real funds without a full security review.

---

## Status

PRISM is currently a testnet build with a working full-stack demo surface on Stellar's Soroban platform.

The goal is not to ship another lending app.

The goal is to prove a primitive:

> A continuous, liquid market for credit risk.
