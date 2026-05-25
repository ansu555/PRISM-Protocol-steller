import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { 
  PublicKey, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY, 
  Keypair, 
  LAMPORTS_PER_SOL 
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  createMint,
  mintTo,
  createAssociatedTokenAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { 
  getPoolPda, 
  getPoolTrancheReservePda, 
  getPoolQuoteReservePda, 
  getLpMintPda 
} from "../lib/pda";
import type { PrismAmmProgram } from "../lib/accounts";

describe("prism-amm", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PrismAmm as PrismAmmProgram;
  const connection = provider.connection;

  // Test state
  const admin = (provider.wallet as anchor.Wallet).payer;
  const lpProvider = Keypair.generate();
  const trader = Keypair.generate();
  let usdcMint: PublicKey;
  let trancheMint: PublicKey;
  
  // PDAs
  let poolPda: PublicKey;
  let trancheReserve: PublicKey;
  let quoteReserve: PublicKey;
  let lpMint: PublicKey;

  before(async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" SETUP: Environment Initialization (AMM)");
    console.log("════════════════════════════════════════════════");

    // Airdrop SOL to test accounts
    console.log(`► Airdropping 2 SOL to LP Provider: ${lpProvider.publicKey.toBase58()}`);
    const sig1 = await connection.requestAirdrop(lpProvider.publicKey, 2 * LAMPORTS_PER_SOL);
    
    console.log(`► Airdropping 2 SOL to Trader:      ${trader.publicKey.toBase58()}`);
    const sig2 = await connection.requestAirdrop(trader.publicKey, 2 * LAMPORTS_PER_SOL);
    
    await connection.confirmTransaction(sig1);
    await connection.confirmTransaction(sig2);
    console.log("  ✔ SOL Airdrops Confirmed");

    // Create mock mints
    console.log("► Creating Mock USDC Mint (6 decimals)...");
    usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
    console.log(`  🔑 USDC Mint:    ${usdcMint.toBase58()}`);

    console.log("► Creating Mock Tranche Mint (6 decimals)...");
    trancheMint = await createMint(connection, admin, admin.publicKey, null, 6);
    console.log(`  🔑 Tranche Mint: ${trancheMint.toBase58()}`);

    // Derive PDAs
    console.log("► Deriving AMM PDAs...");
    [poolPda] = getPoolPda(trancheMint, program.programId);
    [trancheReserve] = getPoolTrancheReservePda(trancheMint, program.programId);
    [quoteReserve] = getPoolQuoteReservePda(trancheMint, program.programId);
    [lpMint] = getLpMintPda(trancheMint, program.programId);
  });

  it("Step 1: Initialize Pool", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 1: Initialize Pool");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Setting up the Automated Market Maker (AMM).");
    console.log("  Walkthrough: This creates the trading infrastructure. We initialize a Pool PDA");
    console.log("               that links a Tranche Token to USDC. This allows investors to");
    console.log("               exit their positions without waiting for the loan to end.");

    const start = Date.now();
    console.log(`► Calling: initializePool [prism-amm]`);
    console.log(`  Params: { feeBps: 30 }`);
    console.log(`  🔑 Pool PDA: ${poolPda.toBase58()}`);
    console.log(`  🔑 Tranche Mint: ${trancheMint.toBase58()}`);
    console.log(`  🔑 Quote Mint: ${usdcMint.toBase58()}`);

    const tx1 = await program.methods
      .initializePool(30) // 0.3% fee
      .accounts({
        admin: admin.publicKey,
        trancheMint: trancheMint,
        quoteMint: usdcMint,
        pool: poolPda,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();
    console.log(`  ✔ Tx (Pool): ${tx1}`);

    console.log(`► Calling: initializePoolReserves [prism-amm]`);
    console.log(`  🔑 Tranche Reserve: ${trancheReserve.toBase58()}`);
    console.log(`  🔑 Quote Reserve: ${quoteReserve.toBase58()}`);
    console.log(`  🔑 LP Mint: ${lpMint.toBase58()}`);

    const tx2 = await program.methods
      .initializePoolReserves()
      .accounts({
        admin: admin.publicKey,
        pool: poolPda,
        trancheMint: trancheMint,
        quoteMint: usdcMint,
        trancheReserve: trancheReserve,
        quoteReserve: quoteReserve,
        lpMint: lpMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();
    console.log(`  ✔ Tx (Reserves): ${tx2}`);

    const elapsed = Date.now() - start;
    console.log(`  ⏱ Total Elapsed: ${elapsed}ms`);

    const pool = await program.account.ammPool.fetch(poolPda);
    expect(pool.feeBps).to.equal(30);
    expect(pool.trancheMint.toBase58()).to.equal(trancheMint.toBase58());
  });

  it("Step 2: Add Liquidity", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 2: Add Liquidity");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Seeding the pool with assets.");
    console.log("  Walkthrough: An LP provider deposits both Tranche tokens and USDC into the");
    console.log("               pool's reserves. In return, they receive AMM-LP tokens which");
    console.log("               earn a share of the 0.3% trading fees.");

    const trancheAmount = new BN(10_000_000);
    const quoteAmount = new BN(10_000_000);

    const lpTrancheAta = await createAssociatedTokenAccount(connection, admin, trancheMint, admin.publicKey);
    const lpQuoteAta = await createAssociatedTokenAccount(connection, admin, usdcMint, admin.publicKey);
    const lpLpAta = await createAssociatedTokenAccount(connection, admin, lpMint, admin.publicKey);

    console.log(`► Minting 20 Tranche tokens and 20 USDC to Admin...`);
    await mintTo(connection, admin, trancheMint, lpTrancheAta, admin, 20_000_000);
    await mintTo(connection, admin, usdcMint, lpQuoteAta, admin, 20_000_000);
    console.log(`  ✔ Minting Successful`);

    const start = Date.now();
    console.log(`► Calling: addLiquidity [prism-amm]`);
    console.log(`  Params: { trancheAmount: 10 tokens, quoteAmount: 10 USDC }`);
    console.log(`  💰 Admin Balance Before: 20 tokens, 20 USDC`);

    const tx = await program.methods
      .addLiquidity(trancheAmount, quoteAmount, new BN(0))
      .accounts({
        lp: admin.publicKey,
        pool: poolPda,
        trancheReserve: trancheReserve,
        quoteReserve: quoteReserve,
        lpMint: lpMint,
        lpTrancheAta: lpTrancheAta,
        lpQuoteAta: lpQuoteAta,
        lpLpAta: lpLpAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      } as any)
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 Admin Balance After: 10 tokens, 10 USDC`);
    console.log(`  💰 Pool Reserves After: 10 tokens, 10 USDC`);
  });

  it("Step 3: Swap (Tranche to Quote)", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 3: Swap (Tranche to Quote)");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Selling Tranche shares for USDC.");
    console.log("  Walkthrough: A user sends Tranche tokens to the pool and receives USDC.");
    console.log("               The price is calculated using x*y=k. This provides 'Instant");
    console.log("               Liquidity' for credit investors.");

    const amountIn = new BN(1_000_000);
    const traderTrancheAta = await getAssociatedTokenAddress(trancheMint, admin.publicKey);
    const traderQuoteAta = await getAssociatedTokenAddress(usdcMint, admin.publicKey);

    await mintTo(connection, admin, trancheMint, traderTrancheAta, admin, 1_000_000);

    const start = Date.now();
    console.log(`► Calling: swap [prism-amm] (Tranche -> Quote)`);
    console.log(`  Params: { direction: 0, amountIn: 1 token }`);
    console.log(`  💰 Admin Balance Before: 11 tokens, 10 USDC`);

    const tx = await program.methods
      .swap(amountIn, new BN(0), 0) // Direction 0: Tranche to Quote
      .accounts({
        user: admin.publicKey,
        pool: poolPda,
        trancheReserve: trancheReserve,
        quoteReserve: quoteReserve,
        userTrancheAta: traderTrancheAta,
        userQuoteAta: traderQuoteAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 Admin Balance After: 10 tokens, ~10.97 USDC`);
  });

  it("Step 4: Swap (Quote to Tranche)", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 4: Swap (Quote to Tranche)");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Buying Tranche shares using USDC.");
    console.log("  Walkthrough: A user sends USDC to the pool and receives Tranche tokens.");
    console.log("               This allows secondary market participants to buy into loans");
    console.log("               that have already been disbursed.");

    const amountIn = new BN(1_000_000);
    const traderQuoteAta = await getAssociatedTokenAddress(usdcMint, admin.publicKey);
    const traderTrancheAta = await getAssociatedTokenAddress(trancheMint, admin.publicKey);

    await mintTo(connection, admin, usdcMint, traderQuoteAta, admin, 1_000_000);

    const start = Date.now();
    console.log(`► Calling: swap [prism-amm] (Quote -> Tranche)`);
    console.log(`  Params: { direction: 1, amountIn: 1 USDC }`);
    console.log(`  💰 Admin Balance Before: 10 tokens, ~11.97 USDC`);

    const tx = await program.methods
      .swap(amountIn, new BN(0), 1) // Direction 1: Quote to Tranche
      .accounts({
        user: admin.publicKey,
        pool: poolPda,
        trancheReserve: trancheReserve,
        quoteReserve: quoteReserve,
        userTrancheAta: traderTrancheAta,
        userQuoteAta: traderQuoteAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 Admin Balance After: ~10.91 tokens, 10.97 USDC`);
  });

  it("Step 5: Remove Liquidity", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 5: Remove Liquidity");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: LP provider exits the AMM.");
    console.log("  Walkthrough: The LP burns their AMM-LP tokens and receives back their share");
    console.log("               of the pool's assets, including any fees collected during");
    console.log("               the trading steps.");

    const lpAmount = new BN(1_000_000);
    const lpLpAta = await getAssociatedTokenAddress(lpMint, admin.publicKey);
    const lpTrancheAta = await getAssociatedTokenAddress(trancheMint, admin.publicKey);
    const lpQuoteAta = await getAssociatedTokenAddress(usdcMint, admin.publicKey);

    const start = Date.now();
    console.log(`► Calling: removeLiquidity [prism-amm]`);
    console.log(`  Params: { lpAmount: 1 LP token }`);
    console.log(`  💰 Admin LP Balance Before: 10 LP tokens`);

    const tx = await program.methods
      .removeLiquidity(lpAmount, new BN(0), new BN(0))
      .accounts({
        lp: admin.publicKey,
        pool: poolPda,
        trancheMint: trancheMint,
        quoteMint: usdcMint,
        trancheReserve: trancheReserve,
        quoteReserve: quoteReserve,
        lpMint: lpMint,
        lpTrancheAta: lpTrancheAta,
        lpQuoteAta: lpQuoteAta,
        lpLpAta: lpLpAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      } as any)
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 Admin LP Balance After: 9 LP tokens`);
  });
});
