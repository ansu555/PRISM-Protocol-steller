/**
 * Mock Cloak oracle for demo/testing.
 *
 * Receives { vault_pubkey, total_shielded_amount }, creates a synthetic
 * batch receipt commitment, signs the 73-byte Cloak attestation message,
 * and returns per-tranche viewing keys.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
} from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

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
const oraclePublicKey = new PublicKey(
  createPublicKey(oraclePrivateKey).export({ type: 'spki', format: 'der' }).slice(-32),
);

function buildMessage(vaultPubkeyB58: string, batchId: Buffer, batchConfirmed: boolean): Buffer {
  const buf = Buffer.alloc(73);
  Buffer.from('clk_atts').copy(buf, 0);
  new PublicKey(vaultPubkeyB58).toBuffer().copy(buf, 8);
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

  const { vault_pubkey, total_shielded_amount } = body as {
    vault_pubkey?: string;
    total_shielded_amount?: string;
  };

  if (!vault_pubkey || !total_shielded_amount) {
    return NextResponse.json(
      { error: 'missing: vault_pubkey, total_shielded_amount' },
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

  // Demo split: 70/20/10 across Prime/Core/Alpha.
  const prime = (total * 70n) / 100n;
  const core = (total * 20n) / 100n;
  const alpha = total - prime - core;

  // Synthetic batch receipt commitment.
  const nonce = randomBytes(8).toString('hex');
  const receipt = `${vault_pubkey}|${total.toString()}|${Date.now()}|${nonce}`;
  const batchId = createHash('sha256').update(receipt).digest();

  const batchConfirmed = true;
  const message = buildMessage(vault_pubkey, batchId, batchConfirmed);
  const signature = sign(null, message, oraclePrivateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey: oraclePublicKey.toBase58(),
    batch_id: batchId.toString('hex'),
    batch_confirmed: batchConfirmed,
    viewing_keys: {
      prime: encodeViewingKey('prime', prime),
      core: encodeViewingKey('core', core),
      alpha: encodeViewingKey('alpha', alpha),
    },
  });
}
