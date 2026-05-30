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

import { sign } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import {
  enforceOracleRateLimit,
  loadManagedOracleSigner,
  recordOracleOperationalEvent,
  selectOracleSigner,
} from '@/app/lib/oracle-security';

const signerBundle = loadManagedOracleSigner({
  oracleName: 'collateral',
  primarySeedEnv: 'COLLATERAL_ORACLE_SEED',
  legacySeedEnvs: ['IKA_TEST_ORACLE_SECRET_SEED'],
  devSeedEnv: 'COLLATERAL_ORACLE_SEED_DEV',
  nextSeedEnv: 'COLLATERAL_ORACLE_SEED_NEXT',
  activeKeyIdEnv: 'COLLATERAL_ORACLE_ACTIVE_KEY_ID',
  primaryKeyIdEnv: 'COLLATERAL_ORACLE_PRIMARY_KEY_ID',
  nextKeyIdEnv: 'COLLATERAL_ORACLE_NEXT_KEY_ID',
});

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
  const rate = enforceOracleRateLimit(
    req,
    'collateral-oracle-attest',
    'COLLATERAL_ORACLE_RATE_LIMIT_PER_MINUTE',
  );
  const rateHeaders = {
    'x-ratelimit-limit': String(rate.limit),
    'x-ratelimit-remaining': String(rate.remaining),
    'x-ratelimit-reset': String(rate.resetAtEpochSeconds),
  };
  if (!rate.allowed) {
    await recordOracleOperationalEvent({
      route: '/api/collateral-oracle/attest',
      oracle: 'collateral',
      outcome: 'rate_limited',
      clientKey: rate.clientKey,
      success: false,
    });
    return NextResponse.json({ error: 'rate limit exceeded' }, { status: 429, headers: rateHeaders });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    await recordOracleOperationalEvent({
      route: '/api/collateral-oracle/attest',
      oracle: 'collateral',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'invalid json' },
    });
    return NextResponse.json({ error: 'invalid json' }, { status: 400, headers: rateHeaders });
  }

  const {
    loan_id,
    chain_id = 0,
    asset_address = '00'.repeat(32),
    amount_usd_micro = '0',
    valued_at_ts = '0',
    nonce,
    status = 'attached',
    key_id,
  } = body as {
    loan_id?: number;
    chain_id?: number;
    asset_address?: string;
    amount_usd_micro?: string;
    valued_at_ts?: string;
    nonce?: string;
    status?: string;
    key_id?: string;
  };

  if (loan_id === undefined || nonce === undefined) {
    await recordOracleOperationalEvent({
      route: '/api/collateral-oracle/attest',
      oracle: 'collateral',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'missing: loan_id, nonce' },
    });
    return NextResponse.json({ error: 'missing: loan_id, nonce' }, { status: 400, headers: rateHeaders });
  }
  if (typeof loan_id !== 'number' || !Number.isInteger(loan_id) || loan_id < 0) {
    await recordOracleOperationalEvent({
      route: '/api/collateral-oracle/attest',
      oracle: 'collateral',
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
  const statusByte = STATUS_MAP[status.toLowerCase()];
  if (statusByte === undefined) {
    await recordOracleOperationalEvent({
      route: '/api/collateral-oracle/attest',
      oracle: 'collateral',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: 'invalid status', status },
    });
    return NextResponse.json(
      { error: 'status must be one of: attached, released, liquidated' },
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
      route: '/api/collateral-oracle/attest',
      oracle: 'collateral',
      outcome: 'invalid_request',
      clientKey: rate.clientKey,
      success: false,
      detail: { error: signer.message },
    });
    return NextResponse.json({ error: signer.message }, { status: 400, headers: rateHeaders });
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

  const signature = sign(null, message, signer.privateKey);

  await recordOracleOperationalEvent({
    route: '/api/collateral-oracle/attest',
    oracle: 'collateral',
    outcome: 'signed',
    signer,
    clientKey: rate.clientKey,
    success: true,
    detail: { loan_id, status, nonce, key_id: signer.keyId },
  });

  return NextResponse.json({
    signature: Buffer.from(signature).toString('hex'),
    oracle_pubkey_hex: signer.publicKeyHex,
    message_hex: message.toString('hex'),
    status,
    key_id: signer.keyId,
  }, { headers: rateHeaders });
}
