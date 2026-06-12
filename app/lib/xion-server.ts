// Server-only XION helpers for the contract-invoking API routes.
//
// The admin / oracle-relayer secret is a Cosmos BIP-39 mnemonic (the xiond
// keyring format) in ADMIN_MNEMONIC — the XION counterpart to the old Stellar
// ADMIN_SECRET_SEED. These are read server-side only (never NEXT_PUBLIC_); the
// functions below are only ever called from `app/api/**/route.ts` handlers.

import { type ExecuteResult } from '@cosmjs/cosmwasm-stargate';

import { executeContract, signerFromMnemonic, type XionSigner } from '@/app/lib/xion';

/** prism-core admin signer (init/yield/credit-event/loan/collateral relayer). */
export async function adminSigner(): Promise<XionSigner> {
  const mnemonic = process.env.ADMIN_MNEMONIC;
  if (!mnemonic) {
    throw new Error(
      'ADMIN_MNEMONIC is not set on the server. Add the deployer mnemonic to .env.local.',
    );
  }
  try {
    return await signerFromMnemonic(mnemonic.trim());
  } catch {
    throw new Error('ADMIN_MNEMONIC is not a valid BIP-39 mnemonic.');
  }
}

/** cw20 USDC minter — usually the deployer; override with USDC_ADMIN_MNEMONIC. */
export async function usdcAdminSigner(): Promise<XionSigner> {
  const mnemonic = process.env.USDC_ADMIN_MNEMONIC ?? process.env.ADMIN_MNEMONIC;
  if (!mnemonic) {
    throw new Error('USDC_ADMIN_MNEMONIC / ADMIN_MNEMONIC is not set on the server.');
  }
  try {
    return await signerFromMnemonic(mnemonic.trim());
  } catch {
    throw new Error('USDC_ADMIN_MNEMONIC is not a valid BIP-39 mnemonic.');
  }
}

/** Mint cw20 tokens to `recipient` (caller must be the token's minter). */
export async function cw20Mint(
  minter: XionSigner,
  token: string,
  recipient: string,
  amount: bigint,
): Promise<ExecuteResult> {
  return executeContract(minter, token, { mint: { recipient, amount: amount.toString() } });
}

/** Normalize a hex string (strip a leading 0x) for HexBinary JSON fields. */
export function hex(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

export function xionErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Case-insensitive match against a contract error's Display string. CosmWasm
 * surfaces the `#[error("…")]` text from `error.rs` (e.g. "collateral already
 * verified"), not the Soroban numeric code — so route idempotency checks match
 * on those phrases.
 */
export function isContractError(err: unknown, ...needles: string[]): boolean {
  const msg = xionErrorMessage(err).toLowerCase();
  return needles.some((n) => msg.includes(n.toLowerCase()));
}
