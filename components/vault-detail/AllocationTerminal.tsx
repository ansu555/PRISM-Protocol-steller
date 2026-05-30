'use client';

import { useState, useEffect } from 'react';
import { TrancheKind } from '@/app/lib/constants';
import { useDeposit } from '@/hooks/useDeposit';
import {
  Shield, Zap, TrendingUp, Info, Loader2, BarChart,
  TriangleAlert
} from 'lucide-react';
import { formatUsdc } from '@/app/lib/format';
import { useIdentityBalances } from '@/hooks/useIdentityBalances';

interface AllocationTerminalProps {
  vaultStatus?: string;
  tranches: {
    kind: TrancheKind;
    apy: string;
    label: string;
    color: string;
    protection: string;
    risk: string;
    nav: bigint;
  }[];
  onTrancheChange: (kind: TrancheKind) => void;
}

export function AllocationTerminal({ vaultStatus, tranches, onTrancheChange }: AllocationTerminalProps) {
  const isActive = vaultStatus?.toLowerCase() === 'active';
  const [selectedKind, setSelectedKind] = useState<TrancheKind>(tranches[0].kind);
  const [amount, setAmount] = useState('');

  const { data: balances } = useIdentityBalances();
  const deposit = useDeposit();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  function handleMax() {
    if (balances?.usdc) {
      setAmount(formatUsdc(balances.usdc));
    }
  }

  const selectedTranche = tranches.find(t => t.kind === selectedKind)!;

  function handleTrancheSelect(kind: TrancheKind) {
    setSelectedKind(kind);
    onTrancheChange(kind);
  }

  function handleDeposit() {
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return;
    deposit.mutate(
      { trancheKind: selectedKind, usdcAmount: BigInt(Math.round(val * 1_000_000)) },
      { onSuccess: () => setAmount('') }
    );
  }

  if (!isMounted) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-px overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]">
      {/* 1. Tranche Selector */}
      <div className="lg:col-span-4 bg-black/20 p-8 space-y-6">
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/20 mb-4">Select Risk Exposure</h3>
          <div className="space-y-3">
            {tranches.map((t) => (
              <button
                key={t.kind}
                onClick={() => handleTrancheSelect(t.kind)}
                className={`w-full group relative flex items-center justify-between px-5 py-4 rounded-xl border transition-all duration-300 overflow-hidden
                  ${selectedKind === t.kind 
                    ? 'border-white/20 bg-white/[0.06] shadow-[0_0_20px_rgba(255,255,255,0.05)]' 
                    : 'border-white/[0.05] bg-transparent hover:border-white/10 hover:bg-white/[0.02]'
                  }
                `}
              >
                <div className="flex items-center gap-4">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                  <div className="text-left">
                    <div className={`font-mono text-sm font-bold tracking-widest ${selectedKind === t.kind ? 'text-white' : 'text-white/40'}`}>
                      {t.label}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-white/20 mt-0.5">{t.risk.split(' ')[0]}</div>
                  </div>
                </div>
                <div className="text-right">
                   <div className="font-mono text-lg font-medium text-white/90 leading-none">{t.apy}</div>
                   <div className="font-mono text-[8px] uppercase tracking-widest text-white/20 mt-1">Target APY</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="pt-6 border-t border-white/[0.04]">
           <div className="flex items-center gap-2 mb-3">
              <Info className="h-3.5 w-3.5 text-white/20" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/30">Structural Insight</span>
           </div>
           <p className="text-[10px] leading-relaxed text-white/20 italic">
              Your capital is locked into the chosen tranche. NAV is updated every epoch. Protection levels are enforced by the on-chain waterfall engine.
           </p>
        </div>
      </div>

      {/* 2. Allocation Form & Intel */}
      <div className="lg:col-span-8 p-8 flex flex-col justify-between">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Input Section */}
          <div className="space-y-6">
            <div className="flex flex-col gap-6">
               {/* USDC Form */}
               <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 block">Allocation Amount (USDC)</label>
                      <button
                        onClick={handleMax}
                        className="font-mono text-[9px] uppercase tracking-widest text-white/20 hover:text-white/50 transition-colors"
                      >
                        Balance: {balances ? formatUsdc(balances.usdc, 2) : '0.00'} <span className="ml-1 text-emerald-400/50 underline">Max</span>
                      </button>
                    </div>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 font-mono text-white/20">$</div>
                      <input
                        type="text"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={!isActive}
                        className="w-full h-16 bg-white/[0.03] border border-white/[0.10] rounded-xl pl-10 pr-16 font-mono text-2xl text-white outline-none focus:border-white/20 transition-all disabled:opacity-40"
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-widest text-white/20">USDC</div>
                    </div>
                  </div>

                  {!isActive && (
                    <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/[0.05] flex items-start gap-3">
                      <TriangleAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-mono text-[10px] font-bold text-red-200 uppercase tracking-wider">Vault Inactive</div>
                        <p className="font-mono text-[9px] text-red-300/60 mt-1">This vault is currently {vaultStatus || 'Initializing'}. Capital allocation is disabled until it reaches Active status.</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleDeposit}
                    disabled={deposit.isPending || !amount || !isActive}
                    className="w-full h-14 flex items-center justify-center gap-3 bg-white text-black font-mono text-[11px] font-bold uppercase tracking-[0.25em] rounded-xl transition-all hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deposit.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : !isActive ? (
                      'Vault Not Active'
                    ) : !amount ? (
                      'Enter Allocation Amount'
                    ) : (
                      <><Zap className="h-4 w-4" /> Allocate USDC</>
                    )}
                  </button>
               </div>
            </div>

            <p className="text-center font-mono text-[9px] uppercase tracking-widest text-white/15 mt-8">
              By allocating, you agree to the structural risk of {selectedTranche.label}
            </p>
          </div>

          {/* Dynamic Intel Section */}
          <div className="space-y-6">
             <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30 block mb-4">Strategy Metrics</label>
             
             <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-white/[0.04]">
                   <div className="flex items-center gap-2">
                      <Shield className="h-3.5 w-3.5 text-white/20" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Protection Depth</span>
                   </div>
                   <span className="font-mono text-[11px] text-white font-bold">{selectedTranche.protection}</span>
                </div>
                
                <div className="flex items-center justify-between py-3 border-b border-white/[0.04]">
                   <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-white/20" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Expected Yield</span>
                   </div>
                   <span className="font-mono text-[11px] text-white font-bold">{selectedTranche.apy}</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/[0.04]">
                   <div className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 text-white/20" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Current NAV</span>
                   </div>
                   <span className="font-mono text-[11px] text-white font-bold">1.0000 USDC</span>
                </div>

                <div className="flex items-center justify-between py-3 border-b border-white/[0.04]">
                   <div className="flex items-center gap-2">
                      <BarChart className="h-3.5 w-3.5 text-white/20" />
                      <span className="font-mono text-[10px] uppercase tracking-widest text-white/40">Structural Vol</span>
                   </div>
                   <span className="font-mono text-[11px] text-white/40 uppercase">Low</span>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
