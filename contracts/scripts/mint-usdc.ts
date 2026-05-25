/**
 * Mints custom devnet USDC to all demo wallets so setup-demo.ts can proceed.
 * Admin keypair must have mint authority over NEXT_PUBLIC_USDC_MINT.
 *
 * Usage:
 *   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com ts-node scripts/mint-usdc.ts
 */
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotent,
  mintTo,
  getMint,
} from "@solana/spl-token";
import * as fs from "fs";
import * as dotenv from "dotenv";

dotenv.config();

const RPC = process.env.ANCHOR_PROVIDER_URL || "http://localhost:8899";
const USDC_MINT_ADDR =
  process.env.NEXT_PUBLIC_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

function loadKeypair(path: string): Keypair {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf-8")))
  );
}

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const usdcMint = new PublicKey(USDC_MINT_ADDR);

  const admin = loadKeypair("keys/admin.json");

  // Verify admin has mint authority
  const mintInfo = await getMint(connection, usdcMint);
  if (!mintInfo.mintAuthority || !mintInfo.mintAuthority.equals(admin.publicKey)) {
    console.error(
      `Admin (${admin.publicKey.toBase58()}) is NOT the mint authority. ` +
        `Actual authority: ${mintInfo.mintAuthority?.toBase58() ?? "none"}`
    );
    process.exit(1);
  }
  console.log(`Mint authority confirmed: ${admin.publicKey.toBase58()}`);

  const wallets: Record<string, { keypair: Keypair; amount: bigint }> = {
    admin:    { keypair: admin,                         amount: 10_000_000_000n },
    borrower: { keypair: loadKeypair("keys/borrower.json"), amount: 15_000_000_000n },
    lpPrime:  { keypair: loadKeypair("keys/lpPrime.json"),  amount: 10_000_000_000n },
    lpCore:   { keypair: loadKeypair("keys/lpCore.json"),   amount:  5_000_000_000n },
    lpAlpha:  { keypair: loadKeypair("keys/lpAlpha.json"),  amount:  5_000_000_000n },
    mm:       { keypair: loadKeypair("keys/mm.json"),       amount:  5_000_000_000n },
  };

  for (const [name, { keypair, amount }] of Object.entries(wallets)) {
    try {
      const ata = await createAssociatedTokenAccountIdempotent(
        connection,
        admin,
        usdcMint,
        keypair.publicKey
      );

      const before = await connection.getTokenAccountBalance(ata).catch(() => ({ value: { amount: "0" } }));
      const currentBalance = BigInt(before.value.amount);

      if (currentBalance >= amount) {
        console.log(`[${name}] already has ${Number(currentBalance) / 1e6} USDC — skipping`);
        continue;
      }

      const toMint = amount - currentBalance;
      await mintTo(connection, admin, usdcMint, ata, admin, toMint);
      console.log(`[${name}] minted ${Number(toMint) / 1e6} USDC → ${ata.toBase58()}`);
    } catch (e) {
      console.error(`[${name}] FAILED:`, e instanceof Error ? e.message : e);
    }
  }

  console.log("\nDone. Re-run setup-demo.ts now.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
