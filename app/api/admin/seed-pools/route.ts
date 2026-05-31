import { parseStellarError } from '@/app/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import {
  Account,
  Asset,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';

import {
  getCoreClient,
  getUsdcClient,
  ContractClient,
  keypairSigner,
  addr,
  nativeToScVal,
} from '@/app/lib/stellar';
import {
  VAULT_ID,
  TrancheKind,
  PTOKEN_PRIME_CONTRACT_ID,
  PTOKEN_CORE_CONTRACT_ID,
  PTOKEN_ALPHA_CONTRACT_ID,
  SOROSWAP_ROUTER_ID,
  USDC_CONTRACT_ID,
} from '@/app/lib/constants';

// Per-tranche seed amounts (7-decimal USDC base units).
// 100 USDC each side gives Soroswap enough depth for small demo swaps.
const SEED_DEPOSIT = 1_000_000_000n; // admin deposits this to get pTokens
const SEED_USDC    = 1_000_000_000n; // minted directly to the contract for the USDC side

const PTOKEN_BY_KIND: Record<number, string> = {
  [TrancheKind.Prime]: PTOKEN_PRIME_CONTRACT_ID,
  [TrancheKind.Core]:  PTOKEN_CORE_CONTRACT_ID,
  [TrancheKind.Alpha]: PTOKEN_ALPHA_CONTRACT_ID,
};

// NotInitialized = PrismError #51 — tranche hasn't been set up yet.
function isNotInitialized(err: unknown): boolean {
  const msg = parseStellarError(err);
  return msg.includes('#51') || msg.includes('NotInitialized');
}

const HORIZON_URL      = process.env.NEXT_PUBLIC_HORIZON_URL      ?? 'https://horizon-testnet.stellar.org';
const NET_PASSPHRASE   = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? 'Test SDF Network ; September 2015';
const PTOKEN_ISSUER    = process.env.NEXT_PUBLIC_USDC_ASSET_ISSUER  ?? 'GCZFPAJEJHMQPZ4BQUWUEBV7KJQ7GEKDF4FAWYUW4NOIRSWXCMDEOESW';

// All SAC-wrapped assets the admin needs trustlines for during seed-pools.
const SEED_ASSETS = [
  new Asset(process.env.NEXT_PUBLIC_USDC_ASSET_CODE ?? 'PTUSDC', PTOKEN_ISSUER),
  new Asset('PPRIME',  PTOKEN_ISSUER),
  new Asset('PCORE',   PTOKEN_ISSUER),
  new Asset('PALPHA',  PTOKEN_ISSUER),
];

interface HorizonBalance { asset_code?: string; asset_issuer?: string; asset_type: string; }
interface HorizonAccount { sequence: string; balances: HorizonBalance[]; }

async function ensureAdminTrustlines(keypair: Keypair): Promise<string[]> {
  const address = keypair.publicKey();
  const actions: string[] = [];

  // Fund via friendbot if account doesn't exist.
  const check = await fetch(`${HORIZON_URL}/accounts/${address}`);
  if (!check.ok) {
    const fb = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
    if (!fb.ok) throw new Error(`Friendbot failed for admin: ${(await fb.text()).slice(0, 120)}`);
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2_000));
      if ((await fetch(`${HORIZON_URL}/accounts/${address}`)).ok) break;
    }
    actions.push('funded via friendbot');
  }

  // Find which trustlines are missing.
  const accountRes  = await fetch(`${HORIZON_URL}/accounts/${address}`);
  let   accountData = (await accountRes.json()) as HorizonAccount;

  const missingAssets = SEED_ASSETS.filter((asset) => {
    const code   = asset.getCode();
    const issuer = asset.getIssuer();
    return !(accountData.balances ?? []).some(
      (b) => b.asset_code === code && b.asset_issuer === issuer,
    );
  });

  if (missingAssets.length === 0) return actions;

  // Submit one transaction with all missing changeTrust operations.
  const account = new Account(address, accountData.sequence);
  const builder = new TransactionBuilder(account, {
    fee: String(100 * missingAssets.length),
    networkPassphrase: NET_PASSPHRASE,
  });
  for (const asset of missingAssets) {
    builder.addOperation(Operation.changeTrust({ asset }));
  }
  const tx = builder.setTimeout(30).build();
  tx.sign(keypair);

  const submit = await fetch(`${HORIZON_URL}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `tx=${encodeURIComponent(tx.toEnvelope().toXDR('base64'))}`,
  });
  if (!submit.ok) {
    const err = (await submit.json()) as { extras?: { result_codes?: { transaction?: string } } };
    if (err.extras?.result_codes?.transaction !== 'tx_bad_seq') {
      throw new Error(`Admin changeTrust failed: ${JSON.stringify(err.extras?.result_codes ?? err)}`);
    }
  }

  // Poll until all trustlines appear on Horizon.
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 2_000));
    accountData = await fetch(`${HORIZON_URL}/accounts/${address}`).then((r) => r.json()) as HorizonAccount;
    const stillMissing = missingAssets.filter((asset) => {
      const code   = asset.getCode();
      const issuer = asset.getIssuer();
      return !(accountData.balances ?? []).some(
        (b) => b.asset_code === code && b.asset_issuer === issuer,
      );
    });
    if (stillMissing.length === 0) {
      actions.push(`trustlines added: ${missingAssets.map((a) => a.getCode()).join(', ')}`);
      return actions;
    }
  }
  throw new Error(`Trustlines not confirmed after 30s: ${missingAssets.map((a) => a.getCode()).join(', ')}`);
}

export async function POST(_req: NextRequest) {
  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) {
    return NextResponse.json(
      { error: 'ADMIN_SECRET_SEED is not set on the server.' },
      { status: 500 },
    );
  }

  let adminKeypair: Keypair;
  try {
    adminKeypair = Keypair.fromSecret(seed);
  } catch {
    return NextResponse.json(
      { error: 'ADMIN_SECRET_SEED is not a valid Stellar secret key (S...)' },
      { status: 500 },
    );
  }

  const signer    = keypairSigner(adminKeypair);
  const adminAddr = adminKeypair.publicKey();
  const core      = getCoreClient();
  const usdc      = getUsdcClient();

  // USDC mint requires the SAC admin keypair (GCZF...), not the prism-core admin.
  const usdcSeed = process.env.USDC_ADMIN_SECRET_SEED ?? seed;
  let usdcKeypair: Keypair;
  try {
    usdcKeypair = Keypair.fromSecret(usdcSeed);
  } catch {
    return NextResponse.json({ error: 'USDC_ADMIN_SECRET_SEED is not a valid Stellar secret key' }, { status: 500 });
  }
  const usdcSigner = keypairSigner(usdcKeypair);
  const steps: string[]  = [];
  const results: Record<string, unknown> = {};

  // Ensure admin has trustlines for PTUSDC + all three pToken SAC assets.
  const trustActions = await ensureAdminTrustlines(adminKeypair);
  if (trustActions.length > 0) steps.push(`admin setup: ${trustActions.join(', ')}`);

  // Seed pools by calling Soroswap router directly from the admin wallet.
  // This avoids the contract-level seed_pool_liquidity which requires prism-core to
  // authorize sub-invocations (authorize_as_current_contract) — a pattern the current
  // contract implementation doesn't support. When the admin is the tx source, Soroswap's
  // internal token.transfer(admin, pair, amount) calls are implicitly authorized.
  const router = new ContractClient(SOROSWAP_ROUTER_ID);

  for (const kind of [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha]) {
    const name = TrancheKind[kind];

    try {
      // 1. Mint USDC to admin: SEED_DEPOSIT (for tranche deposit) + SEED_USDC (for pool side).
      await usdc.invoke(usdcSigner, 'mint', [
        addr(adminAddr),
        nativeToScVal(SEED_DEPOSIT + SEED_USDC, { type: 'i128' }),
      ]);
      steps.push(`${name}: minted ${SEED_DEPOSIT + SEED_USDC} USDC → admin`);

      // 2. Admin deposits SEED_DEPOSIT USDC into the tranche, receiving pToken shares.
      //    NotInitialized (#51) means the tranche isn't set up yet — skip with a message.
      const { result: rawShares } = await core.invoke(signer, 'deposit', [
        addr(adminAddr),
        nativeToScVal(VAULT_ID,      { type: 'u32' }),
        nativeToScVal(kind,          { type: 'u32' }),
        nativeToScVal(SEED_DEPOSIT,  { type: 'i128' }),
      ]);
      const ptokenShares = BigInt(String(rawShares));
      steps.push(`${name}: deposited → ${ptokenShares} pToken shares`);

      // 3. Admin calls Soroswap router add_liquidity directly.
      //    Admin holds both USDC (SEED_USDC remaining) and pTokens (from deposit).
      //    The router calls token.transfer(admin, pair, amount) which is implicitly
      //    authorized because admin is the transaction source.
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
      const { result: poolResult, hash } = await router.invoke(signer, 'add_liquidity', [
        addr(USDC_CONTRACT_ID),
        addr(PTOKEN_BY_KIND[kind]),
        nativeToScVal(SEED_USDC,      { type: 'i128' }), // amount_a_desired
        nativeToScVal(ptokenShares,   { type: 'i128' }), // amount_b_desired
        nativeToScVal(1n,             { type: 'i128' }), // amount_a_min
        nativeToScVal(1n,             { type: 'i128' }), // amount_b_min
        addr(adminAddr),                                  // to: LP tokens → admin
        nativeToScVal(deadline,       { type: 'u64' }),
      ]);
      steps.push(`${name}: pool seeded via router — tx ${hash?.slice(0, 8)}`);
      // poolResult is (usdc_used, ptoken_used, lp_minted) — BigInt values from scValToNative.
      // JSON.stringify can't handle BigInt natively, so convert to strings.
      results[name] = Array.isArray(poolResult)
        ? (poolResult as unknown[]).map(String)
        : String(poolResult);
    } catch (err) {
      if (isNotInitialized(err)) {
        steps.push(`${name}: skipped — tranche not initialized (run Initialize Vault first)`);
        continue;
      }
      const message = parseStellarError(err);
      return NextResponse.json({ error: `${name}: ${message}`, steps }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, steps, results });
}
