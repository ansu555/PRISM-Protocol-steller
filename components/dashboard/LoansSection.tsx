'use client';

import {
  ShieldAlert,
  History,
  AlertCircle,
  Zap,
  Info,
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
    if (hf >= 2.0) return { text: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', label: 'Safe' };
    if (hf >= 1.2) return { text: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/20',   label: 'Warning' };
    return           { text: 'text-red-400',     bg: 'bg-red-400/10',     border: 'border-red-400/20',     label: 'Danger' };
  }

  const hasLoans = loans?.length > 0;

  return (
    <section className="rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04] overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-6 py-5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-white/35">My Loans &amp; Credit</span>
          {hasLoans && (
            <span className="px-2 py-0.5 rounded-full border border-white/10 bg-white/5 font-mono text-xs text-white/45">
              {loans.length} Active
            </span>
          )}
        </div>
        <button className="font-mono text-xs uppercase tracking-widest text-white/25 hover:text-white/50 transition-colors flex items-center gap-1.5">
          <History className="h-3 w-3" /> History
        </button>
      </div>

      {!hasLoans ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/[0.04]">
          <div className="bg-white/[0.02] p-7 flex flex-col justify-between h-52">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-white/25 mb-3">Borrowing Capacity</div>
              <div className="font-mono text-4xl text-white/90 font-medium">${formatUsdc(borrowingCapacity, 0)}</div>
            </div>
            <div className="flex items-center gap-2 text-emerald-400/70 font-mono text-xs uppercase tracking-wider">
              <Zap className="h-3.5 w-3.5" /> Available Now
            </div>
          </div>

          <div className="bg-white/[0.02] p-7 flex flex-col justify-between h-52 border-l border-white/[0.04]">
            <div>
              <div className="font-mono text-xs uppercase tracking-widest text-white/25 mb-3">Estimated Health</div>
              <div className="font-mono text-4xl text-white/40 font-medium">Optimal</div>
            </div>
            <div className="flex items-center gap-2 text-white/25 font-mono text-xs uppercase tracking-wider">
              <Info className="h-3.5 w-3.5" /> Based on collateral
            </div>
          </div>

          <div className="bg-white/[0.02] p-7 flex flex-col justify-center h-52 border-l border-white/[0.04]">
            <p className="font-mono text-sm text-white/40 leading-relaxed mb-6">
              No active borrowing exposure.<br />
              Lock IKA collateral to access your line of credit.
            </p>
            <Link href="/borrow" className="w-full py-3.5 bg-white text-black font-mono text-xs font-bold uppercase tracking-[0.2em] hover:bg-white/90 transition-colors rounded text-center">
              Open Credit Line
            </Link>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/[0.04]">
                {['Collateral', 'Principal', 'APR', 'Health Factor', 'Actions'].map((h) => (
                  <th key={h} className="px-6 py-4 text-left font-mono text-xs uppercase tracking-wider text-white/25 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {loans.map((loan) => {
                const health = getHealthColor(loan.healthFactor);
                return (
                  <tr key={loan.id} className="group hover:bg-white/[0.015] transition-colors">
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm text-white/80">{loan.collateral}</div>
                      <div className="mt-0.5 font-mono text-xs text-white/25 uppercase">Locked IKA</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm text-white/80">${formatUsdc(loan.borrowed, 2)}</div>
                      <div className="mt-0.5 font-mono text-xs text-white/25 uppercase">USDC</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-mono text-sm text-white/80">{loan.apr.toFixed(2)}%</div>
                      <div className="mt-0.5 font-mono text-xs text-white/25 uppercase">Fixed rate</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className={`flex items-center gap-2 ${health.text}`}>
                        <div className={`h-2 w-2 rounded-full ${health.text.replace('text', 'bg')}`} />
                        <span className="font-mono text-sm font-medium">{loan.healthFactor.toFixed(2)}</span>
                        <span className={`px-2 py-0.5 rounded-full border text-xs uppercase tracking-tighter ${health.bg} ${health.border}`}>
                          {health.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Link href="/borrow" className="px-4 py-2 rounded bg-white/5 border border-white/10 font-mono text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors">
                          Repay
                        </Link>
                        <Link href="/borrow" className="px-4 py-2 rounded bg-white/5 border border-white/10 font-mono text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors">
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

      {hasLoans && (
        <div className="bg-white/[0.02] px-6 py-4 border-t border-white/[0.04] flex items-center gap-3">
          <ShieldAlert className="h-4 w-4 text-white/25" />
          <span className="font-mono text-xs uppercase tracking-wider text-white/35">
            Current weighted liquidation threshold: 85.0% · Monitoring 24/7 via PRISM Risk Engine
          </span>
        </div>
      )}
    </section>
  );
}
