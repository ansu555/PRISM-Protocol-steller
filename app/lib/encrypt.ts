/**
 * Encrypt Protocol (FHE / REFHE) integration — Stellar build.
 *
 * The Encrypt FHE oracle still runs homomorphic computation on encrypted
 * borrower data and signs a 73-byte attestation that the contract verifies
 * via `env.crypto().ed25519_verify` inside `verify_encrypt_default`.
 *
 * What changed from Solana:
 *   - Loan identifier in bytes 8..40 is now `(loan_id u32 LE) || 28 zero bytes`
 *     (no Stellar pubkey for the loan itself; loans are keyed by u32 id).
 *   - On-chain verification: one Soroban contract call (no Ed25519 precompile +
 *     instructions sysvar dance). Caller passes (message, signature) as args.
 *   - Oracle pubkey is a 32-byte hex string, not a Stellar StrKey.
 */

import { Buffer } from 'buffer';

// ─────────────────────────────────────────────────────────────────────────────
// Attestation message (73 bytes — must match prism-core's verify_encrypt_default)
//
//   bytes  0..8    b"enc_atts"
//   bytes  8..40   loan_id (u32 LE) padded to 32 bytes with zeros
//   bytes 40..72   sha256 commitment of borrower's Encrypt-sealed credit data
//   byte  72       result: 0x01 = default proven
// ─────────────────────────────────────────────────────────────────────────────

const MSG_PREFIX = Buffer.from('enc_atts'); // 8 bytes
export const ENCRYPT_MSG_LEN = 73;

export function buildEncryptAttestationMessage(params: {
  loanId: number;
  scoreCommitment: Uint8Array; // exactly 32 bytes
  defaultProven: boolean;
}): Buffer {
  if (params.scoreCommitment.length !== 32) {
    throw new Error(
      `Encrypt scoreCommitment must be 32 bytes (got ${params.scoreCommitment.length})`,
    );
  }
  const buf = Buffer.alloc(ENCRYPT_MSG_LEN);
  MSG_PREFIX.copy(buf, 0);
  buf.writeUInt32LE(params.loanId, 8); // rest of 8..40 is already zero from alloc()
  Buffer.from(params.scoreCommitment).copy(buf, 40);
  buf.writeUInt8(params.defaultProven ? 0x01 : 0x00, 72);
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Oracle attestation type
// ─────────────────────────────────────────────────────────────────────────────

export interface EncryptAttestation {
  /** 64-byte Ed25519 signature from the Encrypt FHE oracle */
  signature: Uint8Array;
  /** 32-byte oracle pubkey (raw Ed25519, not Stellar StrKey) */
  oraclePubkey: Uint8Array;
  loanId: number;
  /** 32-byte sha256 commitment registered at attach time */
  scoreCommitment: Uint8Array;
  /** Result of homomorphic comparison: total_repaid < principal */
  defaultProven: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP client for the Encrypt FHE oracle
// ─────────────────────────────────────────────────────────────────────────────

const ENCRYPT_ORACLE_URL =
  process.env.NEXT_PUBLIC_ENCRYPT_ORACLE_URL ?? '/api/encrypt-oracle';

export async function getEncryptAttestation(
  loanId: number,
  scoreCommitment: Uint8Array,
): Promise<EncryptAttestation> {
  const res = await fetch(`${ENCRYPT_ORACLE_URL}/attest_default`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // The mock oracle expects a loan identifier; Stellar version sends the
      // u32 id. The oracle just hashes whatever we send into the message.
      loan_id: loanId,
      score_commitment: Buffer.from(scoreCommitment).toString('hex'),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Encrypt oracle (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    signature: Uint8Array.from(Buffer.from(data.signature, 'hex')),
    // Mock oracle returns the pubkey hex; on Stellar it stays as raw 32 bytes.
    oraclePubkey: Uint8Array.from(Buffer.from(data.oracle_pubkey_hex ?? data.oracle_pubkey, 'hex')),
    loanId,
    scoreCommitment,
    defaultProven: data.default_proven === true,
  };
}

export async function pollEncryptAttestation(
  loanId: number,
  scoreCommitment: Uint8Array,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<EncryptAttestation> {
  const intervalMs = opts.intervalMs ?? 4_000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      return await getEncryptAttestation(loanId, scoreCommitment);
    } catch (e: unknown) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('404')) throw e;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Encrypt oracle did not respond within ${timeoutMs / 1000}s${lastErr ? `: ${String(lastErr)}` : ''}`,
  );
}
