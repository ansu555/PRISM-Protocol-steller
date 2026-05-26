'use client';

// Drop-in replacement for the @solana/wallet-adapter-react family.
//
// Aliased in next.config.mjs so any legacy `import { useWallet } from
// '@solana/wallet-adapter-react'` lands here instead of in the real
// Solana adapter. This lets us keep ~25 components unchanged while their
// runtime semantics quietly switch over to the Stellar wallet context.

import { useStellarWallet } from '@/components/providers/stellar-wallet-context';

export {
  useWallet,
  useConnection,
} from '@/components/providers/stellar-wallet-context';

/**
 * Anchor-wallet shape: an object with publicKey + signTransaction methods.
 * On Stellar we don't have a typed AnchorWallet, but components that called
 * useAnchorWallet() just need `null` when disconnected or `{ publicKey,
 * signTransaction, signAllTransactions }` when connected. Returning null
 * forces components down the disconnected branch — safer than handing them
 * a broken object that pretends to sign Solana transactions.
 */
export function useAnchorWallet() {
  const w = useStellarWallet();
  if (!w.connected || !w.address) return null;
  return {
    publicKey: { toBase58: () => w.address!, toString: () => w.address! },
    signTransaction: async (_tx: unknown) => {
      throw new Error(
        'useAnchorWallet().signTransaction is a Solana shim. The component reading this should be migrated to useStellarWallet().signTransaction(xdr).',
      );
    },
    signAllTransactions: async (_txs: unknown[]) => {
      throw new Error(
        'useAnchorWallet().signAllTransactions is not implemented on the Stellar build.',
      );
    },
  };
}
