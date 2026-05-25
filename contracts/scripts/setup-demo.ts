import * as anchor from "@coral-xyz/anchor";
import { BN, AnchorProvider, workspace } from "@coral-xyz/anchor";
import { 
  Connection, 
  Keypair, 
  PublicKey, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY, 
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import { Command } from "commander";
import * as fs from "fs";
import * as dotenv from "dotenv";
import { 
  getConfigPda, 
  getVaultPda, 
  getTranchePda, 
  getTrancheMintPda, 
  getVaultReservePda, 
  getLossBucketPda, 
  getLoanPda,
  getPoolPda,
  getPoolTrancheReservePda,
  getPoolQuoteReservePda,
  getLpMintPda,
  TrancheKind 
} from "../lib/pda";
import type { PrismAmmProgram, PrismCoreProgram } from "../lib/accounts";

dotenv.config();

const program = new Command()
  .option("--vault-id <id>", "vault ID to use", "0")
  .option("--skip-yield", "skip the simulated yield event at the end")
  .option("--reset", "fail if state already exists")
  .parse(process.argv);

const opts = program.opts();
const VAULT_ID = parseInt(opts.vaultId, 10);
const SKIP_YIELD = !!opts.skipYield;
const RESET_MODE = !!opts.reset;

interface SetupContext {
  connection: Connection;
  provider: AnchorProvider;
  programs: {
    core: PrismCoreProgram;
    amm: PrismAmmProgram;
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
  const connection = new Connection(process.env.ANCHOR_PROVIDER_URL || "http://localhost:8899", "confirmed");

  const admin = loadKeypair("keys/admin.json");
  const provider = new AnchorProvider(connection, new anchor.Wallet(admin), { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Note: workspace typing depends on anchor build having run. Using any for now.
  const core = (workspace as any).PrismCore as PrismCoreProgram;
  const amm  = (workspace as any).PrismAmm  as PrismAmmProgram;

  const wallets = {
    admin,
    borrower:  loadKeypair("keys/borrower.json"),
    lpPrime:   loadKeypair("keys/lpPrime.json"),
    lpCore:    loadKeypair("keys/lpCore.json"),
    lpAlpha:   loadKeypair("keys/lpAlpha.json"),
    mm:        loadKeypair("keys/mm.json"),
  };

  const coreProgramId = core.programId;
  const ammProgramId = amm.programId;

  // Derive PDAs
  const [config] = getConfigPda(coreProgramId);
  const [vault]  = getVaultPda(VAULT_ID, coreProgramId);
  
  const [trancheP] = getTranchePda(vault, TrancheKind.Prime, coreProgramId);
  const [trancheC] = getTranchePda(vault, TrancheKind.Core, coreProgramId);
  const [trancheA] = getTranchePda(vault, TrancheKind.Alpha, coreProgramId);

  const [mintP] = getTrancheMintPda(vault, TrancheKind.Prime, coreProgramId);
  const [mintC] = getTrancheMintPda(vault, TrancheKind.Core, coreProgramId);
  const [mintA] = getTrancheMintPda(vault, TrancheKind.Alpha, coreProgramId);

  const [loan] = getLoanPda(vault, 0, coreProgramId);
  const [reserve] = getVaultReservePda(vault, coreProgramId);
  const [lossBucket] = getLossBucketPda(vault, coreProgramId);

  const [poolP] = getPoolPda(mintP, ammProgramId);
  const [poolC] = getPoolPda(mintC, ammProgramId);
  const [poolA] = getPoolPda(mintA, ammProgramId);

  return {
    connection,
    provider,
    programs: { core, amm },
    wallets,
    vaultId: VAULT_ID,
    usdcMint: new PublicKey(process.env.NEXT_PUBLIC_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
    pdas: {
      config,
      vault,
      tranches: { prime: trancheP, core: trancheC, alpha: trancheA },
      trancheMints: { prime: mintP, core: mintC, alpha: mintA },
      loan,
      vaultUsdcReserve: reserve,
      lossBucket,
      ammPools: { prime: poolP, core: poolC, alpha: poolA },
    },
  };
}

async function ensureSolBalances(ctx: SetupContext) {
  const minSol = 0.5 * LAMPORTS_PER_SOL;
  const adminMinSol = 2 * LAMPORTS_PER_SOL;

  for (const [name, kp] of Object.entries(ctx.wallets)) {
    const balance = await ctx.connection.getBalance(kp.publicKey);
    const needed = name === "admin" ? adminMinSol : minSol;
    if (balance < needed) {
      console.log(`[airdrop] ${name}: ${balance / LAMPORTS_PER_SOL} → topping up`);
      try {
        const sig = await ctx.connection.requestAirdrop(kp.publicKey, needed);
        await ctx.connection.confirmTransaction(sig, "confirmed");
      } catch (e) {
        console.log(`  airdrop failed for ${name} (likely rate limit). Proceeding anyway...`);
      }
    }
  }
}

async function ensureUsdcBalances(ctx: SetupContext) {
  const required = {
    admin:    7_000_000_000n,
    borrower: 10_000_000_000n,
    lpPrime:  5_000_000_000n,
    lpCore:   3_000_000_000n,
    lpAlpha:  2_000_000_000n,
    mm:       2_500_000_000n,
  };

  let missing: string[] = [];
  for (const [name, needed] of Object.entries(required)) {
    const wallet = (ctx.wallets as any)[name] as Keypair;
    const ata = await getAssociatedTokenAddress(ctx.usdcMint, wallet.publicKey);
    const balance = await getAccountBalance(ctx.connection, ata).catch(() => 0n);
    if (balance < needed) {
      missing.push(`  ${name}: has ${formatUsdc(balance)}, needs ${formatUsdc(needed)}`);
    }
  }

  if (missing.length > 0 && ctx.connection.rpcEndpoint.includes("devnet")) {
    console.error(`USDC balances insufficient. Visit https://faucet.circle.com and fund:`);
    missing.forEach(m => console.error(m));
    console.error(`Then re-run this script.`);
    process.exit(1);
  } else if (missing.length > 0) {
    console.log("Missing USDC balances on localnet. You may need to mint some manually to these ATAs.");
  }
}

async function initializeGlobalConfig(ctx: SetupContext) {
  const existing = await ctx.programs.core.account.globalConfig.fetchNullable(ctx.pdas.config);
  if (existing) {
    if (RESET_MODE) throw new Error("config already exists; aborting (--reset)");
    console.log("[step 1/12] config already exists — skipping");
    return;
  }

  await (ctx.programs.core.methods as any)
    .initializeGlobalConfig(0, [ctx.wallets.borrower.publicKey])
    .accounts({
      admin: ctx.wallets.admin.publicKey,
      config: ctx.pdas.config,
      usdcMint: ctx.usdcMint,
      systemProgram: SystemProgram.programId,
    } as any)
    .signers([ctx.wallets.admin])
    .rpc({ commitment: "confirmed" });

  console.log("[step 1/12] initialize_global_config done");
}

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
      systemProgram: SystemProgram.programId,
    })
    .signers([ctx.wallets.admin])
    .rpc({ commitment: "confirmed" });

  await ctx.programs.core.methods
    .initializeVaultReserves()
    .accounts({
      admin: ctx.wallets.admin.publicKey,
      config: ctx.pdas.config,
      vault: ctx.pdas.vault,
      usdcMint: ctx.usdcMint,
      vaultUsdcReserve: ctx.pdas.vaultUsdcReserve,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([ctx.wallets.admin])
    .rpc({ commitment: "confirmed" });

  await ctx.programs.core.methods
    .initializeVaultLossBucket()
    .accounts({
      admin: ctx.wallets.admin.publicKey,
      config: ctx.pdas.config,
      vault: ctx.pdas.vault,
      usdcMint: ctx.usdcMint,
      lossBucket: ctx.pdas.lossBucket,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([ctx.wallets.admin])
    .rpc({ commitment: "confirmed" });

  console.log("[step 2/12] initialize_vault done");
}

async function initializeTranches(ctx: SetupContext) {
  const params = [
    { kind: TrancheKind.Prime, apy: 500, label: "prime" },
    { kind: TrancheKind.Core,  apy: 800,  label: "core" },
    { kind: TrancheKind.Alpha, apy: 1500, label: "alpha" },
  ];

  for (const p of params) {
    const tranchePda = (ctx.pdas.tranches as any)[p.label];
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
        trancheMint: (ctx.pdas.trancheMints as any)[p.label],
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([ctx.wallets.admin])
      .rpc({ commitment: "confirmed" });

    console.log(`[step 3/12] initialize_tranche ${p.label} done`);
  }
}

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
      0,
      new BN("20000000000"),
      800,
      new BN(now + oneYear),
      ctx.wallets.borrower.publicKey,
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

async function runDeposits(ctx: SetupContext) {
  const deposits = [
    { wallet: ctx.wallets.lpPrime, kind: TrancheKind.Prime, amount: 5_000_000_000n, label: "lp_prime" },
    { wallet: ctx.wallets.lpCore,  kind: TrancheKind.Core,  amount: 3_000_000_000n, label: "lp_core" },
    { wallet: ctx.wallets.lpAlpha, kind: TrancheKind.Alpha, amount: 2_000_000_000n, label: "lp_alpha" },
    { wallet: ctx.wallets.mm,      kind: TrancheKind.Alpha, amount: 2_000_000_000n, label: "mm_alpha" },
    { wallet: ctx.wallets.mm,      kind: TrancheKind.Core,  amount:   500_000_000n, label: "mm_core" },
    { wallet: ctx.wallets.admin,   kind: TrancheKind.Prime, amount: 5_000_000_000n, label: "admin_prime" },
    { wallet: ctx.wallets.admin,   kind: TrancheKind.Core,  amount: 1_000_000_000n, label: "admin_core" },
    { wallet: ctx.wallets.admin,   kind: TrancheKind.Alpha, amount: 1_000_000_000n, label: "admin_alpha" },
  ];

  for (const d of deposits) {
    const label = trancheKindToLabel(d.kind);
    const ata = await getAssociatedTokenAddress((ctx.pdas.trancheMints as any)[label], d.wallet.publicKey);
    const before = await getAccountBalance(ctx.connection, ata).catch(() => 0n);

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
        tranche: (ctx.pdas.tranches as any)[label],
        trancheMint: (ctx.pdas.trancheMints as any)[label],
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

async function initializeAmmPools(ctx: SetupContext) {
  const DEFAULT_FEE_BPS = 30;
  for (const kind of [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha]) {
    const label = trancheKindToLabel(kind);
    const poolPda = (ctx.pdas.ammPools as any)[label];
    const existing = await ctx.programs.amm.account.ammPool.fetchNullable(poolPda);
    if (existing) {
      console.log(`[step 8/12] amm pool ${label} exists — skipping`);
      continue;
    }

    const trancheMint = (ctx.pdas.trancheMints as any)[label];
    const [trancheReserve] = getPoolTrancheReservePda(trancheMint, ctx.programs.amm.programId);
    const [quoteReserve] = getPoolQuoteReservePda(trancheMint, ctx.programs.amm.programId);
    const [lpMint] = getLpMintPda(trancheMint, ctx.programs.amm.programId);

    await ctx.programs.amm.methods
      .initializePool(DEFAULT_FEE_BPS)
      .accounts({
        admin: ctx.wallets.admin.publicKey,
        trancheMint: trancheMint,
        quoteMint: ctx.usdcMint,
        pool: poolPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.wallets.admin])
      .rpc({ commitment: "confirmed" });

    await ctx.programs.amm.methods
      .initializePoolReserves()
      .accounts({
        admin: ctx.wallets.admin.publicKey,
        pool: poolPda,
        trancheMint: trancheMint,
        quoteMint: ctx.usdcMint,
        trancheReserve,
        quoteReserve,
        lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.wallets.admin])
      .rpc({ commitment: "confirmed" });

    console.log(`[step 8/12] initialize_pool ${label} done`);
  }
}

async function seedAmmLiquidity(ctx: SetupContext) {
  const seeds = [
    { kind: TrancheKind.Prime, tranche: 5_000_000_000n, quote: 5_000_000_000n },
    { kind: TrancheKind.Core,  tranche: 1_000_000_000n, quote: 1_000_000_000n },
    { kind: TrancheKind.Alpha, tranche: 1_000_000_000n, quote: 1_000_000_000n },
  ];

  for (const s of seeds) {
    const label = trancheKindToLabel(s.kind);
    const trancheMint = (ctx.pdas.trancheMints as any)[label];
    const [trancheReservePda] = getPoolTrancheReservePda(trancheMint, ctx.programs.amm.programId);
    const trancheReserve = await getAccountBalance(ctx.connection, trancheReservePda).catch(() => 0n);
    
    if (trancheReserve >= s.tranche) {
      console.log(`[step 9/12] amm ${label} already seeded — skipping`);
      continue;
    }

    const [pool] = getPoolPda(trancheMint, ctx.programs.amm.programId);
    const [quoteReserve] = getPoolQuoteReservePda(trancheMint, ctx.programs.amm.programId);
    const [lpMint] = getLpMintPda(trancheMint, ctx.programs.amm.programId);
    const lpLpAta = await getAssociatedTokenAddress(lpMint, ctx.wallets.admin.publicKey);

    await ctx.programs.amm.methods
      .addLiquidity(
        new BN(s.tranche.toString()),
        new BN(s.quote.toString()),
        new BN(0),
      )
      .accounts({
        lp: ctx.wallets.admin.publicKey,
        pool,
        trancheMint,
        quoteMint: ctx.usdcMint,
        trancheReserve: trancheReservePda,
        quoteReserve,
        lpMint,
        lpTrancheAta: await getAssociatedTokenAddress(trancheMint, ctx.wallets.admin.publicKey),
        lpQuoteAta: await getAssociatedTokenAddress(ctx.usdcMint, ctx.wallets.admin.publicKey),
        lpLpAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([ctx.wallets.admin])
      .rpc({ commitment: "confirmed" });

    console.log(`[step 9/12] add_liquidity ${label}: ${formatUsdc(s.tranche)} / ${formatUsdc(s.quote)} done`);
  }
}

async function simulateYieldEvent(ctx: SetupContext) {
  // Borrower is authority: they own borrower_usdc_ata and are in oracle_allowlist.
  // The contract uses authority as the SPL transfer signer for borrower_usdc_ata.
  await ctx.programs.core.methods
    .accrueYield(new BN(100_000_000))
    .accounts({
      authority: ctx.wallets.borrower.publicKey,
      config: ctx.pdas.config,
      vault: ctx.pdas.vault,
      tranchePrime: ctx.pdas.tranches.prime,
      trancheCore:  ctx.pdas.tranches.core,
      trancheAlpha: ctx.pdas.tranches.alpha,
      borrower: ctx.wallets.borrower.publicKey,
      borrowerUsdcAta: await getAssociatedTokenAddress(ctx.usdcMint, ctx.wallets.borrower.publicKey),
      vaultUsdcReserve: ctx.pdas.vaultUsdcReserve,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([ctx.wallets.borrower])
    .rpc({ commitment: "confirmed" });

  console.log("[step 10/12] simulated yield event: 100 USDC done");
}

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
═══════════════════════════════════════════════════════════
`);
}

// Helpers
function loadKeypair(path: string): Keypair {
  if (!fs.existsSync(path)) {
    // If not found, create a temporary one for local testing
    const kp = Keypair.generate();
    console.log(`[warning] ${path} not found. Using ephemeral key: ${kp.publicKey.toBase58()}`);
    return kp;
  }
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf-8"))));
}

async function getAccountBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  try {
    const acc = await conn.getTokenAccountBalance(ata);
    return BigInt(acc.value.amount);
  } catch (e) {
    return 0n;
  }
}

function formatUsdc(amount: bigint | number | BN): string {
  const n = typeof amount === "bigint" ? Number(amount) : (typeof amount === "number" ? amount : amount.toNumber());
  return (n / 1_000_000).toFixed(2);
}

function formatNav(navQ: BN | bigint): string {
  const q = typeof navQ === "bigint" ? navQ : BigInt(navQ.toString());
  const integer = q >> 64n;
  const fractional = q & ((1n << 64n) - 1n);
  const decimal = Number(fractional) / Number(1n << 64n);
  return (Number(integer) + decimal).toFixed(5);
}

function trancheKindToLabel(kind: TrancheKind): "prime" | "core" | "alpha" {
  if (kind === TrancheKind.Prime) return "prime";
  if (kind === TrancheKind.Core) return "core";
  return "alpha";
}

async function main() {
  const ctx = await loadContext();
  await ensureSolBalances(ctx);
  await ensureUsdcBalances(ctx);
  await initializeGlobalConfig(ctx);
  await initializeVault(ctx);
  await initializeTranches(ctx);
  await initializeLoan(ctx);
  await runDeposits(ctx);
  await initializeAmmPools(ctx);
  await seedAmmLiquidity(ctx);
  if (!SKIP_YIELD) await simulateYieldEvent(ctx);
  await printSummary(ctx);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
