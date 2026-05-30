// Stellar classic trustline helpers.
//
// Before an account can hold PTUSDC (a classic Stellar asset wrapped by a SAC),
// it needs:
//   1. An XLM-funded account (base reserve ~1 XLM on testnet)
//   2. A changeTrust operation for the PTUSDC asset
//
// This module handles both steps for any Keypair. Works in both browser and Node.

import {
  Account,
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  USDC_ASSET_CODE,
  USDC_ASSET_ISSUER,
} from './constants';

const PTUSDC = new Asset(USDC_ASSET_CODE, USDC_ASSET_ISSUER);

interface HorizonBalance {
  asset_code?: string;
  asset_issuer?: string;
  asset_type: string;
}

interface HorizonAccountData {
  sequence: string;
  balances: HorizonBalance[];
}

/** Fund an account via the Stellar testnet Friendbot, if it doesn't exist yet. */
async function fundIfNeeded(address: string): Promise<boolean> {
  const res = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (res.ok) return false; // already funded

  const fb = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
  if (!fb.ok) {
    const body = await fb.text();
    throw new Error(`Friendbot failed for ${address.slice(0, 8)}: ${body.slice(0, 120)}`);
  }
  // Wait for the account to appear on Horizon before continuing.
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const check = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (check.ok) return true;
  }
  throw new Error(`Account ${address.slice(0, 8)} still not found after friendbot funding`);
}

/** Check Horizon until the PTUSDC trustline appears on the account (max 30s). */
async function pollUntilTrustlineVisible(address: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2_000));
    const data: HorizonAccountData = await fetch(`${HORIZON_URL}/accounts/${address}`).then((r) =>
      r.json(),
    );
    const found = data.balances?.some(
      (b) => b.asset_code === USDC_ASSET_CODE && b.asset_issuer === USDC_ASSET_ISSUER,
    );
    if (found) return;
  }
  throw new Error(`Trustline for ${USDC_ASSET_CODE} not visible on Horizon after 30s`);
}

/** Submit a changeTrust operation for PTUSDC if the trustline doesn't exist.
 *  Waits for on-chain confirmation before returning so subsequent mints don't race. */
async function addTrustlineIfNeeded(keypair: Keypair): Promise<boolean> {
  const address = keypair.publicKey();
  const data: HorizonAccountData = await fetch(`${HORIZON_URL}/accounts/${address}`).then((r) =>
    r.json(),
  );

  const hasTrustline = data.balances?.some(
    (b) => b.asset_code === USDC_ASSET_CODE && b.asset_issuer === USDC_ASSET_ISSUER,
  );
  if (hasTrustline) return false;

  const account = new Account(address, data.sequence);
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.changeTrust({ asset: PTUSDC }))
    .setTimeout(30)
    .build();

  tx.sign(keypair);

  const xdr = tx.toEnvelope().toXDR('base64');
  const submit = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(xdr)}`,
  });

  if (!submit.ok) {
    const err = (await submit.json()) as { extras?: { result_codes?: { transaction?: string } } };
    if (err.extras?.result_codes?.transaction === 'tx_bad_seq') {
      // Another submission already in flight — wait for it to land
      await pollUntilTrustlineVisible(address);
      return false;
    }
    throw new Error(
      `changeTrust failed: ${JSON.stringify(err.extras?.result_codes ?? err)}`,
    );
  }

  // Wait for Horizon to reflect the trustline before the caller proceeds to mint.
  await pollUntilTrustlineVisible(address);
  return true;
}

/**
 * Ensure `keypair`'s account is XLM-funded and has a PTUSDC trustline.
 * Returns a summary of what was done (empty array = nothing needed).
 */
export async function ensureFundedAndTrusted(keypair: Keypair): Promise<string[]> {
  const actions: string[] = [];
  const address = keypair.publicKey();

  const funded = await fundIfNeeded(address);
  if (funded) actions.push('funded via friendbot');

  const trusted = await addTrustlineIfNeeded(keypair);
  if (trusted) actions.push('PTUSDC trustline added');

  return actions;
}
