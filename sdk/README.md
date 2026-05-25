# prismprotocol-sdk

TypeScript SDK for the PRISM Protocol credit engine and AMM on Solana.

Bundles Anchor IDLs, deployed program addresses, PDA derivation helpers, math
constants, error types, and TypeScript types — the same modules the official
PRISM frontend uses, packaged for reuse.

## Install

```bash
bun add prismprotocol-sdk @coral-xyz/anchor @solana/web3.js @solana/spl-token
# or
pnpm add prismprotocol-sdk @coral-xyz/anchor @solana/web3.js @solana/spl-token
```

`@coral-xyz/anchor`, `@solana/web3.js`, and `@solana/spl-token` are peer
dependencies — your app pins one shared version across all Solana modules.

## Quick look

```ts
import {
  PRISM_CORE_PROGRAM_ID,
  TrancheKind,
  USDC_MINT,
  Q64_ONE,
  buildPrograms,
  getConfigPda,
  getVaultPda,
  getTranchePda,
  getVaultReservePda,
} from 'prismprotocol-sdk';
import { Connection, Keypair } from '@solana/web3.js';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const signer = Keypair.generate();

const { core } = buildPrograms(connection, signer);

const [config]  = getConfigPda();
const [vault]   = getVaultPda(0);
const [primeT]  = getTranchePda(vault, TrancheKind.Prime);
const [reserve] = getVaultReservePda(vault);

const tranche = await core.account.tranche.fetchNullable(primeT);
const navUsdc = tranche
  ? Number((tranche.navPerShareQ.toBigInt() * 1_000_000n) / Q64_ONE) / 1_000_000
  : 0;

console.log({ vault: vault.toBase58(), primeT: primeT.toBase58(), navUsdc });
```

## What's included

### Program identifiers

```ts
import { PRISM_CORE_PROGRAM_ID, PRISM_AMM_PROGRAM_ID } from 'prismprotocol-sdk';
```

Resolve to the deployed devnet addresses. Override with environment variables
`PRISM_CORE_PROGRAM_ID` / `PRISM_AMM_PROGRAM_ID` (or the `NEXT_PUBLIC_`
prefixed equivalents in Next.js).

### IDL bundles

```ts
import { prismCoreIdl, prismAmmIdl } from 'prismprotocol-sdk';
// or, from the dedicated subpath (saves ~80 KB if you only need PDAs elsewhere):
import { prismCoreIdl, prismAmmIdl } from 'prismprotocol-sdk/idl';
```

### Tokens

```ts
import { USDC_MINT, USDC_DECIMALS, USDC_BASE_UNITS } from 'prismprotocol-sdk';
```

### Tranche enum

```ts
import { TrancheKind } from 'prismprotocol-sdk';

TrancheKind.Prime  // 0 — paid first, absorbs losses last
TrancheKind.Core   // 1 — intermediate
TrancheKind.Alpha  // 2 — paid last, first-loss
```

### Math constants

```ts
import {
  Q64_ONE,           // 1n << 64n
  USDC_BASE_UNITS,   // 1_000_000n
  BPS_DENOMINATOR,   // 10_000
  MIN_LIQUIDITY,     // 1_000n
  DEFAULT_FEE_BPS,   // 30
  MAX_FEE_BPS,       // 1_000
  SECONDS_PER_YEAR,  // 31_536_000
} from 'prismprotocol-sdk';
```

### PDA helpers

Fifteen helpers cover every program-derived address PRISM uses:

```ts
import {
  getConfigPda,             // ["config2"]
  getVaultPda,              // ["vault", id]
  getTranchePda,            // ["tranche", vault, kind]
  getTrancheMintPda,        // ["mint", vault, kind]
  getVaultReservePda,       // ["reserve", vault]
  getLossBucketPda,         // ["loss_bucket", vault]
  getLoanPda,               // ["loan", vault, loan_id]
  getCreditEventPda,        // ["credit_event", vault, seq]
  getIkaCollateralPda,      // ["ika_collateral_v2", loan]
  getEncryptHealthPda,      // ["encrypt_health", loan]
  getCloakPayoutPda,        // ["cloak_payout", vault]
  getPoolPda,               // ["amm", tranche_mint]
  getPoolTrancheReservePda, // ["amm_tranche", tranche_mint]
  getPoolQuoteReservePda,   // ["amm_quote", tranche_mint]
  getLpMintPda,             // ["amm_lp", tranche_mint]
} from 'prismprotocol-sdk';
```

Every helper returns `[PublicKey, number]` — the address and the canonical
bump. The bump is precomputed and stable; you can cache it.

### Program factory

```ts
import { buildPrograms } from 'prismprotocol-sdk';

const { core, amm, provider } = buildPrograms(connection, signer);
```

For browser apps using a wallet adapter, build the provider yourself with
`useAnchorWallet()` from `@solana/wallet-adapter-react` instead.

### Formatting & utility helpers

```ts
import {
  toBigInt, parseUsdc, formatUsdc, formatBaseUnits,
  formatNavQ, shortKey, delta, stateName, getNetworkName,
} from 'prismprotocol-sdk';

parseUsdc('1,250.50');         // 1_250_500_000n
formatUsdc(1_250_500_000n);    // "1,250.500000"
formatNavQ(Q64_ONE);            // "1.000000"
stateName({ active: {} });      // "active"
```

### Errors

`prism_core` defines 29 typed errors, `prism_amm` defines 5:

```ts
import { PrismCoreError, PrismAmmError } from 'prismprotocol-sdk';

PrismCoreError.VaultPaused                    // 6001
PrismCoreError.TrancheWipedNoDepositsAllowed  // 6012
PrismCoreError.OracleSignatureInvalid         // 6015
PrismAmmError.SlippageExceeded                // 6001
```

#### Decoding errors

```ts
import { decodeAnchorError } from 'prismprotocol-sdk';

try {
  await core.methods.deposit(kind, amount).accounts({ /* ... */ }).rpc();
} catch (raw) {
  const decoded = decodeAnchorError(raw);
  if (decoded?.kind === 'core' && decoded.error === 'TrancheWipedNoDepositsAllowed') {
    // direct user to a different tranche
  } else {
    throw raw;
  }
}
```

### TypeScript types

```ts
import type { PrismCore, PrismAmm } from 'prismprotocol-sdk';
import type { Program } from '@coral-xyz/anchor';

const core: Program<PrismCore> = /* ... */;
const tranche = await core.account.tranche.fetch(primeTranchePda);
```

## Compatibility

| Runtime                     | Status                                                         |
| --------------------------- | -------------------------------------------------------------- |
| Node 20+                    | ✅ Server scripts, indexers, oracles                            |
| Browser (modern)            | ✅ Wallet-adapter integrations, Next.js, Vite                   |
| React Native                | ⚠️ Read paths work; signing needs platform wallet adapter      |
| Cloudflare Workers / Edge   | ⚠️ Read paths work; some Anchor utilities pull Buffer polyfills |

The SDK is published as dual ESM + CommonJS with TypeScript declarations.

## Tree-shaking

Only the helpers you import end up in your bundle. The IDL JSON sits behind a
dedicated `/idl` subpath to keep PDA-only consumers small:

```ts
// ✅ A few KB of PDA helpers + types
import { getVaultPda, TrancheKind } from 'prismprotocol-sdk';

// ⚠️ Pulls the full IDL JSON (~80 KB) — fine for app code, avoid in shared libs
import { prismCoreIdl } from 'prismprotocol-sdk';
```

## Versioning

PRISM is currently a hackathon-stage devnet build. Pin the SDK to an exact
version in `package.json` (no `^` or `~`) until mainnet ships.

| Change                              | SDK version bump          |
| ----------------------------------- | ------------------------- |
| Program redeploy with new ID        | Major (0.x → 1.x)         |
| New instruction or account field    | Minor (1.0 → 1.1)         |
| Bug fix in a helper, doc fix        | Patch (1.0.0 → 1.0.1)     |
| Breaking change to IDL layout       | Major                     |

## Development

```bash
pnpm install
pnpm build       # dual ESM + CJS, generates .d.ts
pnpm typecheck   # tsc --noEmit
pnpm dev         # watch mode
```
