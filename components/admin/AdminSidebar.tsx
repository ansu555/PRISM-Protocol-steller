'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Vault,
  Coins,
  FileText,
  Zap,
  Eye,
  Settings2,
} from 'lucide-react';

const DOMAINS = [
  { icon: LayoutDashboard, label: 'Overview',      href: '/admin'              },
  { icon: Vault,           label: 'Vaults',        href: '/admin/vaults'       },
  { icon: Coins,           label: 'Capital',       href: '/admin/capital'      },
  { icon: FileText,        label: 'Loans',         href: '/admin/loans'        },
  { icon: Zap,             label: 'Risk Engine',   href: '/admin/risk'         },
  { icon: Eye,             label: 'Observability', href: '/admin/observability' },
  { icon: Settings2,       label: 'Protocol',      href: '/admin/protocol'     },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside style={{ width: '220px', minWidth: '220px' }} className="flex h-full shrink-0 flex-col border-r border-white/[0.06] bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] shadow-sm">
          <Image src="/icon-dark-64x64.png" alt="PRISM" width={22} height={22} className="object-contain" />
        </div>
        <div>
          <div className="font-display text-lg tracking-tight text-white">PRISM</div>
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/20">Control Center</div>
        </div>
      </div>

      {/* Domain nav */}
      <nav className="flex-1 space-y-1 px-3 pt-2 pb-6">
        <div className="px-3 pb-2 pt-1">
          <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-white/15">Operations</span>
        </div>
        {DOMAINS.map(({ icon: Icon, label, href }) => {
          const isActive =
            href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-white/[0.06] text-white font-medium shadow-sm'
                  : 'text-white/30 hover:bg-white/[0.02] hover:text-white/60'
              }`}
            >
              <Icon
                className="h-4 w-4 shrink-0"
                strokeWidth={isActive ? 2 : 1.5}
              />
              <span>{label}</span>
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-white/40 shadow-[0_0_8px_rgba(255,255,255,0.3)]" />
              )}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
