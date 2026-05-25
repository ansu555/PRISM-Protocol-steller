# PRISM Protocol — Setup Demo Script

**File:** `scripts/setup-demo.ts`

**Purpose:** Bring a fresh devnet deployment to "ready for demo recording" state in one command.

**Runs:** `yarn setup` (or `ts-node scripts/setup-demo.ts [--vault-id N] [--skip-yield]`)

**Idempotency:** Each step checks if the target account exists. If yes → skip. If no → run. Safe to re-run after partial failures.

---

## 1. What the script produces

After successful run with `vault_id = 0`:

| State | Verifiable via |
|---|---|
| `GlobalConfig` PDA exists with admin = keys/admin.json pubkey | `solana account <config_pda>` |
| `Vault[0]` PDA exists, state = Active, USDC reserve + loss bucket initialized | `solana account <vault_pda>` |
| 3 Tranches initialized: Prime (5% APY), Core (8%), Alpha (15%) | `program.account.tranche.fetch(...)` |
| 3 SPL mints exist (`pPRIME`, `pCORE`, `pALPHA`), authority = Tranche PDA | SPL token CLI: `spl-token display <mint>` |
| 1 Loan PDA exists, borrower = keys/borrower.json | `program.account.loan.fetch(...)` |
| LP wallets hold pTRANCHE balances per [12-reference-card.md §1.4](12-reference-card.md) | `spl-token balance --owner <lp_pubkey>` |
| MM wallet holds 2,000 pALPHA + 500 pCORE for Trade #2 | Same |
| Admin wallet holds 5,000 pPRIME + 1,000 pCORE + 1,000 pALPHA (for AMM seed) | Same |
| 3 AMM pools initialized with seeded liquidity per [12-reference-card.md §1.4](12-reference-card.md) | `program.account.ammPool.fetch(...)` |
| Vault has accrued 1 yield event of 100 USDC over 30 days (simulated via timestamp manipulation OR pre-cooked state) | NAV bars show post-yield values matching [04-data-flows.md §4.3](04-data-flows.md) |

**Total runtime:** ~30 seconds on devnet (12 init txs + 9 deposit txs + 3 AMM seeds + 1 yield).

---

## 2. CLI args + env

```typescript
// scripts/setup-demo.ts header

import { Command } from "commander";

const program = new Command()
  .option("--vault-id <id>", "vault ID to use (per §8.22)", "0")
  .option("--skip-yield", "skip the simulated yield event at the end")
  .option("--reset", "fail if state already exists (don't be idempotent)")
  .parse(process.argv);

const opts = program.opts();
const VAULT_ID = parseInt(opts.vaultId, 10);
const SKIP_YIELD = !!opts.skipYield;
const RESET_MODE = !!opts.reset;
```

Pull RPC + admin keypair from `.env` (see `.env.example` in [10-scaffolding-day-1.md §2.5](10-scaffolding-day-1.md)).

---

## 3. Top-level structure

```typescript
async function main() {
  const ctx = await loadContext();           // §4
  await ensureSolBalances(ctx);              // §5.1 — airdrop SOL if needed
  await ensureUsdcBalances(ctx);             // §5.2 — pre-flight check, prints faucet URL
  await initializeGlobalConfig(ctx);         // §6.1 — idempotent
  await initializeVault(ctx);                // §6.2 — idempotent
  await initializeTranches(ctx);             // §6.3 — idempotent (3 calls)
  await initializeLoan(ctx);                 // §6.4 — idempotent
  await runDeposits(ctx);                    // §7 — LP + MM + admin deposits
  await initializeAmmPools(ctx);             // §8 — idempotent (3 calls)
  await seedAmmLiquidity(ctx);               // §9 — admin add_liquidity × 3
  if (!SKIP_YIELD) await simulateYieldEvent(ctx);   // §10
  await printSummary(ctx);                   // §11 — final state report
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Each step prints `[step N/12] description... done` so progress is visible.

---

## 4. Context (loaded once)

```typescript
interface SetupContext {
  connection: Connection;
  provider: AnchorProvider;
  programs: {
    core: Program<PrismCore>;
    amm: Program<PrismAmm>;
  };
  wallets: {
    admin: Keypair;
    borrower: Keypair;
    lpPrime: Keypair;
    lpCore: Keypair;
    lpAlpha: Keypair;
    mm: Keypair;
  };
  vaultId: number;
  usdcMint: PublicKey;
  pdas: {
    config: PublicKey;
    vault: PublicKey;
    tranches: { prime: PublicKey; core: PublicKey; alpha: PublicKey };
    trancheMints: { prime: PublicKey; core: PublicKey; alpha: PublicKey };
    loan: PublicKey;
    vaultUsdcReserve: PublicKey;
    lossBucket: PublicKey;
    ammPools: { prime: PublicKey; core: PublicKey; alpha: PublicKey };
  };
}

async function loadContext(): Promise<SetupContext> {
  const connection = new Connection(process.env.ANCHOR_PROVIDER_URL!, "confirmed");

  const admin = loadKeypair("keys/admin.json");
  const provider = new AnchorProvider(connection, new Wallet(admin), { commitment: "confirmed" });
  anchor.setProvider(provider);

  const core = workspace.PrismCore as Program<PrismCore>;
  const amm  = workspace.PrismAmm  as Program<PrismAmm>;

  const wallets = {
    admin,
    borrower:  loadKeypair("keys/borrower.json"),
    lpPrime:  loadKeypair("keys/lp_prime.json"),
    lpCore:    loadKeypair("keys/lp_core.json"),
    lpAlpha:  loadKeypair("keys/lp_alpha.json"),
    mm:        loadKeypair("keys/mm.json"),
  };

  // Derive all PDAs once
  const [config]   = getConfigPda();
  const [vault]    = getVaultPda(VAULT_ID);
  const [trancheS] = getTranchePda(vault, TrancheKind.Prime);
  // ... (all PDAs derived per 12-reference-card.md §2.1)

  return {
    connection, provider, programs: { core, amm },
    wallets, vaultId: VAULT_ID,
    usdcMint: new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT!),
    pdas: { config, vault, tranches: { prime: trancheS, ... }, ... },
  };
}
```

---

## 5. Pre-flight checks

### 5.1 SOL balances

Each wallet needs SOL for transaction fees. Auto-airdrop if low:

```typescript
async function ensureSolBalances(ctx: SetupContext) {
  const minSol = 0.5 * LAMPORTS_PER_SOL;
  const adminMinSol = 3 * LAMPORTS_PER_SOL; // admin pays for inits

  for (const [name, kp] of Object.entries(ctx.wallets)) {
    const balance = await ctx.connection.getBalance(kp.publicKey);
    const needed = name === "admin" ? adminMinSol : minSol;
    if (balance < needed) {
      console.log(`[airdrop] ${name}: ${balance / LAMPORTS_PER_SOL} → topping up`);
      const sig = await ctx.connection.requestAirdrop(kp.publicKey, needed);
      await ctx.connection.confirmTransaction(sig, "confirmed");
    }
  }
}
```

### 5.2 USDC balances

Devnet USDC can't be airdropped programmatically (Circle's faucet requires browser). Print instructions if low:

```typescript
async function ensureUsdcBalances(ctx: SetupContext) {
  const required = {
    admin:    7_000_000_000n,   // 7,000 USDC for AMM seed
    borrower: 10_000_000_000n,  // 10,000 USDC for yield
    lpPrime:  5_000_000_000n,
    lpCore:    3_000_000_000n,
    lpAlpha:  2_000_000_000n,
    mm:        2_500_000_000n,
  };

  let missing: string[] = [];
  for (const [name, needed] of Object.entries(required)) {
    const ata = await getAssociatedTokenAddress(ctx.usdcMint, ctx.wallets[name].publicKey);
    const balance = await getAccountBalance(ctx.connection, ata).catch(() => 0n);
    if (balance < needed) {
      missing.push(`  ${name}: has ${formatUsdc(balance)}, needs ${formatUsdc(needed)}`);
    }
  }

  if (missing.length > 0) {
    console.error(`USDC balances insufficient. Visit https://faucet.circle.com and fund:`);
    missing.forEach(m => console.error(m));
    console.error(`Then re-run this script.`);
    process.exit(1);
  }
}
```

---

## 6. Initialization steps (idempotent)

### 6.1 Initialize global config

```typescript
async function initializeGlobalConfig(ctx: SetupContext) {
  const existing = await ctx.programs.core.account.globalConfig.fetchNullable(ctx.pdas.config);
  if (existing) {
    console.log("[step 1/12] config already exists — skipping");
    return;
  }
  if (RESET_MODE) throw new Error("config exists and --reset specified");

  await ctx.programs.core.methods
    .initializeGlobalConfig(
      0,              // default_yield_rate_bps (unused — yield comes via accrue_yield calls)
      [],             // oracle_allowlist (Switchboard added Day 12)
    )
    .accounts({
      admin: ctx.wallets.admin.publicKey,
      config: ctx.pdas.config,
      usdcMint: ctx.usdcMint,
      systemProgram: SystemProgram.programId,
    })
    .signers([ctx.wallets.admin])
    .rpc({ commitment: "confirmed" });

  console.log("[step 1/12] initialize_global_config done");
}
```

### 6.2 Initialize vault

```typescript
async function initializeVault(ctx: SetupContext) {
  const existing = await ctx.programs.core.account.vault.fetchNullable(ctx.pdas.vault);
  if (existing) {
    console.log("[step 2/12] vault already exists — skipping");
    return;
  }

  await ctx.programs.core.methods
    .initializeVault(ctx.vaultId)
    .accounts({
      admin: ctx.wallets.admin.publicKey,
      config: ctx.pdas.config,
      vault: ctx.pdas.vault,
      usdcMint: ctx.usdcMint,
      vaultUsdcReserve: ctx.pdas.vaultUsdcReserve,
      lossBucket: ctx.pdas.lossBucket,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .signers([ctx.wallets.admin])
    .rpc({ commitment: "confirmed" });

  console.log("[step 2/12] initialize_vault done");
}
```

### 6.3 Initialize tranches (3 calls)

```typescript
async function initializeTranches(ctx: SetupContext) {
  const params = [
    { kind: TrancheKind.Prime, apy: 500, label: "prime" },
    { kind: TrancheKind.Core,   apy: 800,  label: "core" },
    { kind: TrancheKind.Alpha, apy: 1500, label: "alpha" },
  ];

  for (const p of params) {
    const tranchePda = ctx.pdas.tranches[p.label];
    const existing = await ctx.programs.core.account.tranche.fetchNullable(tranchePda);
    if (existing) {
      console.log(`[step 3/12] tranche ${p.label} exists — skipping`);
      continue;
    }

    await ctx.programs.core.methods
      .initializeTranche(p.kind, p.apy)
      .accounts({
        admin: ctx.wallets.admin.publicKey,
        config: ctx.pdas.config,
        vault: ctx.pdas.vault,
        tranche: tranchePda,
        trancheMint: ctx.pdas.trancheMints[p.label],
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([ctx.wallets.admin])
      .rpc({ commitment: "confirmed" });

    console.log(`[step 3/12] initialize_tranche ${p.label} done`);
  }
}
```

### 6.4 Initialize loan

```typescript
async function initializeLoan(ctx: SetupContext) {
  const existing = await ctx.programs.core.account.loan.fetchNullable(ctx.pdas.loan);
  if (existing) {
    console.log("[step 4/12] loan exists — skipping");
    return;
  }

  const now = Math.floor(Date.now() / 1000);
  const oneYear = 365 * 24 * 60 * 60;

  await ctx.programs.core.methods
    .initializeLoan(
      0,                                   // loan_id
      new BN(20_000_000_000),              // principal: 20,000 USDC (notional, not disbursed)
      800,                                 // apr_bps: 8% blended
      new BN(now + oneYear),               // maturity: 1 year out
      ctx.wallets.borrower.publicKey,      // borrower
    )
    .accounts({
      admin: ctx.wallets.admin.publicKey,
      config: ctx.pdas.config,
      vault: ctx.pdas.vault,
      loan: ctx.pdas.loan,
      systemProgram: SystemProgram.programId,
    })
    .signers([ctx.wallets.admin])
    .rpc({ commitment: "confirmed" });

  console.log("[step 4/12] initialize_loan done");
}
```

---

## 7. Deposits

```typescript
async function runDeposits(ctx: SetupContext) {
  // Per 12-reference-card.md §1.4 — exact amounts in 6-decimal base units
  const deposits = [
    { wallet: ctx.wallets.lpPrime, kind: TrancheKind.Prime, amount: 5_000_000_000n, label: "lp_prime" },
    { wallet: ctx.wallets.lpCore,   kind: TrancheKind.Core,   amount: 3_000_000_000n, label: "lp_core" },
    { wallet: ctx.wallets.lpAlpha, kind: TrancheKind.Alpha, amount: 2_000_000_000n, label: "lp_alpha" },
    { wallet: ctx.wallets.mm,       kind: TrancheKind.Alpha, amount: 2_000_000_000n, label: "mm_alpha" },
    { wallet: ctx.wallets.mm,       kind: TrancheKind.Core,   amount:   500_000_000n, label: "mm_core" },
    { wallet: ctx.wallets.admin,    kind: TrancheKind.Prime, amount: 5_000_000_000n, label: "admin_prime" },
    { wallet: ctx.wallets.admin,    kind: TrancheKind.Core,   amount: 1_000_000_000n, label: "admin_core" },
    { wallet: ctx.wallets.admin,    kind: TrancheKind.Alpha, amount: 1_000_000_000n, label: "admin_alpha" },
  ];

  for (const d of deposits) {
    const ata = await getAssociatedTokenAddress(
      ctx.pdas.trancheMints[trancheKindToLabel(d.kind)],
      d.wallet.publicKey,
    );
    const before = await getAccountBalance(ctx.connection, ata).catch(() => 0n);

    // Idempotency: if wallet already has expected pTRANCHE balance, skip
    if (before >= d.amount) {
      console.log(`[deposit] ${d.label} already done (balance ${formatUsdc(before)}) — skipping`);
      continue;
    }

    await ctx.programs.core.methods
      .deposit(d.kind, new BN(d.amount.toString()))
      .accounts({
        user: d.wallet.publicKey,
        config: ctx.pdas.config,
        vault: ctx.pdas.vault,
        tranche: ctx.pdas.tranches[trancheKindToLabel(d.kind)],
        trancheMint: ctx.pdas.trancheMints[trancheKindToLabel(d.kind)],
        userUsdcAta: await getAssociatedTokenAddress(ctx.usdcMint, d.wallet.publicKey),
        vaultUsdcReserve: ctx.pdas.vaultUsdcReserve,
        userTrancheAta: ata,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([d.wallet])
      .rpc({ commitment: "confirmed" });

    console.log(`[deposit] ${d.label}: ${formatUsdc(d.amount)} done`);
  }
}
```

---

## 8. Initialize AMM pools (3 calls)

```typescript
async function initializeAmmPools(ctx: SetupContext) {
  for (const kind of [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha]) {
    const label = trancheKindToLabel(kind);
    const poolPda = ctx.pdas.ammPools[label];
    const existing = await ctx.programs.amm.account.ammPool.fetchNullable(poolPda);
    if (existing) {
      console.log(`[step 8/12] amm pool ${label} exists — skipping`);
      continue;
    }

    await ctx.programs.amm.methods
      .initializePool(DEFAULT_FEE_BPS)
      .accounts({
        admin: ctx.wallets.admin.publicKey,
        trancheMint: ctx.pdas.trancheMints[label],
        quoteMint: ctx.usdcMint,
        pool: poolPda,
        trancheReserve: getPoolTrancheReservePda(ctx.pdas.trancheMints[label])[0],
        quoteReserve: getPoolQuoteReservePda(ctx.pdas.trancheMints[label])[0],
        lpMint: getLpMintPda(ctx.pdas.trancheMints[label])[0],
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([ctx.wallets.admin])
      .rpc({ commitment: "confirmed" });

    console.log(`[step 8/12] initialize_pool ${label} done`);
  }
}
```

---

## 9. Seed AMM liquidity

```typescript
async function seedAmmLiquidity(ctx: SetupContext) {
  // Per 12-reference-card.md §1.4
  const seeds = [
    { kind: TrancheKind.Prime, tranche: 5_000_000_000n, quote: 5_000_000_000n },
    { kind: TrancheKind.Core,   tranche: 1_000_000_000n, quote: 1_000_000_000n },
    { kind: TrancheKind.Alpha, tranche: 1_000_000_000n, quote: 1_000_000_000n },
  ];

  for (const s of seeds) {
    const label = trancheKindToLabel(s.kind);
    const trancheReserve = await getAccountBalance(ctx.connection, getPoolTrancheReservePda(ctx.pdas.trancheMints[label])[0]).catch(() => 0n);
    if (trancheReserve >= s.tranche) {
      console.log(`[step 9/12] amm ${label} already seeded — skipping`);
      continue;
    }

    await ctx.programs.amm.methods
      .addLiquidity(
        new BN(s.tranche.toString()),
        new BN(s.quote.toString()),
        new BN(0), // min_lp_out — first LP, no slippage check
      )
      .accounts({
        lp: ctx.wallets.admin.publicKey,
        pool: ctx.pdas.ammPools[label],
        // ... (all accounts per 09-lld-completion.md §9.3.10)
      })
      .signers([ctx.wallets.admin])
      .rpc({ commitment: "confirmed" });

    console.log(`[step 9/12] add_liquidity ${label}: ${formatUsdc(s.tranche)} / ${formatUsdc(s.quote)} done`);
  }
}
```

---

## 10. Simulate yield event (optional)

For demo recording, we want the dashboard to show post-yield state immediately. This step calls `accrue_yield` once with the locked numbers from [§4.3](04-data-flows.md):

```typescript
async function simulateYieldEvent(ctx: SetupContext) {
  // 100 USDC yield, simulating 30 days elapsed
  // (Production: yield accrues continuously via Switchboard cron.
  //  For demo: one-shot to set up post-yield NAVs.)
  await ctx.programs.core.methods
    .accrueYield(new BN(100_000_000))   // 100 USDC base units
    .accounts({
      authority: ctx.wallets.admin.publicKey,
      config: ctx.pdas.config,
      vault: ctx.pdas.vault,
      tranchePrime: ctx.pdas.tranches.prime,
      trancheCore:   ctx.pdas.tranches.core,
      trancheAlpha: ctx.pdas.tranches.alpha,
      borrowerUsdcAta: await getAssociatedTokenAddress(ctx.usdcMint, ctx.wallets.borrower.publicKey),
      borrowerAuthority: ctx.wallets.borrower.publicKey,
      vaultUsdcReserve: ctx.pdas.vaultUsdcReserve,
      switchboardFeed: null,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([ctx.wallets.admin, ctx.wallets.borrower])
    .rpc({ commitment: "confirmed" });

  console.log("[step 10/12] simulated yield event: 100 USDC done");
}
```

**Note on 30-day "elapsed":** the handler computes `prime_target = total_assets × apy_bps × elapsed / SECONDS_PER_YEAR / BPS_DENOMINATOR`. With `elapsed = 30 days × 86400 s = 2,592,000 s`:
- prime_target = 10K × 500 × 2,592,000 / (31,536,000 × 10,000) = 41.10 USDC ✓
- core_target = 4.5K × 800 × 2,592,000 / (31,536,000 × 10,000) = 29.59 USDC ✓
- alpha_take = 100 - 41.10 - 29.59 = 29.31 USDC ✓

For real elapsed time on devnet, we'd need 30 days. **For demo recording**, set `vault.last_yield_timestamp = (now - 30 days)` directly via a setup-only `seed_demo_state` admin instruction, OR fudge the `elapsed` calculation in `accrue_yield` to accept an explicit `elapsed_seconds` parameter (admin-only path). My pick: add an explicit parameter — simpler, and clearly demo-only.

```typescript
// Updated accrue_yield signature for demo:
//   accrue_yield(yield_amount: u64, override_elapsed_seconds: Option<i64>)
// In MVP: only admin signer can pass override_elapsed_seconds. Switchboard
// path always uses now - last_yield_timestamp.
```

---

## 11. Summary print

```typescript
async function printSummary(ctx: SetupContext) {
  const tranches = await Promise.all([
    ctx.programs.core.account.tranche.fetch(ctx.pdas.tranches.prime),
    ctx.programs.core.account.tranche.fetch(ctx.pdas.tranches.core),
    ctx.programs.core.account.tranche.fetch(ctx.pdas.tranches.alpha),
  ]);

  console.log(`
═══════════════════════════════════════════════════════════
  PRISM Demo Setup — Vault ${ctx.vaultId} ready
═══════════════════════════════════════════════════════════

  Prime (NAV ${formatNav(tranches[0].navPerShareQ)}):
    total_assets: ${formatUsdc(tranches[0].totalAssets)}
    total_supply: ${formatUsdc(tranches[0].totalSupply)} pPRIME

  Core   (NAV ${formatNav(tranches[1].navPerShareQ)}):
    total_assets: ${formatUsdc(tranches[1].totalAssets)}
    total_supply: ${formatUsdc(tranches[1].totalSupply)} pCORE

  Alpha (NAV ${formatNav(tranches[2].navPerShareQ)}):
    total_assets: ${formatUsdc(tranches[2].totalAssets)}
    total_supply: ${formatUsdc(tranches[2].totalSupply)} pALPHA

  AMM pools seeded:    Prime 5K+5K, Core 1K+1K, Alpha 1K+1K
  MM Trade #2 inv:     2K pALPHA + 0.5K pCORE
  Yield event:         ${SKIP_YIELD ? "skipped" : "100 USDC accrued"}

  → Visit http://localhost:3000/dashboard
  → Run demo per 13-demo-runbook.md
═══════════════════════════════════════════════════════════
`);
}
```

---

## 12. Helper functions used above

```typescript
function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf-8"))));
}

async function getAccountBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  const acc = await conn.getTokenAccountBalance(ata);
  return BigInt(acc.value.amount);
}

function formatUsdc(amount: bigint | number | BN): string {
  const n = typeof amount === "bigint" ? Number(amount) : (typeof amount === "number" ? amount : amount.toNumber());
  return (n / 1_000_000).toFixed(2);
}

function formatNav(navQ: BN | bigint): string {
  const q = typeof navQ === "bigint" ? navQ : BigInt(navQ.toString());
  // q is Q64.64. Convert to decimal: q / 2^64
  const integer = q >> 64n;
  const fractional = q & ((1n << 64n) - 1n);
  // Cheap approximation good enough for log output:
  const decimal = Number(fractional) / Number(1n << 64n);
  return (Number(integer) + decimal).toFixed(5);
}

function trancheKindToLabel(kind: TrancheKind): "prime" | "core" | "alpha" {
  return kind === TrancheKind.Prime ? "prime" : kind === TrancheKind.Core ? "core" : "alpha";
}
```

---

## 13. Verification — what success looks like

Run `yarn setup` on a fresh devnet deploy. You should see:

```
[step 1/12] initialize_global_config done
[step 2/12] initialize_vault done
[step 3/12] initialize_tranche prime done
[step 3/12] initialize_tranche core done
[step 3/12] initialize_tranche alpha done
[step 4/12] initialize_loan done
[deposit] lp_prime: 5000.00 done
[deposit] lp_core: 3000.00 done
[deposit] lp_alpha: 2000.00 done
[deposit] mm_alpha: 2000.00 done
[deposit] mm_core: 500.00 done
[deposit] admin_prime: 5000.00 done
[deposit] admin_core: 1000.00 done
[deposit] admin_alpha: 1000.00 done
[step 8/12] initialize_pool prime done
[step 8/12] initialize_pool core done
[step 8/12] initialize_pool alpha done
[step 9/12] add_liquidity prime: 5000.00 / 5000.00 done
[step 9/12] add_liquidity core: 1000.00 / 1000.00 done
[step 9/12] add_liquidity alpha: 1000.00 / 1000.00 done
[step 10/12] simulated yield event: 100 USDC done

═══════════════════════════════════════════════════════════
  PRISM Demo Setup — Vault 0 ready
═══════════════════════════════════════════════════════════

  Prime (NAV 1.00411):
    total_assets: 10041.10
    total_supply: 10000.00 pPRIME
  ...
```

Run a second time → all idempotency guards trigger → `[step X/12] ... already exists — skipping` for everything → exits in ~3 seconds.

This is the script you'll run on Day 15 (recording day) and Day 16 (resubmit) to bring fresh devnet vaults to demo-ready state.

---

## 14. Re-recording protocol

If demo recording on Day 15 fails and you need to re-record:

```bash
yarn setup --vault-id 1   # use a fresh vault_id
```

The frontend's `NEXT_PUBLIC_VAULT_ID` env var picks up the new vault. Restart `yarn dev`. All UI and demo flows work against the new vault. Old vault state on devnet stays around but doesn't interfere — invisible to the demo.

For tests, use `--vault-id 99` to keep them isolated from the recording vault range (0–10).

---

## 15. What's NOT in this script

These are operational setups that happen elsewhere:

- **Switchboard aggregator creation** — Day 12 setup, separate `scripts/setup-switchboard.ts` (not part of `setup-demo.ts`)
- **Cloak SDK initialization** — frontend-side at app boot, not setup script
- **Dune SIM webhook subscription** — done in Dune dashboard manually, Day 13
- **Phantom wallet setup** — manual, by the human running the demo
- **OBS recording setup** — manual, Day 15

Everything that's automatable via `yarn setup` is in this script. Anything that requires external service interaction or human judgment is documented in [13-demo-runbook.md](13-demo-runbook.md).
