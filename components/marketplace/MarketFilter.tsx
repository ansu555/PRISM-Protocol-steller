'use client';

import { Search, Filter, SlidersHorizontal } from 'lucide-react';

export function MarketFilter() {
  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-5 py-5">
      <div className="relative w-full md:w-[480px] group">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30 group-hover:text-white/50 transition-colors" />
        <input
          type="text"
          placeholder="Filter credit pools, asset tranches, or institutional issuers..."
          className="w-full h-11 bg-white/[0.04] border border-white/[0.10] rounded-xl pl-11 pr-4 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30 transition-all font-mono"
        />
      </div>

      <div className="flex items-center gap-4 w-full md:w-auto">
        <div className="hidden lg:flex items-center gap-3 px-5 h-11 bg-white/[0.04] border border-white/[0.10] rounded-xl shadow-sm">
           <Filter className="h-3.5 w-3.5 text-white/30" />
           <span className="font-mono text-xs uppercase tracking-[0.15em] text-white/40">Risk Spectrum</span>
           <select className="bg-transparent text-xs uppercase tracking-[0.15em] text-white/80 focus:outline-none cursor-pointer font-bold">
              <option className="bg-[#0b0b0b]">All Profiles</option>
              <option className="bg-[#0b0b0b]">Low Risk / Prime</option>
              <option className="bg-[#0b0b0b]">Medium Risk / Core</option>
              <option className="bg-[#0b0b0b]">High Yield / Alpha</option>
           </select>
        </div>

        <button className="flex items-center gap-2 px-6 h-11 bg-white border border-white text-black hover:bg-transparent hover:text-white transition-all rounded-xl group shadow-lg">
           <SlidersHorizontal className="h-4 w-4" />
           <span className="font-mono text-xs font-bold uppercase tracking-[0.2em]">Advanced Exchange</span>
        </button>
      </div>
    </div>
  );
}
