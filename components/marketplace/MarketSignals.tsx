'use client';

import { useMarketSignals } from '@/hooks/useMarketSignals';
import { Activity, ArrowUpRight } from 'lucide-react';

export function MarketSignals() {
  const { data: signals, isLoading } = useMarketSignals();

  if (isLoading || !signals || signals.length === 0) return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] backdrop-blur-md bg-white/[0.03]">
      <div className="flex items-center gap-4 px-5 py-3.5">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-white/18">Live Events</span>
        <div className="h-px flex-1 bg-white/[0.04]" />
        <span className="font-mono text-[11px] text-white/14 italic">Initializing market signals…</span>
      </div>
    </section>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] backdrop-blur-md bg-white/[0.03]">
      <div className="flex items-center gap-3 border-b border-white/[0.04] px-5 py-2.5">
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-white/18">Live Signals</span>
        <div className="h-px flex-1 bg-white/[0.04]" />
        <div className="flex items-center gap-1.5">
          <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-[9px] text-white/14 uppercase tracking-widest">On-Chain Stream</span>
        </div>
      </div>

      <div className="relative overflow-hidden py-3">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[#060606] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[#060606] to-transparent" />

        <div className="flex whitespace-nowrap animate-marquee-ticker">
          {[...signals, ...signals].map((s: any, idx: number) => (
            <span key={`${s.signature}-${idx}`} className="mx-6 inline-flex items-center gap-3 group">
               <span className="font-mono text-[10px] text-white/10 uppercase tracking-widest">
                 {new Date(s.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
               </span>
               <span className="font-mono text-[11px] text-white/60 uppercase tracking-widest group-hover:text-emerald-400 transition-colors">
                 {s.eventType}
               </span>
               <span className="font-mono text-[10px] text-white/25 italic">
                 {s.message}
               </span>
               <span className="ml-4 text-white/[0.08]">·</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
