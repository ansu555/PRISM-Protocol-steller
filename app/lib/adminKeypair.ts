/**
 * Server-only admin keypair loader.
 *
 * Reads the 64-byte secret key as base64 from ADMIN_SECRET_KEY_B64. This
 * decouples server routes from the client-side JSON import in
 * components/admin/AdminPanel.tsx and avoids leaking the file path into
 * any future serverless deployment.
 */

import { Keypair } from '@solana/web3.js';

const globalForAdmin = globalThis as typeof globalThis & {
  prismAdminKeypair?: Keypair;
};

class AdminKeypairConfigError extends Error {
  constructor(reason: string) {
    super(`ADMIN_SECRET_KEY_B64 is not configured: ${reason}`);
    this.name = 'AdminKeypairConfigError';
  }
}

export function getAdminKeypair(): Keypair {
  if (globalForAdmin.prismAdminKeypair) return globalForAdmin.prismAdminKeypair;

  const b64 = process.env.ADMIN_SECRET_KEY_B64;
  if (!b64) throw new AdminKeypairConfigError('env var missing');

  const bytes = Buffer.from(b64, 'base64');
  if (bytes.length !== 64) {
    throw new AdminKeypairConfigError(
      `expected 64 bytes, got ${bytes.length}`,
    );
  }

  const kp = Keypair.fromSecretKey(Uint8Array.from(bytes));
  globalForAdmin.prismAdminKeypair = kp;
  return kp;
}

export { AdminKeypairConfigError };
