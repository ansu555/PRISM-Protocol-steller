'use client';

// Stellar wallet provider - owns the Freighter connect/sign flow.
//
// This file is dynamic-imported from app-providers (ssr: false) because the
// browser extension API is only available after hydration. The context itself
// lives in stellar-wallet-context.tsx so other components remain SSR-safe.

import {
  getAddress,
  isConnected,
  requestAccess,
  signTransaction as signFreighterTransaction,
} from '@stellar/freighter-api';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { NETWORK_PASSPHRASE } from '@/app/lib/constants';
import {
  StellarWalletCtx,
  useStellarWallet,
  type StellarWalletContext,
} from './stellar-wallet-context';

export {
  useStellarWallet,
  useWallet,
  useWalletModal,
  useConnection,
} from './stellar-wallet-context';

export function StellarWalletProvider({ children }: { children: ReactNode }) {
  const [apiReady, setApiReady] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const connection = await isConnected();
        if (!connection.error && connection.isConnected) {
          const result = await getAddress();
          if (!result.error && result.address && !cancelled) {
            setAddress(result.address);
          }
        }
      } finally {
        if (!cancelled) setApiReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    if (!apiReady) return;
    setPending(true);
    try {
      const result = await requestAccess();
      if (result.error) throw new Error(result.error.message);
      if (!result.address) throw new Error('Freighter did not return an address');
      setAddress(result.address);
    } catch (err) {
      // User-closed-modal is a normal flow, don't log scary errors for it.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/closed|cancel/i.test(msg)) {
        console.error('Stellar wallet connect failed:', err);
      }
    } finally {
      setPending(false);
    }
  }, [apiReady]);

  const disconnect = useCallback(async () => {
    setPending(true);
    try {
      setAddress(null);
    } finally {
      setPending(false);
    }
  }, []);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!apiReady) throw new Error('Freighter API not yet ready');
      if (!address) throw new Error('No wallet connected');
      const result = await signFreighterTransaction(xdr, {
        address,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      if (result.error) throw new Error(result.error.message);
      return result.signedTxXdr;
    },
    [apiReady, address],
  );

  const value = useMemo<StellarWalletContext>(
    () => ({
      address,
      connected: address !== null,
      pending,
      connect,
      disconnect,
      signTransaction,
    }),
    [address, pending, connect, disconnect, signTransaction],
  );

  return <StellarWalletCtx.Provider value={value}>{children}</StellarWalletCtx.Provider>;
}

export function WalletMultiButton() {
  const wallet = useStellarWallet();
  if (wallet.connected) {
    return (
      <button
        type="button"
        onClick={() => void wallet.disconnect()}
        className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/70 transition hover:bg-white/[0.08]"
      >
        {wallet.address?.slice(0, 4)}...{wallet.address?.slice(-4)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void wallet.connect()}
      disabled={wallet.pending}
      className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-emerald-200 transition hover:bg-emerald-400/[0.14] disabled:opacity-50"
    >
      {wallet.pending ? 'Connecting...' : 'Connect Stellar'}
    </button>
  );
}
