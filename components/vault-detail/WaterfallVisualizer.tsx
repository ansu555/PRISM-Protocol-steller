'use client';

import { TrancheKind } from '@/app/lib/constants';
import { Shield, Zap, TrendingUp, Info } from 'lucide-react';

interface WaterfallVisualizerProps {
  activeTranche?: TrancheKind;
}

export function WaterfallVisualizer({ activeTranche }: WaterfallVisualizerProps) {
  const tranches = [
    {
      kind: TrancheKind.Prime,
      label: 'Prime Tranche',
      role: 'Senior Protection',
      desc: 'Paid first, loses last. Capital is protected by Core and Alpha buffers.',
      color: 'bg-[#38596a]',
      borderColor: 'border-[#38596a]/30',
      glow: 'shadow-[0_0_30px_rgba(56,89,106,0.15)]',
      height: 'h-[35%]',
      features: ['99.9% Protection', 'Fixed-Income Profile', 'Treasury Grade']
    },
    {
      kind: TrancheKind.Core,
      label: 'Core Tranche',
      role: 'Mezzanine Growth',
      desc: 'Balanced risk. Protected by Alpha buffer. Absorbs losses after Alpha is exhausted.',
      color: 'bg-[#ad7b21]',
      borderColor: 'border-[#ad7b21]/30',
      glow: 'shadow-[0_0_30px_rgba(173,123,33,0.15)]',
      height: 'h-[40%]',
      features: ['First-Loss Protected', 'Targeted Alpha', 'Institutional Balance']
    },
    {
      kind: TrancheKind.Alpha,
      label: 'Alpha Tranche',
      role: 'Junior Yield',
      desc: 'High reward, high risk. Absorbs the first dollar of portfolio loss.',
      color: 'bg-[#9f442b]',
      borderColor: 'border-[#9f442b]/30',
      glow: 'shadow-[0_0_30px_rgba(159,68,43,0.15)]',
      height: 'h-[25%]',
      features: ['Leveraged Yield', 'First-Loss Capital', 'Maximum Exposure']
    }
  ];

  return (
    <div className="relative h-[600px] flex gap-12 py-8">
      {/* 1. The Waterfall Tower */}
      <div className="relative w-48 h-full flex flex-col gap-2">
        {tranches.map((t) => (
          <div 
            key={t.kind}
            className={`relative ${t.height} w-full rounded-xl border ${t.borderColor} ${t.color} ${t.glow} transition-all duration-500 flex flex-col items-center justify-center overflow-hidden
              ${activeTranche === t.kind ? 'scale-105 z-10 ring-2 ring-white/20' : 'opacity-80 scale-100'}
            `}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
            <span className="font-mono text-[10px] uppercase font-bold tracking-widest text-white/90 drop-shadow-md">
              {t.label.split(' ')[0]}
            </span>
          </div>
        ))}

        {/* Labels for flows */}
        <div className="absolute -left-12 inset-y-0 flex flex-col justify-between py-10 pointer-events-none">
           <div className="flex items-center gap-2 -rotate-90 origin-left">
              <Shield className="h-3 w-3 text-emerald-400/60" />
              <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/20">Capital Protection</span>
           </div>
           <div className="flex items-center gap-2 rotate-90 origin-left translate-x-3 text-right">
              <TrendingUp className="h-3 w-3 text-amber-400/60" />
              <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/20">Yield Flow</span>
           </div>
        </div>
      </div>

      {/* 2. Detailed Breakdown */}
      <div className="flex-1 flex flex-col justify-between py-2">
        {tranches.map((t) => (
          <div 
            key={t.kind}
            className={`flex-1 flex flex-col justify-center transition-all duration-500 px-8 border-l border-white/[0.04]
              ${activeTranche === t.kind ? 'opacity-100 translate-x-2' : 'opacity-30'}
            `}
          >
             <div className="flex items-center gap-3 mb-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">{t.role}</span>
                <div className="h-px w-8 bg-white/10" />
             </div>
             <h3 className="font-display text-2xl text-white mb-2">{t.label}</h3>
             <p className="text-xs leading-relaxed text-white/40 max-w-lg mb-4">{t.desc}</p>
             
             <div className="flex gap-4">
                {t.features.map(f => (
                  <div key={f} className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-white/[0.05] bg-white/[0.02]">
                    <div className="h-1 w-1 rounded-full bg-white/20" />
                    <span className="font-mono text-[8px] uppercase tracking-widest text-white/30">{f}</span>
                  </div>
                ))}
             </div>
          </div>
        ))}
      </div>

      {/* 3. Logic Indicators */}
      <div className="hidden xl:flex flex-col justify-between w-64 py-8 border-l border-white/[0.06] pl-10">
         <div className="space-y-6">
            <div className="flex gap-3">
               <Shield className="h-4 w-4 text-emerald-400/40 shrink-0" />
               <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-white/80 mb-1">Loss Absorption</div>
                  <p className="text-[10px] leading-relaxed text-white/30 italic">Losses are absorbed by Alpha first. Core and Prime remain untouched until subordinated capital is exhausted.</p>
               </div>
            </div>
            <div className="flex gap-3">
               <Zap className="h-4 w-4 text-amber-400/40 shrink-0" />
               <div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-white/80 mb-1">Yield Priority</div>
                  <p className="text-[10px] leading-relaxed text-white/30 italic">Yield is distributed to Prime first at its target rate, then Core, then residual flows to Alpha.</p>
               </div>
            </div>
         </div>

         <div className="p-4 rounded-xl border border-white/[0.05] bg-white/[0.02]">
            <div className="flex items-center gap-2 mb-2">
               <Info className="h-3 w-3 text-blue-400/40" />
               <span className="font-mono text-[9px] uppercase tracking-widest text-white/40">Market Tip</span>
            </div>
            <p className="text-[10px] leading-relaxed text-white/25">Prime is often used as a cash alternative, while Alpha is used to hedge or lever credit exposure.</p>
         </div>
      </div>
    </div>
  );
}
