'use client';

// Soroswap router helpers — swap quotes and transaction building.
//
// Soroswap is the Uniswap-V2 CPMM on Stellar. PRISM uses it for the
// pTranche/USDC pools that power Trade #1 and Trade #2 in the demo arc.
//
// Architecture:
//   - End-user swaps go directly to the Soroswap router (NOT through prism-core).
//   - Pool seeding (add_liquidity) is called directly by the admin wallet. The
//     admin's single signature authorizes the router's internal token transfers
//     and pair creation — a contract source (prism-core) cannot do this without
//     `authorize_as_current_contract`, which the deployed contract lacks.
//   - This module handles the user-facing paths: quote, swap, and seed.
//
// Soroswap router interface (Uniswap-V2 style):
//   swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline) → Vec<i128>
//   add_liquidity(token_a, token_b, amount_a_desired, amount_b_desired,
//                 amount_a_min, amount_b_min, to, deadline) → (i128, i128, i128)

import {
  Address,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

import {
  NETWORK_PASSPHRASE,
  SOROSWAP_ROUTER_ID,
  USDC_CONTRACT_ID,
} from './constants';
import { getRpcServer, getHorizonServer, type StellarSigner } from './stellar';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SwapQuote {
  /** Input amount (7 decimals). */
  amountIn: bigint;
  /** Expected output amount at current pool price (7 decimals). */
  expectedOut: bigint;
  /** Path as [tokenIn, tokenOut] contract IDs. */
  path: [string, string];
}

export interface SwapResult {
  txHash: string;
  /** Actual amounts at each hop in the path. */
  amounts: bigint[];
}

// ── Internal ScVal builder ─────────────────────────────────────────────────────

/** Build a Vec<Address> ScVal from an array of contract ID strings. */
function addressVec(addresses: string[]): xdr.ScVal {
  return xdr.ScVal.scvVec(addresses.map((a) => new Address(a).toScVal()));
}

// ── Quote ──────────────────────────────────────────────────────────────────────

/**
 * Simulate a swap to get the expected output without submitting a transaction.
 *
 * Uses Soroban's `simulateTransaction` — no fee, no signing required.
 * The path must be `[tokenIn, tokenOut]` for a direct swap.
 *
 * @param amountIn   Input amount in 7-decimal USDC units (or pToken units).
 * @param path       Two-element array: [tokenIn contractId, tokenOut contractId].
 * @param routerId   Soroswap router contract ID (defaults to SOROSWAP_ROUTER_ID).
 */
export async function getSwapQuote(
  amountIn: bigint,
  path: [string, string],
  routerId = SOROSWAP_ROUTER_ID,
): Promise<SwapQuote> {
  const server = getRpcServer();
  const router = new Contract(routerId);

  // Use a funded placeholder account for simulation (won't be submitted).
  const placeholder = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
  const sourceAccount = await server
    .getAccount(placeholder)
    .catch(() => ({ accountId: () => placeholder, sequenceNumber: () => '0' }) as never);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      router.call(
        'swap_exact_tokens_for_tokens',
        nativeToScVal(amountIn, { type: 'i128' }),
        nativeToScVal(0n, { type: 'i128' }), // no min — simulation only
        addressVec(path),
        new Address(placeholder).toScVal(), // to — doesn't matter for simulation
        nativeToScVal(BigInt(Math.floor(Date.now() / 1000) + 300), { type: 'u64' }),
      ),
    )
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if ('error' in sim && sim.error) {
    throw new Error(`Soroswap quote failed: ${sim.error}`);
  }

  // The return value is Vec<i128> — amounts at each hop. Last element = out.
  let expectedOut = 0n;
  if ('result' in sim && sim.result) {
    const amounts = scValToNative(sim.result.retval) as bigint[];
    expectedOut = amounts[amounts.length - 1] ?? 0n;
  }

  return { amountIn, expectedOut, path };
}

// ── Swap ───────────────────────────────────────────────────────────────────────

/**
 * Execute a swap on Soroswap.
 *
 * Builds, simulates, signs, and submits a `swap_exact_tokens_for_tokens` call
 * to the Soroswap router. The signer must hold `amountIn` of `path[0]`.
 *
 * @param signer       Stellar signer (Keypair or wallet).
 * @param amountIn     Exact input amount (7 decimals).
 * @param amountOutMin Minimum accepted output (slippage guard, 7 decimals).
 * @param path         [tokenIn, tokenOut] contract IDs.
 * @param routerId     Soroswap router contract ID.
 */
export async function executeSwap(
  signer: StellarSigner,
  amountIn: bigint,
  amountOutMin: bigint,
  path: [string, string],
  routerId = SOROSWAP_ROUTER_ID,
): Promise<SwapResult> {
  const server = getRpcServer();
  const sourceAccount = await getHorizonServer().loadAccount(signer.publicKey());
  const router = new Contract(routerId);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  let tx = new TransactionBuilder(sourceAccount, {
    fee: '1000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      router.call(
        'swap_exact_tokens_for_tokens',
        nativeToScVal(amountIn, { type: 'i128' }),
        nativeToScVal(amountOutMin, { type: 'i128' }),
        addressVec(path),
        new Address(signer.publicKey()).toScVal(),
        nativeToScVal(deadline, { type: 'u64' }),
      ),
    )
    .setTimeout(60)
    .build();

  tx = await server.prepareTransaction(tx);
  await signer.sign(tx);

  const sendResult = await server.sendTransaction(tx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Soroswap swap failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Poll for settlement.
  const deadline2 = Date.now() + 30_000;
  let status = await server.getTransaction(sendResult.hash);
  while (status.status === 'NOT_FOUND' && Date.now() < deadline2) {
    await new Promise((r) => setTimeout(r, 1_500));
    status = await server.getTransaction(sendResult.hash);
  }

  if (status.status !== 'SUCCESS') {
    throw new Error(`Soroswap swap settled with status ${status.status}`);
  }

  const amounts: bigint[] = status.returnValue
    ? (scValToNative(status.returnValue) as bigint[])
    : [];

  return { txHash: sendResult.hash, amounts };
}

// ── Add liquidity (pool seeding) ─────────────────────────────────────────────────

export interface AddLiquidityResult {
  txHash: string;
  /** Actual token_a amount deposited. */
  amountA: bigint;
  /** Actual token_b amount deposited. */
  amountB: bigint;
  /** LP tokens minted to the signer. */
  lpMinted: bigint;
}

/**
 * Add liquidity to a Soroswap pool directly from the signer's wallet.
 *
 * The signer is both the token source and the LP recipient (`to = signer`).
 * Because the signer is a regular account, its single envelope signature
 * authorizes the entire nested call tree — the router's internal
 * `transfer(signer → pair)` calls plus on-the-fly pair creation. This is the
 * critical difference from routing through a contract: a contract source must
 * call `authorize_as_current_contract` for those inner transfers, which the
 * deployed prism-core does not do.
 *
 * Creates the pair if it does not exist yet. Pass `0n` mins for initial seeding
 * (no pool price exists, so there is nothing to slip against).
 *
 * @param signer          Wallet signer (becomes the LP).
 * @param tokenA          First token contract id.
 * @param tokenB          Second token contract id.
 * @param amountADesired  Desired token_a amount (7 decimals).
 * @param amountBDesired  Desired token_b amount (7 decimals).
 * @param amountAMin      Min accepted token_a (slippage guard; 0 for seeding).
 * @param amountBMin      Min accepted token_b (slippage guard; 0 for seeding).
 * @param routerId        Soroswap router contract id.
 */
export async function addLiquidity(
  signer: StellarSigner,
  tokenA: string,
  tokenB: string,
  amountADesired: bigint,
  amountBDesired: bigint,
  amountAMin: bigint,
  amountBMin: bigint,
  routerId = SOROSWAP_ROUTER_ID,
): Promise<AddLiquidityResult> {
  const server = getRpcServer();
  const sourceAccount = await getHorizonServer().loadAccount(signer.publicKey());
  const router = new Contract(routerId);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  let tx = new TransactionBuilder(sourceAccount, {
    fee: '10000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      router.call(
        'add_liquidity',
        new Address(tokenA).toScVal(),
        new Address(tokenB).toScVal(),
        nativeToScVal(amountADesired, { type: 'i128' }),
        nativeToScVal(amountBDesired, { type: 'i128' }),
        nativeToScVal(amountAMin, { type: 'i128' }),
        nativeToScVal(amountBMin, { type: 'i128' }),
        new Address(signer.publicKey()).toScVal(), // to — LP recipient = source
        nativeToScVal(deadline, { type: 'u64' }),
      ),
    )
    .setTimeout(120)
    .build();

  // prepareTransaction simulates and attaches the Soroban footprint + auth.
  // The nested transfers resolve to source-account auth, covered by the signature.
  tx = await server.prepareTransaction(tx);
  await signer.sign(tx);

  const sendResult = await server.sendTransaction(tx);
  if (sendResult.status === 'ERROR') {
    throw new Error(`add_liquidity failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  // Poll for settlement.
  const settleBy = Date.now() + 40_000;
  let status = await server.getTransaction(sendResult.hash);
  while (status.status === 'NOT_FOUND' && Date.now() < settleBy) {
    await new Promise((r) => setTimeout(r, 1_500));
    status = await server.getTransaction(sendResult.hash);
  }

  if (status.status !== 'SUCCESS') {
    throw new Error(`add_liquidity settled with status ${status.status}`);
  }

  // Return value is the tuple (amount_a, amount_b, lp_minted).
  let amountA = 0n;
  let amountB = 0n;
  let lpMinted = 0n;
  if (status.returnValue) {
    const tuple = scValToNative(status.returnValue) as [bigint, bigint, bigint];
    [amountA, amountB, lpMinted] = tuple;
  }

  return { txHash: sendResult.hash, amountA, amountB, lpMinted };
}

// ── Convenience helpers ────────────────────────────────────────────────────────

/**
 * Build the swap path for selling a pTranche token for USDC.
 * Direction: pToken → USDC.
 */
export function sellTranchePath(ptokenId: string): [string, string] {
  return [ptokenId, USDC_CONTRACT_ID];
}

/**
 * Build the swap path for buying a pTranche token with USDC.
 * Direction: USDC → pToken.
 */
export function buyTranchePath(ptokenId: string): [string, string] {
  return [USDC_CONTRACT_ID, ptokenId];
}
