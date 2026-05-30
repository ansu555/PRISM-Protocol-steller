'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import {
  ChevronDown,
  Copy,
  ExternalLink,
  LogOut,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Positions', href: '/positions' },
  { label: 'Earn',      href: '/earn'      },
  { label: 'Trade',     href: '/trade'     },
  { label: 'Terminal',  href: '/terminal'  },
  { label: 'Borrow',   href: '/borrow'    },
];

function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function AppNavbar() {
  const pathname = usePathname();
  const wallet = useStellarWallet();
  const { connected, address, connect, disconnect } = wallet;

  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const [networkMenuOpen, setNetworkMenuOpen] = useState(false);
  const [currentNetwork, setCurrentNetwork] = useState<'testnet' | 'mainnet'>('testnet');
  const networkDropdownRef = useRef<HTMLDivElement>(null);
  const networkButtonRef = useRef<HTMLDivElement>(null);

  // Close wallet dropdown on click outside
  useEffect(() => {
    if (!walletMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setWalletMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [walletMenuOpen]);

  // Close network dropdown on click outside
  useEffect(() => {
    if (!networkMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        networkButtonRef.current?.contains(target) ||
        networkDropdownRef.current?.contains(target)
      ) return;
      setNetworkMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [networkMenuOpen]);

  const handleWalletClick = () => {
    if (connected && address) setWalletMenuOpen(!walletMenuOpen);
    else void connect();
  };

  return (
    <header className="relative flex-shrink-0 border-b border-white/[0.015] bg-black w-full z-40 transition-all duration-300">
      <div className="w-full max-w-[1800px] mx-auto px-8 md:px-10 h-18 flex items-center justify-between">
        {/* Left: Logo & Brand */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-3 transition-opacity hover:opacity-90">
            <span className="relative h-8 w-8 shrink-0">
              <Image
                src="/icon-dark-64x64.png"
                alt="PRISM"
                fill
                className="object-contain"
              />
            </span>
            <div className="flex items-baseline gap-1.5 whitespace-nowrap">
              <span className="font-sans text-base font-semibold tracking-tight text-white">PRISM</span>
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#e54b73]/80 font-bold">Protocol</span>
            </div>
          </Link>

          {/* Middle-Left: Nav Tabs */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-full border border-white/[0.015] bg-white/[0.02]">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative inline-block px-4 py-1.5 rounded-full font-mono text-[11px] font-bold uppercase tracking-wider transition-all duration-200 text-center select-none',
                    isActive
                      ? 'text-white'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  )}
                >
                  {isActive && (
                    <span
                      className="absolute inset-0 bg-[#e54b73] rounded-full -z-10"
                      style={{
                        transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: Controls & Wallet Connect */}
        <div className="flex items-center gap-4">
          {/* Wallet Button */}
          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              onClick={handleWalletClick}
              className={cn(
                'flex h-9 items-center justify-center gap-2 px-5 rounded-full transition-all duration-200 font-mono text-[11px] font-bold uppercase tracking-widest',
                connected && address
                  ? 'border border-white/[0.04] bg-white/[0.01] text-white/80 hover:bg-white/[0.03] hover:text-white'
                  : 'bg-[#e54b73] text-white hover:bg-[#de3860] hover:scale-[1.01] active:scale-[0.99]'
              )}
            >
              <Wallet className="h-[14px] w-[14px] shrink-0" />
              <span>
                {connected && address ? shortAddress(address) : 'Connect Wallet'}
              </span>
              {connected && <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />}
            </button>

            {/* Wallet Dropdown Menu */}
            {walletMenuOpen && connected && address && (
              <div
                ref={dropdownRef}
                className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-white/[0.04] bg-[#0c0c0e]/98 shadow-2xl backdrop-blur-xl z-50"
              >
                <div className="border-b border-white/[0.03] px-4 py-2.5 text-[9px] font-mono text-white/30 uppercase tracking-wider">
                  Connected · Stellar
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(address);
                    setWalletMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left font-mono text-xs text-white/60 transition-colors hover:bg-white/[0.02] hover:text-white"
                >
                  <Copy className="h-3.5 w-3.5 text-white/30" />
                  Copy address
                </button>
                <a
                  href={`https://stellar.expert/explorer/testnet/account/${address}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setWalletMenuOpen(false)}
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-left font-mono text-xs text-white/60 transition-colors hover:bg-white/[0.02] hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-white/30" />
                  View Explorer
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void disconnect();
                    setWalletMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-white/[0.03] px-4 py-3 text-left font-mono text-xs text-[#e54b73] transition-colors hover:bg-[#e54b73]/[0.04]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>
            )}
          </div>

          {/* Network Selector */}
          <div className="relative">
            <div
              ref={networkButtonRef}
              onClick={() => setNetworkMenuOpen(!networkMenuOpen)}
              className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/[0.03] bg-white/[0.005] hover:bg-white/[0.02] transition-colors cursor-pointer group select-none"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.3)] animate-pulse" />
              <span className="font-mono text-[11px] text-white/40 group-hover:text-white/70 uppercase tracking-widest font-semibold transition-colors">
                {currentNetwork === 'testnet' ? 'Testnet' : 'Mainnet'}
              </span>
              <ChevronDown className="h-3 w-3 text-white/20 group-hover:text-white/40 transition-colors" />
            </div>

            {networkMenuOpen && (
              <div
                ref={networkDropdownRef}
                className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-white/[0.04] bg-[#0c0c0e]/98 shadow-2xl backdrop-blur-xl z-50"
              >
                <div className="border-b border-white/[0.03] px-4 py-2.5 text-[9px] font-mono text-white/30 uppercase tracking-wider">
                  Select Network
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentNetwork('testnet');
                    setNetworkMenuOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between px-4 py-3 text-left font-mono text-xs transition-colors hover:bg-white/[0.02]',
                    currentNetwork === 'testnet' ? 'text-white font-bold' : 'text-white/60'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Testnet
                  </div>
                  {currentNetwork === 'testnet' && (
                    <span className="text-[10px] text-emerald-400 font-mono">ACTIVE</span>
                  )}
                </button>

                <div
                  className="flex w-full items-center justify-between px-4 py-3 text-left font-mono text-xs text-white/20 cursor-not-allowed select-none border-t border-white/[0.03]"
                >
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
                    Mainnet
                  </div>
                  <span className="text-[9px] bg-white/[0.03] text-white/30 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider font-mono">
                    Soon
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
