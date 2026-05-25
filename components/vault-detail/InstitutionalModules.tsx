'use client';

import { Shield, ShieldCheck, Activity, Users, Layers, ArrowUpRight, BarChart, PieChart, Clock } from 'lucide-react';
import { formatUsdc } from '@/app/lib/format';

// ─── Risk & Protection Panel ──────────────────────────────────────────────────
export function RiskProtectionPanel() {
  const metrics = [
    { label: 'Protection Coverage', value: '114%', sub: 'Over-collateralized', icon: ShieldCheck, color: 'text-emerald-400' },
    { label: 'Junior Capital Buffer', value: '$1.4M', sub: 'First-loss capital', icon: Layers, color: 'text-amber-400' },
    { label: 'Stress Survival', value: '98.5%', sub: 'Simulated 50% drawdown', icon: Activity, color: 'text-blue-400' },
    { label: 'Borrower Diversification', value: 'High', sub: '124 unique entities', icon: Users, color: 'text-purple-400' },
  ];

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-4 w-4 text-white/40" />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">Risk & Protection Layer</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((m) => (
          <div key={m.label} className="p-6 rounded-xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
              <m.icon className={`h-4 w-4 ${m.color} opacity-40`} />
              <div className="h-1 w-8 rounded-full bg-white/[0.05]" />
            </div>
            <div className="font-mono text-[9px] uppercase tracking-widest text-white/20 mb-1">{m.label}</div>
            <div className="font-mono text-2xl font-bold text-white/90 leading-none">{m.value}</div>
            <div className="mt-3 font-mono text-[8px] uppercase tracking-widest text-white/10">{m.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Loan Book Exposure ───────────────────────────────────────────────────────
export function LoanBookExposure() {
  const sectors = [
    { name: 'SME Lending', weight: '42%', apy: '12.4%', color: 'bg-emerald-500' },
    { name: 'Trade Finance', weight: '28%', apy: '9.8%', color: 'bg-blue-500' },
    { name: 'Consumer Credit', weight: '18%', apy: '14.2%', color: 'bg-amber-500' },
    { name: 'Real Estate Debt', weight: '12%', apy: '8.5%', color: 'bg-purple-500' },
  ];

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <PieChart className="h-4 w-4 text-white/40" />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">Loan Book Exposure</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 p-8 rounded-xl border border-white/[0.08] bg-white/[0.03]">
          <div className="space-y-6">
            {sectors.map((s) => (
              <div key={s.name} className="space-y-2">
                <div className="flex justify-between items-end mb-1">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${s.color}`} />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-white/60">{s.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-[10px] text-white/40">{s.weight} Exposure</span>
                    <span className="mx-2 text-white/10">|</span>
                    <span className="font-mono text-[10px] text-emerald-400/60">{s.apy} Avg APR</span>
                  </div>
                </div>
                <div className="h-1.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                  <div className={`h-full ${s.color} opacity-40 transition-all duration-1000`} style={{ width: s.weight }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-4 p-8 rounded-xl border border-white/[0.08] bg-white/[0.03] flex flex-col justify-between">
           <div className="space-y-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Collateral Focus</div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                    <div className="font-mono text-lg text-white/80">1.4x</div>
                    <div className="font-mono text-[8px] uppercase text-white/20 mt-1">Avg Coverage</div>
                 </div>
                 <div className="p-4 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                    <div className="font-mono text-lg text-white/80">92%</div>
                    <div className="font-mono text-[8px] uppercase text-white/20 mt-1">Secured</div>
                 </div>
              </div>
           </div>
           <button className="w-full py-4 border border-white/10 font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 hover:bg-white/5 transition-colors rounded-lg">
              Explore Active Loan Book
           </button>
        </div>
      </div>
    </section>
  );
}

// ─── Vault Activity Feed ──────────────────────────────────────────────────────
export function VaultActivityFeed() {
  const activities = [
    { type: 'Deposit', amount: '$42,000', tranche: 'Prime', time: '2m ago', user: '0x4f...a2' },
    { type: 'Loan Repayment', amount: '$12,400', tranche: 'Portfolio', time: '14m ago', user: 'Issuer #12' },
    { type: 'Yield Dist', amount: '$1,204', tranche: 'Core', time: '22m ago', user: 'Protocol' },
    { type: 'Deposit', amount: '$8,500', tranche: 'Alpha', time: '45m ago', user: '0x9a...1c' },
    { type: 'Loan Funding', amount: '$150,000', tranche: 'Portfolio', time: '1h ago', user: 'Issuer #8' },
  ];

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <Clock className="h-4 w-4 text-white/40" />
        <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">Live Market Activity</h2>
      </div>
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
        <div className="divide-y divide-white/[0.04]">
          {activities.map((a, i) => (
            <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg bg-white/[0.04] border border-white/[0.08]`}>
                  <ArrowUpRight className="h-3.5 w-3.5 text-white/40" />
                </div>
                <div>
                  <div className="font-mono text-[11px] text-white/80">{a.type}</div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-white/20 mt-0.5">{a.user}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-[11px] text-white font-bold">{a.amount}</div>
                <div className="font-mono text-[9px] uppercase tracking-widest text-white/20 mt-0.5">{a.tranche} · {a.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
