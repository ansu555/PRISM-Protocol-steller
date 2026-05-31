/**
 * PRISM Cloak Oracle — Ed25519 attestation signer.
 *
 * Signs the 73-byte `clk_atts` message confirming that a batch of yield has
 * been shielded into Cloak's privacy pool. Mirrors the collateral oracle shape.
 *
 * This route provides the current dev/demo signing path.
 *
 * Message layout (73 bytes, must match prism-core's record_cloak_payout):
 *   bytes  0..8    b"clk_atts"
 *   bytes  8..12   vault_id (u32 LE), zero-padded to 32 bytes at 8..40
 *   bytes 40..72   batch_id (sha256 of off-chain disbursement receipt)
 *   byte  72       result (0x01 = batch confirmed)
 */

import { sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  enforceOracleRateLimit,
  loadManagedOracleSigner,
  recordOracleOperationalEvent,
  selectOracleSigner,
} from '@/app/lib/oracle-security';

function loadSignerBundle() {
  return loadManagedOracleSigner({
    oracleName: 'cloak',
    primarySeedEnv: 'CLOAK_ORACLE_SEED',
    legacySeedEnvs: ['CLOAK_ORACLE_SECRET_SEED'],
    devSeedEnv: 'CLOAK_ORACLE_SEED_DEV',
    nextSeedEnv: 'CLOAK_ORACLE_SEED_NEXT',
    activeKeyIdEnv: 'CLOAK_ORACLE_ACTIVE_KEY_ID',
    primaryKeyIdEnv: 'CLOAK_ORACLE_PRIMARY_KEY_ID',
    nextKeyIdEnv: 'CLOAK_ORACLE_NEXT_KEY_ID',
  });
}

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
  const rate = enforceOracleRateLimit(req, 'cloak-oracle-attest', 'CLOAK_ORACLE_RATE_LIMIT_PER_MINUTE');
  const rateHeaders = {
    'x-ratelimit-limit': String(rate.limit),
    'x-ratelimit-remaining': String(rate.remaining),
    'x-ratelimit-reset': String(rate.resetAtEpochSeconds),
  };
  if (!rate.allowed) {
    await recordOracleOperationalEvent({
      route: '/api/cloak-oracle/attest',
      oracle: 'cloak',
      outcome: 'rate_limited',
      clientKey: rate.clientKey,
      success: false,
    });
    return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429, headers: rateHeaders });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    await recordOracleOperationalEvent({
      route: '/api/cloak-oracle/attest',
      oracle: 'cloak',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'invalid json' },
    });
    return NextResponse.json({ error: 'invalid json' }, { status: 400, headers: rateHeaders });
  }

  const { vault_id, batch_id, result = 1, key_id } = body as {
    vault_id?: number;
    batch_id?: string;
    result?: number;
    key_id?: string;
  };

  if (vault_id === undefined || !batch_id) {
    await recordOracleOperationalEvent({
      route: '/api/cloak-oracle/attest',
      oracle: 'cloak',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'missing: vault_id, batch_id' },
    });
    return NextResponse.json(
      { error: 'missing: vault_id, batch_id (64 hex chars)' },
      { status: 400, headers: rateHeaders },
    );
  }
  if (typeof vault_id !== 'number' || !Number.isInteger(vault_id) || vault_id < 0) {
    await recordOracleOperationalEvent({
      route: '/api/cloak-oracle/attest',
      oracle: 'cloak',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'vault_id must be a non-negative integer' },
    });
    return NextResponse.json(
      { error: 'vault_id must be a non-negative integer' },
      { status: 400, headers: rateHeaders },
    );
  }
  if (batch_id.length !== 64) {
    await recordOracleOperationalEvent({
      route: '/api/cloak-oracle/attest',
      oracle: 'cloak',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'batch_id must be 64 hex chars' },
    });
    return NextResponse.json(
      { error: 'batch_id must be 64 hex chars (32 bytes sha256)' },
      { status: 400, headers: rateHeaders },
    );
  }

  const signerBundle = (() => {
    try {
      return loadSignerBundle();
    } catch (error) {
      return error as Error;
    }
  })();
  if (signerBundle instanceof Error) {
    await recordOracleOperationalEvent({
      route: '/api/cloak-oracle/attest',
      oracle: 'cloak',
      outcome: 'error',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: signerBundle.message },
    });
    return NextResponse.json({ error: 'oracle unavailable' }, { status: 503, headers: rateHeaders });
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
      route: '/api/cloak-oracle/attest',
      oracle: 'cloak',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: signer.message },
    });
    return NextResponse.json({ error: signer.message }, { status: 400, headers: rateHeaders });
  }

  const message = buildCloakMessage(vault_id, batch_id, result);
  const signature = sign(null, message, signer.privateKey);

  await recordOracleOperationalEvent({
    route: '/api/cloak-oracle/attest',
    oracle: 'cloak',
    outcome: 'signed',
    signer,
    clientKey: rate.clientKey,
    success: true,
    detail: { vault_id, key_id: signer.keyId },
  });

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey_hex: signer.publicKeyHex,
    message_hex: message.toString('hex'),
    key_id: signer.keyId,
  }, { headers: rateHeaders });
}
