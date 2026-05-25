# PRISM Protocol — Day 1 Scaffolding

**Goal:** By end of Day 1 (April 26, 2026), the workspace is set up, both Anchor programs deploy to devnet, the Next.js app runs at `localhost:3000`, and wallet connect works.

This doc gives you exact file contents and the command sequence. Treat it as a paste-able recipe. Don't deviate without reason.

---

## 0. Prerequisites — install once, before Day 1

```bash
# Rust (1.75+)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup default stable

# Solana CLI (1.18.x)
sh -c "$(curl -sSfL https://release.solana.com/v1.18.17/install)"
solana --version  # should print 1.18.x

# Anchor CLI (0.30.1)
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install 0.30.1
avm use 0.30.1
anchor --version  # should print 0.30.1

# Node (20.x) and Yarn
# (use nvm or your preferred Node version manager)
node --version  # should print v20.x
yarn --version  # should print 1.22.x or later
```

If any of these fail, fix before proceeding. The plan assumes all four tools work.

---

## 1. Workspace tree (after Day 1 setup)

```
prism-protocol/
├── .gitignore
├── .env                          (gitignored — copy from .env.example, fill in)
├── .env.example
├── Anchor.toml
├── Cargo.toml                    (workspace root)
├── package.json                  (root, for tests + scripts)
├── tsconfig.json                 (root, for tests + scripts)
├── yarn.lock
├── docs/                         (already exists — design docs)
├── keys/                         (devnet wallet keypairs — committed)
│   ├── admin.json
│   ├── borrower.json
│   ├── lp_prime.json
│   ├── lp_core.json
│   ├── lp_alpha.json
│   └── mm.json
├── programs/
│   ├── prism-core/
│   │   ├── Cargo.toml
│   │   ├── Xargo.toml
│   │   └── src/
│   │       ├── lib.rs            (entrypoint)
│   │       ├── errors.rs
│   │       ├── state.rs
│   │       ├── events.rs
│   │       ├── pda.rs
│   │       ├── math/
│   │       │   ├── mod.rs
│   │       │   ├── q.rs
│   │       │   └── waterfall.rs
│   │       └── instructions/
│   │           ├── mod.rs
│   │           ├── initialize_global_config.rs
│   │           ├── initialize_vault.rs
│   │           ├── initialize_tranche.rs
│   │           ├── initialize_loan.rs
│   │           ├── deposit.rs
│   │           ├── withdraw.rs
│   │           ├── accrue_yield.rs
│   │           ├── trigger_credit_event.rs
│   │           ├── disburse_loan.rs
│   │           ├── repay_loan.rs
│   │           └── pause.rs
│   └── prism-amm/
│       ├── Cargo.toml
│       ├── Xargo.toml
│       └── src/
│           ├── lib.rs
│           ├── errors.rs
│           ├── state.rs
│           ├── events.rs
│           ├── pda.rs
│           └── instructions/
│               ├── mod.rs
│               ├── initialize_pool.rs
│               ├── add_liquidity.rs
│               ├── remove_liquidity.rs
│               └── swap.rs
├── tests/
│   ├── prism-core.ts             (filled in Day 3-5)
│   └── prism-amm.ts              (filled in Day 6)
├── scripts/
│   └── setup-demo.ts             (filled in Day 2 — see 11-setup-demo-script.md)
├── target/                       (gitignored)
└── app/
    ├── package.json
    ├── tsconfig.json
    ├── next.config.js
    ├── tailwind.config.ts
    ├── postcss.config.js
    ├── .eslintrc.json
    ├── public/
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx          (redirect to /dashboard)
        │   ├── globals.css
        │   ├── providers.tsx
        │   ├── dashboard/page.tsx
        │   ├── deposit/page.tsx
        │   ├── trade/page.tsx
        │   └── admin/page.tsx
        ├── components/
        ├── hooks/
        └── lib/
            ├── constants.ts
            ├── pda.ts
            ├── q64.ts
            ├── format.ts
            ├── demo-wallets.ts
            └── idl/
                ├── prism_core.json
                └── prism_amm.json
```

---

## 2. Root configuration files

### 2.1 `Anchor.toml`

```toml
[features]
seeds = false
skip-lint = false

[programs.devnet]
prism_core = "11111111111111111111111111111111"
prism_amm = "11111111111111111111111111111111"

# Note: replace placeholder program IDs with actual ones after first `anchor build`.
# Run: solana address -k target/deploy/prism_core-keypair.json

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet = "keys/admin.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"
setup = "yarn run ts-node scripts/setup-demo.ts"

[test]
startup_wait = 5000
```

### 2.2 Workspace `Cargo.toml`

```toml
[workspace]
members = [
    "programs/prism-core",
    "programs/prism-amm",
]
resolver = "2"

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1

[profile.release.build-override]
opt-level = 3
incremental = false
codegen-units = 1
```

### 2.3 Root `package.json`

```json
{
  "name": "prism-protocol",
  "version": "0.1.0",
  "private": true,
  "description": "PRISM Protocol — programmable credit infrastructure on Solana",
  "scripts": {
    "build": "anchor build",
    "test": "anchor test",
    "test:skip-build": "anchor test --skip-build",
    "deploy:devnet": "anchor deploy --provider.cluster devnet",
    "setup": "ts-node scripts/setup-demo.ts",
    "app:dev": "cd app && yarn dev",
    "app:build": "cd app && yarn build",
    "format": "prettier --write 'tests/**/*.ts' 'scripts/**/*.ts'",
    "idl:sync": "cp target/idl/*.json app/src/lib/idl/"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1",
    "@solana/spl-token": "^0.4.6",
    "@solana/web3.js": "^1.91.0",
    "bn.js": "^5.2.1",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "@types/bn.js": "^5.1.5",
    "@types/chai": "^4.3.11",
    "@types/mocha": "^10.0.6",
    "@types/node": "^20.11.0",
    "chai": "^4.4.1",
    "mocha": "^10.2.0",
    "prettier": "^3.2.0",
    "ts-mocha": "^10.0.0",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### 2.4 Root `tsconfig.json`

```json
{
  "compilerOptions": {
    "types": ["mocha", "chai"],
    "typeRoots": ["./node_modules/@types"],
    "lib": ["es2020"],
    "module": "commonjs",
    "target": "es2020",
    "esModuleInterop": true,
    "strict": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["scripts/**/*", "tests/**/*"]
}
```

### 2.5 `.env.example`

```bash
# Anchor / Solana
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
ANCHOR_WALLET=keys/admin.json

# Helius RPC (better reliability than public RPC)
HELIUS_API_KEY=your_helius_key_here
NEXT_PUBLIC_RPC_URL=https://devnet.helius-rpc.com/?api-key=your_helius_key_here

# Program IDs (filled after first deploy)
NEXT_PUBLIC_PRISM_CORE_PROGRAM_ID=
NEXT_PUBLIC_PRISM_AMM_PROGRAM_ID=

# Demo state
NEXT_PUBLIC_VAULT_ID=0

# USDC mint (Circle's official devnet USDC)
NEXT_PUBLIC_USDC_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU

# Switchboard (filled Day 12 after creating aggregator)
SWITCHBOARD_AGGREGATOR_PUBKEY=

# Cloak SDK (filled Day 13)
CLOAK_API_ENDPOINT=https://api.cloak.dev
```

### 2.6 `.gitignore`

```
# Build output
target/
dist/
.next/
out/

# Dependencies
node_modules/
.yarn/

# Environment
.env
!.env.example

# Solana
test-ledger/
.anchor/

# Editor
.vscode/
.idea/
*.swp
.DS_Store

# Logs
*.log
yarn-error.log
npm-debug.log

# DON'T gitignore keys/ — those are devnet keypairs and ARE committed.
# WARNING: Never use the keys in keys/ on mainnet.
```

---

## 3. `prism_core` Anchor program

### 3.1 `programs/prism-core/Cargo.toml`

```toml
[package]
name = "prism-core"
version = "0.1.0"
description = "PRISM Protocol — programmable credit engine"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "prism_core"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []
idl-build = ["anchor-lang/idl-build", "anchor-spl/idl-build"]

[dependencies]
anchor-lang = { version = "0.30.1", features = ["init-if-needed"] }
anchor-spl = "0.30.1"
```

### 3.2 `programs/prism-core/Xargo.toml`

```toml
[target.bpfel-unknown-unknown.dependencies.std]
features = []
```

### 3.3 `programs/prism-core/src/lib.rs` (skeleton)

```rust
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");
// Replace after first `anchor build` with the actual program ID from
// target/deploy/prism_core-keypair.json (run `solana address -k <path>`)

pub mod errors;
pub mod state;
pub mod events;
pub mod pda;
pub mod math;
pub mod instructions;

use instructions::*;

#[program]
pub mod prism_core {
    use super::*;

    pub fn initialize_global_config(
        ctx: Context<InitializeGlobalConfig>,
        default_yield_rate_bps: u16,
        oracle_allowlist: Vec<Pubkey>,
    ) -> Result<()> {
        instructions::initialize_global_config::handler(ctx, default_yield_rate_bps, oracle_allowlist)
    }

    pub fn initialize_vault(ctx: Context<InitializeVault>, vault_id: u32) -> Result<()> {
        instructions::initialize_vault::handler(ctx, vault_id)
    }

    pub fn initialize_tranche(
        ctx: Context<InitializeTranche>,
        kind: u8,
        target_apy_bps: u16,
    ) -> Result<()> {
        instructions::initialize_tranche::handler(ctx, kind, target_apy_bps)
    }

    pub fn initialize_loan(
        ctx: Context<InitializeLoan>,
        loan_id: u32,
        principal: u64,
        apr_bps: u16,
        maturity_ts: i64,
        borrower: Pubkey,
    ) -> Result<()> {
        instructions::initialize_loan::handler(ctx, loan_id, principal, apr_bps, maturity_ts, borrower)
    }

    pub fn deposit(ctx: Context<Deposit>, tranche_kind: u8, usdc_amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, tranche_kind, usdc_amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>, tranche_kind: u8, share_amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, tranche_kind, share_amount)
    }

    pub fn accrue_yield(ctx: Context<AccrueYield>, yield_amount: u64) -> Result<()> {
        instructions::accrue_yield::handler(ctx, yield_amount)
    }

    pub fn trigger_credit_event(
        ctx: Context<TriggerCreditEvent>,
        event_type: u8,
        loss_amount: u64,
        severity_bps: u16,
    ) -> Result<()> {
        instructions::trigger_credit_event::handler(ctx, event_type, loss_amount, severity_bps)
    }

    pub fn disburse_loan(ctx: Context<DisburseLoan>) -> Result<()> {
        instructions::disburse_loan::handler(ctx)
    }

    pub fn repay_loan(ctx: Context<RepayLoan>, amount: u64) -> Result<()> {
        instructions::repay_loan::handler(ctx, amount)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause_handler(ctx)
    }

    pub fn unpause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::unpause_handler(ctx)
    }
}
```

### 3.4 `programs/prism-core/src/errors.rs` (skeleton)

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum PrismError {
    #[msg("Vault is not in Active state")]
    VaultNotActive,
    #[msg("Vault is paused")]
    VaultPaused,
    #[msg("Invalid tranche kind")]
    InvalidTrancheKind,
    #[msg("Loan is not in expected state")]
    LoanInWrongState,
    #[msg("Insufficient liquidity in tranche")]
    InsufficientLiquidity,
    #[msg("Slippage exceeded — swap output below min_amount_out")]
    SlippageExceeded,
    #[msg("Unauthorized — caller is neither admin nor allowlisted oracle")]
    Unauthorized,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("NAV calculation: division by zero (empty tranche)")]
    EmptyTrancheNav,
    #[msg("CreditEvent severity exceeds 100% (10000 bps)")]
    InvalidSeverity,
    #[msg("Loss amount exceeds total vault assets")]
    LossExceedsTotalAssets,
    #[msg("Borrower account mismatch")]
    BorrowerMismatch,
    #[msg("Tranche has been wiped (NAV = 0); deposits blocked until reset")]
    TrancheWipedNoDepositsAllowed,
    #[msg("Switchboard feed value is older than freshness threshold")]
    OracleStale,
}
```

### 3.5 `programs/prism-core/src/state.rs` (skeleton)

```rust
use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub usdc_mint: Pubkey,
    pub default_yield_rate_bps: u16,
    pub paused: bool,
    #[max_len(8)]
    pub oracle_allowlist: Vec<Pubkey>,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub id: u32,
    pub usdc_mint: Pubkey,
    pub usdc_reserve: Pubkey,
    pub tranche_pdas: [Pubkey; 3],
    pub loan_pda: Pubkey,
    pub state: VaultState,
    pub total_deposits: u64,
    pub total_loaned: u64,
    pub last_yield_timestamp: i64,
    pub credit_event_seq: u32,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VaultState {
    Active,
    Defaulted,
    Resolved,
}

#[account]
#[derive(InitSpace)]
pub struct Tranche {
    pub vault: Pubkey,
    pub kind: TrancheKind,
    pub mint: Pubkey,
    pub target_apy_bps: u16,
    pub total_assets: u64,
    pub total_supply: u64,
    pub nav_per_share_q: u128,
    pub cumulative_yield: u64,
    pub cumulative_loss: u64,
    pub last_nav_update_ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum TrancheKind {
    Prime,
    Core,
    Alpha,
}

#[account]
#[derive(InitSpace)]
pub struct Loan {
    pub id: u32,
    pub vault: Pubkey,
    pub borrower: Pubkey,
    pub principal: u64,
    pub apr_bps: u16,
    pub origination_ts: i64,
    pub maturity_ts: i64,
    pub state: LoanState,
    pub total_repaid: u64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum LoanState {
    Originated,
    Active,
    Repaying,
    Defaulted,
    Resolved,
}

#[account]
#[derive(InitSpace)]
pub struct CreditEvent {
    pub vault: Pubkey,
    pub seq: u32,
    pub event_type: CreditEventType,
    pub loan: Pubkey,
    pub loss_amount: u64,
    pub recovery_amount: u64,
    pub severity_bps: u16,
    pub timestamp: i64,
    pub triggered_by: Pubkey,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CreditEventType {
    Default,
    PartialLoss,
    Recovery,
}
```

### 3.6 `programs/prism-core/src/instructions/mod.rs`

```rust
pub mod initialize_global_config;
pub mod initialize_vault;
pub mod initialize_tranche;
pub mod initialize_loan;
pub mod deposit;
pub mod withdraw;
pub mod accrue_yield;
pub mod trigger_credit_event;
pub mod disburse_loan;
pub mod repay_loan;
pub mod pause;

pub use initialize_global_config::*;
pub use initialize_vault::*;
pub use initialize_tranche::*;
pub use initialize_loan::*;
pub use deposit::*;
pub use withdraw::*;
pub use accrue_yield::*;
pub use trigger_credit_event::*;
pub use disburse_loan::*;
pub use repay_loan::*;
pub use pause::*;
```

### 3.7 Each instruction file (`programs/prism-core/src/instructions/<name>.rs`)

**Pattern: each file exports a `Context` struct + a `handler` function.** Day 1 just stubs them. Days 2–5 fill in the actual logic per [09-lld-completion.md §9.3 + §9.4](09-lld-completion.md).

Example skeleton — `deposit.rs`:

```rust
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::*;
use crate::errors::PrismError;

#[derive(Accounts)]
#[instruction(tranche_kind: u8, usdc_amount: u64)]
pub struct Deposit<'info> {
    // see 09-lld-completion.md §9.3.x for full context
    // ...
}

pub fn handler(ctx: Context<Deposit>, tranche_kind: u8, usdc_amount: u64) -> Result<()> {
    // see 09-lld-completion.md §9.4 deposit handler pseudocode
    // Day 1: return Ok(()) — implement Day 3
    Ok(())
}
```

Repeat the same shape for the other 10 instructions. Day 1 just gets the workspace compiling.

### 3.8 `programs/prism-core/src/math/mod.rs`

```rust
pub mod q;
pub mod waterfall;
```

### 3.9 `programs/prism-core/src/math/q.rs`

Copy the Q64.64 helper module from [09-lld-completion.md §9.1](09-lld-completion.md). Day 1 commits the full module — it's referenced by tests and handlers throughout.

### 3.10 `programs/prism-core/src/events.rs`

Copy event schemas from [09-lld-completion.md §9.5](09-lld-completion.md) and [12-reference-card.md §4](12-reference-card.md).

### 3.11 `programs/prism-core/src/pda.rs`

Mirror the TS PDA helpers from [12-reference-card.md §2.1](12-reference-card.md) in Rust.

---

## 4. `prism_amm` Anchor program

### 4.1 `programs/prism-amm/Cargo.toml`

Identical structure to prism-core's Cargo.toml — replace `prism-core` with `prism-amm`.

### 4.2 `programs/prism-amm/src/lib.rs` (skeleton)

```rust
use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

pub mod errors;
pub mod state;
pub mod events;
pub mod pda;
pub mod instructions;

use instructions::*;

#[program]
pub mod prism_amm {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>, fee_bps: u16) -> Result<()> {
        instructions::initialize_pool::handler(ctx, fee_bps)
    }

    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        tranche_amount: u64,
        quote_amount: u64,
        min_lp_out: u64,
    ) -> Result<()> {
        instructions::add_liquidity::handler(ctx, tranche_amount, quote_amount, min_lp_out)
    }

    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_amount: u64,
        min_tranche_out: u64,
        min_quote_out: u64,
    ) -> Result<()> {
        instructions::remove_liquidity::handler(ctx, lp_amount, min_tranche_out, min_quote_out)
    }

    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        min_amount_out: u64,
        direction: u8,
    ) -> Result<()> {
        instructions::swap::handler(ctx, amount_in, min_amount_out, direction)
    }
}
```

The four instruction files follow the same skeleton pattern as prism-core's.

---

## 5. Frontend (Next.js app)

### 5.1 `app/package.json`

```json
{
  "name": "prism-app",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1",
    "@solana/spl-token": "^0.4.6",
    "@solana/wallet-adapter-base": "^0.9.23",
    "@solana/wallet-adapter-react": "^0.15.35",
    "@solana/wallet-adapter-react-ui": "^0.9.35",
    "@solana/wallet-adapter-wallets": "^0.19.32",
    "@solana/web3.js": "^1.91.0",
    "@tanstack/react-query": "^5.20.0",
    "bn.js": "^5.2.1",
    "framer-motion": "^11.0.0",
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-countup": "^6.5.0",
    "react-dom": "^18.2.0",
    "react-hot-toast": "^2.4.1"
  },
  "devDependencies": {
    "@types/bn.js": "^5.1.5",
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.1.0",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3"
  }
}
```

### 5.2 `app/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "es2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### 5.3 `app/next.config.js`

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.externals = [
      ...(config.externals || []),
      { 'utf-8-validate': 'commonjs utf-8-validate', bufferutil: 'commonjs bufferutil' },
    ];
    return config;
  },
};

module.exports = nextConfig;
```

### 5.4 `app/tailwind.config.ts`

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        prime: "#0EA5E9",   // sky-500 — stable blue
        core:   "#F59E0B",   // amber-500 — risk amber
        alpha: "#EF4444",   // red-500 — high risk
        positive: "#10B981", // emerald-500 — for PnL gains
        negative: "#DC2626", // red-600 — for PnL losses
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
```

### 5.5 `app/postcss.config.js`

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### 5.6 `app/src/app/globals.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 9 9 11;       /* zinc-950 */
  --foreground: 244 244 245;  /* zinc-100 */
}

body {
  background: rgb(var(--background));
  color: rgb(var(--foreground));
}
```

### 5.7 `app/src/app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "PRISM Protocol",
  description: "Programmable, tradable risk layers on Solana",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### 5.8 `app/src/app/providers.tsx`

```tsx
"use client";

import { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter, BackpackWalletAdapter } from "@solana/wallet-adapter-wallets";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";

import "@solana/wallet-adapter-react-ui/styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchInterval: 3000, staleTime: 2000 },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new BackpackWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            {children}
            <Toaster position="top-right" />
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

### 5.9 `app/src/app/page.tsx`

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

### 5.10 `app/src/app/dashboard/page.tsx` (Day 1 stub)

```tsx
"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function DashboardPage() {
  return (
    <main className="min-h-screen p-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">PRISM Protocol</h1>
        <WalletMultiButton />
      </header>
      <p className="text-zinc-400">Dashboard coming Day 7. Wallet connect verified Day 1.</p>
    </main>
  );
}
```

### 5.11 `app/src/lib/constants.ts`

```typescript
import { PublicKey } from "@solana/web3.js";

export const PRISM_CORE_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PRISM_CORE_PROGRAM_ID ?? "11111111111111111111111111111111",
);
export const PRISM_AMM_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PRISM_AMM_PROGRAM_ID ?? "11111111111111111111111111111111",
);
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ?? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
export const VAULT_ID = Number(process.env.NEXT_PUBLIC_VAULT_ID ?? "0");

// Math constants — mirror Rust
export const Q64_SHIFT = 64n;
export const Q64_ONE = 1n << 64n;
export const MIN_LIQUIDITY = 1_000n;
export const DEFAULT_FEE_BPS = 30;
export const BPS_DENOMINATOR = 10_000;

// Tranche kinds
export enum TrancheKind {
  Prime = 0,
  Core = 1,
  Alpha = 2,
}

export const TRANCHE_LABEL: Record<TrancheKind, string> = {
  [TrancheKind.Prime]: "Prime",
  [TrancheKind.Core]: "Core",
  [TrancheKind.Alpha]: "Alpha",
};

export const TRANCHE_COLOR: Record<TrancheKind, string> = {
  [TrancheKind.Prime]: "prime",
  [TrancheKind.Core]: "core",
  [TrancheKind.Alpha]: "alpha",
};
```

### 5.12 `app/src/lib/pda.ts`

Copy the full TS PDA helper module from [12-reference-card.md §2.1](12-reference-card.md).

### 5.13 `app/src/lib/idl/` (empty on Day 1, populated after first `anchor build`)

```bash
# After anchor build completes:
cp target/idl/prism_core.json app/src/lib/idl/
cp target/idl/prism_amm.json app/src/lib/idl/
```

This is the IDL sync rule from [CLAUDE.md](CLAUDE.md). Run after every contract change.

---

## 6. Wallet keypairs (`keys/`)

### 6.1 Generate them

```bash
mkdir -p keys
solana-keygen new --no-bip39-passphrase --silent --outfile keys/admin.json
solana-keygen new --no-bip39-passphrase --silent --outfile keys/borrower.json
solana-keygen new --no-bip39-passphrase --silent --outfile keys/lp_prime.json
solana-keygen new --no-bip39-passphrase --silent --outfile keys/lp_core.json
solana-keygen new --no-bip39-passphrase --silent --outfile keys/lp_alpha.json
solana-keygen new --no-bip39-passphrase --silent --outfile keys/mm.json
```

### 6.2 Add a `keys/README.md` warning

```markdown
# DEVNET KEYPAIRS — DO NOT USE ON MAINNET

These keypairs are committed to the public repo for hackathon reproducibility.
They control devnet USDC and SOL only — both worthless outside development.

If you fork this project, **regenerate these keys before deploying anywhere
that handles real value**.
```

### 6.3 Fund them (devnet)

```bash
# Admin gets 5 SOL for deploys + ops
solana airdrop 5 -k keys/admin.json --url devnet
# Plus get more if rate-limited:
solana airdrop 2 -k keys/admin.json --url devnet

# Each demo wallet gets 0.5 SOL for fees
for wallet in borrower lp_prime lp_core lp_alpha mm; do
  solana airdrop 0.5 -k keys/$wallet.json --url devnet
done

# Devnet USDC: faucet at https://faucet.circle.com — repeat until each wallet
# has the amount listed in 12-reference-card.md §1.5.
# (Day 1: optional — only needed when the setup script runs in Day 2.)
```

---

## 7. Day 1 command sequence

Run these in order. Each step has a verification before moving on.

```bash
# 1. Initialize Anchor workspace (one-time, in parent dir)
anchor init prism-protocol --no-git
cd prism-protocol

# 2. Replace generated files with the contents from §2 of this doc
#    (Anchor.toml, Cargo.toml, package.json, tsconfig.json, .env.example, .gitignore)
#    Initialize git
git init
git add .
git commit -m "chore: initial Anchor scaffolding"

# 3. Replace programs/ with structure from §3 and §4
#    Add the second program (prism-amm) since Anchor only generates one by default:
mkdir -p programs/prism-amm/src/instructions
mkdir -p programs/prism-core/src/{instructions,math}
# Paste all the file contents from §3 and §4

# 4. Generate keypairs (§6.1)
mkdir -p keys
solana-keygen new --no-bip39-passphrase --silent --outfile keys/admin.json
# ... (rest of §6.1)
solana config set --keypair keys/admin.json --url devnet

# 5. Fund admin
solana airdrop 5 -k keys/admin.json --url devnet
solana balance -k keys/admin.json --url devnet  # should show ~5 SOL

# 6. Build both programs
anchor build
# This generates target/deploy/prism_core-keypair.json + prism_amm-keypair.json

# 7. Get the actual program IDs
solana address -k target/deploy/prism_core-keypair.json
solana address -k target/deploy/prism_amm-keypair.json

# 8. Update Anchor.toml [programs.devnet] section with the real IDs
# 9. Update declare_id!("...") in both src/lib.rs files
# 10. Rebuild
anchor build

# 11. Deploy to devnet
anchor deploy --provider.cluster devnet
# Check the deployed addresses match what's in Anchor.toml + declare_id!

# 12. Sync IDLs to frontend
mkdir -p app/src/lib/idl
cp target/idl/prism_core.json app/src/lib/idl/
cp target/idl/prism_amm.json app/src/lib/idl/

# 13. Set up Next.js app
cd app
yarn create next-app . --typescript --tailwind --eslint --app --no-src-dir=false --import-alias='@/*'
# Replace generated files with §5 contents

# 14. Install deps
yarn install

# 15. Copy .env.example → .env, fill in HELIUS_API_KEY and the program IDs from §11
cp ../.env.example .env  # adjust paths
# (or set env vars in app/.env.local)

# 16. Run dev server
yarn dev

# 17. Open http://localhost:3000
#     Verify: page loads, "Connect Wallet" button works with Phantom on devnet
```

---

## 8. Day 1 Definition of Done

Check each box before declaring Day 1 complete:

- [ ] `anchor build` passes with no warnings on either program
- [ ] `solana address -k target/deploy/prism_core-keypair.json` returns the address now in `declare_id!()` and `Anchor.toml`
- [ ] `anchor deploy --provider.cluster devnet` succeeds for both programs (visible in `solana logs` output and on Solana Explorer for devnet)
- [ ] IDLs copied to `app/src/lib/idl/prism_core.json` and `prism_amm.json`
- [ ] `cd app && yarn dev` starts cleanly on port 3000
- [ ] http://localhost:3000 → redirects to /dashboard, page renders, no console errors
- [ ] Click "Select Wallet" → Phantom popup appears → connect → wallet address shows in the button
- [ ] Phantom is on Solana devnet (settings → developer mode → cluster = devnet)
- [ ] All 6 wallet keypairs in `keys/` exist and `keys/README.md` warning is committed
- [ ] All admin wallet has ≥3 SOL on devnet (`solana balance -k keys/admin.json --url devnet`)
- [ ] First commit pushed to `main` with message `feat(scaffold): Day 1 — programs deploy, app connects wallet`

---

## 9. Common Day 1 problems

| Symptom | Likely cause | Fix |
|---|---|---|
| `anchor build` fails: "ProgramId mismatch" | `declare_id!` doesn't match the keypair address | Run `solana address -k target/deploy/X-keypair.json`, paste into `declare_id!` and `Anchor.toml`, rebuild |
| `anchor deploy` fails: "Insufficient funds" | Admin wallet < ~3 SOL | `solana airdrop 5 -k keys/admin.json --url devnet`, retry |
| `anchor deploy` fails: "RPC rate limited" | Public devnet RPC throttling | Set `ANCHOR_PROVIDER_URL` to Helius devnet endpoint |
| Frontend: "Cannot find module @/lib/..." | Path alias not configured | Check `app/tsconfig.json` `paths` field |
| Frontend: hydration mismatch on wallet | SSR running wallet code | Ensure `providers.tsx` has `"use client"` directive |
| Frontend: "Buffer is not defined" | Browser polyfill missing | Add to `next.config.js` (already in §5.3) |
| Phantom doesn't connect | Phantom is on mainnet | Phantom settings → developer mode on → cluster devnet |

---

## 10. What's next (Day 2)

Day 2 starts implementing actual handlers. Reference:
- [09-lld-completion.md §9.4](09-lld-completion.md) — handler pseudocode for all instructions
- [09-lld-completion.md §9.3](09-lld-completion.md) — full Anchor contexts
- [11-setup-demo-script.md](11-setup-demo-script.md) — `scripts/setup-demo.ts` spec

Day 2 goal per [06-mvp-build-plan.md](06-mvp-build-plan.md): all 5 init instructions (`config`, `vault`, `tranche` × 3, `loan`) plus the setup script that exercises them. DoD: a single `yarn setup` call creates a fully-initialized vault with 3 tranches and a loan on devnet.
