import {
  getVaultPda as sdkVault,
  getTranchePda as sdkTranche,
  TrancheKind as sdkKind,
  getLoanPda as sdkLoan,
  getPoolPda as sdkPool,
  getLpMintPda as sdkLp,
  PRISM_CORE_PROGRAM_ID,
  PRISM_AMM_PROGRAM_ID,
} from '../dist/index.js';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

const CORE = PRISM_CORE_PROGRAM_ID;
const AMM = PRISM_AMM_PROGRAM_ID;

function appVault(id) {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(id, 0);
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), idBuf], CORE);
}
function appTranche(vault, kind) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('tranche'), vault.toBuffer(), Buffer.from([kind])],
    CORE,
  );
}
function appLoan(vault, id) {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(id, 0);
  return PublicKey.findProgramAddressSync([Buffer.from('loan'), vault.toBuffer(), idBuf], CORE);
}
function appPool(trancheMint) {
  return PublicKey.findProgramAddressSync([Buffer.from('amm'), trancheMint.toBuffer()], AMM);
}
function appLp(trancheMint) {
  return PublicKey.findProgramAddressSync([Buffer.from('amm_lp'), trancheMint.toBuffer()], AMM);
}

const [v1, vb1] = sdkVault(0);
const [v2, vb2] = appVault(0);
console.log('vault match:', v1.equals(v2), 'bump-match:', vb1 === vb2);

const [t1] = sdkTranche(v1, sdkKind.Prime);
const [t2] = appTranche(v2, 0);
console.log('tranche match:', t1.equals(t2));

const [l1] = sdkLoan(v1, 42);
const [l2] = appLoan(v2, 42);
console.log('loan match:', l1.equals(l2));

const [p1] = sdkPool(t1);
const [p2] = appPool(t2);
console.log('pool match:', p1.equals(p2));

const [lp1] = sdkLp(t1);
const [lp2] = appLp(t2);
console.log('lp match:', lp1.equals(lp2));
