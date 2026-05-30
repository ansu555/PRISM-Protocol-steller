/**
 * PRISM Collateral Oracle — Ed25519 attestation signer.
 *
 * Signs the 73-byte `col_atts` message on behalf of the PRISM-hosted collateral oracle.
 * This replaces the IKA dWallet flow (§6.6 of stellar-migration-plan.md).
 *
 * Trust model (v1): oracle key is held by the PRISM team.
 * Trust model (v1.5+): key moves behind a 2-of-3 multisig.
 *
 * Message layout (73 bytes, must match prism-core's verify_collateral):
 *   bytes  0..8    b"col_atts"
 *   bytes  8..12   loan_id (u32 LE)
 *   bytes 12..16   chain_id (u32 LE)  — 0=BTC, 1=ETH, 2=SOL, 3=XLM, 4=USDC-Stellar
 *   bytes 16..48   asset_address (32 bytes)
 *   bytes 48..56   amount_usd_micro (u64 LE)
 *   bytes 56..64   valued_at_ts (i64 LE)
 *   bytes 64..72   nonce (u64 LE)
 *   byte  72       status (0x01=Attached, 0x02=Released, 0x03=Liquidated)
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

// Dev seed: 32 bytes of 0x01 (differs from Encrypt oracle which uses all zeros).
// Override with COLLATERAL_ORACLE_SEED in prod.
const seedHex =
  process.env.COLLATERAL_ORACLE_SEED ?? process.env.COLLATERAL_ORACLE_SEED_DEV ?? '01'.repeat(32);

const SEED = Buffer.from(seedHex, 'hex');
if (SEED.length !== 32) {
  throw new Error('COLLATERAL_ORACLE_SEED must be 32 bytes (64 hex chars)');
}

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const privateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, SEED]),
  format: 'der',
  type: 'pkcs8',
});
const oraclePubkeyHex = createPublicKey(privateKey)
  .export({ type: 'spki', format: 'der' })
  .slice(-32)
  .toString('hex');

const STATUS_MAP: Record<string, number> = {
  attached: 0x01,
  released: 0x02,
  liquidated: 0x03,
};

function buildCollateralMessage(params: {
  loanId: number;
  chainId: number;
  assetAddressHex: string;
  amountUsdMicro: bigint;
  valuedAtTs: bigint;
  nonce: bigint;
  statusByte: number;
}): Buffer {
  const buf = Buffer.alloc(73);
  Buffer.from('col_atts').copy(buf, 0);
  buf.writeUInt32LE(params.loanId, 8);
  buf.writeUInt32LE(params.chainId, 12);
  Buffer.from(params.assetAddressHex.padStart(64, '0'), 'hex').copy(buf, 16);
  buf.writeBigUInt64LE(params.amountUsdMicro, 48);
  buf.writeBigInt64LE(params.valuedAtTs, 56);
  buf.writeBigUInt64LE(params.nonce, 64);
  buf.writeUInt8(params.statusByte, 72);
  return buf;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const {
    loan_id,
    chain_id = 0,
    asset_address = '00'.repeat(32),
    amount_usd_micro = '0',
    valued_at_ts = '0',
    nonce,
    status = 'attached',
  } = body as {
    loan_id?: number;
    chain_id?: number;
    asset_address?: string;
    amount_usd_micro?: string;
    valued_at_ts?: string;
    nonce?: string;
    status?: string;
  };

  if (loan_id === undefined || nonce === undefined) {
    return NextResponse.json({ error: 'missing: loan_id, nonce' }, { status: 400 });
  }
  if (typeof loan_id !== 'number' || !Number.isInteger(loan_id) || loan_id < 0) {
    return NextResponse.json({ error: 'loan_id must be a non-negative integer' }, { status: 400 });
  }
  const statusByte = STATUS_MAP[status.toLowerCase()];
  if (statusByte === undefined) {
    return NextResponse.json(
      { error: 'status must be one of: attached, released, liquidated' },
      { status: 400 },
    );
  }

  const message = buildCollateralMessage({
    loanId: loan_id,
    chainId: chain_id,
    assetAddressHex: asset_address,
    amountUsdMicro: BigInt(amount_usd_micro),
    valuedAtTs: BigInt(valued_at_ts),
    nonce: BigInt(nonce),
    statusByte,
  });

  const signature = sign(null, message, privateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey_hex: oraclePubkeyHex,
    message_hex: message.toString('hex'),
    status,
  });
}
