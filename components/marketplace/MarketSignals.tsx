'use client';

import { useMarketSignals } from '@/hooks/useMarketSignals';

export function MarketSignals() {
  const { data: signals, isLoading } = useMarketSignals();

  if (isLoading || !signals || signals.length === 0) return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.03] bg-[#0c0c0f]">
      <div className="flex items-center gap-4 px-5 py-3.5">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-white/25 font-semibold">Live Events</span>
        <div className="h-px flex-1 bg-white/[0.03]" />
        <span className="font-mono text-[10px] text-white/20 uppercase tracking-wider">Initializing…</span>
      </div>
    </section>
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.03] bg-[#0c0c0f]">
      <div className="flex items-center gap-3 border-b border-white/[0.03] px-5 py-2.5">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-white/25 font-semibold">Live Signals</span>
        <div className="h-px flex-1 bg-white/[0.03]" />
        <div className="flex items-center gap-1.5">
          <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[9px] text-emerald-400/60 uppercase tracking-wider font-semibold">On-Chain Stream</span>
        </div>
      </div>

      <div className="relative overflow-hidden py-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#0c0c0f] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#0c0c0f] to-transparent" />

        <div className="flex whitespace-nowrap animate-marquee-ticker">
          {[...signals, ...signals].map((s: any, idx: number) => (
            <span key={`${s.signature}-${idx}`} className="mx-6 inline-flex items-center gap-3">
              <span className="font-mono text-[9px] text-white/20 uppercase tracking-wider">
                {new Date(s.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="font-mono text-[10px] text-white/50 uppercase tracking-wider">
                {s.eventType}
              </span>
              <span className="font-mono text-[9px] text-white/25 italic">
                {s.message}
              </span>
              <span className="ml-4 text-white/[0.06]">·</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
