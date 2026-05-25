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
  getConfigPda, 
  getVaultPda, 
  getTranchePda, 
  getTrancheMintPda, 
  getVaultReservePda, 
  getLossBucketPda, 
  getLoanPda,
  TrancheKind 
} from "../lib/pda";
import type { PrismCoreProgram } from "../lib/accounts";

describe("prism-core", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PrismCore as PrismCoreProgram;
  const connection = provider.connection;

  // Test state
  const admin = (provider.wallet as anchor.Wallet).payer;
  const user = Keypair.generate();
  const borrower = Keypair.generate();
  const vaultId = Math.floor(Math.random() * 1000000);
  let usdcMint: PublicKey;
  
  // PDAs
  const [configPda] = getConfigPda(program.programId);
  const [vaultPda] = getVaultPda(vaultId, program.programId);
  const [reservePda] = getVaultReservePda(vaultPda, program.programId);
  const [lossBucketPda] = getLossBucketPda(vaultPda, program.programId);
  const [loanPda] = getLoanPda(vaultPda, 0, program.programId);

  before(async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" SETUP: Environment Initialization");
    console.log("════════════════════════════════════════════════");

    // Airdrop SOL to test accounts
    console.log(`► Airdropping 2 SOL to Borrower: ${borrower.publicKey.toBase58()}`);
    const sig1 = await connection.requestAirdrop(borrower.publicKey, 2 * LAMPORTS_PER_SOL);
    
    console.log(`► Airdropping 2 SOL to User:     ${user.publicKey.toBase58()}`);
    const sig2 = await connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL);
    
    await connection.confirmTransaction(sig1);
    await connection.confirmTransaction(sig2);
    console.log("  ✔ SOL Airdrops Confirmed");

    // Create a mock USDC mint
    console.log("► Creating Mock USDC Mint (6 decimals)...");
    usdcMint = await createMint(
      connection,
      admin,
      admin.publicKey,
      null,
      6
    );
    console.log(`  🔑 USDC Mint Address: ${usdcMint.toBase58()}`);
  });

  it("Step 1: Initialize Global Config", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 1: Initialize Global Config");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Setting up the protocol's master switch.");
    console.log("  Walkthrough: This is the 'Genesis' transaction. We define the admin authority");
    console.log("               and hardcode the USDC mint address. Every subsequent instruction");
    console.log("               checks this Config PDA to verify that the protocol is initialized.");

    const start = Date.now();
    console.log(`► Calling: initializeGlobalConfig [prism-core]`);
    console.log(`  Params: { yieldRateBps: 100, oracleAllowlist: [${borrower.publicKey.toBase58()}] }`);
    console.log(`  🔑 Admin: ${admin.publicKey.toBase58()}`);
    console.log(`  🔑 Config PDA: ${configPda.toBase58()}`);
    console.log(`  🔑 USDC Mint: ${usdcMint.toBase58()}`);

    const tx = await program.methods
      .initializeGlobalConfig(100, [borrower.publicKey])
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        usdcMint: usdcMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);

    const config = await program.account.globalConfig.fetch(configPda);
    expect(config.admin.toBase58()).to.equal(admin.publicKey.toBase58());
    expect(config.usdcMint.toBase58()).to.equal(usdcMint.toBase58());
  });

  it("Step 2: Initialize Vault", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 2: Initialize Vault");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Creating a new Credit Vault container.");
    console.log("  Walkthrough: A Vault is a segregated pool of capital. We initialize three things:");
    console.log("               1. The Vault State (metadata)");
    console.log("               2. The Reserve (a PDA-owned USDC wallet for deposits)");
    console.log("               3. The Loss Bucket (the first-loss insurance fund)");

    const start = Date.now();
    console.log(`► Calling: initializeVault [prism-core]`);
    console.log(`  Params: { vaultId: ${vaultId} }`);
    console.log(`  🔑 Vault PDA: ${vaultPda.toBase58()}`);

    const tx1 = await program.methods
      .initializeVault(vaultId)
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`  ✔ Tx (Vault): ${tx1}`);

    console.log(`► Calling: initializeVaultReserves [prism-core]`);
    console.log(`  🔑 Reserve PDA: ${reservePda.toBase58()}`);
    const tx2 = await program.methods
      .initializeVaultReserves()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        usdcMint: usdcMint,
        vaultUsdcReserve: reservePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`  ✔ Tx (Reserves): ${tx2}`);

    console.log(`► Calling: initializeVaultLossBucket [prism-core]`);
    console.log(`  🔑 Loss Bucket PDA: ${lossBucketPda.toBase58()}`);
    const tx3 = await program.methods
      .initializeVaultLossBucket()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        usdcMint: usdcMint,
        lossBucket: lossBucketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log(`  ✔ Tx (Loss Bucket): ${tx3}`);

    const elapsed = Date.now() - start;
    console.log(`  ⏱ Total Elapsed: ${elapsed}ms`);

    const vault = await program.account.vault.fetch(vaultPda);
    expect(vault.id).to.equal(vaultId);
    expect(vault.state).to.have.property('active');
  });

  it("Step 3: Initialize Tranches", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 3: Initialize Tranches");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Carving the vault into risk layers (Tranches).");
    console.log("  Walkthrough: We define Prime, Core, and Alpha layers. Each layer has its own");
    console.log("               target APY and LP token mint. This allows investors to choose");
    console.log("               their preferred risk-reward profile within this specific vault.");

    const tranches = [
      { kind: TrancheKind.Prime, apy: 500, label: "Prime" },
      { kind: TrancheKind.Core, apy: 800, label: "Core" },
      { kind: TrancheKind.Alpha, apy: 1500, label: "Alpha" },
    ];

    const start = Date.now();
    for (const t of tranches) {
      const [tranchePda] = getTranchePda(vaultPda, t.kind, program.programId);
      const [mintPda] = getTrancheMintPda(vaultPda, t.kind, program.programId);

      console.log(`► Calling: initializeTranche [prism-core] (${t.label})`);
      console.log(`  Params: { kind: ${t.kind}, apy: ${t.apy} }`);
      console.log(`  🔑 Tranche PDA: ${tranchePda.toBase58()}`);
      console.log(`  🔑 Tranche Mint: ${mintPda.toBase58()}`);

      const tx = await program.methods
        .initializeTranche(t.kind, t.apy)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          vault: vaultPda,
          tranche: tranchePda,
          trancheMint: mintPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      console.log(`  ✔ Tx: ${tx}`);
    }
    const elapsed = Date.now() - start;
    console.log(`  ⏱ Total Elapsed: ${elapsed}ms`);
  });

  it("Step 4: Initialize Loan", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 4: Initialize Loan");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Registering a borrower's credit request.");
    console.log("  Walkthrough: We create a Loan PDA that tracks the principal, APR, and deadline.");
    console.log("               At this stage, the loan is 'Pending'. It won't become 'Active'");
    console.log("               until the vault has enough liquidity to disburse the funds.");

    const now = Math.floor(Date.now() / 1000);
    const principal = new BN(10_000_000); // 10 USDC

    const start = Date.now();
    console.log(`► Calling: initializeLoan [prism-core]`);
    console.log(`  Params: { id: 0, principal: 10 USDC, apr: 800, maturity: 30 days }`);
    console.log(`  🔑 Loan PDA: ${loanPda.toBase58()}`);
    console.log(`  🔑 Borrower: ${borrower.publicKey.toBase58()}`);

    const tx = await program.methods
      .initializeLoan(
        0,
        principal,
        800, // 8% APR
        new BN(now + 86400 * 30), // 30 days maturity
        borrower.publicKey
      )
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        loan: loanPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);

    const loan = await program.account.loan.fetch(loanPda);
    expect(loan.principal.toString()).to.equal(principal.toString());
    expect(loan.borrower.toBase58()).to.equal(borrower.publicKey.toBase58());
  });

  it("Step 5: Deposit into Tranches", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 5: Deposit into Tranches");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Investor (Lender) provides USDC liquidity.");
    console.log("  Walkthrough: The user sends USDC to the Vault Reserve PDA and automatically");
    console.log("               receives Tranche LP tokens (shares) in return. This capital");
    console.log("               is now available for the vault to disburse to borrowers.");

    const amount = new BN(50_000_000); // 50 USDC
    console.log(`► Preparing User: ${user.publicKey.toBase58()}`);
    const userUsdcAta = await createAssociatedTokenAccount(connection, admin, usdcMint, user.publicKey);
    console.log(`  🔑 User USDC ATA Created: ${userUsdcAta.toBase58()}`);
    
    console.log(`► Minting 100 USDC to User...`);
    await mintTo(connection, admin, usdcMint, userUsdcAta, admin, 100_000_000);
    console.log(`  ✔ Minting Successful`);

    const [tranchePda] = getTranchePda(vaultPda, TrancheKind.Prime, program.programId);
    const [mintPda] = getTrancheMintPda(vaultPda, TrancheKind.Prime, program.programId);
    const userTrancheAta = await getAssociatedTokenAddress(mintPda, user.publicKey);

    const start = Date.now();
    console.log(`► Calling: deposit [prism-core]`);
    console.log(`  Params: { tranche: Prime, amount: 50 USDC }`);
    console.log(`  🔑 User: ${user.publicKey.toBase58()}`);
    console.log(`  💰 User USDC Balance Before: 100 USDC`);

    const tx = await program.methods
      .deposit(TrancheKind.Prime, amount)
      .accounts({
        user: user.publicKey,
        config: configPda,
        vault: vaultPda,
        tranche: tranchePda,
        trancheMint: mintPda,
        userUsdcAta: userUsdcAta,
        vaultUsdcReserve: reservePda,
        userTrancheAta: userTrancheAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 User USDC Balance After: 50 USDC`);
    console.log(`  💰 Vault Reserve After: 50 USDC`);

    const tranche = await program.account.tranche.fetch(tranchePda);
    expect(tranche.totalAssets.toString()).to.equal(amount.toString());
  });

  it("Step 6: Disburse Loan", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 6: Disburse Loan");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Moving capital from Vault to Borrower.");
    console.log("  Walkthrough: Once the vault has enough USDC from Step 5, the admin triggers");
    console.log("               disbursement. 10 USDC moves from the Reserve PDA to the borrower.");
    console.log("               The loan state changes to 'Active', and interest begins to accrue.");

    const borrowerUsdcAta = await createAssociatedTokenAccount(connection, admin, usdcMint, borrower.publicKey);
    
    const start = Date.now();
    console.log(`► Calling: disburseLoan [prism-core]`);
    console.log(`  🔑 Loan PDA: ${loanPda.toBase58()}`);
    console.log(`  💰 Vault Reserve Before: 50 USDC`);
    console.log(`  💰 Borrower Balance Before: 0 USDC`);

    const tx = await program.methods
      .disburseLoan()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        loan: loanPda,
        vaultUsdcReserve: reservePda,
        borrowerUsdcAta: borrowerUsdcAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        ikaCollateral: null,
      })
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 Vault Reserve After: 40 USDC`);
    console.log(`  💰 Borrower Balance After: 10 USDC`);

    const loan = await program.account.loan.fetch(loanPda);
    expect(loan.state).to.have.property('active');
  });

  it("Step 7: Accrue Yield", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 7: Accrue Yield");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Distributing interest via the Waterfall Model.");
    console.log("  Walkthrough: The borrower pays 1 USDC interest. The protocol checks the");
    console.log("               target yield for each tranche and fills them from top to bottom:");
    console.log("               Prime first, then Core, then Alpha. This increases share value.");

    const yieldAmount = new BN(1_000_000); // 1 USDC
    const borrowerUsdcAta = await getAssociatedTokenAddress(usdcMint, borrower.publicKey);
    const [tP] = getTranchePda(vaultPda, TrancheKind.Prime, program.programId);
    const [tC] = getTranchePda(vaultPda, TrancheKind.Core, program.programId);
    const [tA] = getTranchePda(vaultPda, TrancheKind.Alpha, program.programId);

    const start = Date.now();
    console.log(`► Calling: accrueYield [prism-core]`);
    console.log(`  Params: { yieldAmount: 1 USDC }`);
    console.log(`  💰 Borrower Balance Before: 10 USDC`);

    const tx = await program.methods
      .accrueYield(yieldAmount)
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        tranchePrime: tP,
        trancheCore: tC,
        trancheAlpha: tA,
        borrower: borrower.publicKey,
        borrowerUsdcAta: borrowerUsdcAta,
        vaultUsdcReserve: reservePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin, borrower])
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 Borrower Balance After: 9 USDC`);
    console.log(`  💰 Vault Reserve After: 41 USDC`);
  });

  it("Step 8: Repay Loan", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 8: Repay Loan");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Borrower returns the principal.");
    console.log("  Walkthrough: The borrower sends the 10 USDC principal back to the Reserve PDA.");
    console.log("               The loan state is set to 'Repaid', making this capital available");
    console.log("               for investors to withdraw back to their personal wallets.");

    const repayAmount = new BN(10_000_000);
    const borrowerUsdcAta = await getAssociatedTokenAddress(usdcMint, borrower.publicKey);
    
    console.log(`► Preparing Borrower for Repayment...`);
    console.log(`  🔑 Borrower USDC ATA: ${borrowerUsdcAta.toBase58()}`);
    
    console.log(`► Minting 10 USDC to Borrower (for repayment principal)...`);
    await mintTo(connection, admin, usdcMint, borrowerUsdcAta, admin, 10_000_000);
    console.log(`  ✔ Minting Successful`);

    const start = Date.now();
    console.log(`► Calling: repayLoan [prism-core]`);
    console.log(`  Params: { amount: 10 USDC }`);
    console.log(`  💰 Borrower Balance Before: 19 USDC (9 + 10 minted)`);

    const tx = await program.methods
      .repayLoan(repayAmount)
      .accounts({
        borrower: borrower.publicKey,
        config: configPda,
        vault: vaultPda,
        loan: loanPda,
        borrowerUsdcAta: borrowerUsdcAta,
        vaultUsdcReserve: reservePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 Borrower Balance After: 9 USDC`);
    console.log(`  💰 Vault Reserve After: 51 USDC`);

    const loan = await program.account.loan.fetch(loanPda);
    expect(loan.state).to.have.property('repaid');
  });

  it("Step 9: Withdraw from Tranche", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 9: Withdraw from Tranche");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Investor exits the vault.");
    console.log("  Walkthrough: The user burns their LP tokens. The vault calculates their share");
    console.log("               of the current Reserve balance (Principal + Interest) and");
    console.log("               transfers the USDC back to the user's wallet.");

    const [tranchePda] = getTranchePda(vaultPda, TrancheKind.Prime, program.programId);
    const [mintPda] = getTrancheMintPda(vaultPda, TrancheKind.Prime, program.programId);
    const userTrancheAta = await getAssociatedTokenAddress(mintPda, user.publicKey);
    const userUsdcAta = await getAssociatedTokenAddress(usdcMint, user.publicKey);

    const sharesToBurn = new BN(1_000_000);

    const start = Date.now();
    console.log(`► Calling: withdraw [prism-core]`);
    console.log(`  Params: { tranche: Prime, shares: 1,000,000 }`);
    console.log(`  💰 User USDC Balance Before: 50 USDC`);
    console.log(`  💰 Vault Reserve Before: 51 USDC`);

    const tx = await program.methods
      .withdraw(TrancheKind.Prime, sharesToBurn)
      .accounts({
        user: user.publicKey,
        config: configPda,
        vault: vaultPda,
        tranche: tranchePda,
        trancheMint: mintPda,
        userUsdcAta: userUsdcAta,
        vaultUsdcReserve: reservePda,
        userTrancheAta: userTrancheAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([user])
      .rpc();

    const elapsed = Date.now() - start;
    console.log(`  ✔ Tx: ${tx}`);
    console.log(`  ⏱ Elapsed: ${elapsed}ms`);
    console.log(`  💰 User USDC Balance After: >50 USDC`);
    console.log(`  💰 Vault Reserve After: <51 USDC`);

    const tranche = await program.account.tranche.fetch(tranchePda);
  });

  it("Step 10: Protocol Pause/Unpause", async () => {
    console.log("\n════════════════════════════════════════════════");
    console.log(" Step 10: Protocol Pause/Unpause");
    console.log("════════════════════════════════════════════════");
    console.log("  Description: Administrative Emergency Controls.");
    console.log("  Walkthrough: The admin toggles the 'paused' flag in the Global Config.");
    console.log("               Instructions like 'deposit' and 'withdraw' check this flag");
    console.log("               and will throw a 'VaultPaused' error if it is set to true.");

    const startPause = Date.now();
    console.log(`► Calling: pause [prism-core]`);
    const txPause = await program.methods
      .pause()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
      })
      .rpc();
    console.log(`  ✔ Tx (Pause): ${txPause}`);
    console.log(`  ⏱ Elapsed: ${Date.now() - startPause}ms`);

    let config = await program.account.globalConfig.fetch(configPda);
    expect(config.paused).to.be.true;

    const startUnpause = Date.now();
    console.log(`► Calling: unpause [prism-core]`);
    const txUnpause = await program.methods
      .unpause()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
      })
      .rpc();
    console.log(`  ✔ Tx (Unpause): ${txUnpause}`);
    console.log(`  ⏱ Elapsed: ${Date.now() - startUnpause}ms`);

    config = await program.account.globalConfig.fetch(configPda);
    expect(config.paused).to.be.false;
  });
});
