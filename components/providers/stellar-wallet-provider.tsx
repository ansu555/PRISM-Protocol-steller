'use client';

// Stellar wallet provider — owns the StellarWalletsKit init + connect/sign flow.
//
// SDK note: in @creit.tech/stellar-wallets-kit v2.x the kit exposes all
// methods as STATIC class methods, not instance methods. We call
// `StellarWalletsKit.init(...)` once on mount, then `.authModal()`,
// `.signTransaction()` etc. directly on the class. No `new`, no `openModal`.
//
// This file is dynamic-imported from app-providers (ssr: false) because
// the kit calls into window.localStorage at construction. The context
// itself + hooks live in stellar-wallet-context.tsx so other components
// can use them during SSR without dragging the kit into the SSR bundle.

import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { FREIGHTER_ID, FreighterModule } from '@creit.tech/stellar-wallets-kit/modules/freighter';
import { Networks as KitNetworks } from '@creit.tech/stellar-wallets-kit/types';
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
  useAnchorWallet,
  useStellarWallet,
  useWallet,
  useWalletModal,
  useConnection,
} from './stellar-wallet-context';

export function StellarWalletProvider({ children }: { children: ReactNode }) {
  const [kitReady, setKitReady] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const network = NETWORK_PASSPHRASE.includes('Public') ? KitNetworks.PUBLIC : KitNetworks.TESTNET;
    StellarWalletsKit.init({
      network,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule()],
    });
    setKitReady(true);

    // Restore a previously connected wallet if browser remembered it.
    const remembered = window.localStorage.getItem('prism:walletId');
    const rememberedAddress = window.localStorage.getItem('prism:walletAddress');
    if (remembered && rememberedAddress) {
      try {
        StellarWalletsKit.setWallet(remembered);
        setAddress(rememberedAddress);
      } catch {
        // If the remembered wallet isn't recognised anymore, just drop it.
        window.localStorage.removeItem('prism:walletId');
        window.localStorage.removeItem('prism:walletAddress');
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (!kitReady) return;
    setPending(true);
    try {
      // v2 API: authModal opens the wallet picker and resolves with the
      // selected address. No onWalletSelected callback anymore.
      const { address: addr } = await StellarWalletsKit.authModal();
      setAddress(addr);
      // Persist which wallet module the user picked so we can restore on reload.
      const mod = StellarWalletsKit.selectedModule;
      const walletId = (mod as unknown as { id?: string } | undefined)?.id;
      if (walletId) {
        window.localStorage.setItem('prism:walletId', walletId);
      }
      window.localStorage.setItem('prism:walletAddress', addr);
    } catch (err) {
      // User-closed-modal is a normal flow, don't log scary errors for it.
      const msg = err instanceof Error ? err.message : String(err);
      if (!/closed|cancel/i.test(msg)) {
        console.error('Stellar wallet connect failed:', err);
      }
    } finally {
      setPending(false);
    }
  }, [kitReady]);

  const disconnect = useCallback(async () => {
    if (!kitReady) return;
    setPending(true);
    try {
      await StellarWalletsKit.disconnect().catch(() => undefined);
      setAddress(null);
      window.localStorage.removeItem('prism:walletId');
      window.localStorage.removeItem('prism:walletAddress');
    } finally {
      setPending(false);
    }
  }, [kitReady]);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!kitReady) throw new Error('Stellar wallet kit not yet ready');
      if (!address) throw new Error('No wallet connected');
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        address,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      return signedTxXdr;
    },
    [kitReady, address],
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
