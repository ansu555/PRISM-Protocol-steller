"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';

import { useIdentity } from '@/hooks/useIdentity';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { address: walletAddress, connected, connect } = useStellarWallet();
  const { address: adminAddress } = useIdentity();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'authorized' | 'unauthorized'>('loading');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (connected && walletAddress) {
        if (walletAddress === adminAddress) {
          setStatus('authorized');
        } else {
          setStatus('unauthorized');
        }
      } else {
        setStatus('unauthorized');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [connected, walletAddress, adminAddress]);

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/20">
          Verifying Authority
        </div>
      </div>
    );
  }

  if (status === 'unauthorized') {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-black gap-6 px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/[0.05] shadow-[0_0_50px_rgba(244,63,94,0.1)]">
          <ShieldAlert className="h-8 w-8 text-rose-500" strokeWidth={1.5} />
        </div>
        <div className="text-center space-y-2">
          <h1 className="font-display text-2xl text-white">
            {connected ? 'Access Restricted' : 'Admin Terminal Locked'}
          </h1>
          <p className="max-w-xs text-sm text-white/40 leading-relaxed">
            {connected
              ? 'This terminal is reserved for Protocol Administrators. Please connect the deployer wallet to proceed.'
              : 'Please connect your administrative wallet to access the Mission Control terminal.'}
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-[240px]">
          {!connected ? (
            <button
              onClick={() => {
                void connect();
              }}
              className="w-full rounded-xl bg-white px-6 py-3 font-mono text-[11px] font-bold uppercase tracking-widest text-black transition-all hover:bg-white/90"
            >
              Connect Admin Wallet
            </button>
          ) : (
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-6 py-3 font-mono text-[11px] uppercase tracking-widest text-white/60 transition-all hover:bg-white/10 hover:text-white"
            >
              Return to Terminal
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
