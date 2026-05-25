/**
 * IKA Collateral Integration Test
 *
 * Covers the full lending lifecycle with IKA dWallet collateral:
 *   1. LP deposits into tranche pool
 *   2. Yield accrues → token NAV rises
 *   3. Borrower attaches + verifies IKA collateral (ed25519 oracle sig)
 *   4. Loan disbursal gated on Locked collateral
 *   5. Repayment → collateral Released
 *   6. LP withdraws (receives principal + yield)
 *   7. Default path: credit event → NAV falls → LP still withdraws (receives less)
 *
 * Run from contracts/ dir:
 *   yarn test:skip-build  (assumes anchor build already done)
 *   yarn test             (builds then runs)
 */

import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import {
  Ed25519Program,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddress,
  mintTo,
} from "@solana/spl-token";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { expect } from "chai";
import {
  TrancheKind,
  getCreditEventPda,
  getConfigPda,
  getIkaCollateralPda,
  getLoanPda,
  getLossBucketPda,
  getTrancheMintPda,
  getTranchePda,
  getVaultPda,
  getVaultReservePda,
} from "../lib/pda";
import type { PrismCoreProgram } from "../lib/accounts";

// ── Test oracle keypair (same seed as app/api/ika-test-oracle/route.ts) ─────
const TEST_ORACLE_SEED = Buffer.from(
  "fc0dfc6881aee8d6af913f60fff07ab0b1ec16427573ab6d33b3825df3a52820",
  "hex"
);
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const oraclePrivKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, TEST_ORACLE_SEED]),
  format: "der",
  type: "pkcs8",
});
const oraclePubkeyRaw = Buffer.from(
  createPublicKey(oraclePrivKey).export({ type: "spki", format: "der" }).slice(-32)
);
const oraclePubkey = new PublicKey(oraclePubkeyRaw);

/** Build the 81-byte IKA attestation message (must match verify_ika_collateral.rs layout). */
function buildAttestationMessage(
  dwalletId: Buffer,
  chainId: number,
  amountUsdMicro: bigint,
  loanPubkey: PublicKey
): Buffer {
  const msg = Buffer.alloc(81);
  Buffer.from("ika_atts").copy(msg, 0);
  dwalletId.copy(msg, 8);
  msg.writeUInt8(chainId, 40);
  msg.writeBigUInt64LE(amountUsdMicro, 41);
  loanPubkey.toBuffer().copy(msg, 49);
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("ika-collateral", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.PrismCore as PrismCoreProgram;
  const connection = provider.connection;
  const admin = (provider.wallet as anchor.Wallet).payer;

  // Fresh keypairs for this test suite
  const lp = Keypair.generate();
  const borrower = Keypair.generate();

  // Use a random vault ID so tests can run alongside prism-core.ts on the same localnet
  const vaultId = Math.floor(Math.random() * 1_000_000);

  let usdcMint: PublicKey;
  let [configPda] = getConfigPda(program.programId);
  let [vaultPda] = getVaultPda(vaultId, program.programId);
  let [reservePda] = getVaultReservePda(vaultPda, program.programId);
  let [lossBucketPda] = getLossBucketPda(vaultPda, program.programId);
  let [loanPda] = getLoanPda(vaultPda, 0, program.programId);
  let [ikaCollateralPda] = getIkaCollateralPda(loanPda, program.programId);

  let lpUsdcAta: PublicKey;
  let borrowerUsdcAta: PublicKey;

  // Fixed dWallet test values
  const DWALLET_ID = Buffer.alloc(32, 0xaa); // 32 bytes of 0xAA
  const CHAIN_ID = 0; // BTC
  const COLLATERAL_USD_MICRO = 10_000_000_000n; // $10,000 (oracle returns $50,000 — passes ≥ check)
  const ORACLE_COLLATERAL_USD_MICRO = 50_000_000_000n; // what the oracle always attests

  // ── Full protocol setup ──────────────────────────────────────────────────
  before("protocol setup", async () => {
    console.log("\n══════════════════════════════════════════════");
    console.log("  IKA-Collateral Setup");
    console.log(`  Oracle pubkey: ${oraclePubkey.toBase58()}`);
    console.log(`  Vault ID: ${vaultId}`);
    console.log("══════════════════════════════════════════════");

    // SOL airdrops
    await Promise.all([
      connection
        .requestAirdrop(lp.publicKey, 2 * LAMPORTS_PER_SOL)
        .then((s) => connection.confirmTransaction(s)),
      connection
        .requestAirdrop(borrower.publicKey, 2 * LAMPORTS_PER_SOL)
        .then((s) => connection.confirmTransaction(s)),
    ]);
    console.log("  ✔ SOL airdrops confirmed");

    // USDC mock mint
    usdcMint = await createMint(connection, admin, admin.publicKey, null, 6);
    console.log(`  ✔ USDC mint: ${usdcMint.toBase58()}`);

    // ATAs
    lpUsdcAta = await createAssociatedTokenAccount(connection, admin, usdcMint, lp.publicKey);
    borrowerUsdcAta = await createAssociatedTokenAccount(
      connection,
      admin,
      usdcMint,
      borrower.publicKey
    );

    // Mint USDC to LP and borrower
    await mintTo(connection, admin, usdcMint, lpUsdcAta, admin, 200_000_000); // 200 USDC
    await mintTo(connection, admin, usdcMint, borrowerUsdcAta, admin, 100_000_000); // 100 USDC (for yield + repay)

    // Global config (shared — idempotent)
    const configInfo = await connection.getAccountInfo(configPda);
    if (!configInfo) {
      await program.methods
        .initializeGlobalConfig(500, [admin.publicKey])
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          usdcMint,
          systemProgram: SystemProgram.programId,
        } as any)
        .rpc();
      console.log("  ✔ GlobalConfig initialized");
    } else {
      console.log("  ✔ GlobalConfig already exists — reusing");
    }

    // Vault
    await program.methods
      .initializeVault(vaultId)
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeVaultReserves()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        usdcMint,
        vaultUsdcReserve: reservePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .initializeVaultLossBucket()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        usdcMint,
        lossBucket: lossBucketPda,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("  ✔ Vault + Reserve + LossBucket initialized");

    // Tranches
    for (const [kind, apy] of [
      [TrancheKind.Prime, 500],
      [TrancheKind.Core, 800],
      [TrancheKind.Alpha, 1500],
    ] as [TrancheKind, number][]) {
      const [tranchePda] = getTranchePda(vaultPda, kind, program.programId);
      const [mintPda] = getTrancheMintPda(vaultPda, kind, program.programId);
      await program.methods
        .initializeTranche(kind, apy)
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
    }
    console.log("  ✔ Prime / Core / Alpha tranches initialized");

    // Loan (principal = 20 USDC)
    const now = Math.floor(Date.now() / 1000);
    await program.methods
      .initializeLoan(
        0,
        new BN(20_000_000), // 20 USDC principal
        800, // 8% APR
        new BN(now + 86400 * 30), // 30-day maturity
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
    console.log("  ✔ Loan #0 initialized (borrower, 20 USDC, 30 days)");
  });

  // ── 1. LP Deposit ────────────────────────────────────────────────────────
  it("LP deposits 100 USDC into Alpha tranche and receives tranche tokens", async () => {
    const [tranchePda] = getTranchePda(vaultPda, TrancheKind.Alpha, program.programId);
    const [mintPda] = getTrancheMintPda(vaultPda, TrancheKind.Alpha, program.programId);
    const lpTrancheAta = await getAssociatedTokenAddress(mintPda, lp.publicKey);

    const depositAmount = new BN(100_000_000); // 100 USDC

    await program.methods
      .deposit(TrancheKind.Alpha, depositAmount)
      .accounts({
        user: lp.publicKey,
        config: configPda,
        vault: vaultPda,
        tranche: tranchePda,
        trancheMint: mintPda,
        userUsdcAta: lpUsdcAta,
        vaultUsdcReserve: reservePda,
        userTrancheAta: lpTrancheAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([lp])
      .rpc();

    const tranche = await program.account.tranche.fetch(tranchePda);
    expect(tranche.totalAssets.toString()).to.equal("100000000", "tranche holds 100 USDC");
    expect(tranche.totalSupply.toNumber()).to.be.greaterThan(0, "LP tokens minted");
    console.log(
      `  ✔ Deposit OK — totalAssets=${tranche.totalAssets}, totalSupply=${tranche.totalSupply}`
    );
  });

  // ── 2. Attach IKA collateral ─────────────────────────────────────────────
  it("borrower attaches IKA dWallet collateral → status Pending", async () => {
    await program.methods
      .attachIkaCollateral(
        Array.from(DWALLET_ID) as unknown as number[], // [u8; 32]
        CHAIN_ID,
        new BN(COLLATERAL_USD_MICRO.toString()),
        oraclePubkey
      )
      .accounts({
        borrower: borrower.publicKey,
        loan: loanPda,
        ikaCollateral: ikaCollateralPda,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    const col = await program.account.ikaCollateral.fetch(ikaCollateralPda);
    expect(col.status).to.have.property("pending");
    expect(col.oraclePubkey.toBase58()).to.equal(oraclePubkey.toBase58());
    expect(col.chainId).to.equal(CHAIN_ID);
    console.log(`  ✔ IKA collateral attached — status=Pending, oracle=${oraclePubkey.toBase58()}`);
  });

  // ── 3. Verify IKA collateral (ed25519 precompile) ────────────────────────
  it("borrower verifies IKA collateral with oracle ed25519 signature → status Locked", async () => {
    // Build the exact same 81-byte message the oracle would sign
    const msg = buildAttestationMessage(
      DWALLET_ID,
      CHAIN_ID,
      ORACLE_COLLATERAL_USD_MICRO,
      loanPda
    );

    // Sign with the test oracle private key
    const sigBytes = sign(null, msg, oraclePrivKey);

    // Build ix[0]: native ed25519 precompile validates the signature on-chain
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
      publicKey: new Uint8Array(oraclePubkeyRaw),
      message: new Uint8Array(msg),
      signature: new Uint8Array(sigBytes),
    });

    // Build ix[1]: verify_ika_collateral reads ix[0] via instructions sysvar
    const verifyIx = await program.methods
      .verifyIkaCollateral()
      .accounts({
        signer: admin.publicKey,
        config: configPda,
        loan: loanPda,
        ikaCollateral: ikaCollateralPda,
        instructionsSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
      })
      .instruction();

    // Send both instructions in one atomic transaction
    const tx = new Transaction().add(ed25519Ix, verifyIx);
    await provider.sendAndConfirm(tx, [admin]);

    const col = await program.account.ikaCollateral.fetch(ikaCollateralPda);
    expect(col.status).to.have.property("locked");
    expect(col.lockedTs.toNumber()).to.be.greaterThan(0, "locked_ts must be set");
    // Oracle's attested amount ($50k) should override our registered amount ($10k)
    expect(col.collateralAmountUsd.toString()).to.equal(
      ORACLE_COLLATERAL_USD_MICRO.toString(),
      "collateral amount updated to oracle-attested value"
    );
    console.log(
      `  ✔ IKA collateral verified — status=Locked, attestedUsd=${col.collateralAmountUsd}`
    );
  });

  // ── 4. Disburse loan (gated on Locked collateral) ────────────────────────
  it("admin disburses loan when IKA collateral is Locked", async () => {
    const balBefore = await connection.getTokenAccountBalance(borrowerUsdcAta);

    await program.methods
      .disburseLoan()
      .accounts({
        admin: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        loan: loanPda,
        vaultUsdcReserve: reservePda,
        borrowerUsdcAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        ikaCollateral: ikaCollateralPda,
      })
      .rpc();

    const loan = await program.account.loan.fetch(loanPda);
    expect(loan.state).to.have.property("active");

    const balAfter = await connection.getTokenAccountBalance(borrowerUsdcAta);
    const received =
      Number(balAfter.value.amount) - Number(balBefore.value.amount);
    expect(received).to.equal(20_000_000, "borrower must receive exactly 20 USDC");
    console.log(`  ✔ Loan disbursed — borrower received ${received / 1e6} USDC`);
  });

  // ── 5. Accrue yield → NAV increases ──────────────────────────────────────
  it("yield accrual increases Alpha tranche NAV per share", async () => {
    const [tP] = getTranchePda(vaultPda, TrancheKind.Prime, program.programId);
    const [tC] = getTranchePda(vaultPda, TrancheKind.Core, program.programId);
    const [tA] = getTranchePda(vaultPda, TrancheKind.Alpha, program.programId);

    const before = await program.account.tranche.fetch(tA);
    const navBefore = BigInt(before.navPerShareQ.toString());

    // Borrower pays 5 USDC interest
    const yieldAmount = new BN(5_000_000);
    await program.methods
      .accrueYield(yieldAmount)
      .accounts({
        authority: admin.publicKey,
        config: configPda,
        vault: vaultPda,
        tranchePrime: tP,
        trancheCore: tC,
        trancheAlpha: tA,
        borrower: borrower.publicKey,
        borrowerUsdcAta,
        vaultUsdcReserve: reservePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([admin, borrower])
      .rpc();

    const after = await program.account.tranche.fetch(tA);
    const navAfter = BigInt(after.navPerShareQ.toString());
    expect(navAfter > navBefore).to.be.true;
    console.log(
      `  ✔ Alpha NAV rose: ${navBefore} → ${navAfter} (Q64 units)`
    );
  });

  // ── 6. Repay loan ────────────────────────────────────────────────────────
  it("borrower repays full principal → loan state Repaid", async () => {
    const repayAmount = new BN(20_000_000); // 20 USDC

    await program.methods
      .repayLoan(repayAmount)
      .accounts({
        borrower: borrower.publicKey,
        config: configPda,
        vault: vaultPda,
        loan: loanPda,
        borrowerUsdcAta,
        vaultUsdcReserve: reservePda,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([borrower])
      .rpc();

    const loan = await program.account.loan.fetch(loanPda);
    expect(loan.state).to.have.property("repaid");
    console.log("  ✔ Loan repaid");
  });

  // ── 7. Release IKA collateral ────────────────────────────────────────────
  it("release IKA collateral after repayment → status Released", async () => {
    await program.methods
      .releaseIkaCollateral()
      .accounts({
        signer: admin.publicKey,
        loan: loanPda,
        ikaCollateral: ikaCollateralPda,
      })
      .rpc();

    const col = await program.account.ikaCollateral.fetch(ikaCollateralPda);
    expect(col.status).to.have.property("released");
    console.log("  ✔ IKA collateral released — IKA Network will unlock dWallet BTC/ETH");
  });

  // ── 8. LP withdraws (receives principal + yield) ────────────────────────
  it("LP withdraws Alpha shares and receives more USDC than deposited (yield earned)", async () => {
    const [tranchePda] = getTranchePda(vaultPda, TrancheKind.Alpha, program.programId);
    const [mintPda] = getTrancheMintPda(vaultPda, TrancheKind.Alpha, program.programId);
    const lpTrancheAta = await getAssociatedTokenAddress(mintPda, lp.publicKey);

    const tranche = await program.account.tranche.fetch(tranchePda);
    const allShares = tranche.totalSupply; // burn everything

    const lpUsdcBefore = await connection.getTokenAccountBalance(lpUsdcAta);

    await program.methods
      .withdraw(TrancheKind.Alpha, allShares)
      .accounts({
        user: lp.publicKey,
        config: configPda,
        vault: vaultPda,
        tranche: tranchePda,
        trancheMint: mintPda,
        userUsdcAta: lpUsdcAta,
        vaultUsdcReserve: reservePda,
        userTrancheAta: lpTrancheAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([lp])
      .rpc();

    const lpUsdcAfter = await connection.getTokenAccountBalance(lpUsdcAta);
    const received =
      Number(lpUsdcAfter.value.amount) - Number(lpUsdcBefore.value.amount);
    // LP deposited 100 USDC. After yield they should get back > 100 USDC
    expect(received).to.be.greaterThan(100_000_000, "LP must earn more than deposited");
    console.log(`  ✔ LP withdrew ${received / 1e6} USDC (deposited 100 USDC, earned yield)`);
  });

  // ── Default path (separate vault) ────────────────────────────────────────
  describe("default path — credit event reduces NAV, LP still withdraws", () => {
    const vaultId2 = Math.floor(Math.random() * 1_000_000);
    const lp2 = Keypair.generate();
    let vaultPda2: PublicKey;
    let reservePda2: PublicKey;
    let lossBucketPda2: PublicKey;
    let lp2UsdcAta: PublicKey;

    before("default vault setup", async () => {
      [vaultPda2] = getVaultPda(vaultId2, program.programId);
      [reservePda2] = getVaultReservePda(vaultPda2, program.programId);
      [lossBucketPda2] = getLossBucketPda(vaultPda2, program.programId);

      await connection
        .requestAirdrop(lp2.publicKey, 2 * LAMPORTS_PER_SOL)
        .then((s) => connection.confirmTransaction(s));

      lp2UsdcAta = await createAssociatedTokenAccount(
        connection,
        admin,
        usdcMint,
        lp2.publicKey
      );
      await mintTo(connection, admin, usdcMint, lp2UsdcAta, admin, 100_000_000); // 100 USDC

      // Vault2
      await program.methods
        .initializeVault(vaultId2)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          vault: vaultPda2,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .initializeVaultReserves()
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          vault: vaultPda2,
          usdcMint,
          vaultUsdcReserve: reservePda2,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      await program.methods
        .initializeVaultLossBucket()
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          vault: vaultPda2,
          usdcMint,
          lossBucket: lossBucketPda2,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      for (const [kind, apy] of [
        [TrancheKind.Prime, 500],
        [TrancheKind.Core, 800],
        [TrancheKind.Alpha, 1500],
      ] as [TrancheKind, number][]) {
        const [tranchePda] = getTranchePda(vaultPda2, kind, program.programId);
        const [mintPda] = getTrancheMintPda(vaultPda2, kind, program.programId);
        await program.methods
          .initializeTranche(kind, apy)
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            vault: vaultPda2,
            tranche: tranchePda,
            trancheMint: mintPda,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
      }
      console.log(`  ✔ Default vault (id=${vaultId2}) set up`);

      // LP2 deposits 100 USDC into Alpha2
      const [tranchePda2] = getTranchePda(vaultPda2, TrancheKind.Alpha, program.programId);
      const [mintPda2] = getTrancheMintPda(vaultPda2, TrancheKind.Alpha, program.programId);
      const lp2TrancheAta = await getAssociatedTokenAddress(mintPda2, lp2.publicKey);

      await program.methods
        .deposit(TrancheKind.Alpha, new BN(100_000_000))
        .accounts({
          user: lp2.publicKey,
          config: configPda,
          vault: vaultPda2,
          tranche: tranchePda2,
          trancheMint: mintPda2,
          userUsdcAta: lp2UsdcAta,
          vaultUsdcReserve: reservePda2,
          userTrancheAta: lp2TrancheAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([lp2])
        .rpc();
      console.log("  ✔ LP2 deposited 100 USDC into Alpha (vault2)");
    });

    it("trigger credit event (Default) → Alpha tranche NAV drops", async () => {
      const vault2Acc = await program.account.vault.fetch(vaultPda2);
      const [creditEventPda] = getCreditEventPda(vaultPda2, vault2Acc.creditEventSeq, program.programId);

      const [tP2] = getTranchePda(vaultPda2, TrancheKind.Prime, program.programId);
      const [tC2] = getTranchePda(vaultPda2, TrancheKind.Core, program.programId);
      const [tA2] = getTranchePda(vaultPda2, TrancheKind.Alpha, program.programId);

      const alphaBefore = await program.account.tranche.fetch(tA2);
      const navBefore = BigInt(alphaBefore.navPerShareQ.toString());

      // 30% loss (3000 bps), event_type=0 (Default), loss_amount=30 USDC
      await program.methods
        .triggerCreditEvent(0, new BN(30_000_000), 3000)
        .accounts({
          authority: admin.publicKey,
          config: configPda,
          vault: vaultPda2,
          tranchePrime: tP2,
          trancheCore: tC2,
          trancheAlpha: tA2,
          vaultUsdcReserve: reservePda2,
          lossBucket: lossBucketPda2,
          creditEvent: creditEventPda,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const alphaAfter = await program.account.tranche.fetch(tA2);
      const navAfter = BigInt(alphaAfter.navPerShareQ.toString());

      expect(navAfter < navBefore).to.be.true;
      console.log(
        `  ✔ Credit event triggered — Alpha NAV fell: ${navBefore} → ${navAfter} (Q64 units)`
      );
    });

    it("LP withdraws Alpha shares after default — receives less USDC than deposited", async () => {
      const [tranchePda2] = getTranchePda(vaultPda2, TrancheKind.Alpha, program.programId);
      const [mintPda2] = getTrancheMintPda(vaultPda2, TrancheKind.Alpha, program.programId);
      const lp2TrancheAta = await getAssociatedTokenAddress(mintPda2, lp2.publicKey);

      const tranche2 = await program.account.tranche.fetch(tranchePda2);
      const allShares = tranche2.totalSupply;

      const lp2UsdcBefore = await connection.getTokenAccountBalance(lp2UsdcAta);

      await program.methods
        .withdraw(TrancheKind.Alpha, allShares)
        .accounts({
          user: lp2.publicKey,
          config: configPda,
          vault: vaultPda2,
          tranche: tranchePda2,
          trancheMint: mintPda2,
          userUsdcAta: lp2UsdcAta,
          vaultUsdcReserve: reservePda2,
          userTrancheAta: lp2TrancheAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([lp2])
        .rpc();

      const lp2UsdcAfter = await connection.getTokenAccountBalance(lp2UsdcAta);
      const received =
        Number(lp2UsdcAfter.value.amount) - Number(lp2UsdcBefore.value.amount);

      // LP deposited 100 USDC. After a 30 USDC default they get back only 70 USDC.
      expect(received).to.be.lessThan(100_000_000, "LP must receive less than deposited after default");
      expect(received).to.be.greaterThan(0, "LP must still receive something");
      console.log(
        `  ✔ LP withdrew ${received / 1e6} USDC after default (deposited 100 USDC, lost to default)`
      );
    });
  });
});
