/**
 * Cloak batch payout integration — Stellar build.
 *
 * Same 73-byte attestation shape as before, with vault identified by u32 LE
 * id padded with zeros (not a Stellar pubkey). The on-chain `record_cloak_payout`
 * verifies the Ed25519 sig via `env.crypto().ed25519_verify`.
 */

import { Buffer } from 'buffer';

const MSG_PREFIX = Buffer.from('clk_atts'); // 8 bytes
export const CLOAK_MSG_LEN = 73;

export interface CloakViewingKeys {
  prime: string;
  core: string;
  alpha: string;
}

export interface CloakAttestation {
  /** 64-byte Ed25519 signature from the Cloak oracle */
  signature: Uint8Array;
  /** 32-byte oracle pubkey (raw bytes, not Stellar StrKey) */
  oraclePubkey: Uint8Array;
  vaultId: number;
  /** 32-byte batch commitment (sha256 receipt hash) */
  batchId: Uint8Array;
  batchConfirmed: boolean;
  viewingKeys: CloakViewingKeys;
}

export function buildCloakAttestationMessage(params: {
  vaultId: number;
  batchId: Uint8Array;
  batchConfirmed?: boolean;
}): Buffer {
  if (params.batchId.length !== 32) {
    throw new Error(`Cloak batchId must be 32 bytes (got ${params.batchId.length})`);
  }
  const buf = Buffer.alloc(CLOAK_MSG_LEN);
  MSG_PREFIX.copy(buf, 0);
  buf.writeUInt32LE(params.vaultId, 8); // rest of 8..40 is zero-padded
  Buffer.from(params.batchId).copy(buf, 40);
  buf.writeUInt8(params.batchConfirmed === false ? 0x00 : 0x01, 72);
  return buf;
}

const CLOAK_ORACLE_URL = process.env.NEXT_PUBLIC_CLOAK_ORACLE_URL ?? '/api/cloak-oracle';

export async function fetchCloakAttestation(params: {
  vaultId: number;
  totalShieldedAmount: bigint;
}): Promise<CloakAttestation> {
  const res = await fetch(`${CLOAK_ORACLE_URL}/shield_payout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vault_id: params.vaultId,
      total_shielded_amount: params.totalShieldedAmount.toString(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cloak oracle (${res.status}): ${text}`);
  }

  const data = await res.json();
  const batchId = Buffer.from(data.batch_id, 'hex');
  const signature = Buffer.from(data.signature, 'hex');

  if (batchId.length !== 32) {
    throw new Error(`Cloak oracle returned invalid batch_id length (${batchId.length})`);
  }
  if (signature.length !== 64) {
    throw new Error(`Cloak oracle returned invalid signature length (${signature.length})`);
  }

  return {
    signature: new Uint8Array(signature),
    oraclePubkey: Uint8Array.from(Buffer.from(data.oracle_pubkey_hex ?? data.oracle_pubkey, 'hex')),
    vaultId: params.vaultId,
    batchId: new Uint8Array(batchId),
    batchConfirmed: data.batch_confirmed !== false,
    viewingKeys: {
      prime: data.viewing_keys?.prime ?? '',
      core: data.viewing_keys?.core ?? '',
      alpha: data.viewing_keys?.alpha ?? '',
    },
  };
}
