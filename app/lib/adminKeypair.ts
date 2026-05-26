/**
 * Server-only admin keypair loader for Stellar.
 *
 * Reads the Stellar secret key from ADMIN_SECRET_KEY (S... format) or
 * ADMIN_SECRET_KEY_B64 (base64-encoded 32-byte raw seed).
 */

import { Keypair } from '@stellar/stellar-sdk';

const globalForAdmin = globalThis as typeof globalThis & {
  prismAdminKeypair?: Keypair;
};

class AdminKeypairConfigError extends Error {
  constructor(reason: string) {
    super(`Admin keypair is not configured: ${reason}`);
    this.name = 'AdminKeypairConfigError';
  }
}

export function getAdminKeypair(): Keypair {
  if (globalForAdmin.prismAdminKeypair) return globalForAdmin.prismAdminKeypair;

  const secret = process.env.ADMIN_SECRET_KEY;
  if (secret) {
    const kp = Keypair.fromSecret(secret);
    globalForAdmin.prismAdminKeypair = kp;
    return kp;
  }

  const b64 = process.env.ADMIN_SECRET_KEY_B64;
  if (!b64) throw new AdminKeypairConfigError('ADMIN_SECRET_KEY or ADMIN_SECRET_KEY_B64 env var missing');

  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length !== 32) {
    throw new AdminKeypairConfigError(
      `expected 32-byte seed, got ${bytes.length}`,
    );
  }

  const kp = Keypair.fromRawEd25519Seed(bytes);
  globalForAdmin.prismAdminKeypair = kp;
  return kp;
}

export { AdminKeypairConfigError };
