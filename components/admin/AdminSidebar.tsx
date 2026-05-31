'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Vault,
  Coins,
  FileText,
  Zap,
  Eye,
  Settings2,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Overview',      href: '/admin'               },
  { icon: FileText,        label: 'Loan Apps',     href: '/admin/loans'         },
  { icon: Vault,           label: 'Vaults',        href: '/admin/vaults'        },
  { icon: Coins,           label: 'Capital',       href: '/admin/capital'       },
  { icon: Zap,             label: 'Risk Engine',   href: '/admin/risk'          },
  { icon: Eye,             label: 'Observability', href: '/admin/observability'  },
  { icon: Settings2,       label: 'Protocol',      href: '/admin/protocol'      },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { address, disconnect } = useStellarWallet();

  async function handleDisconnect() {
    await disconnect();
    router.push('/dashboard');
  }

  const short = address ? `${address.slice(0, 6)}…${address.slice(-6)}` : null;

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col bg-[#0a0a0a] border-r border-white/[0.04]">

      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.04]">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06]">
          <Image src="/icon-dark-64x64.png" alt="PRISM" width={18} height={18} className="object-contain" />
        </div>
        <div>
          <span className="font-sans text-sm font-semibold text-white tracking-tight">PRISM</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#e54b73]/70 ml-1.5">Admin</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/20 px-3 pb-2">Operations</p>

        {NAV_ITEMS.map(({ icon: Icon, label, href }) => {
          const isActive = href === '/admin'
            ? pathname === '/admin'
            : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-sans transition-all duration-150 ${
                isActive
                  ? 'bg-white text-black font-medium'
                  : 'text-white/40 hover:bg-white/[0.04] hover:text-white/80'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={isActive ? 2 : 1.5} />
              <span className="text-sm">{label}</span>
            </Link>
          );
        })}

        <div className="pt-4">
          <p className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/20 px-3 pb-2">Support</p>
          <Link href="/admin/protocol" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-white/30 hover:bg-white/[0.04] hover:text-white/60 transition-all duration-150">
            <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className="text-sm">Help</span>
          </Link>
          <button
            onClick={() => void handleDisconnect()}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-white/30 hover:bg-white/[0.04] hover:text-white/60 transition-all duration-150"
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            <span className="text-sm">Disconnect</span>
          </button>
        </div>
      </nav>

      {/* Wallet address at bottom */}
      {short && (
        <div className="border-t border-white/[0.04] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-full bg-[#e54b73]/20 border border-[#e54b73]/30 flex items-center justify-center shrink-0">
              <span className="font-mono text-[7px] text-[#e54b73]/80 font-bold">AD</span>
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[8px] text-white/25 uppercase tracking-widest">Admin Wallet</p>
              <p className="font-mono text-[10px] text-white/50 truncate">{short}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
