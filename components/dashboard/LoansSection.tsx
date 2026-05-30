'use client';

import {
  ShieldAlert,
  History,
  Info,
  Zap,
} from 'lucide-react';
import { formatUsdc } from '@/app/lib/format';
import Link from 'next/link';

interface Loan {
  id: string;
  collateral: string;
  borrowed: bigint;
  apr: number;
  healthFactor: number;
  status: string;
}

interface LoansSectionProps {
  loans: Loan[];
  borrowingCapacity: bigint;
}

export function LoansSection({ loans = [], borrowingCapacity = 0n }: LoansSectionProps) {
  function getHealthColor(hf: number) {
    if (hf >= 2.0) return { text: 'text-emerald-500', bg: 'bg-emerald-500/[0.04]', border: 'border-emerald-500/10', label: 'Safe' };
    if (hf >= 1.2) return { text: 'text-amber-500',   bg: 'bg-amber-500/[0.04]',   border: 'border-amber-500/10',   label: 'Warning' };
    return           { text: 'text-red-500',     bg: 'bg-red-500/[0.04]',     border: 'border-red-500/10',     label: 'Danger' };
  }

  const hasLoans = loans?.length > 0;

  return (
    <section className="rounded-2xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden shadow-sm transition-all duration-200">
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 pt-6 pb-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-wider text-white/35 font-semibold">My Loans &amp; Credit</span>
          {hasLoans && (
            <span className="px-2 py-0.5 rounded-full border border-white/[0.04] bg-white/[0.01] font-mono text-[9px] text-white/40">
              {loans.length} Active
            </span>
          )}
        </div>
        <button className="font-mono text-[9px] uppercase tracking-widest text-white/20 hover:text-white/40 transition-colors flex items-center gap-1 font-semibold">
          <History className="h-3 w-3" /> History
        </button>
      </div>

      {/* ── Content ── */}
      {!hasLoans ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-8 pb-6">
          {/* Card 1: Borrowing Capacity */}
          <div className="bg-[#131316] border border-white/[0.04] p-5 rounded-xl flex flex-col justify-between transition-all duration-200 hover:border-white/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 font-semibold">Borrowing Capacity</div>
                <div className="flex items-center gap-1.5 text-emerald-400/80 font-mono text-[9px] uppercase tracking-wider font-semibold bg-emerald-400/[0.05] px-2 py-0.5 rounded border border-emerald-400/10">
                  <Zap className="h-3 w-3" /> Available Now
                </div>
              </div>
              <div className="font-mono text-2xl text-white font-medium mb-4">${formatUsdc(borrowingCapacity, 0)}</div>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/[0.02] border border-white/[0.02] rounded p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-white/30 mb-1">Available Credit</div>
                  <div className="font-mono text-xs text-white/90">${formatUsdc(borrowingCapacity, 0)}</div>
                </div>
                <div className="bg-white/[0.02] border border-white/[0.02] rounded p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-white/30 mb-1">Utilization</div>
                  <div className="font-mono text-xs text-white/90">0.00%</div>
                  <div className="w-full h-0.5 bg-white/[0.05] mt-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400/50 w-[0%]" />
                  </div>
                </div>
                <div className="bg-white/[0.02] border border-white/[0.02] rounded p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-white/30 mb-1">Collateral Ratio</div>
                  <div className="font-mono text-xs text-white/90">N/A</div>
                </div>
                <div className="bg-white/[0.02] border border-white/[0.02] rounded p-2.5">
                  <div className="font-mono text-[8px] uppercase tracking-wider text-white/30 mb-1">Interest Rate</div>
                  <div className="font-mono text-xs text-white/90">4.25% <span className="text-white/30 text-[9px]">APY</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Health Metrics */}
          <div className="bg-[#131316] border border-white/[0.04] p-5 rounded-xl flex flex-col justify-between transition-all duration-200 hover:border-white/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 font-semibold">Account Health</div>
                <div className="flex items-center gap-1.5 text-white/30 font-mono text-[9px] uppercase tracking-wider">
                  <ShieldAlert className="h-3 w-3" /> Risk Profile
                </div>
              </div>
              <div className="font-mono text-2xl text-white/50 font-medium mb-4">—</div>
              
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.02] rounded px-3 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-white/30">Health Factor</span>
                  <span className="font-mono text-xs text-white/50">∞</span>
                </div>
                <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.02] rounded px-3 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-white/30">Risk Level</span>
                  <span className="font-mono text-xs text-white/50">None</span>
                </div>
                <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.02] rounded px-3 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-white/30">Collateral Health</span>
                  <span className="font-mono text-xs text-emerald-400/80">Optimal</span>
                </div>
                <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.02] rounded px-3 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-white/30">Liq. Distance</span>
                  <span className="font-mono text-xs text-white/50">Safe</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Quick Actions */}
          <div className="bg-[#131316] border border-white/[0.04] p-5 rounded-xl flex flex-col transition-all duration-200 hover:border-white/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.2)]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-white/40 font-semibold mb-4">Operations</div>
            
            <p className="font-sans text-xs text-white/40 leading-relaxed mb-6 flex-1">
              No active credit lines. Deposit eligible collateral to access institutional liquidity.
            </p>

            <div className="grid grid-cols-2 gap-2 mt-auto">
              <Link href="/borrow" className="flex items-center justify-center py-2.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.05] text-white font-sans text-[11px] font-medium transition-all rounded-lg">
                Open Credit Line
              </Link>
              <button className="flex items-center justify-center py-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.02] hover:border-white/[0.05] text-white/70 font-sans text-[11px] font-medium transition-all rounded-lg">
                Deposit Collateral
              </button>
              <button className="flex items-center justify-center py-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.02] hover:border-white/[0.05] text-white/70 font-sans text-[11px] font-medium transition-all rounded-lg">
                Adjust Exposure
              </button>
              <button className="flex items-center justify-center py-2.5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.02] hover:border-white/[0.05] text-white/70 font-sans text-[11px] font-medium transition-all rounded-lg">
                View Terms
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-8 pb-5 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.03]">
                {['Collateral', 'Principal', 'APR', 'Health Factor', 'Actions'].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-mono text-[9px] uppercase tracking-wider text-white/20 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.02]">
              {loans.map((loan) => {
                const health = getHealthColor(loan.healthFactor);
                return (
                  <tr key={loan.id} className="hover:bg-white/[0.005] transition-all duration-200">
                    <td className="px-3 py-3.5">
                      <div className="font-mono text-xs text-white/70 font-medium">{loan.collateral}</div>
                      <div className="mt-0.5 font-mono text-[8px] text-white/20 uppercase">Locked IKA</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-mono text-xs text-white/70 font-medium">${formatUsdc(loan.borrowed, 2)}</div>
                      <div className="mt-0.5 font-mono text-[8px] text-white/20 uppercase">USDC</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="font-mono text-xs text-white/70 font-medium">{loan.apr.toFixed(2)}%</div>
                      <div className="mt-0.5 font-mono text-[8px] text-white/20 uppercase">Fixed rate</div>
                    </td>
                    <td className="px-3 py-3.5">
                      <div className={`flex items-center gap-1.5 ${health.text}`}>
                        <div className={`h-1.5 w-1.5 rounded-full ${health.text.replace('text', 'bg')}`} />
                        <span className="font-mono text-xs font-semibold">{loan.healthFactor.toFixed(2)}</span>
                        <span className={`px-1.5 py-0.5 rounded border text-[8px] font-bold uppercase ${health.bg} ${health.border}`}>
                          {health.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Link href="/borrow" className="px-3 py-1.5 rounded-lg bg-white/[0.01] border border-white/[0.03] font-mono text-[9px] font-semibold text-white/50 hover:bg-white/[0.03] hover:text-white transition-all">
                          Repay
                        </Link>
                        <Link href="/borrow" className="px-3 py-1.5 rounded-lg bg-white/[0.01] border border-white/[0.03] font-mono text-[9px] font-semibold text-white/50 hover:bg-white/[0.03] hover:text-white transition-all">
                          Manage
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Status Banner ── */}
      {hasLoans && (
        <div className="bg-white/[0.002] px-8 py-3.5 border-t border-white/[0.03] flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-[#e54b73]/60" />
          <span className="font-mono text-[8px] uppercase tracking-wider text-white/25 font-medium">
            Weighted liquidation threshold: 85.0% · Monitored via PRISM Risk Engine
          </span>
        </div>
      )}
    </section>
  );
}
