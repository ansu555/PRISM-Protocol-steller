'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  ExternalLink,
  History,
  Info,
  Layers3,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useEvents } from '@/hooks/useEvents';
import { shortKey } from '@/app/lib/format';
import {
  PRISM_CORE_CONTRACT_ID,
  PTOKEN_PRIME_CONTRACT_ID,
  PTOKEN_CORE_CONTRACT_ID,
  PTOKEN_ALPHA_CONTRACT_ID,
  USDC_CONTRACT_ID,
} from '@/app/lib/constants';

const CONTRACT_NAMES: Record<string, string> = {
  [PRISM_CORE_CONTRACT_ID]: 'PRISM Core',
  [PTOKEN_PRIME_CONTRACT_ID]: 'Prime Token',
  [PTOKEN_CORE_CONTRACT_ID]: 'Core Token',
  [PTOKEN_ALPHA_CONTRACT_ID]: 'Alpha Token',
  [USDC_CONTRACT_ID]: 'USDC Token',
};

function cx(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// ─── Metric card (Trade-style: rounded-2xl, calm, mono) ────────────────────────

function MetricCard({ icon: Icon, label, value, sub, isLoading = false }: any) {
  return (
    <div className="rounded-2xl border border-white/[0.04] bg-[#0c0c0f] p-5 transition-colors hover:border-white/10">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wide text-white/40">{label}</span>
        <Icon className="h-3.5 w-3.5 text-white/25" />
      </div>
      {isLoading ? (
        <div className="mt-3 h-7 w-20 animate-pulse rounded bg-white/10" />
      ) : (
        <div className="mt-3 font-mono text-2xl tabular-nums text-white/90">{value}</div>
      )}
      {sub && <div className="mt-1 font-mono text-[9px] text-white/25">{sub}</div>}
    </div>
  );
}

// ─── Select control (Trade-style) ─────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-wide text-white/40">{label}</span>
      {children}
    </div>
  );
}

const selectClass =
  'cursor-pointer rounded-xl border border-white/[0.04] bg-black/40 px-3 py-2 font-mono text-[11px] text-white/70 outline-none transition-colors hover:border-white/15';

// ─── Main Component ──────────────────────────────────────────────────────────

export function ProtocolAnalytics() {
  const { data: eventsResult, isLoading } = useEvents();
  const events = eventsResult?.events ?? [];

  const [search, setSearch] = useState('');
  const [selectedContract, setSelectedContract] = useState('ALL');
  const [selectedFunction, setSelectedFunction] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState('TIME_DESC');

  // Live clock — client-only to avoid SSR/CSR hydration mismatch.
  const [lastSync, setLastSync] = useState('');
  useEffect(() => {
    setLastSync(new Date().toLocaleTimeString());
    const id = setInterval(() => setLastSync(new Date().toLocaleTimeString()), 10_000);
    return () => clearInterval(id);
  }, [events.length]);

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

  const filteredAndSortedEvents = useMemo(() => {
    let result = [...events];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) => e.signature.toLowerCase().includes(q) || e.signer.toLowerCase().includes(q)
      );
    }
    if (selectedContract !== 'ALL') {
      result = result.filter((e) => e.contractId === selectedContract);
    }
    if (selectedFunction !== 'ALL') {
      result = result.filter((e) => e.eventType === selectedFunction);
    }
    if (selectedStatus !== 'ALL') {
      const isSuccess = selectedStatus === 'SUCCESS';
      result = result.filter((e) => e.success === isSuccess);
    }

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

  const hasActiveFilters =
    search ||
    selectedContract !== 'ALL' ||
    selectedFunction !== 'ALL' ||
    selectedStatus !== 'ALL' ||
    sortBy !== 'TIME_DESC';

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-5 px-6 pb-24 pt-7 lg:px-10">
      {/* ── Header (Trade slim style) ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wide text-white/70">Protocol Analytics</span>
            <span className="rounded-full bg-[#e54b73]/10 px-2 py-0.5 font-mono text-[10px] text-[#e54b73]">
              On-Chain
            </span>
          </div>
          <p className="mt-1 font-mono text-[10px] text-white/30">
            Real-time Soroban contract event monitoring via indexed ledger logs
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-white/[0.04] bg-[#0c0c0f] px-3 py-2">
            <div className="font-mono text-[9px] uppercase tracking-wide text-white/30">Contract</div>
            <div className="mt-0.5 font-mono text-[11px] text-white/70">{shortKey(PRISM_CORE_CONTRACT_ID)}</div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="font-mono text-[9px] text-emerald-400/70">
              ● {events.length ? 'Live' : 'Idle'}
            </span>
            <span className="font-mono text-[9px] text-white/20">Sync {lastSync || '—'}</span>
          </div>
        </div>
      </div>

      {/* ── Metric grid (Trade cards) ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          icon={Database}
          label="Total Events"
          value={stats?.total ?? 0}
          sub="Last 50 indexed events"
          isLoading={isLoading}
        />
        <MetricCard
          icon={ShieldCheck}
          label="Execution Success"
          value={stats?.successRate ?? '0%'}
          sub="Contract runtime health"
          isLoading={isLoading}
        />
        <MetricCard
          icon={Layers3}
          label="Active Signers"
          value={stats?.activeSigners ?? 0}
          sub="Unique source accounts"
          isLoading={isLoading}
        />
        <MetricCard
          icon={Cpu}
          label="Top Event"
          value={stats?.topInstruction ?? 'None'}
          sub="Most frequent contract event"
          isLoading={isLoading}
        />
      </div>

      {/* ── Ledger + sidebar ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Event Ledger card */}
        <div className="rounded-2xl border border-white/[0.04] bg-[#0c0c0f] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs uppercase tracking-wide text-white/70">Event Ledger</span>
              <span className="rounded-full bg-[#e54b73]/10 px-2 py-0.5 font-mono text-[10px] text-[#e54b73]">
                Soroban RPC
              </span>
            </div>
            <span className="font-mono text-[9px] text-emerald-400/70">● Indexer v1.0.2</span>
          </div>

          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-white/[0.04] bg-black/40 p-4">
            <Field label="Search">
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-black/40 px-3 py-2">
                <Search className="h-3.5 w-3.5 text-white/25" />
                <input
                  type="text"
                  placeholder="Tx hash or signer…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent font-mono text-[11px] text-white outline-none placeholder:text-white/20"
                />
              </div>
            </Field>

            <Field label="Contract">
              <select
                value={selectedContract}
                onChange={(e) => setSelectedContract(e.target.value)}
                className={selectClass}
              >
                <option value="ALL">All Contracts</option>
                {Object.entries(CONTRACT_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name} ({id.slice(0, 4)}…{id.slice(-4)})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Event">
              <select
                value={selectedFunction}
                onChange={(e) => setSelectedFunction(e.target.value)}
                className={selectClass}
              >
                <option value="ALL">All Events</option>
                {distinctFunctions.map((func) => (
                  <option key={func} value={func}>
                    {func}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Status">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className={selectClass}
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
              </select>
            </Field>

            <Field label="Sort By">
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className={selectClass}>
                <option value="TIME_DESC">Time: Newest First</option>
                <option value="TIME_ASC">Time: Oldest First</option>
                <option value="TYPE_ASC">Event: A to Z</option>
                <option value="TYPE_DESC">Event: Z to A</option>
                <option value="SIGNER_ASC">Signer: A to Z</option>
                <option value="STATUS_DESC">Status: Success First</option>
              </select>
            </Field>

            {hasActiveFilters && (
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedContract('ALL');
                  setSelectedFunction('ALL');
                  setSelectedStatus('ALL');
                  setSortBy('TIME_DESC');
                }}
                className="mb-0.5 self-end rounded-xl border border-[#e54b73]/30 bg-[#e54b73]/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wide text-[#e54b73] transition-colors hover:bg-[#e54b73]/20"
              >
                Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-white/[0.03] bg-black/30">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-white/[0.04]">
                    {['Time', 'Event / Contract', 'Status', 'Signer'].map((h) => (
                      <th key={h} className="px-4 py-3 font-mono text-[9px] uppercase tracking-wide text-white/30">
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-mono text-[9px] uppercase tracking-wide text-white/30">
                      Tx Hash
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.03]">
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <tr key={idx} className="animate-pulse">
                        <td className="px-4 py-3.5">
                          <div className="mb-1.5 h-3 w-16 rounded bg-white/10" />
                          <div className="h-2 w-10 rounded bg-white/5" />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="mb-1.5 h-3.5 w-28 rounded bg-white/10" />
                          <div className="h-2 w-20 rounded bg-white/5" />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="h-5 w-16 rounded-full bg-white/10" />
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="h-3 w-20 rounded bg-white/10" />
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="ml-auto h-3 w-14 rounded bg-white/10" />
                        </td>
                      </tr>
                    ))
                  ) : filteredAndSortedEvents.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-16 text-center font-mono text-xs uppercase tracking-wide text-white/20"
                      >
                        No matching events found
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedEvents.map((e) => (
                      <tr key={e.signature} className="group transition-colors hover:bg-white/[0.02]">
                        <td className="px-4 py-3.5">
                          <div className="font-mono text-[11px] text-white/60">
                            {new Date(e.timestamp * 1000).toLocaleTimeString()}
                          </div>
                          <div className="font-mono text-[9px] text-white/20">
                            {new Date(e.timestamp * 1000).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="block font-mono text-xs text-white/80">{e.eventType}</span>
                          <span className="mt-0.5 block font-mono text-[9px] text-white/25">
                            {e.contractId
                              ? CONTRACT_NAMES[e.contractId] ?? `Contract: ${shortKey(e.contractId)}`
                              : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div
                            className={cx(
                              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wide',
                              e.success
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            )}
                          >
                            <span
                              className={cx('h-1.5 w-1.5 rounded-full', e.success ? 'bg-emerald-400' : 'bg-red-400')}
                            />
                            {e.success ? 'Success' : 'Failed'}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="font-mono text-xs text-white/40">{e.signer ? shortKey(e.signer) : '—'}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          {e.signature ? (
                            <a
                              href={`https://stellar.expert/explorer/testnet/tx/${e.signature}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 font-mono text-[10px] text-white/30 transition-colors hover:text-[#e54b73]"
                            >
                              {e.signature.slice(0, 8)}…{e.signature.slice(-4)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="font-mono text-[10px] text-white/15">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Indexer Health */}
          <div className="rounded-2xl border border-white/[0.04] bg-[#0c0c0f] p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-xs uppercase tracking-wide text-white/70">Indexer Health</span>
              <span className="font-mono text-[9px] text-emerald-400/70">● Live</span>
            </div>

            <div className="space-y-3">
              {isLoading
                ? Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="flex animate-pulse items-center justify-between">
                      <div className="h-2.5 w-20 rounded bg-white/10" />
                      <div className="h-3 w-12 rounded bg-white/10" />
                    </div>
                  ))
                : [
                    { label: 'Sync Status', value: events?.length ? 'Live' : 'Idle', color: 'text-emerald-400' },
                    { label: 'Latency', value: '< 600ms', color: 'text-white/70' },
                    { label: 'Events Indexed', value: String(events?.length ?? 0), color: 'text-white/70' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between rounded-xl border border-white/[0.03] bg-black/30 px-3 py-2.5"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-wide text-white/40">{item.label}</span>
                      <span className={cx('font-mono text-xs', item.color)}>{item.value}</span>
                    </div>
                  ))}
            </div>

            <div className="mt-4 flex gap-2.5 rounded-xl border border-white/[0.03] bg-black/30 p-3">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
              <p className="font-mono text-[10px] leading-relaxed text-white/30">
                The indexer streams all contract events emitted by PRISM Core on Soroban testnet.
              </p>
            </div>
          </div>

          {/* Event Mix */}
          <div className="rounded-2xl border border-white/[0.04] bg-[#0c0c0f] p-5">
            <div className="mb-4 flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-white/40" />
              <span className="font-mono text-xs uppercase tracking-wide text-white/70">Event Mix</span>
            </div>

            <div className="space-y-3.5">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="animate-pulse space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="h-2.5 w-16 rounded bg-white/10" />
                      <div className="h-2.5 w-8 rounded bg-white/10" />
                    </div>
                    <div className="h-1 w-full rounded-full bg-white/5" />
                  </div>
                ))
              ) : !stats?.types ? (
                <div className="py-4 text-center font-mono text-[10px] uppercase tracking-wide text-white/20">
                  No data available
                </div>
              ) : (
                Object.entries(stats.types).map(([type, count]) => {
                  const pct = (count / stats.total) * 100;
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wide">
                        <span className="text-white/50">{type}</span>
                        <span className="text-white/70">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.04]">
                        <div className="h-full rounded-full bg-[#e54b73]" style={{ width: `${pct}%` }} />
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
