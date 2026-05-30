'use client';

// Reflector oracle helpers — read live price feeds on Stellar Soroban.
//
// Reflector is a decentralized SEP-40 price oracle on Stellar.
// PRISM uses it for collateral mark-to-market and the Reflector price display
// in the dashboard (P2-T6: Reflector read live in UI).
//
// Integration path:
//   Frontend → simulateTransaction → prism-core.read_reflector_price(reflector, symbol)
//                                       ↓
//                                 ReflectorClient.lastprice(Asset::Other(symbol))
//
// No state is written; this is always a simulation (no fee, no signing).
//
// Asset symbols Reflector tracks (mainnet Pulse): BTC, ETH, USDC, XLM, SOL, ...
// Use `getReflectorAssets()` to enumerate what the live oracle supports.

import { Contract, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';

import { NETWORK_PASSPHRASE, REFLECTOR_CONTRACT_ID } from './constants';
import { getCoreClient, getRpcServer } from './stellar';
import { TransactionBuilder } from '@stellar/stellar-sdk';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PriceData {
  /** Price in the oracle's base asset (usually USDC), scaled by 10^decimals. */
  price: bigint;
  /** Unix timestamp of the observation. */
  timestamp: bigint;
}

// ── Low-level read (via prism-core simulation) ────────────────────────────────

/**
 * Read the most recent Reflector price for `symbol` by simulating
 * prism-core's `read_reflector_price` function.
 *
 * This goes through prism-core so the on-chain oracle interface is the single
 * canonical entry point, matching §6.2 of the migration plan.
 *
 * Returns null if the oracle has no price for the asset.
 *
 * @param symbol      E.g. "BTC", "ETH", "XLM"
 * @param reflectorId Reflector oracle contract ID (defaults to REFLECTOR_CONTRACT_ID)
 */
export async function getPrice(
  symbol: string,
  reflectorId = REFLECTOR_CONTRACT_ID,
): Promise<bigint | null> {
  const core = getCoreClient();
  const result = await core.read<bigint | null | undefined>('read_reflector_price', [
    new (await import('@stellar/stellar-sdk')).Address(reflectorId).toScVal(),
    nativeToScVal(symbol, { type: 'symbol' }),
  ]);
  return result ?? null;
}

// ── Direct oracle read (bypasses prism-core — useful for dashboard) ───────────

/**
 * Read `lastprice` directly from the Reflector oracle contract.
 *
 * Builds a simulation tx calling the oracle's `lastprice` function with
 * `Asset::Other(symbol)`. Use this when you want raw oracle data without
 * going through prism-core.
 *
 * Returns null if the oracle has no data for the symbol.
 */
export async function getReflectorPriceDirect(
  symbol: string,
  reflectorId = REFLECTOR_CONTRACT_ID,
): Promise<PriceData | null> {
  const server = getRpcServer();
  const oracle = new Contract(reflectorId);

  const placeholder = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const sourceAccount = await server
    .getAccount(placeholder)
    .catch(() => ({ accountId: () => placeholder, sequenceNumber: () => '0' }) as never);

  // Asset::Other(symbol) — matches the Soroban enum variant.
  // Encoded as scvVec([scvSymbol("Other"), scvSymbol(symbol)]) per Soroban ABI.
  const assetOther = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol('Other'),
    nativeToScVal(symbol, { type: 'symbol' }),
  ]);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(oracle.call('lastprice', assetOther))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if ('error' in sim && sim.error) {
    // The oracle may not be available on testnet — return null instead of throwing.
    console.warn(`Reflector oracle unavailable (${reflectorId}):`, sim.error);
    return null;
  }
  if (!('result' in sim) || !sim.result?.retval) return null;

  const native = scValToNative(sim.result.retval);
  if (!native || typeof native !== 'object') return null;

  // PriceData = { price: i128, timestamp: u64 }
  const { price, timestamp } = native as { price: bigint; timestamp: bigint };
  return { price: BigInt(price ?? 0), timestamp: BigInt(timestamp ?? 0) };
}

// ── Price formatting ───────────────────────────────────────────────────────────

/**
 * Format a raw Reflector price to a human-readable USD string.
 * Reflector Pulse uses 14 decimal places by default.
 *
 * @param rawPrice   Value returned by `lastprice.price`.
 * @param decimals   Oracle's decimal precision (default 14 for Reflector Pulse).
 */
export function formatReflectorPrice(rawPrice: bigint, decimals = 14): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = rawPrice / divisor;
  const frac = rawPrice % divisor;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 4); // 4 sig figs
  return `$${whole.toLocaleString()}.${fracStr}`;
}
