/**
 * Local test oracle for IKA collateral verification (Stellar build).
 *
 * IKA collateral was dropped for the Stellar migration, but we keep the
 * endpoint functional for backward-compatible API tests. The loan binding
 * is now a u32 loan_id padded to 32 bytes (LE), not a Solana pubkey.
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

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
const oraclePubkeyBytes = createPublicKey(oraclePrivateKey)
  .export({ type: 'spki', format: 'der' })
  .slice(-32);

export const TEST_ORACLE_PUBKEY = Buffer.from(oraclePubkeyBytes).toString('hex');

const TEST_COLLATERAL_USD_MICRO = 50_000_000_000n;

function buildMessage(
  dwalletIdHex: string,
  chainId: number,
  amountUsdMicro: bigint,
  loanId: number,
): Buffer {
  const buf = Buffer.alloc(81);
  Buffer.from('ika_atts').copy(buf, 0);
  Buffer.from(dwalletIdHex, 'hex').copy(buf, 8);
  buf.writeUInt8(chainId, 40);
  buf.writeBigUInt64LE(amountUsdMicro, 41);
  buf.writeUInt32LE(loanId, 49);
  return buf;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const { dwallet_id, chain_id, loan_pubkey, loan_id } = body as {
    dwallet_id: string;
    chain_id: number;
    loan_pubkey?: string;
    loan_id?: number;
  };

  const resolvedLoanId = loan_id ?? 1;

  if (!dwallet_id || chain_id === undefined) {
    return NextResponse.json({ error: 'missing: dwallet_id, chain_id' }, { status: 400 });
  }
  if (dwallet_id.length !== 64) {
    return NextResponse.json({ error: 'dwallet_id must be 64 hex chars (32 bytes)' }, { status: 400 });
  }

  const message = buildMessage(dwallet_id, chain_id, TEST_COLLATERAL_USD_MICRO, resolvedLoanId);
  const signature = sign(null, message, oraclePrivateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey: TEST_ORACLE_PUBKEY,
    amount_usd_micro: TEST_COLLATERAL_USD_MICRO.toString(),
  });
}
