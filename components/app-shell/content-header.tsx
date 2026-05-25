'use client';

import { Search, Bell } from 'lucide-react';
import { ConnectWalletButton } from './connect-wallet-button';
import { TestnetFaucetButton } from './testnet-faucet-button';

export function ContentHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-white/[0.05] bg-transparent px-8">
      <div />

      <div className="flex items-center gap-4">
        <ConnectWalletButton />
      </div>
    </header>
  );
}
