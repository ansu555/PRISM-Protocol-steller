'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useWallet } from '@/components/providers/stellar-wallet-context';

import {
  LayoutDashboard,
  WalletCards,
  HandCoins,
  LogOut,
  ShieldCheck,
  Terminal,
  ChartCandlestick,
  BookOpenText,
  BriefcaseBusiness,
  Copy,
  ExternalLink,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { icon: LayoutDashboard,  label: 'Dashboard', href: '/dashboard' },
  { icon: BriefcaseBusiness, label: 'Positions', href: '/positions' },
  { icon: WalletCards,       label: 'Earn',      href: '/earn'      },
  { icon: ChartCandlestick,  label: 'Trade',     href: '/trade'     },
  { icon: Terminal,          label: 'Terminal',  href: '/terminal'  },
  { icon: HandCoins,         label: 'Borrow',    href: '/borrow'    },
];

const BOTTOM_ITEMS = [
  { icon: ShieldCheck,  label: 'Admin',   href: '/admin', external: false },
  { icon: BookOpenText, label: 'Docs',    href: 'https://docs.prismprotocol.dev', external: true },
  { icon: LogOut,       label: 'Log out', href: '/', external: false },
];

function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

// ─── Sidebar Wallet Button ────────────────────────────────────────────────────

function SidebarWalletButton({
  walletOpen,
  setWalletOpen,
}: {
  walletOpen: boolean;
  setWalletOpen: (v: boolean) => void;
}) {
  const { publicKey, wallet, connected, disconnect } = useWallet();
  const setVisible = (_v: boolean) => {}; // wallet modal not available in Stellar
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number }>({ left: 248, bottom: 0 });
  const portalTarget = typeof document === 'undefined' ? null : document.body;

  // Keep dropdown anchored to sidebar's right edge (sidebar is forced expanded while open)
  useEffect(() => {
    if (!walletOpen || !buttonRef.current) return;
    const update = () => {
      const rect = buttonRef.current!.getBoundingClientRect();
      setPos({
        left: Math.max(rect.right + 8, 248),
        bottom: window.innerHeight - rect.bottom,
      });
    };
    update();
    const frame = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, [walletOpen]);

  useEffect(() => {
    if (!walletOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return;
      setWalletOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [walletOpen, setWalletOpen]);

  const handleClick = () => {
    if (connected) setWalletOpen(!walletOpen);
    else setVisible(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        aria-expanded={walletOpen}
        aria-haspopup="menu"
        className="group/item flex w-full items-center gap-3 h-11 pl-4 pr-3"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-pink-500/40 bg-pink-500/[0.18] text-pink-200 shadow-[0_0_15px_rgba(236,72,153,0.18)] transition-colors group-hover/item:bg-pink-500/[0.28]">
          {connected && wallet?.adapter.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wallet.adapter.icon} alt="" className="h-[18px] w-[18px]" />
          ) : (
            <Wallet className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </div>
        <span className="whitespace-nowrap font-mono text-sm text-pink-200/90 transition-opacity duration-200 opacity-0 group-hover/sidebar:opacity-100">
          {connected && publicKey ? shortAddress(publicKey.toBase58()) : 'Connect Wallet'}
        </span>
      </button>

      {portalTarget && walletOpen && connected && publicKey && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          style={{ left: pos.left, bottom: pos.bottom }}
          className="fixed z-[80] w-56 overflow-hidden rounded-md border border-white/10 bg-black/95 shadow-2xl backdrop-blur"
        >
          <div className="border-b border-white/10 px-3 py-2 text-[11px] text-white/50">
            Connected via {wallet?.adapter.name ?? 'wallet'}
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(publicKey.toBase58());
              setWalletOpen(false);
            }}
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy address
          </button>
          <a
            href={`https://explorer.solana.com/address/${publicKey.toBase58()}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setWalletOpen(false)}
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View on Explorer
          </a>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setWalletOpen(false);
            }}
            role="menuitem"
            className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2.5 text-left text-sm text-pink-300 transition-colors hover:bg-pink-500/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        </div>,
        portalTarget,
      )}
    </>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const [walletOpen, setWalletOpen] = useState(false);

  // While wallet menu is open, keep sidebar expanded.
  // When it closes, sidebar reverts to hover-driven width.
  return (
    <aside
      className={cn(
        'group/sidebar fixed left-0 top-0 z-50 flex h-full flex-col overflow-hidden border-r border-white/[0.05] py-5 transition-all duration-300 ease-out backdrop-blur-xl',
        walletOpen
          ? 'w-[240px] bg-black/85 shadow-[20px_0_50px_rgba(0,0,0,0.5)]'
          : 'w-[72px] hover:w-[240px] bg-black/20 hover:bg-black/85 hover:shadow-[20px_0_50px_rgba(0,0,0,0.5)]',
      )}
    >
      {/* Logo + Title */}
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 pl-[14px] pr-3">
        <span className="relative h-11 w-11 shrink-0">
          <Image
            src="/icon-dark-64x64.png"
            alt="PRISM"
            fill
            className="object-contain"
          />
        </span>
        <div
          className={cn(
            'flex items-baseline gap-2 whitespace-nowrap transition-opacity duration-200',
            walletOpen ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100',
          )}
        >
          <span className="font-display text-xl leading-none tracking-tight text-white">PRISM</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/50">Protocol</span>
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group/item relative flex items-center gap-3 h-11 pl-4 pr-3 transition-colors",
                isActive ? "bg-white/[0.04]" : "hover:bg-white/[0.02]"
              )}
            >
              {/* Active indicator bar */}
              {isActive && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
              )}

              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-200',
                  isActive
                    ? 'bg-white text-black shadow-[0_0_15px_rgba(255,255,255,0.2)]'
                    : 'text-white/40 group-hover/item:text-white/90',
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 1.75} />
              </div>
              <span
                className={cn(
                  'whitespace-nowrap font-mono text-[13px] tracking-tight transition-opacity duration-200',
                  walletOpen ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100',
                  isActive ? 'text-white font-medium' : 'text-white/50 group-hover/item:text-white/80',
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="flex flex-col gap-1 border-t border-white/[0.05] pt-4">
        <SidebarWalletButton walletOpen={walletOpen} setWalletOpen={setWalletOpen} />

        {BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon;
          const content = (
            <>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors group-hover/item:text-white/90">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <span
                className={cn(
                  'whitespace-nowrap font-mono text-[13px] tracking-tight transition-opacity duration-200',
                  walletOpen ? 'opacity-100' : 'opacity-0 group-hover/sidebar:opacity-100',
                  'text-white/50 group-hover/item:text-white/80',
                )}
              >
                {item.label}
              </span>
            </>
          );
          const className = "group/item flex items-center gap-3 h-11 pl-4 pr-3 hover:bg-white/[0.02] transition-colors";

          return item.external ? (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className={className}
            >
              {content}
            </a>
          ) : (
            <Link key={item.href} href={item.href} className={className}>
              {content}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
