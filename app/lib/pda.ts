// Soroban doesn't have PDAs — entities are addressed by `(contract_id, DataKey)`.
// This module previously exported 15 `findProgramAddressSync` helpers; we keep
// the names so legacy imports compile but they all return placeholder strings.
//
// Anywhere that *actually* uses these (e.g. account fetches), the call site
// should be rewritten to use Soroban contract reads instead. New code should
// import from `app/lib/stellar` and call `getCoreClient().read('get_xxx', ...)`.

import {
  PRISM_AMM_CONTRACT_ID,
  PRISM_CORE_CONTRACT_ID,
} from './constants';

// Stand-in shape for places that destructure `const [pda] = getXxxPda(...)`.
// We return the contract id (Stellar contract addresses are 56-char strings)
// plus a placeholder bump byte so the tuple destructure still works.
type PdaTuple = [string, number];

const placeholder = (cid: string): PdaTuple => [cid, 255];

export function getConfigPda(programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getVaultPda(_vaultId: number, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getTranchePda(
  _vault: string,
  _kind: number,
  programId?: string,
): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getTrancheMintPda(
  _vault: string,
  _kind: number,
  programId?: string,
): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getVaultReservePda(_vault: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getLossBucketPda(_vault: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getLoanPda(
  _vault: string,
  _loanId: number,
  programId?: string,
): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getCreditEventPda(
  _vault: string,
  _seq: number,
  programId?: string,
): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getPoolPda(_trancheMint: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_AMM_CONTRACT_ID);
}

export function getPoolTrancheReservePda(_trancheMint: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_AMM_CONTRACT_ID);
}

export function getPoolQuoteReservePda(_trancheMint: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_AMM_CONTRACT_ID);
}

export function getIkaCollateralPda(_loan: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getEncryptHealthPda(_loan: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getCloakPayoutPda(_vault: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_CORE_CONTRACT_ID);
}

export function getLpMintPda(_trancheMint: string, programId?: string): PdaTuple {
  return placeholder(programId ?? PRISM_AMM_CONTRACT_ID);
}
