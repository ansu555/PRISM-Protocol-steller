/**
 * Mock Encrypt FHE oracle for the demo.
 *
 * The real Encrypt oracle runs an FHE circuit that homomorphically computes
 * `total_repaid < principal` on borrower-sealed credit data and signs the
 * boolean result. For demo purposes we simulate this: always return
 * `default_proven: true` and sign the 73-byte attestation with a deterministic
 * Ed25519 keypair derived from a 32-byte zero seed.
 *
 * The corresponding pubkey is exposed as ENCRYPT_ORACLE_PUBKEY in
 * app/lib/constants.ts and must be added to GlobalConfig.oracle_allowlist
 * during initialize_global_config.
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

// Deterministic seed: 32-byte zero seed in dev. Override via env in prod.
const seedHex =
  process.env.ENCRYPT_ORACLE_SECRET_SEED ?? '00'.repeat(32);

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
const oraclePublicKey = new PublicKey(
  createPublicKey(oraclePrivateKey).export({ type: 'spki', format: 'der' }).slice(-32),
);

function buildMessage(
  loanPubkeyB58: string,
  scoreCommitmentHex: string,
  defaultProven: boolean,
): Buffer {
  const buf = Buffer.alloc(73);
  Buffer.from('enc_atts').copy(buf, 0);
  new PublicKey(loanPubkeyB58).toBuffer().copy(buf, 8);
  Buffer.from(scoreCommitmentHex, 'hex').copy(buf, 40);
  buf.writeUInt8(defaultProven ? 0x01 : 0x00, 72);
  return buf;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const { loan_pubkey, score_commitment } = body as {
    loan_pubkey?: string;
    score_commitment?: string;
  };

  if (!loan_pubkey || !score_commitment) {
    return NextResponse.json(
      { error: 'missing: loan_pubkey, score_commitment' },
      { status: 400 },
    );
  }

  if (score_commitment.length !== 64) {
    return NextResponse.json(
      { error: 'score_commitment must be 64 hex chars (32 bytes)' },
      { status: 400 },
    );
  }

  // FHE result: in production the oracle decides this based on the homomorphic
  // comparison. For demo, always prove default — the loan is in default state.
  const defaultProven = true;

  const message = buildMessage(loan_pubkey, score_commitment, defaultProven);
  const signature = sign(null, message, oraclePrivateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey: oraclePublicKey.toBase58(),
    default_proven: defaultProven,
  });
}
