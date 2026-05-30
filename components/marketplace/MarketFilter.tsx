'use client';

import { Search, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const RISK_OPTIONS = ['All risk tiers', 'Low / Prime', 'Medium / Core', 'High / Alpha'];
const SORT_OPTIONS  = ['TVL (high–low)', 'APY (high–low)', 'Utilization', 'Newest'];

export function MarketFilter() {
  const [risk, setRisk] = useState(0);
  const [sort, setSort] = useState(0);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3.5">
      {/* Search */}
      <div className="relative w-full sm:w-80 group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20 group-focus-within:text-white/40 transition-colors" />
        <input
          type="text"
          placeholder="Search vaults, tranches, issuers…"
          className="w-full h-9 bg-transparent border border-white/[0.05] rounded-lg pl-9 pr-3 font-mono text-xs text-white/80 placeholder:text-white/20 focus:outline-none focus:border-white/[0.12] transition-colors"
        />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 w-full sm:w-auto">
        {/* Risk filter */}
        <div className="relative flex items-center gap-1 h-9 px-3 border border-white/[0.05] rounded-lg bg-transparent hover:border-white/[0.1] transition-colors">
          <span className="font-mono text-[10px] text-white/30">Risk</span>
          <select
            value={risk}
            onChange={(e) => setRisk(Number(e.target.value))}
            className="absolute inset-0 opacity-0 cursor-pointer"
          >
            {RISK_OPTIONS.map((o, i) => <option key={i} value={i} className="bg-[#0c0c0f]">{o}</option>)}
          </select>
          <span className="font-mono text-[10px] text-white/60 font-medium">{RISK_OPTIONS[risk]}</span>
          <ChevronDown className="h-3 w-3 text-white/25 ml-0.5" />
        </div>

        {/* Sort */}
        <div className="relative flex items-center gap-1 h-9 px-3 border border-white/[0.05] rounded-lg bg-transparent hover:border-white/[0.1] transition-colors">
          <span className="font-mono text-[10px] text-white/30">Sort</span>
          <select
            value={sort}
            onChange={(e) => setSort(Number(e.target.value))}
            className="absolute inset-0 opacity-0 cursor-pointer"
          >
            {SORT_OPTIONS.map((o, i) => <option key={i} value={i} className="bg-[#0c0c0f]">{o}</option>)}
          </select>
          <span className="font-mono text-[10px] text-white/60 font-medium">{SORT_OPTIONS[sort]}</span>
          <ChevronDown className="h-3 w-3 text-white/25 ml-0.5" />
        </div>
      </div>
    </div>
  );
}
