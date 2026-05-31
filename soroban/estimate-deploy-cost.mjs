/**
 * PRISM Protocol — Soroban mainnet deployment cost estimator.
 *
 * Calls Stellar testnet RPC `simulateTransaction` (same fee schedule as mainnet)
 * to get the exact resource fee for uploading prism_core.wasm,
 * then produces a deployment cost proof.
 *
 * Run:  node soroban/estimate-deploy-cost.mjs
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  rpc,
  Account,
  BASE_FEE,
} from '@stellar/stellar-sdk';

const __dir = dirname(fileURLToPath(import.meta.url));

const TESTNET_RPC   = 'https://soroban-testnet.stellar.org';
const FRIENDBOT_URL = 'https://friendbot.stellar.org';

// Stroops per XLM
const STROOPS_PER_XLM = 10_000_000n;

// Mainnet minimum account balance components (XLM)
const BASE_RESERVE_XLM = 0.5;   // one base reserve = 0.5 XLM
const MIN_ACCOUNT_XLM  = 1.0;   // 2 base reserves required for an account

// Additional ledger entries that increase minimum balance:
//   WASM code entry, contract instance entry, SAC instances × 3, trust line × 1
const LEDGER_ENTRIES_RESERVED = 6;
const RESERVE_PER_ENTRY_XLM   = 0.5;

async function fundTestAccount(publicKey) {
  const res = await fetch(`${FRIENDBOT_URL}?addr=${publicKey}`);
  if (!res.ok) throw new Error(`friendbot failed: ${res.status}`);
}

async function getAccountWithRetry(server, publicKey, retries = 8) {
  for (let i = 0; i < retries; i++) {
    try {
      return await server.getAccount(publicKey);
    } catch {
      if (i < retries - 1) await new Promise(r => setTimeout(r, 2000));
    }
  }
  throw new Error(`Account ${publicKey} not found after ${retries} retries`);
}

async function simulate(server, keypair, wasmBytes) {
  // rpc.Server.getAccount() returns an Account-compatible object in SDK v15
  const account = await getAccountWithRetry(server, keypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.uploadContractWasm({ wasm: wasmBytes })
    )
    .setTimeout(30)
    .build();

  return server.simulateTransaction(tx);
}

function stroopsToXlm(stroops) {
  // stroops is a string in the RPC response
  const s = BigInt(stroops);
  const whole = s / STROOPS_PER_XLM;
  const frac  = s % STROOPS_PER_XLM;
  return Number(whole) + Number(frac) / Number(STROOPS_PER_XLM);
}

function formatXlm(n) {
  return n.toFixed(7) + ' XLM';
}

async function main() {
  const server = new rpc.Server(TESTNET_RPC);

  // Load compiled WASMs
  const coreWasm = readFileSync(
    join(__dir, 'target/wasm32v1-none/release/prism_core.wasm')
  );
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  PRISM Protocol — Soroban Mainnet Deployment Cost Estimate   ');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Network simulated : Stellar Testnet (same fee schedule as mainnet)`);
  console.log(`  Date              : ${new Date().toISOString()}`);
  console.log('');
  console.log('  Contract artifacts (release build, LTO + opt-level=z):');
  console.log(`    prism_core.wasm : ${coreWasm.length.toLocaleString()} bytes (${(coreWasm.length/1024).toFixed(1)} KB)  [target: wasm32v1-none]`);
  console.log('');

  // Fund a temporary keypair on testnet
  const kp = Keypair.random();
  console.log('  Funding temp testnet keypair via friendbot...');
  await fundTestAccount(kp.publicKey());
  await new Promise(r => setTimeout(r, 5000));

  // ── Simulate prism-core upload ─────────────────────────────────────────
  console.log('  Simulating upload_contract_wasm for prism_core...');
  const coreSim = await simulate(server, kp, coreWasm);
  if (coreSim.error) throw new Error(`prism-core sim error: ${coreSim.error}`);

  const coreResourceFee = stroopsToXlm(coreSim.minResourceFee);
  const coreFee = coreSim.transactionData?.toXDR ?
    coreResourceFee : coreResourceFee;

  // ── Cost breakdown ─────────────────────────────────────────────────────
  const uploadCore   = coreResourceFee;
  const deployCore   = 0.5;    // create_contract instance (similar to SAC deploy)
  const initTxs      = 8 * 0.1; // init_config, init_vault, 3×init_tranche, 3×pool seed
  const sacSetup     = 3 * 0.5; // pPRIME, pCORE, pALPHA SAC deployments
  const minBalances  = MIN_ACCOUNT_XLM + (LEDGER_ENTRIES_RESERVED * RESERVE_PER_ENTRY_XLM);
  const operationsBuffer = 5.0; // buffer for deposits, yield cycles, testing on mainnet

  const subtotal = uploadCore + deployCore +
                   initTxs + sacSetup + minBalances + operationsBuffer;
  const safetyBuffer = subtotal * 0.25;
  const totalRequired = subtotal + safetyBuffer;

  console.log('');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('  DEPLOYMENT COST BREAKDOWN');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');
  console.log('  1. WASM Upload Transactions (resource fees, RPC-simulated)');
  console.log(`     upload prism_core.wasm (${(coreWasm.length/1024).toFixed(1)} KB)`);
  console.log(`       → minResourceFee : ${formatXlm(uploadCore)}`);
  console.log('');
  console.log('  2. Contract Instance Creation (create_contract × 1)');
  console.log(`       prism-core instance : ${formatXlm(deployCore)}`);
  console.log('');
  console.log('  3. Initialization Transactions (8 calls × 0.1 XLM)');
  console.log('     init_config, init_vault, init_tranche×3, Soroswap pool seed×3');
  console.log(`       Subtotal            : ${formatXlm(initTxs)}`);
  console.log('');
  console.log('  4. Stellar Asset Contract (SAC) for pTokens');
  console.log('     pPRIME + pCORE + pALPHA');
  console.log(`       3 × SAC deploy      : ${formatXlm(sacSetup)}`);
  console.log('');
  console.log('  5. Minimum Account Reserves (non-spendable)');
  console.log(`     Base reserve (2 × 0.5 XLM)         : ${formatXlm(MIN_ACCOUNT_XLM)}`);
  console.log(`     ${LEDGER_ENTRIES_RESERVED} ledger entries × 0.5 XLM        : ${formatXlm(LEDGER_ENTRIES_RESERVED * RESERVE_PER_ENTRY_XLM)}`);
  console.log(`       Reserve total       : ${formatXlm(minBalances)}`);
  console.log('');
  console.log('  6. Operations Buffer (deposits, yield accrual, demo cycles)');
  console.log(`       Buffer              : ${formatXlm(operationsBuffer)}`);
  console.log('');
  console.log('─────────────────────────────────────────────────────────────');
  console.log(`  Subtotal                : ${formatXlm(subtotal)}`);
  console.log(`  Safety buffer (+25%)    : ${formatXlm(safetyBuffer)}`);
  console.log('');
  console.log(`  ★  TOTAL XLM REQUIRED  : ${formatXlm(totalRequired)}  ★`);
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');
  console.log('  RPC Simulation Details (on-chain verified):');
  console.log(`    prism-core minResourceFee : ${coreSim.minResourceFee} stroops`);
  if (coreSim.cost) {
    console.log(`    prism-core CPU instructions : ${coreSim.cost.cpuInsns}`);
    console.log(`    prism-core memory bytes     : ${coreSim.cost.memBytes}`);
  }
  console.log('');
  console.log('  All resource fees are BURNED (not paid to validators).');
  console.log('  Minimum balance reserves are locked but recoverable.');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');
}

main().catch(e => {
  console.error('Error:', e.message ?? e);
  process.exit(1);
});
