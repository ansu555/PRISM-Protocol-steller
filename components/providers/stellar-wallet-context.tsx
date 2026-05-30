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

// Compatibility helpers for components that still expect the old wallet hook shape.

/** Stellar wallet hook (also serves as compatibility shim for legacy imports). */
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

export function useAnchorWallet() {
  const w = useContext(StellarWalletCtx);
  if (!w?.address) return null;
  return {
    publicKey: { toBase58: () => w.address!, toString: () => w.address! },
    signTransaction: async () => {
      throw new Error('Use useStellarWallet().signTransaction(xdr) for Stellar transactions.');
    },
    signAllTransactions: async () => {
      throw new Error('Batch transaction signing is not wired for the Stellar build.');
    },
  };
}

export function useWalletModal() {
  const w = useStellarWallet();
  return {
    visible: false,
    setVisible: (visible: boolean) => {
      if (visible) void w.connect();
    },
  };
}

/** Returns the active Soroban RPC endpoint for cache-keying and display. */
export function useConnection() {
  return {
    connection: {
      rpcEndpoint: process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
      getTokenAccountBalance: async () => ({ value: { amount: '0' } }),
    },
  };
}
