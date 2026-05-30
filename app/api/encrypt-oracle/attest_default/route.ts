/**
 * Mock Encrypt FHE oracle for the demo — Stellar build.
 *
 * The real Encrypt oracle runs an FHE circuit that homomorphically computes
 * `total_repaid < principal` on borrower-sealed credit data and signs the
 * boolean result. For demo purposes we simulate this: always return
 * `default_proven: true` and sign the 73-byte attestation using the
 * environment-managed Ed25519 signer configured for this route.
 *
 * Message layout (73 bytes, must match prism-core's verify_encrypt_default):
 *   bytes  0..8    b"enc_atts"
 *   bytes  8..40   loan_id (u32 LE) + 28 zero bytes
 *   bytes 40..72   sha256 score_commitment
 *   byte  72       result: 0x01 = default proven
 *
 * The oracle pubkey (raw 32-byte Ed25519 hex) must be in GlobalConfig.oracle_allowlist.
 */

import { sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  enforceOracleRateLimit,
  loadManagedOracleSigner,
  recordOracleOperationalEvent,
  selectOracleSigner,
} from '@/app/lib/oracle-security';

const signerBundle = loadManagedOracleSigner({
  oracleName: 'encrypt',
  primarySeedEnv: 'ENCRYPT_ORACLE_SECRET_SEED',
  legacySeedEnvs: ['IKA_TEST_ORACLE_SECRET_SEED'],
  devSeedEnv: 'ENCRYPT_ORACLE_SECRET_SEED_DEV',
  nextSeedEnv: 'ENCRYPT_ORACLE_SECRET_SEED_NEXT',
  activeKeyIdEnv: 'ENCRYPT_ORACLE_ACTIVE_KEY_ID',
  primaryKeyIdEnv: 'ENCRYPT_ORACLE_PRIMARY_KEY_ID',
  nextKeyIdEnv: 'ENCRYPT_ORACLE_NEXT_KEY_ID',
});

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
  const rate = enforceOracleRateLimit(
    req,
    'encrypt-oracle-attest-default',
    'ENCRYPT_ORACLE_RATE_LIMIT_PER_MINUTE',
  );
  const rateHeaders = {
    'x-ratelimit-limit': String(rate.limit),
    'x-ratelimit-remaining': String(rate.remaining),
    'x-ratelimit-reset': String(rate.resetAtEpochSeconds),
  };
  if (!rate.allowed) {
    await recordOracleOperationalEvent({
      route: '/api/encrypt-oracle/attest_default',
      oracle: 'encrypt',
      outcome: 'rate_limited',
      clientKey: rate.clientKey,
      success: false,
    });
    return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429, headers: rateHeaders });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    await recordOracleOperationalEvent({
      route: '/api/encrypt-oracle/attest_default',
      oracle: 'encrypt',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'invalid json' },
    });
    return NextResponse.json({ error: 'invalid json' }, { status: 400, headers: rateHeaders });
  }

  const { loan_id, score_commitment, key_id } = body as {
    loan_id?: number;
    score_commitment?: string;
    key_id?: string;
  };

  if (loan_id === undefined || loan_id === null || !score_commitment) {
    await recordOracleOperationalEvent({
      route: '/api/encrypt-oracle/attest_default',
      oracle: 'encrypt',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'missing: loan_id, score_commitment' },
    });
    return NextResponse.json(
      { error: 'missing: loan_id (number), score_commitment (64 hex chars)' },
      { status: 400, headers: rateHeaders },
    );
  }
  if (typeof loan_id !== 'number' || !Number.isInteger(loan_id) || loan_id < 0) {
    await recordOracleOperationalEvent({
      route: '/api/encrypt-oracle/attest_default',
      oracle: 'encrypt',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'loan_id must be a non-negative integer' },
    });
    return NextResponse.json(
      { error: 'loan_id must be a non-negative integer' },
      { status: 400, headers: rateHeaders },
    );
  }
  if (score_commitment.length !== 64) {
    await recordOracleOperationalEvent({
      route: '/api/encrypt-oracle/attest_default',
      oracle: 'encrypt',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'score_commitment must be 64 hex chars' },
    });
    return NextResponse.json(
      { error: 'score_commitment must be 64 hex chars (32 bytes)' },
      { status: 400, headers: rateHeaders },
    );
  }

  const signer = (() => {
    try {
      return selectOracleSigner(signerBundle, key_id);
    } catch (error) {
      return error as Error;
    }
  })();
  if (signer instanceof Error) {
    await recordOracleOperationalEvent({
      route: '/api/encrypt-oracle/attest_default',
      oracle: 'encrypt',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: signer.message },
    });
    return NextResponse.json({ error: signer.message }, { status: 400, headers: rateHeaders });
  }

  const defaultProven = true;
  const message = buildMessage(loan_id, score_commitment, defaultProven);
  const signature = sign(null, message, signer.privateKey);

  await recordOracleOperationalEvent({
    route: '/api/encrypt-oracle/attest_default',
    oracle: 'encrypt',
    outcome: 'signed',
    signer,
    clientKey: rate.clientKey,
    success: true,
    detail: { loan_id, key_id: signer.keyId },
  });

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey_hex: signer.publicKeyHex,
    default_proven: defaultProven,
    key_id: signer.keyId,
  }, { headers: rateHeaders });
}
