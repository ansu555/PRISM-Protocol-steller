'use client';

// Drop-in shim for legacy wallet-adapter-react-ui imports.
// Aliased in next.config.mjs.

import { useStellarWallet } from '@/components/providers/stellar-wallet-context';

/** `useWalletModal()` had a single useful method: setVisible(true). On Stellar
 *  this maps to the Wallets Kit modal, which is opened via connect(). */
export function useWalletModal() {
  const { connect } = useStellarWallet();
  return {
    visible: false,
    setVisible: (open: boolean) => {
      if (open) void connect();
    },
  };
}

/**
 * The old WalletMultiButton rendered a fancy "Connect / disconnect" button.
 * Stellar build re-uses our existing ConnectWalletButton instead — we just
 * proxy through to it so legacy <WalletMultiButton /> mounts still work.
 *
 * Imported via lazy require to avoid circular module-graph issues.
 */
import { ConnectWalletButton } from '@/components/app-shell/connect-wallet-button';
export function WalletMultiButton() {
  return <ConnectWalletButton />;
}
