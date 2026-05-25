import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';

import { PRISM_AMM_PROGRAM_ID, PRISM_CORE_PROGRAM_ID, TrancheKind } from './constants';

export function getConfigPda(programId: PublicKey = PRISM_CORE_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('config2')], programId);
}

export function getVaultPda(
  vaultId: number,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(vaultId, 0);
  return PublicKey.findProgramAddressSync([Buffer.from('vault'), idBuf], programId);
}

export function getTranchePda(
  vault: PublicKey,
  kind: TrancheKind,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('tranche'), vault.toBuffer(), Buffer.from([kind])],
    programId,
  );
}

export function getTrancheMintPda(
  vault: PublicKey,
  kind: TrancheKind,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('mint'), vault.toBuffer(), Buffer.from([kind])],
    programId,
  );
}

export function getVaultReservePda(
  vault: PublicKey,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('reserve'), vault.toBuffer()], programId);
}

export function getLossBucketPda(
  vault: PublicKey,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('loss_bucket'), vault.toBuffer()],
    programId,
  );
}

export function getLoanPda(
  vault: PublicKey,
  loanId: number,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32LE(loanId, 0);
  return PublicKey.findProgramAddressSync([Buffer.from('loan'), vault.toBuffer(), idBuf], programId);
}

export function getCreditEventPda(
  vault: PublicKey,
  seq: number,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  const seqBuf = Buffer.alloc(4);
  seqBuf.writeUInt32LE(seq, 0);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('credit_event'), vault.toBuffer(), seqBuf],
    programId,
  );
}

export function getPoolPda(
  trancheMint: PublicKey,
  programId: PublicKey = PRISM_AMM_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('amm'), trancheMint.toBuffer()], programId);
}

export function getPoolTrancheReservePda(
  trancheMint: PublicKey,
  programId: PublicKey = PRISM_AMM_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('amm_tranche'), trancheMint.toBuffer()],
    programId,
  );
}

export function getPoolQuoteReservePda(
  trancheMint: PublicKey,
  programId: PublicKey = PRISM_AMM_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('amm_quote'), trancheMint.toBuffer()],
    programId,
  );
}

export function getIkaCollateralPda(
  loan: PublicKey,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('ika_collateral_v2'), loan.toBuffer()],
    programId,
  );
}

export function getEncryptHealthPda(
  loan: PublicKey,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('encrypt_health'), loan.toBuffer()],
    programId,
  );
}

export function getCloakPayoutPda(
  vault: PublicKey,
  programId: PublicKey = PRISM_CORE_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('cloak_payout'), vault.toBuffer()],
    programId,
  );
}

export function getLpMintPda(
  trancheMint: PublicKey,
  programId: PublicKey = PRISM_AMM_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('amm_lp'), trancheMint.toBuffer()],
    programId,
  );
}
