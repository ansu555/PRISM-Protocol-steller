import { parseStellarError } from '@/app/lib/errors';
// Fund simulation wallets — server-side so there are no CORS/timing issues.
//
// For each wallet: (1) Stellar friendbot for XLM, (2) changeTrust for PTUSDC,
// (3) SAC mint of TUSDC. All signed server-side using the provided secret keys.
// Testnet only — sending secret keys is acceptable here because these wallets
// hold no real value.

import { NextRequest, NextResponse } from 'next/server';
import {
  Account,
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import { getUsdcClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import {
  HORIZON_URL,
  NETWORK_PASSPHRASE,
  USDC_ASSET_CODE,
  USDC_ASSET_ISSUER,
} from '@/app/lib/constants';

const MINT_AMOUNT = 100_000_000_000n; // 10,000 TUSDC (7 decimals)
const PTOKEN_ISSUER = USDC_ASSET_ISSUER; // all pTokens share the same issuer (GCZF...)

// All SAC assets a simulation wallet needs trustlines for.
const REQUIRED_ASSETS = [
  new Asset(USDC_ASSET_CODE, USDC_ASSET_ISSUER), // PTUSDC
  new Asset('PPRIME',  PTOKEN_ISSUER),
  new Asset('PCORE',   PTOKEN_ISSUER),
  new Asset('PALPHA',  PTOKEN_ISSUER),
];

interface WalletInput {
  label: string;
  secret: string; // Stellar secret key (S...)
}

interface HorizonBalance {
  asset_code?: string;
  asset_issuer?: string;
  asset_type: string;
}

interface HorizonAccount {
  sequence: string;
  balances: HorizonBalance[];
}

async function fundViaFriendbot(address: string): Promise<boolean> {
  const check = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (check.ok) return false;

  const fb = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
  if (!fb.ok) {
    const body = await fb.text();
    throw new Error(`Friendbot failed: ${body.slice(0, 200)}`);
  }

  // Poll until account appears (up to 20s).
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 2_000));
    const poll = await fetch(`${HORIZON_URL}/accounts/${address}`);
    if (poll.ok) return true;
  }
  throw new Error(`Account ${address.slice(0, 8)} not visible after friendbot funding`);
}

async function addTrustlines(keypair: Keypair): Promise<void> {
  const address = keypair.publicKey();
  const accountRes = await fetch(`${HORIZON_URL}/accounts/${address}`);
  const accountData = (await accountRes.json()) as HorizonAccount;

  // Find which trustlines are missing.
  const missing = REQUIRED_ASSETS.filter((asset) =>
    !(accountData.balances ?? []).some(
      (b) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer(),
    ),
  );
  if (missing.length === 0) return;

  const account = new Account(address, accountData.sequence);
  const builder = new TransactionBuilder(account, {
    fee: String(100 * missing.length),
    networkPassphrase: NETWORK_PASSPHRASE,
  });
  for (const asset of missing) builder.addOperation(Operation.changeTrust({ asset }));
  const tx = builder.setTimeout(30).build();

  tx.sign(keypair);

  const submit = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(tx.toEnvelope().toXDR('base64'))}`,
  });

  if (!submit.ok) {
    const err = (await submit.json()) as {
      extras?: { result_codes?: { transaction?: string; operations?: string[] } };
    };
    const txCode = err.extras?.result_codes?.transaction;
    if (txCode !== 'tx_bad_seq' && txCode !== 'tx_success') {
      throw new Error(`changeTrust failed: ${JSON.stringify(err.extras?.result_codes ?? err)}`);
    }
  }

  // Poll until all trustlines are visible on Horizon (up to 30s).
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2_000));
    const poll = await fetch(`${HORIZON_URL}/accounts/${address}`).then((r) => r.json()) as HorizonAccount;
    const allPresent = missing.every((asset) =>
      (poll.balances ?? []).some(
        (b) => b.asset_code === asset.getCode() && b.asset_issuer === asset.getIssuer(),
      ),
    );
    if (allPresent) return;
  }
  throw new Error(`Trustlines not confirmed after 30s for ${address.slice(0, 8)}`);
}

export async function POST(req: NextRequest) {
  const adminSeed = process.env.ADMIN_SECRET_SEED;
  if (!adminSeed) {
    return NextResponse.json({ error: 'ADMIN_SECRET_SEED not set' }, { status: 500 });
  }

  let adminKeypair: Keypair;
  try {
    adminKeypair = Keypair.fromSecret(adminSeed);
  } catch {
    return NextResponse.json({ error: 'Invalid ADMIN_SECRET_SEED' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({})) as { wallets?: WalletInput[] };
  const wallets: WalletInput[] = body.wallets ?? [];

  if (!wallets.length) {
    return NextResponse.json({ error: 'No wallets provided' }, { status: 400 });
  }

  // USDC mint requires the SAC admin (GCZF...), which may differ from ADMIN_SECRET_SEED.
  const usdcSeed = process.env.USDC_ADMIN_SECRET_SEED ?? adminSeed;
  let usdcKeypair: Keypair;
  try {
    usdcKeypair = Keypair.fromSecret(usdcSeed);
  } catch {
    return NextResponse.json({ error: 'USDC_ADMIN_SECRET_SEED is not a valid Stellar secret key' }, { status: 500 });
  }

  const usdcSigner = keypairSigner(usdcKeypair);
  const usdc = getUsdcClient();
  const results: { label: string; hash: string; actions: string[] }[] = [];

  for (const { label, secret } of wallets) {
    let walletKeypair: Keypair;
    try {
      walletKeypair = Keypair.fromSecret(secret);
    } catch {
      return NextResponse.json({ error: `Invalid secret for ${label}` }, { status: 400 });
    }

    const address = walletKeypair.publicKey();
    const actions: string[] = [];

    try {
      // 1. Fund with XLM via friendbot if account doesn't exist.
      const funded = await fundViaFriendbot(address);
      if (funded) actions.push('funded via friendbot');

      // 2. Set up trustlines for PTUSDC + pPRIME + pCORE + pALPHA.
      await addTrustlines(walletKeypair);
      actions.push('trustlines confirmed (PTUSDC, PPRIME, PCORE, PALPHA)');

      // 3. Mint TUSDC — must be signed by the USDC SAC admin (GCZF...).
      const { hash } = await usdc.invoke(usdcSigner, 'mint', [
        addr(address),
        nativeToScVal(MINT_AMOUNT, { type: 'i128' }),
      ]);
      actions.push(`minted 10,000 TUSDC → ${hash.slice(0, 8)}`);

      results.push({ label, hash, actions });
    } catch (err) {
      const message = parseStellarError(err);
      return NextResponse.json({ error: `${label}: ${message}`, steps: actions }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, results });
}
