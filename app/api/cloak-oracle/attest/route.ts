/**
 * PRISM Cloak Oracle — Ed25519 attestation signer.
 *
 * Signs the 73-byte `clk_atts` message confirming that a batch of yield has
 * been shielded into Cloak's privacy pool. Mirrors the collateral oracle shape.
 *
 * Cloak is reclassified from "external partner" to "internal feature" (§5 of
 * stellar-migration-plan.md). The on-chain record_cloak_payout handler is kept;
 * this route provides the dev/demo signing path.
 *
 * Message layout (73 bytes, must match prism-core's record_cloak_payout):
 *   bytes  0..8    b"clk_atts"
 *   bytes  8..12   vault_id (u32 LE), zero-padded to 32 bytes at 8..40
 *   bytes 40..72   batch_id (sha256 of off-chain disbursement receipt)
 *   byte  72       result (0x01 = batch confirmed)
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

// Dev seed: 32 bytes of 0x02.  Override with CLOAK_ORACLE_SEED in prod.
const seedHex =
  process.env.CLOAK_ORACLE_SEED ?? process.env.CLOAK_ORACLE_SEED_DEV ?? '02'.repeat(32);

const SEED = Buffer.from(seedHex, 'hex');
if (SEED.length !== 32) {
  throw new Error('CLOAK_ORACLE_SEED must be 32 bytes (64 hex chars)');
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

function buildCloakMessage(vaultId: number, batchIdHex: string, result: number): Buffer {
  const buf = Buffer.alloc(73);
  Buffer.from('clk_atts').copy(buf, 0);
  buf.writeUInt32LE(vaultId, 8);
  // bytes 8..40: vault_id u32 LE + 28 zero bytes (alloc zero-initialises)
  Buffer.from(batchIdHex.padStart(64, '0'), 'hex').copy(buf, 40);
  buf.writeUInt8(result, 72);
  return buf;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const { vault_id, batch_id, result = 1 } = body as {
    vault_id?: number;
    batch_id?: string;
    result?: number;
  };

  if (vault_id === undefined || !batch_id) {
    return NextResponse.json({ error: 'missing: vault_id, batch_id (64 hex chars)' }, { status: 400 });
  }
  if (typeof vault_id !== 'number' || !Number.isInteger(vault_id) || vault_id < 0) {
    return NextResponse.json({ error: 'vault_id must be a non-negative integer' }, { status: 400 });
  }
  if (batch_id.length !== 64) {
    return NextResponse.json(
      { error: 'batch_id must be 64 hex chars (32 bytes sha256)' },
      { status: 400 },
    );
  }

  const message = buildCloakMessage(vault_id, batch_id, result);
  const signature = sign(null, message, privateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey_hex: oraclePubkeyHex,
    message_hex: message.toString('hex'),
  });
}
