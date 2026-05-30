'use client';

import { useMemo, useState } from 'react';
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
import {
  PRISM_CORE_CONTRACT_ID,
  PRISM_AMM_CONTRACT_ID,
  PTOKEN_PRIME_CONTRACT_ID,
  PTOKEN_CORE_CONTRACT_ID,
  PTOKEN_ALPHA_CONTRACT_ID,
  USDC_CONTRACT_ID,
  PRISM_CORE_PROGRAM_ID,
} from '@/app/lib/constants';

const CONTRACT_NAMES: Record<string, string> = {
  [PRISM_CORE_CONTRACT_ID]: 'PRISM Core',
  [PRISM_AMM_CONTRACT_ID]: 'PRISM AMM',
  [PTOKEN_PRIME_CONTRACT_ID]: 'Prime Token',
  [PTOKEN_CORE_CONTRACT_ID]: 'Core Token',
  [PTOKEN_ALPHA_CONTRACT_ID]: 'Alpha Token',
  [USDC_CONTRACT_ID]: 'USDC Token',
};

// ─── Components ───────────────────────────────────────────────────────────────

function PageHeader() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/[0.03] bg-[#0c0c0f]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 80% at 100% 0%, rgba(168,85,247,0.12) 0%, transparent 55%), radial-gradient(ellipse 50% 60% at 0% 100%, rgba(56,189,248,0.08) 0%, transparent 50%)',
        }}
      />

      <div className="relative flex flex-col gap-6 px-8 py-7 sm:flex-row sm:items-center sm:justify-between">
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
          <h1 className="font-sans text-3xl font-semibold leading-none text-white tracking-tight">
            Protocol Analytics
          </h1>
          <p className="mt-3 font-mono text-sm text-white/30">
            Real-time SVM execution monitoring via indexed contract logs
          </p>
        </div>

        <div className="flex items-center gap-4">
           <div className="flex flex-col items-end gap-1 px-5 py-3 rounded-xl border border-white/[0.03] bg-[#0c0c0f]">
             <span className="font-mono text-[10px] uppercase tracking-widest text-white/20">Program ID</span>
             <span className="font-mono text-sm text-white/60">{shortKey(PRISM_CORE_PROGRAM_ID)}</span>
           </div>
        </div>
      </div>
      <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, color = 'blue', isLoading = false }: any) {
  const colors: any = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    emerald: 'text-emerald-400',
    amber: 'text-amber-400',
  };

  return (
    <div className="p-6 rounded-xl border border-white/[0.03] bg-[#0c0c0f] hover:bg-white/[0.015] transition-all group">
      <div className="flex items-center justify-between mb-4">
        <div className={cx('p-2 rounded-lg bg-[#0c0c0f]', colors[color])}>
          <Icon className="h-5 w-5" />
        </div>
        {isLoading ? (
          <div className="h-3.5 w-8 bg-white/10 rounded animate-pulse" />
        ) : (
          <span className="font-mono text-[10px] text-white/10 uppercase tracking-widest">Live</span>
        )}
      </div>
      <div className="font-mono text-[11px] uppercase tracking-widest text-white/30 mb-1">{label}</div>
      {isLoading ? (
        <div className="h-9 w-24 bg-white/10 rounded animate-pulse my-1" />
      ) : (
        <div className="font-mono text-3xl font-medium text-white/80 tabular-nums">{value}</div>
      )}
      {isLoading ? (
        <div className="h-3.5 w-32 bg-white/[0.04] rounded animate-pulse mt-2" />
      ) : (
        sub && <div className="mt-2 font-mono text-[10px] text-white/20 uppercase tracking-tighter">{sub}</div>
      )}
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

  // Filter & Sort States
  const [search, setSearch] = useState('');
  const [selectedContract, setSelectedContract] = useState('ALL');
  const [selectedFunction, setSelectedFunction] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('TIME_DESC');

  // Dynamically extract distinct function names from events for dropdown
  const distinctFunctions = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => {
      if (e.eventType) set.add(e.eventType);
    });
    return Array.from(set).sort();
  }, [events]);

  const stats = useMemo(() => {
    if (!events.length) return null;
    const successCount = events.filter((e) => e.success).length;
    const rate = (successCount / events.length) * 100;
    
    const types: Record<string, number> = {};
    events.forEach((e) => {
      types[e.eventType] = (types[e.eventType] || 0) + 1;
    });
    
    const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0];

    return {
      total: events.length,
      successRate: rate.toFixed(1) + '%',
      topInstruction: topType ? topType[0] : 'N/A',
      activeSigners: new Set(events.map((e) => e.signer)).size,
      types,
    };
  }, [events]);

  // Filter and Sort Events Memo
  const filteredAndSortedEvents = useMemo(() => {
    let result = [...events];

    // Filter by text search (signer address or transaction signature)
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.signature.toLowerCase().includes(q) ||
          e.signer.toLowerCase().includes(q)
      );
    }

    // Filter by contract address
    if (selectedContract !== 'ALL') {
      result = result.filter((e) => e.contractId === selectedContract);
    }

    // Filter by function name
    if (selectedFunction !== 'ALL') {
      result = result.filter((e) => e.eventType === selectedFunction);
    }

    // Filter by status
    if (selectedStatus !== 'ALL') {
      const isSuccess = selectedStatus === 'SUCCESS';
      result = result.filter((e) => e.success === isSuccess);
    }

    // Sort events
    result.sort((a, b) => {
      switch (sortBy) {
        case 'TIME_DESC':
          return b.timestamp - a.timestamp;
        case 'TIME_ASC':
          return a.timestamp - b.timestamp;
        case 'TYPE_ASC':
          return a.eventType.localeCompare(b.eventType);
        case 'TYPE_DESC':
          return b.eventType.localeCompare(a.eventType);
        case 'SIGNER_ASC':
          return a.signer.localeCompare(b.signer);
        case 'STATUS_DESC':
          return (b.success ? 1 : 0) - (a.success ? 1 : 0);
        default:
          return b.timestamp - a.timestamp;
      }
    });

    return result;
  }, [events, search, selectedContract, selectedFunction, selectedStatus, sortBy]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-10 px-10 pb-20 pt-4">
      <PageHeader />

      <div className="flex items-center gap-4 p-5 rounded-xl border border-white/[0.03] bg-[#0c0c0f]">
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
          value={stats?.total ?? 0} 
          sub="Last 50 indexed events"
          color="blue"
          isLoading={isLoading}
        />
        <MetricCard 
          icon={ShieldCheck} 
          label="Execution Success" 
          value={stats?.successRate ?? '0%'} 
          sub="Program runtime health"
          color="emerald"
          isLoading={isLoading}
        />
        <MetricCard 
          icon={Layers3} 
          label="Active Protocols" 
          value={stats?.activeSigners ?? 0} 
          sub="Unique signing authorities"
          color="purple"
          isLoading={isLoading}
        />
        <MetricCard 
          icon={Cpu} 
          label="Top Instruction" 
          value={stats?.topInstruction ?? 'None'} 
          sub="Most frequent SVM call"
          color="amber"
          isLoading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-8 items-start">
        {/* Main Event Log */}
        <div className="rounded-xl border border-white/[0.03] bg-[#0c0c0f] overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.03] flex items-center justify-between bg-[#0c0c0f]">
            <div>
              <h2 className="font-sans text-lg font-semibold text-white">Event Ledger</h2>
              <p className="font-mono text-[10px] uppercase tracking-widest text-white/20 mt-1">Dune SIM SVM indexer v1.0.2</p>
            </div>
            <div className="flex items-center gap-4">
               <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/[0.03] bg-[#0c0c0f]">
                 <Search className="h-3.5 w-3.5 text-white/20" />
                 <input
                   type="text"
                   placeholder="Filter events..."
                   value={search}
                   onChange={(e) => setSearch(e.target.value)}
                   className="bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-white/10"
                 />
               </div>
            </div>
          </div>

          {/* Sleek Filters Toolbar */}
          <div className="px-6 py-3 border-b border-white/[0.03] bg-white/[0.002] flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] text-white/35 uppercase tracking-wider font-semibold">Contract Address</span>
              <select
                value={selectedContract}
                onChange={(e) => setSelectedContract(e.target.value)}
                className="bg-[#0c0c0f] border border-white/10 hover:border-white/20 text-white/80 font-mono text-[11px] rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors"
              >
                <option value="ALL">All Contracts</option>
                {Object.entries(CONTRACT_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} ({id.slice(0, 4)}…{id.slice(-4)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] text-white/35 uppercase tracking-wider font-semibold">Function / Action</span>
              <select
                value={selectedFunction}
                onChange={(e) => setSelectedFunction(e.target.value)}
                className="bg-[#0c0c0f] border border-white/10 hover:border-white/20 text-white/80 font-mono text-[11px] rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors"
              >
                <option value="ALL">All Actions</option>
                {distinctFunctions.map((func) => (
                  <option key={func} value={func}>
                    {func}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] text-white/35 uppercase tracking-wider font-semibold">Status</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-[#0c0c0f] border border-white/10 hover:border-white/20 text-white/80 font-mono text-[11px] rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors"
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <span className="font-mono text-[9px] text-white/35 uppercase tracking-wider font-semibold">Sort By</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-[#0c0c0f] border border-white/10 hover:border-white/20 text-white/80 font-mono text-[11px] rounded-lg px-2.5 py-1.5 outline-none cursor-pointer transition-colors"
              >
                <option value="TIME_DESC">Time: Newest First</option>
                <option value="TIME_ASC">Time: Oldest First</option>
                <option value="TYPE_ASC">Action: A to Z</option>
                <option value="TYPE_DESC">Action: Z to A</option>
                <option value="SIGNER_ASC">Signer: A to Z</option>
                <option value="STATUS_DESC">Status: Success First</option>
              </select>
            </div>

            {(search || selectedContract !== 'ALL' || selectedFunction !== 'ALL' || selectedStatus !== 'ALL' || sortBy !== 'TIME_DESC') && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedContract('ALL');
                  setSelectedFunction('ALL');
                  setSelectedStatus('ALL');
                  setSortBy('TIME_DESC');
                }}
                className="self-end mb-0.5 px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-mono text-[10px] uppercase tracking-wider transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">Time</th>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">Instruction / Contract</th>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">Status</th>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">Signer</th>
                  <th className="px-5 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/25 text-right">Signature</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="px-5 py-4">
                        <div className="h-3 w-16 bg-white/10 rounded mb-1.5" />
                        <div className="h-2 w-10 bg-white/5 rounded" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="h-3.5 w-28 bg-white/10 rounded mb-1.5" />
                        <div className="h-2 w-20 bg-white/5 rounded" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="h-5 w-16 bg-white/10 rounded-full" />
                      </td>
                      <td className="px-5 py-4">
                        <div className="h-3 w-20 bg-white/10 rounded" />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="h-3 w-14 bg-white/10 rounded ml-auto" />
                      </td>
                    </tr>
                  ))
                ) : filteredAndSortedEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center text-white/20 font-mono text-sm uppercase tracking-widest">
                      No matching events found
                    </td>
                  </tr>
                ) : (
                  filteredAndSortedEvents.map((e) => (
                    <tr key={e.signature} className="hover:bg-[#0c0c0f] transition-colors group cursor-default">
                      <td className="px-5 py-4">
                        <div className="font-mono text-[11px] text-white/50">{new Date(e.timestamp * 1000).toLocaleTimeString()}</div>
                        <div className="font-mono text-[9px] text-white/20 uppercase tracking-tighter">{new Date(e.timestamp * 1000).toLocaleDateString()}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs font-medium text-white/80 block">{e.eventType}</span>
                        <span className="font-mono text-[9px] text-white/25 block mt-0.5">
                          {e.contractId ? (CONTRACT_NAMES[e.contractId] ?? `Contract: ${shortKey(e.contractId)}`) : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className={cx(
                          'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 border font-mono text-[9px] uppercase tracking-wider',
                          e.success ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-red-500/20 bg-red-500/10 text-red-400'
                        )}>
                          <span className={cx('h-1.5 w-1.5 rounded-full', e.success ? 'bg-emerald-400' : 'bg-red-400')} />
                          {e.success ? 'Success' : 'Failed'}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-mono text-xs text-white/40">{e.signer ? shortKey(e.signer) : '—'}</span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {e.signature ? (
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${e.signature}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-mono text-[10px] text-white/20 hover:text-white/60 transition-colors uppercase tracking-widest group-hover:text-white/40"
                          >
                            {e.signature.slice(0, 8)}…{e.signature.slice(-4)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="font-mono text-[10px] text-white/10 uppercase tracking-widest">—</span>
                        )}
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
          <div className="p-6 rounded-xl border border-white/[0.03] bg-[#0c0c0f]">
            <div className="flex items-center gap-2.5 mb-6">
              <Database className="h-4 w-4 text-white/35" />
              <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Data Integrity</h3>
            </div>
            
            <div className="space-y-5">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="flex items-center justify-between animate-pulse">
                    <div className="h-2.5 w-20 bg-white/10 rounded" />
                    <div className="h-3 w-12 bg-white/10 rounded" />
                  </div>
                ))
              ) : (
                [
                  { label: 'Sync Status', value: events?.length ? 'Live' : 'Idle', color: 'text-emerald-400' },
                  { label: 'Latency', value: '< 600ms', color: 'text-white/60' },
                  { label: 'Events Indexed', value: String(events?.length ?? 0), color: 'text-white/60' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-white/25 uppercase tracking-widest">{item.label}</span>
                    <span className={cx('font-mono text-xs font-medium', item.color)}>{item.value}</span>
                  </div>
                ))
              )}
            </div>

            <div className="mt-8 p-4 rounded-lg bg-[#0c0c0f] border border-white/[0.03]">
               <div className="flex gap-3">
                 <Info className="h-4 w-4 text-blue-400/40 shrink-0 mt-0.5" />
                 <p className="font-mono text-[10px] text-white/25 leading-relaxed uppercase tracking-wide">
                   The SVM Indexer tracks all instructions hitting the PRISM program on devnet.
                 </p>
               </div>
            </div>
          </div>

          <div className="p-6 rounded-xl border border-white/[0.03] bg-[#0c0c0f]">
            <div className="flex items-center gap-2.5 mb-6">
              <History className="h-4 w-4 text-white/35" />
              <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-white/40">Instruction Mix</h3>
            </div>
            
            <div className="space-y-4">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="space-y-2.5 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="h-2.5 w-16 bg-white/10 rounded" />
                      <div className="h-2.5 w-8 bg-white/10 rounded" />
                    </div>
                    <div className="h-1 w-full bg-white/5 rounded-full" />
                  </div>
                ))
              ) : !stats?.types ? (
                <div className="font-mono text-[10px] text-white/20 uppercase tracking-widest text-center py-4">No data available</div>
              ) : (
                Object.entries(stats.types).map(([type, count]) => {
                  const pct = (count / stats.total) * 100;
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest">
                        <span className="text-white/40">{type}</span>
                        <span className="text-white/60">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 w-full bg-[#0c0c0f] rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500/40 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
