import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { readFileSync } from 'fs';
import { join } from 'path';

const RPC = 'https://api.devnet.solana.com';
const AMOUNT_SOL = 0.5;
const KEYS_DIR = join(import.meta.dir, 'keys');

function loadKeypair(file: string): Keypair {
  const raw = JSON.parse(readFileSync(join(KEYS_DIR, file), 'utf-8'));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

const TRADERS = ['lp_prime.json', 'lp_core.json', 'lp_alpha.json', 'borrower.json', 'mm.json'];

const connection = new Connection(RPC, 'confirmed');
const admin = loadKeypair('admin.json');

console.log(`Admin: ${admin.publicKey.toBase58()}`);
const adminBalance = await connection.getBalance(admin.publicKey);
console.log(`Admin balance: ${adminBalance / LAMPORTS_PER_SOL} SOL`);
console.log(`Transferring ${AMOUNT_SOL} SOL to ${TRADERS.length} wallets...\n`);

for (const file of TRADERS) {
  const wallet = loadKeypair(file);
  const before = await connection.getBalance(wallet.publicKey);
  const lamports = AMOUNT_SOL * LAMPORTS_PER_SOL;

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: admin.publicKey,
      toPubkey: wallet.publicKey,
      lamports,
    }),
  );

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = admin.publicKey;
  tx.sign(admin);

  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, 'confirmed');

  const after = await connection.getBalance(wallet.publicKey);
  console.log(`${file.padEnd(16)} ${wallet.publicKey.toBase58().slice(0, 8)}…  ${(before / LAMPORTS_PER_SOL).toFixed(4)} → ${(after / LAMPORTS_PER_SOL).toFixed(4)} SOL  tx: ${sig.slice(0, 16)}…`);
}

console.log('\nDone.');
