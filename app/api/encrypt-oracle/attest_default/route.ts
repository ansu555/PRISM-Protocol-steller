/**
 * Mock Encrypt FHE oracle for the demo — Stellar build.
 *
 * The real Encrypt oracle runs an FHE circuit that homomorphically computes
 * `total_repaid < principal` on borrower-sealed credit data and signs the
 * boolean result. For demo purposes we simulate this: always return
 * `default_proven: true` and sign the 73-byte attestation with a deterministic
 * Ed25519 keypair derived from a 32-byte zero seed.
 *
 * Message layout (73 bytes, must match prism-core's verify_encrypt_default):
 *   bytes  0..8    b"enc_atts"
 *   bytes  8..40   loan_id (u32 LE) + 28 zero bytes
 *   bytes 40..72   sha256 score_commitment
 *   byte  72       result: 0x01 = default proven
 *
 * The oracle pubkey (raw 32-byte Ed25519 hex) must be in GlobalConfig.oracle_allowlist.
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

// Deterministic seed: 32-byte zero seed in dev. Override via env in prod.
const seedHex = process.env.ENCRYPT_ORACLE_SECRET_SEED ?? '00'.repeat(32);

const TEST_SEED = Buffer.from(seedHex, 'hex');
if (TEST_SEED.length !== 32) {
  throw new Error('ENCRYPT_ORACLE_SECRET_SEED must be 32 bytes (64 hex chars)');
}

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const oraclePrivateKey = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, TEST_SEED]),
  format: 'der',
  type: 'pkcs8',
});
// Raw 32-byte Ed25519 public key (last 32 bytes of SPKI export).
const oraclePubkeyHex = createPublicKey(oraclePrivateKey)
  .export({ type: 'spki', format: 'der' })
  .slice(-32)
  .toString('hex');

function buildMessage(loanId: number, scoreCommitmentHex: string, defaultProven: boolean): Buffer {
  const buf = Buffer.alloc(73);
  // bytes 0..8: prefix
  Buffer.from('enc_atts').copy(buf, 0);
  // bytes 8..12: loan_id u32 LE; bytes 12..40: zero-padded (alloc initialises to 0)
  buf.writeUInt32LE(loanId, 8);
  // bytes 40..72: score_commitment
  Buffer.from(scoreCommitmentHex, 'hex').copy(buf, 40);
  // byte 72: result
  buf.writeUInt8(defaultProven ? 0x01 : 0x00, 72);
  return buf;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const { loan_id, score_commitment } = body as {
    loan_id?: number;
    score_commitment?: string;
  };

  if (loan_id === undefined || loan_id === null || !score_commitment) {
    return NextResponse.json(
      { error: 'missing: loan_id (number), score_commitment (64 hex chars)' },
      { status: 400 },
    );
  }
  if (typeof loan_id !== 'number' || !Number.isInteger(loan_id) || loan_id < 0) {
    return NextResponse.json({ error: 'loan_id must be a non-negative integer' }, { status: 400 });
  }
  if (score_commitment.length !== 64) {
    return NextResponse.json(
      { error: 'score_commitment must be 64 hex chars (32 bytes)' },
      { status: 400 },
    );
  }

  const defaultProven = true;
  const message = buildMessage(loan_id, score_commitment, defaultProven);
  const signature = sign(null, message, oraclePrivateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey_hex: oraclePubkeyHex,
    default_proven: defaultProven,
  });
}
