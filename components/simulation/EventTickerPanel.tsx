'use client';

import { RefreshCw, Wallet } from 'lucide-react';
import { useWallet } from '@/components/providers/stellar-wallet-context';


import { useEvents } from '@/hooks/useEvents';
import { useDuneBalances } from '@/hooks/useDuneBalances';
import { useSimulationLog } from '@/hooks/useSimulationLog';
import type { ProtocolEvent } from '@/app/lib/dune-sim';

const EVENT_STYLES: Record<string, { dot: string; badge: string }> = {
  'Deposit':        { dot: 'bg-blue-400',   badge: 'border-blue-500/25 bg-blue-500/10 text-blue-300' },
  'Withdraw':       { dot: 'bg-white/40',   badge: 'border-white/10 bg-white/[0.04] text-white/55' },
  'Yield Accrual':  { dot: 'bg-amber-400',  badge: 'border-amber-500/25 bg-amber-500/10 text-amber-300' },
  'Credit Event':   { dot: 'bg-red-400',    badge: 'border-red-500/25 bg-red-500/10 text-red-300' },
  'Disbursement':   { dot: 'bg-green-400',  badge: 'border-green-500/25 bg-green-500/10 text-green-300' },
  'Repayment':      { dot: 'bg-teal-400',   badge: 'border-teal-500/25 bg-teal-500/10 text-teal-300' },
  'Loan Created':   { dot: 'bg-violet-400', badge: 'border-violet-500/25 bg-violet-500/10 text-violet-300' },
  'AMM Swap':       { dot: 'bg-pink-400',   badge: 'border-pink-500/25 bg-pink-500/10 text-pink-300' },
  'Add Liquidity':  { dot: 'bg-cyan-400',   badge: 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300' },
  'Transaction':    { dot: 'bg-white/30',   badge: 'border-white/10 bg-white/[0.04] text-white/55' },
};

function getStyle(type: string) {
  return EVENT_STYLES[type] ?? EVENT_STYLES['Transaction'];
}

function relativeTime(unixSec: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSec;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortSig(sig: string): string {
  if (sig.length <= 12) return sig;
  return `${sig.slice(0, 6)}…${sig.slice(-6)}`;
}

function EventRow({ event, isLocal }: { event: ProtocolEvent; isLocal?: boolean }) {
  const style = getStyle(event.eventType);
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3 last:border-0">
      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${style.dot}`} />
      <span
        className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${style.badge}`}
      >
        {event.eventType}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/40">
        {shortSig(event.signature)}
      </span>
      {isLocal && (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-white/20">
          sim
        </span>
      )}
      {!event.success && (
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-red-400">
          failed
        </span>
      )}
      <span className="shrink-0 font-mono text-[11px] text-white/30">{relativeTime(event.timestamp)}</span>
    </div>
  );
}

export function EventTickerPanel() {
  const { data, isFetching } = useEvents();
  const { publicKey } = useWallet();
  const setVisible = (_v: boolean) => {}; // wallet modal not available in Stellar
  const walletAddress = publicKey?.toBase58() ?? null;
  const { data: balances, isFetching: balancesFetching } = useDuneBalances(walletAddress ?? '');
  const { entries: logEntries } = useSimulationLog();

  const hasDuneData = data.duneCount > 0;

  const localEvents: ProtocolEvent[] = logEntries.slice(0, 15).map((e) => ({
    signature: e.id,
    timestamp: Math.floor(new Date(e.timestamp).getTime() / 1000),
    success: e.status !== 'error',
    eventType: e.action,
    signer: e.role,
  }));

  const events = hasDuneData ? data.events.slice(0, 15) : localEvents;
  const isLocal = !hasDuneData;

  return (
    <section className="mt-16">
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="font-display text-4xl leading-none text-white">Live Protocol Events</h2>
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/30">
          {isFetching && <RefreshCw className="h-3 w-3 animate-spin" />}
          <span className="text-[#FF6154]/70">Dune SIM</span>
          <span>·</span>
          <span>{hasDuneData ? 'mainnet · live' : 'devnet · no mainnet txs yet'}</span>
        </div>
      </div>

      {/* Dune SIM API status */}
      <div className="mb-4 rounded border border-[#FF6154]/15 bg-[#FF6154]/5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-[#FF6154]/60">Dune SIM API</span>
          <div className="flex flex-1 flex-wrap items-center gap-x-6 gap-y-1 font-mono text-[10px] text-white/35">
            <span>
              <span className="text-white/20">GET</span>{' '}
              /beta/svm/transactions/…{' '}
              <span className="text-white/50">{data.duneCount} results</span>
            </span>
            <span>
              <span className="text-white/20">GET</span>{' '}
              /beta/svm/balances/…{' '}
              {walletAddress
                ? <span className="text-white/50">{balancesFetching ? '…' : `${balances.balances.length} tokens`}</span>
                : <button onClick={() => setVisible(true)} className="inline-flex items-center gap-1 text-[#FF6154]/60 hover:text-[#FF6154] transition-colors cursor-pointer">
                    <Wallet className="h-2.5 w-2.5" />
                    connect wallet to fetch
                  </button>
              }
            </span>
          </div>
        </div>

        {/* Show balances if wallet connected and Dune returned data */}
        {walletAddress && balances.balances.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-3 border-t border-[#FF6154]/10 pt-2.5">
            {balances.balances.map((b) => (
              <span key={b.symbol} className="font-mono text-[10px] text-white/50">
                <span className="text-white/70">{b.amount}</span> {b.symbol}
              </span>
            ))}
          </div>
        )}

        {walletAddress && balances.balances.length === 0 && !balancesFetching && (
          <p className="mt-1.5 font-mono text-[10px] text-white/25">
            No mainnet tokens found · Dune SIM indexes mainnet only
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-md border border-white/10 bg-black/35">
        {events.length === 0 ? (
          <p className="px-5 py-8 text-center font-mono text-sm text-white/30">
            {isFetching ? 'Fetching on-chain activity…' : 'No activity yet · run a simulation action above'}
          </p>
        ) : (
          events.map((event, i) => (
            <EventRow key={event.signature + i} event={event} isLocal={isLocal} />
          ))
        )}
      </div>
    </section>
  );
}
