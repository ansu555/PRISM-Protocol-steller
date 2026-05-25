'use client';

// Context + hooks ONLY. The actual StellarWalletsKit (which touches
// window.localStorage at construction) lives in stellar-wallet-provider.tsx.
//
// Keeping these split means hooks like useStellarWallet / useWallet /
// useConnection can be imported anywhere (SSR-safe) without pulling the
// Wallets Kit into the SSR bundle.

import { createContext, useContext } from 'react';

export interface StellarWalletContext {
  /** The connected wallet's Stellar address (`G...`), or `null` when disconnected. */
  address: string | null;
  /** Whether a wallet is currently connected. */
  connected: boolean;
  /** Whether a connect/disconnect operation is in flight. */
  pending: boolean;
  /** Opens the kit modal so the user can pick a wallet to connect. */
  connect: () => Promise<void>;
  /** Forgets the current connection. */
  disconnect: () => Promise<void>;
  /**
   * Signs a base64-encoded transaction XDR with the connected wallet.
   * Returns the signed XDR (base64). Throws if no wallet is connected.
   */
  signTransaction: (xdr: string) => Promise<string>;
}

export const StellarWalletCtx = createContext<StellarWalletContext | null>(null);

export function useStellarWallet(): StellarWalletContext {
  const ctx = useContext(StellarWalletCtx);
  if (!ctx) {
    // Render-time fallback: provider may be loading (it's dynamic-imported).
    return {
      address: null,
      connected: false,
      pending: false,
      connect: async () => {
        throw new Error('Stellar wallet provider not yet mounted');
      },
      disconnect: async () => undefined,
      signTransaction: async () => {
        throw new Error('Stellar wallet provider not yet mounted');
      },
    };
  }
  return ctx;
}

// ── Compatibility shims so legacy useWallet()/useConnection() callers compile ─

/** Drop-in replacement for `useWallet()` from @solana/wallet-adapter-react. */
export function useWallet() {
  const w = useContext(StellarWalletCtx);
  if (!w) {
    return {
      publicKey: null,
      connected: false,
      connecting: false,
      disconnect: async () => undefined,
      signTransaction: undefined as undefined | ((tx: unknown) => Promise<unknown>),
      signAllTransactions: undefined as undefined | ((txs: unknown[]) => Promise<unknown[]>),
    };
  }
  return {
    publicKey: w.address
      ? { toBase58: () => w.address!, toString: () => w.address! }
      : null,
    connected: w.connected,
    connecting: w.pending,
    disconnect: w.disconnect,
    signTransaction: async (_tx: unknown) => {
      throw new Error(
        'useWallet().signTransaction is a compat shim. Use useStellarWallet().signTransaction(xdr) instead.',
      );
    },
    signAllTransactions: undefined,
  };
}

/** Drop-in replacement for `useConnection()`. Returns a fake connection
 *  object whose only useful method is `rpcEndpoint` for cache-keying. */
export function useConnection() {
  return {
    connection: {
      rpcEndpoint: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
      getTokenAccountBalance: async () => ({ value: { amount: '0' } }),
    },
  };
}
