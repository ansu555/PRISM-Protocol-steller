'use client';

import { useMemo } from 'react';
import {
  Activity,
  BarChart,
  Cpu,
  Database,
  ExternalLink,
  History,
  Info,
  Layers3,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import { useEvents } from '@/hooks/useEvents';
import { shortKey } from '@/app/lib/format';
import { PRISM_CORE_PROGRAM_ID } from '@/app/lib/constants';

// ─── Components ───────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 80% at 100% 0%, rgba(168,85,247,0.12) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 0% 100%, rgba(56,189,248,0.08) 0%, transparent 50%)',
        }}
      />

      <div className="relative flex flex-col gap-6 px-10 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-white/30">
              On-Chain Intelligence
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-purple-500/25 bg-purple-500/[0.08] px-2.5 py-1">
              <span className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-purple-400/80">Dune SIM Sync</span>
            </span>
          </div>
          <h1 className="font-display text-5xl leading-none text-white tracking-tight">
            Protocol Analytics
          </h1>
          <p className="mt-3 font-mono text-sm text-white/30">
            Real-time SVM execution monitoring via indexed contract logs
          </p>
        </div>

        <div className="flex items-center gap-4">
           <div className="flex flex-col items-end gap-1 px-5 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
             <span className="font-mono text-[10px] uppercase tracking-widest text-white/20">Program ID</span>
             <span className="font-mono text-sm text-white/60">{shortKey(PRISM_CORE_PROGRAM_ID)}</span>
           </div>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color = 'blue' }: any) {
  const colors: any = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  };

  return (
    <div className="p-6 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05] transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={cx('p-2 rounded-lg bg-white/[0.04]', colors[color])}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="font-mono text-[10px] text-white/10 uppercase tracking-widest">Live</span>
      </div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-white/30 mb-1">{label}</div>
      <div className="font-mono text-3xl font-medium text-white/80 tabular-nums">{value}</div>
      {sub && <div className="mt-2 font-mono text-[10px] text-white/20 uppercase tracking-tighter">{sub}</div>}
    </div>
  );
}

function cx(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProtocolAnalytics() {
  const { data: eventsResult, isLoading, error } = useEvents();
  const events = eventsResult?.events ?? [];

  const stats = useMemo(() => {
    if (!events.length) return null;
    const successCount = events.filter(e => e.success).length;
    const rate = (successCount / events.length) * 100;
    
    const types: Record<string, number> = {};
    events.forEach(e => {
      types[e.eventType] = (types[e.eventType] || 0) + 1;
    });
    
    const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];

    return {
      total: events.length,
      successRate: rate.toFixed(1) + '%',
      topInstruction: topType ? topType[0] : 'N/A',
      activeSigners: new Set(events.map(e => e.signer)).size,
      types
    };
  }, [events]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-10 px-10 pb-20 pt-4">
      <PageHeader />

      <div className="flex items-center gap-4 p-5 rounded-xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
          <Zap className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-blue-400/80 mb-0.5">Environment: Real-time SVM Sync</div>
          <p className="text-sm text-white/50 leading-relaxed">
            Successfully synchronized with the PRISM core program on <b>Stellar Testnet</b>.
            Instruction logs are now being pulled directly from the chain and indexed for institutional visibility.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Ready for Mainnet</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          icon={Activity} 
          label="Total Transactions" 
          value={isLoading ? '...' : stats?.total ?? 0} 
          sub="Last 50 indexed events"
          color="blue"
        />
        <MetricCard 
          icon={ShieldCheck} 
          label="Execution Success" 
          value={isLoading ? '...' : stats?.successRate ?? '0%'} 
          sub="Program runtime health"
          color="emerald"
        />
        <MetricCard 
          icon={Layers3} 
          label="Active Protocols" 
          value={isLoading ? '...' : stats?.activeSigners ?? 0} 
          sub="Unique signing authorities"
          color="purple"
        />
        <MetricCard 
          icon={Cpu} 
          label="Top Instruction" 
          value={isLoading ? '...' : stats?.topInstruction ?? 'None'} 
          sub="Most frequent SVM call"
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8 items-start">
        {/* Main Event Log */}
        <div className="rounded-xl border border-white/[0.10] backdrop-blur-md bg-white/[0.04] overflow-hidden">
          <div className="px-8 py-6 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
            <div>
              <h2 className="font-display text-xl text-white">Event Ledger</h2>
              <p className="font-mono text-[10px] uppercase tracking-widest text-white/20 mt-1">Dune SIM SVM indexer v1.0.2</p>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                 <Search className="h-3.5 w-3.5 text-white/20" />
                 <input type="text" placeholder="Filter events..." className="bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-white/10" />
               </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                  <th className="px-8 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">Time</th>
                  <th className="px-8 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">Instruction</th>
                  <th className="px-8 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">Status</th>
                  <th className="px-8 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">Signer</th>
                  <th className="px-8 py-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25 text-right">Signature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="h-6 w-6 text-white/10 animate-spin" />
                        <span className="font-mono text-xs text-white/20 uppercase tracking-widest text-white/20">Syncing with SVM Indexer...</span>
                      </div>
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center text-white/20 font-mono text-sm uppercase tracking-widest">
                      No on-chain events detected
                    </td>
                  </tr>
                ) : (
                  events.map((e) => (
                    <tr key={e.signature} className="hover:bg-white/[0.02] transition-colors group cursor-default">
                      <td className="px-8 py-5">
                        <div className="font-mono text-[11px] text-white/50">{new Date(e.timestamp * 1000).toLocaleTimeString()}</div>
                        <div className="font-mono text-[9px] text-white/20 uppercase tracking-tighter">{new Date(e.timestamp * 1000).toLocaleDateString()}</div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="font-mono text-xs font-medium text-white/80">{e.eventType}</span>
                      </td>
                      <td className="px-8 py-5">
                        <div className={cx(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 border font-mono text-[9px] uppercase tracking-wider',
                          e.success ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-red-500/20 bg-red-500/10 text-red-400'
                        )}>
                          <span className={cx('h-1.5 w-1.5 rounded-full', e.success ? 'bg-emerald-400' : 'bg-red-400')} />
                          {e.success ? 'Success' : 'Failed'}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="font-mono text-xs text-white/40">{shortKey(e.signer)}</span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <a 
                          href={`https://stellar.expert/explorer/testnet/tx/${e.signature}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-mono text-[10px] text-white/20 hover:text-white/60 transition-colors uppercase tracking-widest group-hover:text-white/40"
                        >
                          {e.signature.slice(0, 8)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="p-6 rounded-xl border border-white/[0.10] bg-white/[0.04]">
            <div className="flex items-center gap-2.5 mb-6">
              <Database className="h-4 w-4 text-white/35" />
              <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Data Integrity</h3>
            </div>
            
            <div className="space-y-5">
              {[
                { label: 'Sync Status', value: isLoading ? '…' : events?.length ? 'Live' : 'Idle', color: 'text-emerald-400' },
                { label: 'Latency', value: '< 600ms', color: 'text-white/60' },
                { label: 'Events Indexed', value: String(events?.length ?? 0), color: 'text-white/60' },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-white/25 uppercase tracking-widest">{item.label}</span>
                  <span className={cx('font-mono text-xs font-medium', item.color)}>{item.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 p-4 rounded-lg bg-white/[0.02] border border-white/[0.06]">
               <div className="flex gap-3">
                 <Info className="h-4 w-4 text-blue-400/40 shrink-0 mt-0.5" />
                 <p className="font-mono text-[10px] text-white/25 leading-relaxed uppercase tracking-wide">
                   The SVM Indexer tracks all instructions hitting the PRISM program on devnet.
                 </p>
               </div>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-white/[0.10] bg-white/[0.04]">
            <div className="flex items-center gap-2.5 mb-6">
              <History className="h-4 w-4 text-white/35" />
              <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Instruction Mix</h3>
            </div>
            
            <div className="space-y-4">
              {stats?.types && Object.entries(stats.types).map(([type, count]) => {
                const pct = (count / stats.total) * 100;
                return (
                  <div key={type} className="space-y-2">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
                      <span className="text-white/40">{type}</span>
                      <span className="text-white/60">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1 w-full bg-white/[0.04] rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500/40 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
