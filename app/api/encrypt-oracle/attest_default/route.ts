/**
 * Mock Encrypt FHE oracle for the demo (Stellar build).
 *
 * Signs a 73-byte attestation with a deterministic Ed25519 keypair.
 * On Stellar, loan_id is a u32 padded to 32 bytes (LE), not a pubkey.
 */

import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

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
const oraclePubkeyBytes = createPublicKey(oraclePrivateKey)
  .export({ type: 'spki', format: 'der' })
  .slice(-32);

function buildMessage(
  loanId: number,
  scoreCommitmentHex: string,
  defaultProven: boolean,
): Buffer {
  const buf = Buffer.alloc(73);
  Buffer.from('enc_atts').copy(buf, 0);
  buf.writeUInt32LE(loanId, 8);
  Buffer.from(scoreCommitmentHex, 'hex').copy(buf, 40);
  buf.writeUInt8(defaultProven ? 0x01 : 0x00, 72);
  return buf;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid json' }, { status: 400 });

  const { loan_id, loan_pubkey, score_commitment } = body as {
    loan_id?: number;
    loan_pubkey?: string;
    score_commitment?: string;
  };

  const resolvedLoanId = loan_id ?? (loan_pubkey ? 1 : undefined);

  if (resolvedLoanId === undefined || !score_commitment) {
    return NextResponse.json(
      { error: 'missing: loan_id (or loan_pubkey), score_commitment' },
      { status: 400 },
    );
  }

  if (score_commitment.length !== 64) {
    return NextResponse.json(
      { error: 'score_commitment must be 64 hex chars (32 bytes)' },
      { status: 400 },
    );
  }

  const defaultProven = true;
  const message = buildMessage(resolvedLoanId, score_commitment, defaultProven);
  const signature = sign(null, message, oraclePrivateKey);

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey: Buffer.from(oraclePubkeyBytes).toString('hex'),
    default_proven: defaultProven,
  });
}
