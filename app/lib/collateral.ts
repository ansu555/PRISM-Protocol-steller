/**
 * PRISM Collateral Oracle — client library (Stellar build).
 *
 * Replaces app/lib/ika.ts for the attestation flow. The on-chain message
 * layout mirrors §6.6 of stellar-migration-plan.md and must stay byte-identical
 * to prism-core's verify_collateral handler.
 *
 * chain_id values:
 *   0 = BTC, 1 = ETH, 2 = SOL, 3 = XLM, 4 = USDC-Stellar
 */

import { Buffer } from 'buffer';

// ─────────────────────────────────────────────────────────────────────────────
// Attestation message layout (73 bytes)
//
//   bytes  0..8    b"col_atts"
//   bytes  8..12   loan_id (u32 LE)
//   bytes 12..16   chain_id (u32 LE)
//   bytes 16..48   asset_address (32 bytes)
//   bytes 48..56   amount_usd_micro (u64 LE)
//   bytes 56..64   valued_at_ts (i64 LE)
//   bytes 64..72   nonce (u64 LE)
//   byte  72       status (0x01=Attached, 0x02=Released, 0x03=Liquidated)
// ─────────────────────────────────────────────────────────────────────────────

export const COLLATERAL_MSG_LEN = 73;
const MSG_PREFIX = Buffer.from('col_atts'); // 8 bytes

export type CollateralStatusName = 'attached' | 'released' | 'liquidated';

const STATUS_BYTE: Record<CollateralStatusName, number> = {
  attached: 0x01,
  released: 0x02,
  liquidated: 0x03,
};

export interface CollateralMessageParams {
  loanId: number;
  chainId: number;
  /** 32-byte asset address as Uint8Array */
  assetAddress: Uint8Array;
  amountUsdMicro: bigint;
  valuedAtTs: bigint;
  nonce: bigint;
  status: CollateralStatusName;
}

export function buildCollateralMessage(params: CollateralMessageParams): Buffer {
  if (params.assetAddress.length !== 32) {
    throw new Error(`assetAddress must be 32 bytes (got ${params.assetAddress.length})`);
  }
  const buf = Buffer.alloc(COLLATERAL_MSG_LEN);
  MSG_PREFIX.copy(buf, 0);
  buf.writeUInt32LE(params.loanId, 8);
  buf.writeUInt32LE(params.chainId, 12);
  Buffer.from(params.assetAddress).copy(buf, 16);
  buf.writeBigUInt64LE(params.amountUsdMicro, 48);
  buf.writeBigInt64LE(params.valuedAtTs, 56);
  buf.writeBigUInt64LE(params.nonce, 64);
  buf.writeUInt8(STATUS_BYTE[params.status], 72);
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Attestation response type
// ─────────────────────────────────────────────────────────────────────────────

export interface CollateralAttestation {
  /** 64-byte Ed25519 signature */
  signature: Uint8Array;
  /** 32-byte oracle pubkey (raw Ed25519, not Stellar StrKey) */
  oraclePubkey: Uint8Array;
  /** The signed message (73 bytes), ready to pass to verify_collateral */
  message: Uint8Array;
  loanId: number;
  status: CollateralStatusName;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP client
// ─────────────────────────────────────────────────────────────────────────────

const COLLATERAL_ORACLE_URL =
  process.env.NEXT_PUBLIC_COLLATERAL_ORACLE_URL ?? '/api/collateral-oracle';

export async function getCollateralAttestation(params: {
  loanId: number;
  chainId?: number;
  assetAddressHex?: string;
  amountUsdMicro?: bigint;
  valuedAtTs?: bigint;
  nonce: bigint;
  status?: CollateralStatusName;
}): Promise<CollateralAttestation> {
  const res = await fetch(`${COLLATERAL_ORACLE_URL}/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loan_id: params.loanId,
      chain_id: params.chainId ?? 0,
      asset_address: params.assetAddressHex ?? '00'.repeat(32),
      amount_usd_micro: (params.amountUsdMicro ?? 0n).toString(),
      valued_at_ts: (params.valuedAtTs ?? BigInt(Math.floor(Date.now() / 1000))).toString(),
      nonce: params.nonce.toString(),
      status: params.status ?? 'attached',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Collateral oracle (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    signature: Uint8Array.from(Buffer.from(data.signature, 'hex')),
    oraclePubkey: Uint8Array.from(Buffer.from(data.oracle_pubkey_hex, 'hex')),
    message: Uint8Array.from(Buffer.from(data.message_hex, 'hex')),
    loanId: params.loanId,
    status: params.status ?? 'attached',
  };
}
