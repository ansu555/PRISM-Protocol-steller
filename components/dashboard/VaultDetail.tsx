'use client';

import { useState } from 'react';
import { ArrowLeft, Shield, Zap, TrendingUp, Info, Activity, Layers, HeartPulse, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useConnection } from '@solana/wallet-adapter-react';
import { TrancheKind, Q64_ONE } from '@/app/lib/constants';
import { formatUsdc, getNetworkName } from '@/app/lib/format';
import { usePrismData } from '@/hooks/usePrismData';
import { useUserPosition } from '@/hooks/useUserPosition';
import { useAllVaults } from '@/hooks/useAllVaults';

// Sub-components
import { WaterfallVisualizer } from '../vault-detail/WaterfallVisualizer';
import { MarketOverviewStrip } from '../vault-detail/MarketOverviewStrip';
import { AllocationTerminal } from '../vault-detail/AllocationTerminal';
import { RiskProtectionPanel, LoanBookExposure, VaultActivityFeed } from '../vault-detail/InstitutionalModules';
import { UserPositionSection } from '../vault-detail/UserPositionSection';
import { PerformanceAnalytics } from '../vault-detail/PerformanceAnalytics';

const TRANCHE_ORDER = [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const;

const TRANCHE_META = {
  [TrancheKind.Prime]: {
    label: 'Prime Tranche',
    color: '#38596a',
    apy: '5.2%',
    risk: 'Senior · Low Risk',
    protection: 'Maximum',
  },
  [TrancheKind.Core]: {
    label: 'Core Tranche',
    color: '#ad7b21',
    apy: '8.5%',
    risk: 'Mezzanine · Balanced',
    protection: 'High',
  },
  [TrancheKind.Alpha]: {
    label: 'Alpha Tranche',
    color: '#9f442b',
    apy: '15.4%',
    risk: 'Junior · High Yield',
    protection: 'None',
  },
} as const;

interface VaultDetailProps {
  vaultId: number;
}

export function VaultDetail({ vaultId }: VaultDetailProps) {
  const { connection } = useConnection();
  const data = usePrismData(vaultId);
  const { data: allVaults } = useAllVaults();
  const { data: userPositions } = useUserPosition();
  const network = getNetworkName(connection.rpcEndpoint);

  const [activeTranche, setActiveTranche] = useState<TrancheKind>(TrancheKind.Prime);

  const vault = allVaults?.find((v) => v.id === vaultId);
  const vaultName = vault ? `Credit Vault #${vaultId}` : 'Loading...';

  // Prepare position data for the UserPositionSection
  const preparedPositions = TRANCHE_ORDER.map((kind) => {
    const tranche = data.tranches?.find((t) => t.kind === kind);
    const userPos = userPositions?.find((p) => p.kind === kind);
    const valueUsdc = userPos ? (userPos.balance * (tranche?.navPerShareQ ?? 0n)) / Q64_ONE : 0n;
    const yieldAccrued = userPos ? (userPos.balance * (tranche?.cumulativeYield ?? 0n)) / Q64_ONE : 0n;
    
    return {
      kind,
      label: TRANCHE_META[kind].label,
      balance: userPos?.balance ?? 0n,
      valueUsdc,
      yieldAccrued,
      color: TRANCHE_META[kind].color
    };
  });

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-16 pb-32">
      {/* Navigation & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link 
          href="/earn"
          className="group inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-white/30 hover:text-white/60 transition-colors"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
          Market Registry
        </Link>
        <div className="flex items-center gap-4">
           <span className="font-mono text-[9px] uppercase tracking-widest text-white/10 italic">Updated 5s ago</span>
           <div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
        </div>
      </div>

      {/* 1. VAULT HEADER */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.10] bg-white/[0.04] backdrop-blur-md px-10 py-10 flex flex-col lg:flex-row justify-between gap-12 group">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent" />
        
        <div className="relative max-w-3xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.02]">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/40">{network} Network</span>
            </div>
            <div className="h-px w-8 bg-white/10" />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-400/60 font-bold">● Institutional Grade</span>
          </div>
          <h1 className="font-display text-6xl text-white tracking-tighter mb-4">{vaultName}</h1>
          <p className="text-base leading-relaxed text-white/40 max-w-xl">
            Institutional-grade liquidity pool focusing on diversified RWA and on-chain credit assets. Managed by validated protocol risk engines with a priority repayment waterfall.
          </p>
          <div className="mt-8 flex gap-6">
             <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-white/20" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">Audited Engine v2.1</span>
             </div>
             <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-white/20" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">Diversified Portfolio</span>
             </div>
          </div>
        </div>

        <div className="relative flex flex-col justify-between items-end min-w-[320px]">
           {/* Terminal Aesthetic Graphic */}
           <div className="absolute -top-12 -right-12 w-64 h-64 opacity-20 pointer-events-none blur-3xl bg-emerald-500/20 rounded-full" />
           <div className="absolute top-0 right-0 w-full h-full opacity-10 pointer-events-none overflow-hidden rounded-xl">
             <img 
               src="/institutional_credit_terminal_graphic_1778431019848.png" 
               alt="" 
               className="object-cover w-full h-full scale-150 rotate-12 opacity-50"
             />
           </div>

           <div className="relative text-right space-y-2 z-10">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/20">Vault Status</div>
              <div className="flex items-center gap-3 justify-end">
                 <div className={`font-mono text-xl font-bold uppercase tracking-widest ${data.vaultHealth > 90 ? 'text-emerald-400' : 'text-amber-400'}`}>
                   {data.vaultStatus}
                 </div>
                 <Activity className={`h-4 w-4 ${data.vaultHealth > 90 ? 'text-emerald-500' : 'text-amber-500'} animate-pulse`} />
              </div>
           </div>
           
           <div className="relative p-6 rounded-xl border border-white/[0.05] bg-white/[0.02] text-right z-10 backdrop-blur-sm">
              <div className="font-mono text-[10px] uppercase tracking-widest text-white/20 mb-1">Health Score</div>
              <div className="font-mono text-3xl font-medium text-white tabular-nums leading-none">
                {data.vaultHealth.toFixed(2)}%
              </div>
              <div className="mt-2 font-mono text-[8px] uppercase tracking-widest text-white/10 italic">Structural Integrity Nominal</div>
           </div>

           <button 
             onClick={() => document.getElementById('allocation-terminal')?.scrollIntoView({ behavior: 'smooth' })}
             className="w-full mt-4 py-3 rounded-xl bg-white text-black font-mono text-[9px] font-bold uppercase tracking-[0.2em] transition-all hover:bg-white/90 flex items-center justify-center gap-2"
           >
              Fast-Track Allocation
              <Zap className="h-3 w-3 fill-current" />
           </button>
        </div>
      </section>

      {/* 2. MARKET OVERVIEW */}
      <MarketOverviewStrip 
        totalCapital={data.vaultCapital}
        activeCredit={data.vaultCapital - data.poolLiquidity} // Simplified for UI
        yieldDistributed={data.yieldDistributed}
        utilization={(Number(data.vaultCapital - data.poolLiquidity) / Number(data.vaultCapital)) * 100}
        health={data.vaultHealth}
      />

      {/* 3. TRANCHE ALLOCATION INTERFACE */}
      <section id="allocation-terminal" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex items-center gap-3">
          <Zap className="h-4 w-4 text-white/40" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">Tranche Allocation Terminal</h2>
        </div>
        <AllocationTerminal 
          vaultStatus={data.vaultStatus}
          tranches={TRANCHE_ORDER.map(k => ({
            kind: k,
            ...TRANCHE_META[k],
            nav: data.tranches?.find(t => t.kind === k)?.navPerShareQ ?? Q64_ONE
          }))}
          onTrancheChange={setActiveTranche}
        />
      </section>

      {/* 4. WATERFALL STRUCTURE VISUALIZATION */}
      <section className="space-y-8">
        <div className="flex items-center gap-3">
          <Layers className="h-4 w-4 text-white/40" />
          <h2 className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/40">Waterfall Risk Engine</h2>
        </div>
        <div className="p-10 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
          <WaterfallVisualizer activeTranche={activeTranche} />
        </div>
      </section>

      {/* 5. RISK & PROTECTION LAYER */}
      <RiskProtectionPanel />

      {/* 6. LOAN BOOK EXPOSURE */}
      <LoanBookExposure />

      {/* 7. LIVE MARKET ACTIVITY & 8. PERFORMANCE */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-16">
        <PerformanceAnalytics />
        <VaultActivityFeed />
      </div>

      {/* 9. USER POSITION SECTION */}
      <UserPositionSection positions={preparedPositions} />

      {/* 10. CAPITAL ACTIONS (Bottom Bar or Secondary Actions) */}
      <section className="flex flex-col md:flex-row items-center justify-between p-10 rounded-2xl border border-white/[0.10] bg-white/[0.04] backdrop-blur-md gap-8">
        <div className="flex items-center gap-6">
           <div className="h-12 w-12 rounded-full border border-white/[0.10] flex items-center justify-center bg-white/[0.02]">
              <HeartPulse className="h-6 w-6 text-emerald-400/40" />
           </div>
           <div>
              <h3 className="font-display text-xl text-white">Institutional Rebalancing</h3>
              <p className="text-xs text-white/30 max-w-sm">Re-allocate your capital across tranches with zero-fee internal rebalancing.</p>
           </div>
        </div>
        <div className="flex gap-4">
           <button className="px-8 py-4 rounded-xl border border-white/[0.10] bg-white/[0.02] font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/[0.06] transition-all">
              Claim Accrued Yield
           </button>
           <button className="px-8 py-4 rounded-xl border border-white/[0.10] bg-white/[0.02] font-mono text-[10px] font-bold uppercase tracking-widest text-white/40 cursor-not-allowed">
              Withdraw Liquidity
           </button>
        </div>
      </section>

      {/* Footer Info */}
      <div className="flex flex-col items-center gap-4 py-10 opacity-20 hover:opacity-40 transition-opacity">
         <Link href="#" className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest text-white group">
            Review Smart Contract Architecture <ExternalLink className="h-3 w-3 group-hover:translate-x-0.5" />
         </Link>
         <span className="font-mono text-[8px] uppercase tracking-[0.3em] text-white/50">PRISM PROTOCOL v2.1.0 · SECURE CAPITAL MANAGEMENT</span>
      </div>
    </div>
  );
}
