import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const KEYS_DIR = path.join(__dirname, "../keys");

if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
}

const keyNames = [
  "admin",
  "borrower",
  "lp_prime",
  "lp_core",
  "lp_alpha",
  "mm",
];

function generateKey(name: string) {
  const filePath = path.join(KEYS_DIR, `${name}.json`);
  if (fs.existsSync(filePath)) {
    console.log(`Key ${name}.json already exists, skipping.`);
    return;
  }

  const kp = Keypair.generate();
  const secretKey = Array.from(kp.secretKey);
  fs.writeFileSync(filePath, JSON.stringify(secretKey));
  console.log(`Generated ${name}.json: ${kp.publicKey.toBase58()}`);
}

console.log("Generating devnet keypairs...");
keyNames.forEach(generateKey);
console.log("Done.");
