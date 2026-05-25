'use client';

// Stellar wallet provider — owns the actual StellarWalletsKit instance.
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
  type StellarWalletContext,
} from './stellar-wallet-context';

export {
  useStellarWallet,
  useWallet,
  useConnection,
} from './stellar-wallet-context';

export function StellarWalletProvider({ children }: { children: ReactNode }) {
  const [kit, setKit] = useState<StellarWalletsKit | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const network = NETWORK_PASSPHRASE.includes('Public') ? KitNetworks.PUBLIC : KitNetworks.TESTNET;
    const instance = new StellarWalletsKit({
      network,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule()],
    });
    setKit(instance);

    const remembered = window.localStorage.getItem('prism:walletId');
    const rememberedAddress = window.localStorage.getItem('prism:walletAddress');
    if (remembered && rememberedAddress) {
      instance.setWallet(remembered);
      setAddress(rememberedAddress);
    }
  }, []);

  const connect = useCallback(async () => {
    if (!kit) return;
    setPending(true);
    try {
      await kit.openModal({
        onWalletSelected: async (selected) => {
          kit.setWallet(selected.id);
          const { address: addr } = await kit.getAddress();
          setAddress(addr);
          window.localStorage.setItem('prism:walletId', selected.id);
          window.localStorage.setItem('prism:walletAddress', addr);
        },
      });
    } finally {
      setPending(false);
    }
  }, [kit]);

  const disconnect = useCallback(async () => {
    if (!kit) return;
    setPending(true);
    try {
      await kit.disconnect().catch(() => undefined);
      setAddress(null);
      window.localStorage.removeItem('prism:walletId');
      window.localStorage.removeItem('prism:walletAddress');
    } finally {
      setPending(false);
    }
  }, [kit]);

  const signTransaction = useCallback(
    async (xdr: string): Promise<string> => {
      if (!kit) throw new Error('Stellar wallet kit not yet ready');
      if (!address) throw new Error('No wallet connected');
      const { signedTxXdr } = await kit.signTransaction(xdr, {
        address,
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      return signedTxXdr;
    },
    [kit, address],
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
