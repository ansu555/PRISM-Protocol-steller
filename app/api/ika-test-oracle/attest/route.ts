/**
 * Local test oracle for IKA collateral verification.
 *
 * Signs the 81-byte attestation message with the key from IKA_TEST_ORACLE_SECRET_SEED
 * (defaults to a fixed dev seed if unset). The pubkey must be in the GlobalConfig
 * oracle_allowlist — set IKA_TEST_ORACLE_SECRET_SEED to the admin keypair seed so it
 * matches the [admin] allowlist created during setup.
 *
 * Production: change NEXT_PUBLIC_IKA_ORACLE_URL to the real IKA oracle endpoint.
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

// Resolve signing seed: env var first, fixed fallback for CI/zero-config dev.
const seedHex =
  process.env.IKA_TEST_ORACLE_SECRET_SEED ??
  'fc0dfc6881aee8d6af913f60fff07ab0b1ec16427573ab6d33b3825df3a52820';

const TEST_SEED = Buffer.from(seedHex, 'hex');

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const oraclePrivateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, TEST_SEED]),
  format: 'der',
  type: 'pkcs8',
});
const oraclePublicKey = new PublicKey(
  createPublicKey(oraclePrivateKey).export({ type: 'spki', format: 'der' }).slice(-32),
);

export const TEST_ORACLE_PUBKEY = oraclePublicKey.toBase58();

// Fixed collateral amount returned by the test oracle: $50,000 USD
const TEST_COLLATERAL_USD_MICRO = 50_000_000_000n;

function buildMessage(
  dwalletIdHex: string,
  chainId: number,
  amountUsdMicro: bigint,
  loanPubkeyB58: string,
): Buffer {
  const buf = Buffer.alloc(81);
  Buffer.from('ika_atts').copy(buf, 0);
  Buffer.from(dwalletIdHex, 'hex').copy(buf, 8);
  buf.writeUInt8(chainId, 40);
  buf.writeBigUInt64LE(amountUsdMicro, 41);
  new PublicKey(loanPubkeyB58).toBuffer().copy(buf, 49);
  return buf;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const { dwallet_id, chain_id, loan_pubkey } = body as {
    dwallet_id: string;
    chain_id: number;
    loan_pubkey: string;
  };

  if (!dwallet_id || chain_id === undefined || !loan_pubkey) {
    return NextResponse.json({ error: 'missing: dwallet_id, chain_id, loan_pubkey' }, { status: 400 });
  }
  if (dwallet_id.length !== 64) {
    return NextResponse.json({ error: 'dwallet_id must be 64 hex chars (32 bytes)' }, { status: 400 });
  }

  const message = buildMessage(dwallet_id, chain_id, TEST_COLLATERAL_USD_MICRO, loan_pubkey);
  const signature = sign(null, message, oraclePrivateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey: oraclePublicKey.toBase58(),
    amount_usd_micro: TEST_COLLATERAL_USD_MICRO.toString(),
  });
}
