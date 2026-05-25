/**
 * Mock Cloak oracle for demo/testing (Stellar build).
 *
 * Receives { vault_id, total_shielded_amount }, signs the 73-byte attestation.
 * On Stellar, vault_id is a u32 padded to 32 bytes (LE), not a pubkey.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
} from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

const seedHex = process.env.CLOAK_ORACLE_SECRET_SEED ?? '11'.repeat(32);
const ORACLE_SEED = Buffer.from(seedHex, 'hex');
if (ORACLE_SEED.length !== 32) {
  throw new Error('CLOAK_ORACLE_SECRET_SEED must be 32 bytes (64 hex chars)');
}

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const oraclePrivateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, ORACLE_SEED]),
  format: 'der',
  type: 'pkcs8',
});
const oraclePubkeyBytes = createPublicKey(oraclePrivateKey)
  .export({ type: 'spki', format: 'der' })
  .slice(-32);

function buildMessage(vaultId: number, batchId: Buffer, batchConfirmed: boolean): Buffer {
  const buf = Buffer.alloc(73);
  Buffer.from('clk_atts').copy(buf, 0);
  buf.writeUInt32LE(vaultId, 8);
  batchId.copy(buf, 40);
  buf.writeUInt8(batchConfirmed ? 0x01 : 0x00, 72);
  return buf;
}

function encodeViewingKey(tranche: 'prime' | 'core' | 'alpha', amountMicroUsdc: bigint) {
  return `${tranche}:${amountMicroUsdc.toString()}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const { vault_id, vault_pubkey, total_shielded_amount } = body as {
    vault_id?: number;
    vault_pubkey?: string;
    total_shielded_amount?: string;
  };

  const resolvedVaultId = vault_id ?? 0;

  if (!total_shielded_amount) {
    return NextResponse.json(
      { error: 'missing: total_shielded_amount' },
      { status: 400 },
    );
  }

  let total: bigint;
  try {
    total = BigInt(total_shielded_amount);
  } catch {
    return NextResponse.json(
      { error: 'total_shielded_amount must be a base-10 integer string' },
      { status: 400 },
    );
  }

  if (total < 0n) {
    return NextResponse.json(
      { error: 'total_shielded_amount must be non-negative' },
      { status: 400 },
    );
  }

  const prime = (total * 70n) / 100n;
  const core = (total * 20n) / 100n;
  const alpha = total - prime - core;

  const nonce = randomBytes(8).toString('hex');
  const receipt = `${resolvedVaultId}|${total.toString()}|${Date.now()}|${nonce}`;
  const batchId = createHash('sha256').update(receipt).digest();

  const batchConfirmed = true;
  const message = buildMessage(resolvedVaultId, batchId, batchConfirmed);
  const signature = sign(null, message, oraclePrivateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey: Buffer.from(oraclePubkeyBytes).toString('hex'),
    batch_id: batchId.toString('hex'),
    batch_confirmed: batchConfirmed,
    viewing_keys: {
      prime: encodeViewingKey('prime', prime),
      core: encodeViewingKey('core', core),
      alpha: encodeViewingKey('alpha', alpha),
    },
  });
}
