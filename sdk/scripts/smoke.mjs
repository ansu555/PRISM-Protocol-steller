import {
  PRISM_CORE_PROGRAM_ID,
  PRISM_AMM_PROGRAM_ID,
  TrancheKind,
  USDC_MINT,
  Q64_ONE,
  BPS_DENOMINATOR,
  MIN_LIQUIDITY,
  DEFAULT_FEE_BPS,
  MAX_FEE_BPS,
  SECONDS_PER_YEAR,
  getConfigPda,
  getVaultPda,
  getTranchePda,
  getVaultReservePda,
  getLossBucketPda,
  getLoanPda,
  getPoolPda,
  getLpMintPda,
  buildPrograms,
  PrismCoreError,
  PrismAmmError,
  decodeAnchorError,
  formatUsdc,
  parseUsdc,
  formatNavQ,
  stateName,
} from '../dist/index.js';
import { Connection, Keypair } from '@solana/web3.js';

console.log('-- IDs --');
console.log('core:', PRISM_CORE_PROGRAM_ID.toBase58());
console.log('amm: ', PRISM_AMM_PROGRAM_ID.toBase58());
console.log('usdc:', USDC_MINT.toBase58());

console.log('-- Constants --');
console.log({ Q64_ONE, BPS_DENOMINATOR, MIN_LIQUIDITY, DEFAULT_FEE_BPS, MAX_FEE_BPS, SECONDS_PER_YEAR });

console.log('-- PDAs --');
const [config, configBump] = getConfigPda();
const [vault, vaultBump] = getVaultPda(0);
const [primeT] = getTranchePda(vault, TrancheKind.Prime);
const [coreT] = getTranchePda(vault, TrancheKind.Core);
const [alphaT] = getTranchePda(vault, TrancheKind.Alpha);
const [reserve] = getVaultReservePda(vault);
const [loss] = getLossBucketPda(vault);
const [loan] = getLoanPda(vault, 1);
const [pool] = getPoolPda(primeT);
const [lp] = getLpMintPda(primeT);
console.log({
  config: config.toBase58(),
  configBump,
  vault: vault.toBase58(),
  vaultBump,
  primeT: primeT.toBase58(),
  coreT: coreT.toBase58(),
  alphaT: alphaT.toBase58(),
  reserve: reserve.toBase58(),
  loss: loss.toBase58(),
  loan: loan.toBase58(),
  pool: pool.toBase58(),
  lp: lp.toBase58(),
});

console.log('-- Format helpers --');
console.log({
  parsed: parseUsdc('1,250.50'),
  formatted: formatUsdc(1_250_500_000n),
  nav: formatNavQ(Q64_ONE),
  state: stateName({ active: {} }),
});

console.log('-- Errors --');
console.log({
  vaultPaused: PrismCoreError.VaultPaused,
  trancheWiped: PrismCoreError.TrancheWipedNoDepositsAllowed,
  ammSlip: PrismAmmError.SlippageExceeded,
});

console.log('-- Decode error (Anchor shape) --');
const decoded = decodeAnchorError({
  error: { errorCode: { code: 'VaultPaused', number: 6001 }, errorMessage: 'Vault is paused' },
  message:
    'AnchorError caused by account: vault. Error Code: VaultPaused. Error Number: 6001. Error Message: Vault is paused. Program prism_core consumed 12345 of 200000 compute units',
});
console.log(decoded);

console.log('-- Decode error (string shape, amm) --');
const decoded2 = decodeAnchorError(
  'Program 7hbMRBwXF13fqqL8HGsgPrAakv21YoQz2KjtBpDTrRXf invoke [1]\nprism_amm: custom program error: 0x1771',
);
console.log(decoded2);

console.log('-- Decode error (ambiguous, prefers core) --');
const decoded3 = decodeAnchorError({ error: { errorCode: { code: 'X', number: 6005 } } });
console.log(decoded3);

console.log('-- buildPrograms instantiation --');
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const { core, amm, provider } = buildPrograms(conn, Keypair.generate());
console.log('core.programId:', core.programId.toBase58());
console.log('amm.programId: ', amm.programId.toBase58());
console.log('provider.publicKey:', provider.publicKey.toBase58());

console.log('-- ALL CHECKS PASSED --');
