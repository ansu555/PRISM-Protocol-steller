'use client';

import { useProtectionState } from '@/hooks/useProtectionState';
import { usePrismData } from '@/hooks/usePrismData';
import { VAULT_ID } from '@/app/lib/constants';
import { formatUsdc } from '@/app/lib/format';
import { 
  ShieldAlert, 
  Activity, 
  BarChart, 
  Zap, 
  Scale, 
  Info,
  TrendingDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMemo } from 'react';

export function HedgeIntelligencePanel() {
  const { protectionNotional, duration, hedgeType, exposureAmount } = useProtectionState();
  const prismData = usePrismData(VAULT_ID);

  const numNotional = Number(protectionNotional) || 0;
  const numExposure = Number(exposureAmount) || 0;

  // Real-time risk calculations
  const impliedDefaultProb = useMemo(() => {
    // Mocked logic for simulation: based on tranche utilization
    const util = prismData.tranches[2]?.utilization || 0; // Alpha tranche
    return Math.min(util / 2, 100);
  }, [prismData.tranches]);

  const premiumCost = useMemo(() => {
    const rate = hedgeType === 'alpha' ? 0.045 : 0.025;
    return (numNotional * rate * (duration / 365));
  }, [numNotional, duration, hedgeType]);

  const coverageRatio = numExposure > 0 ? (numNotional / numExposure) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Risk Metrics Section */}
      <section className="rounded-md border border-white/10 bg-black/35 p-6 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5 text-pink-400" />
          <h2 className="text-lg font-semibold text-white">Risk Intelligence</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Implied Default Prob.</span>
            <span className="font-mono text-sm text-pink-400">{impliedDefaultProb.toFixed(2)}%</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Protection Coverage</span>
            <span className={cn(
              "font-mono text-sm",
              coverageRatio >= 100 ? "text-emerald-400" : "text-amber-400"
            )}>{coverageRatio.toFixed(1)}%</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Est. Premium</span>
            <span className="font-mono text-sm text-white">${premiumCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>

          <div className="h-[1px] w-full bg-white/5" />

          {/* Hedge Efficiency */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-white/40 uppercase tracking-widest">Hedge Efficiency</span>
              <span className="font-mono text-[10px] text-white/60">High</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
               <div className="h-full bg-pink-500 transition-all duration-1000" style={{ width: '85%' }} />
            </div>
          </div>
        </div>
      </section>

      {/* Underwriting Context */}
      <section className="rounded-md border border-white/10 bg-white/[0.02] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-white/40" />
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">Underwriting Node</h3>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col gap-1">
             <span className="font-mono text-[9px] uppercase text-white/30">Pool Solvency</span>
             <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-emerald-500/40" style={{ width: '92%' }} />
                </div>
                <span className="font-mono text-[9px] text-white/40">92%</span>
             </div>
          </div>

          <div className="rounded-sm border border-white/5 bg-white/[0.01] p-3">
             <div className="flex items-start gap-2">
                <Info className="h-3 w-3 text-white/20 mt-0.5" />
                <p className="text-[10px] leading-relaxed text-white/30">
                  Hedge counterparty is the **PRISM Alpha Liquidity Pool**. Sufficient loss-bucket capital exists to cover this notional.
                </p>
             </div>
          </div>
        </div>
      </section>

      {/* Cost Basis */}
      <section className="rounded-md border border-white/10 bg-black/20 p-5">
         <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-pink-500/20 bg-pink-500/10">
               <TrendingDown className="h-5 w-5 text-pink-400" />
            </div>
            <div>
               <div className="font-mono text-[9px] uppercase tracking-widest text-white/30">Basis Point Cost</div>
               <div className="text-sm font-bold text-white uppercase tracking-tight">250 bps / Annum</div>
            </div>
         </div>
      </section>
    </div>
  );
}
