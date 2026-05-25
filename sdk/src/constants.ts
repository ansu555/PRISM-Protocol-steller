import { PublicKey } from '@solana/web3.js';

import { prismAmmIdl, prismCoreIdl } from './idl';

const env = (key: string): string | undefined => {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] ?? process.env[`NEXT_PUBLIC_${key}`];
  }
  return undefined;
};

const idlAddress = (idl: unknown): string => {
  return (idl as { address?: string }).address ?? '';
};

export const PRISM_CORE_PROGRAM_ID = new PublicKey(
  env('PRISM_CORE_PROGRAM_ID') ?? idlAddress(prismCoreIdl),
);

export const PRISM_AMM_PROGRAM_ID = new PublicKey(
  env('PRISM_AMM_PROGRAM_ID') ?? idlAddress(prismAmmIdl),
);

export const USDC_MINT = new PublicKey(
  env('USDC_MINT') ?? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
);

export const USDC_DECIMALS = 6;
export const USDC_BASE_UNITS = 1_000_000n;

export enum TrancheKind {
  Prime = 0,
  Core = 1,
  Alpha = 2,
}

// ── Q64.64 fixed-point math ───────────────────────────────────────────────────
export const Q64_ONE = 1n << 64n;

// ── AMM constants — mirror contracts/programs/prism-amm/src/state.rs ──────────
export const BPS_DENOMINATOR = 10_000;
export const MIN_LIQUIDITY = 1_000n;
export const DEFAULT_FEE_BPS = 30;
export const MAX_FEE_BPS = 1_000;

// ── Time ──────────────────────────────────────────────────────────────────────
export const SECONDS_PER_YEAR = 31_536_000;
