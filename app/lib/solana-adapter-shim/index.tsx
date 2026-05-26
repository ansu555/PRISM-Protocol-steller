'use client';

// Drop-in shim that redirects legacy wallet-adapter imports to the
// Stellar wallet context. Aliased in next.config.mjs so any
// `import { useWallet } from '@solana/wallet-adapter-react'` resolves
// here, letting components work unchanged on Stellar.

import { useStellarWallet } from '@/components/providers/stellar-wallet-context';

export {
  useWallet,
  useConnection,
} from '@/components/providers/stellar-wallet-context';

/**
 * Anchor-wallet shape shim. Returns null when disconnected so components
 * fall through to the disconnected branch.
 */
export function useAnchorWallet() {
  const w = useStellarWallet();
  if (!w.connected || !w.address) return null;
  return {
    publicKey: { toBase58: () => w.address!, toString: () => w.address! },
    signTransaction: async (_tx: unknown) => {
      throw new Error(
        'useAnchorWallet().signTransaction is a legacy shim. Use useStellarWallet().signTransaction(xdr) instead.',
      );
    },
    signAllTransactions: async (_txs: unknown[]) => {
      throw new Error(
        'useAnchorWallet().signAllTransactions is not implemented on the Stellar build.',
      );
    },
  };
}
