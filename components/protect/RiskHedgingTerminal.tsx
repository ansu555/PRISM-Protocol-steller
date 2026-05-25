'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { 
  ShieldCheck, 
  ShieldAlert,
  BarChart, 
  FileCheck, 
  Activity,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Fingerprint,
  Lock,
  Cpu
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useProtectionState } from '@/hooks/useProtectionState';
import { useVaultState } from '@/hooks/useVaultState';
import { VAULT_ID } from '@/app/lib/constants';
import { formatUsdc } from '@/app/lib/format';

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS: { id: Step; label: string; icon: any }[] = [
  { id: 1, label: 'Exposure Audit', icon: Fingerprint },
  { id: 2, label: 'Instrument', icon: ShieldCheck },
  { id: 3, label: 'Structuring', icon: Cpu },
  { id: 4, label: 'Underwriting', icon: BarChart },
  { id: 5, label: 'Execution', icon: FileCheck },
];

export function RiskHedgingTerminal() {
  const { connected, publicKey } = useWallet();
  const vaultState = useVaultState(VAULT_ID);
  const { 
    exposureAmount, setExposureAmount,
    protectionNotional, setProtectionNotional,
    duration, setDuration,
    hedgeType, setHedgeType,
    basisPoints
  } = useProtectionState();

  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const next = () => setCurrentStep((s) => Math.min(s + 1, 5) as Step);
  const back = () => setCurrentStep((s) => Math.max(s - 1, 1) as Step);

  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/40 p-20 text-center">
        <Lock className="mb-4 h-10 w-10 text-white/10" />
        <h3 className="text-xl font-display text-white">Institutional Access Restricted</h3>
        <p className="mt-2 text-sm text-white/40 max-w-sm font-mono uppercase tracking-tight">
          Connect a verified wallet to audit protocol exposure and underwrite credit protection.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Simulation Header */}
      <div className="flex items-center justify-between px-2">
         <div className="flex items-center gap-3">
            <div className="flex h-2 w-2 relative">
               <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
               <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">Simulation Mode: Active</span>
         </div>
         <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
               <span className="font-mono text-[9px] uppercase text-white/20">Network</span>
               <span className="font-mono text-[9px] uppercase text-emerald-400">PRISM-DEV-01</span>
            </div>
            <div className="flex items-center gap-2">
               <span className="font-mono text-[9px] uppercase text-white/20">Latency</span>
               <span className="font-mono text-[9px] uppercase text-emerald-400">12ms</span>
            </div>
         </div>
      </div>

      {/* Step Navigator */}
      <nav className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.02] p-4 overflow-x-auto backdrop-blur-sm">
        {STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isDone = currentStep > step.id;
          
          return (
            <div key={step.id} className="flex items-center shrink-0">
              <div className={cn(
                "flex flex-col items-center gap-2 px-6 transition-all",
                isActive ? "opacity-100" : "opacity-30"
              )}>
                <div className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-sm border transition-all",
                  isActive ? "border-pink-500 bg-pink-500/20 text-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.3)]" : 
                  isDone ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400" : "border-white/10 bg-white/5 text-white/40"
                )}>
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] whitespace-nowrap">{step.label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className="h-[1px] w-12 bg-white/10 mx-2" />
              )}
            </div>
          );
        })}
      </nav>

      {/* Main Stage */}
      <div className="min-h-[520px] relative overflow-hidden rounded-md border border-white/10 bg-black/40 p-10 shadow-2xl backdrop-blur-xl">
        {/* Ambient background glow */}
        <div className="absolute -top-24 -left-24 h-64 w-64 bg-pink-500/10 blur-[100px] pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-64 w-64 bg-blue-500/5 blur-[100px] pointer-events-none" />

        {currentStep === 1 && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative z-10">
              <h2 className="font-display text-4xl text-white tracking-tight">Exposure Audit</h2>
              <p className="mt-2 text-sm text-white/40 italic font-mono uppercase tracking-tighter">Phase 01: Portfolio Risk Scanning</p>
            </div>
            
            <div className="grid gap-8 relative z-10">
               <div className="rounded-sm border border-white/10 bg-white/[0.02] p-8 space-y-6">
                  <div className="flex items-center justify-between">
                     <div className="font-mono text-[10px] uppercase tracking-widest text-white/30">Detected Assets at Risk</div>
                     <div className="font-mono text-xl text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                        {formatUsdc(BigInt(exposureAmount))}
                     </div>
                  </div>
                  
                  {/* Dune-style visual placeholder */}
                  <div className="h-24 w-full flex items-end gap-1 px-1">
                     {[40, 65, 30, 85, 45, 90, 55, 35, 75, 60, 40, 80, 50, 70, 30, 95].map((h, i) => (
                        <div 
                          key={i} 
                          className="flex-1 bg-gradient-to-t from-pink-500/40 to-pink-500/10 rounded-t-[1px] transition-all hover:from-pink-400 hover:to-pink-300"
                          style={{ height: `${h}%` }}
                        />
                     ))}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <div className="rounded-sm bg-white/5 p-4 space-y-1">
                        <div className="text-[9px] text-white/20 uppercase font-mono">Reference Vault</div>
                        <div className="text-xs text-white font-mono">PRISM-SOL-V1</div>
                     </div>
                     <div className="rounded-sm bg-white/5 p-4 space-y-1 text-right">
                        <div className="text-[9px] text-white/20 uppercase font-mono">Tranche Nodes</div>
                        <div className="text-xs text-white font-mono">Alpha / Core</div>
                     </div>
                  </div>

                  <div className="p-4 rounded-sm border border-amber-500/20 bg-amber-500/[0.03] flex items-start gap-4">
                     <AlertTriangle className="h-5 w-5 text-amber-500/50 mt-1" />
                     <div>
                        <div className="text-xs font-bold text-amber-200/80 uppercase tracking-wide">Unhedged Exposure Detected</div>
                        <p className="text-[11px] text-amber-200/40 mt-1 leading-relaxed uppercase tracking-tight">
                          The PRISM Audit engine has detected active capital exposed to Alpha-tranche volatility without a bound CDS agreement.
                        </p>
                     </div>
                  </div>
               </div>

               <div className="space-y-4">
                  <div className="flex justify-between items-end">
                    <label className="font-mono text-[10px] uppercase tracking-widest text-white/30">Manual Audit Override</label>
                    <span className="font-mono text-[10px] text-pink-500/60 uppercase">USDC DENOMINATED</span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={exposureAmount}
                      onChange={(e) => setExposureAmount(e.target.value)}
                      className="w-full rounded-sm border border-white/10 bg-white/5 px-6 py-6 font-mono text-3xl text-white focus:border-pink-500/50 focus:outline-none focus:ring-1 focus:ring-pink-500/20 transition-all"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 font-mono text-xs text-white/20">USDC</div>
                  </div>
               </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative z-10">
              <h2 className="font-display text-4xl text-white tracking-tight">Instrument Selection</h2>
              <p className="mt-2 text-sm text-white/40 italic font-mono uppercase tracking-tighter">Phase 02: Hedging Strategy Specification</p>
            </div>

            <div className="grid gap-4 relative z-10">
              {[
                { id: 'standard', title: 'Standard CDS', copy: 'Full protection across all tranches.', rate: '250 bps', icon: ShieldCheck },
                { id: 'alpha', title: 'Alpha Tranche Hedge', copy: 'Specific protection for first-loss exposure.', rate: '450 bps', icon: Activity },
                { id: 'total', title: 'Protocol Umbrella', copy: 'Global coverage for multiple vault nodes.', rate: '180 bps', icon: Cpu }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setHedgeType(t.id as any)}
                  className={cn(
                    "group flex items-center justify-between rounded-sm border p-6 text-left transition-all",
                    hedgeType === t.id ? "border-pink-500/50 bg-pink-500/10 shadow-[0_4px_30px_rgba(236,72,153,0.15)]" : "border-white/10 bg-white/5 hover:border-white/20"
                  )}
                >
                  <div className="flex items-center gap-5">
                    <div className={cn(
                      "h-12 w-12 rounded-full border flex items-center justify-center transition-all",
                      hedgeType === t.id ? "border-pink-500 bg-pink-500/20 text-pink-400" : "border-white/10 bg-white/5 text-white/20 group-hover:border-white/30"
                    )}>
                      <t.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="font-mono text-xs uppercase tracking-widest text-white">{t.title}</div>
                      <div className="mt-1 text-xs text-white/40 uppercase tracking-tight">{t.copy}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg text-pink-400 font-bold tracking-tighter">{t.rate}</div>
                    <div className="text-[9px] text-white/20 uppercase font-mono tracking-widest">Premium Rate</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative z-10">
              <h2 className="font-display text-4xl text-white tracking-tight">Instrument Structuring</h2>
              <p className="mt-2 text-sm text-white/40 italic font-mono uppercase tracking-tighter">Phase 03: Parameter Configuration</p>
            </div>

            <div className="grid gap-12 relative z-10">
              <div className="space-y-4">
                <div className="flex justify-between items-end">
                  <label className="font-mono text-[10px] uppercase tracking-widest text-white/30">Protection Notional</label>
                  <span className="font-mono text-[10px] text-white/40 italic">Max available: $5.2M</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={protectionNotional}
                    onChange={(e) => setProtectionNotional(e.target.value)}
                    className="w-full rounded-sm border border-white/10 bg-white/5 px-6 py-6 font-mono text-4xl text-white focus:border-pink-500/50 focus:outline-none transition-all"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 font-mono text-sm text-white/20">USDC</div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="font-mono text-[10px] uppercase tracking-widest text-white/30">Coverage Duration</label>
                <div className="grid grid-cols-4 gap-4">
                   {[30, 90, 180, 365].map(d => (
                     <button
                       key={d}
                       onClick={() => setDuration(d)}
                       className={cn(
                         "group relative overflow-hidden rounded-sm border py-6 font-mono text-sm tracking-[0.2em] transition-all",
                         duration === d ? "border-pink-500/50 bg-pink-500/20 text-white" : "border-white/10 bg-white/5 text-white/40 hover:border-white/20"
                       )}
                     >
                       <span className="relative z-10">{d}D</span>
                       {duration === d && <div className="absolute inset-0 bg-gradient-to-tr from-pink-500/10 to-transparent" />}
                     </button>
                   ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="relative z-10">
              <h2 className="font-display text-4xl text-white tracking-tight">Underwriting Review</h2>
              <p className="mt-2 text-sm text-white/40 italic font-mono uppercase tracking-tighter">Phase 04: Counterparty Audit & Settlement Simulation</p>
            </div>

            <div className="space-y-6 relative z-10">
               <div className="rounded-sm border border-white/10 bg-white/[0.02] p-10 space-y-10 backdrop-blur-md">
                  <div className="grid grid-cols-2 gap-16">
                     <div className="space-y-6">
                        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30 font-bold">Payout Triggers</div>
                        <div className="space-y-4">
                           <div className="flex items-center gap-4 text-[11px] text-white/60 font-mono tracking-tight uppercase">
                              <CheckCircle2 className="h-4 w-4 text-pink-500/50" />
                              Alpha Tranche Loss {'>'} 5%
                           </div>
                           <div className="flex items-center gap-4 text-[11px] text-white/60 font-mono tracking-tight uppercase">
                              <CheckCircle2 className="h-4 w-4 text-pink-500/50" />
                              Vault NAV {'<'} 0.95 USDC
                           </div>
                           <div className="flex items-center gap-4 text-[11px] text-white/60 font-mono tracking-tight uppercase">
                              <CheckCircle2 className="h-4 w-4 text-pink-500/50" />
                              Oracle Deviation {'>'} 2%
                           </div>
                        </div>
                     </div>
                     <div className="space-y-6">
                        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30 font-bold">Counterparty Health</div>
                        <div className="space-y-5">
                           <div className="flex justify-between items-end border-b border-white/5 pb-2">
                              <span className="text-[10px] text-white/40 uppercase tracking-widest">Pool Liquidity</span>
                              <span className="text-white font-mono text-sm">{formatUsdc(vaultState.data?.reserveBalance ?? 0n)}</span>
                           </div>
                           <div className="flex justify-between items-end border-b border-white/5 pb-2">
                              <span className="text-[10px] text-white/40 uppercase tracking-widest">Solvency Margin</span>
                              <span className="text-emerald-400 font-mono text-sm font-bold">1.82x</span>
                           </div>
                           <div className="flex justify-between items-end border-b border-white/5 pb-2">
                              <span className="text-[10px] text-white/40 uppercase tracking-widest">Oracle Health</span>
                              <span className="text-emerald-400 font-mono text-[10px] uppercase">99.98% uptime</span>
                           </div>
                        </div>
                     </div>
                  </div>

                  <div className="pt-10 border-t border-white/10">
                     <div className="flex items-center justify-between p-6 rounded-sm bg-white/[0.03]">
                        <div>
                           <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/40">Total Hedge Premium Due</span>
                           <p className="text-[10px] text-white/20 mt-1 uppercase">Billed in real-time via yield diversion</p>
                        </div>
                        <span className="font-mono text-4xl text-pink-500 font-bold drop-shadow-[0_0_15px_rgba(236,72,153,0.3)]">
                           ${((Number(protectionNotional) * (hedgeType === 'alpha' ? 0.045 : 0.025)) * (duration/365)).toFixed(2)}
                        </span>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isCompleted ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-8 relative z-10">
                <div className="h-24 w-24 rounded-full bg-emerald-500/10 border border-emerald-500 flex items-center justify-center relative">
                   <div className="absolute inset-0 rounded-full animate-ping bg-emerald-500/20" />
                   <CheckCircle2 className="h-12 w-12 text-emerald-500 relative z-10" />
                </div>
                <div className="space-y-2">
                   <h2 className="font-display text-5xl text-white tracking-tighter">CDS Agreement Bound</h2>
                   <p className="font-mono text-[10px] text-white/40 uppercase tracking-[0.5em]">Network ID: TX-CDS-99281-IKA</p>
                </div>
                <div className="max-w-md text-xs text-white/40 leading-relaxed uppercase tracking-widest font-mono">
                  Your Credit Default Swap has been cryptographically registered and settled via the PRISM IKA Network. 
                  Protection coverage is now active and monitoring live oracle feeds.
                </div>
                <div className="flex gap-4">
                  <button onClick={() => window.location.reload()} className="px-8 py-3 rounded-sm border border-white/10 bg-white/5 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-white/10 transition-all">
                    Back to Terminal
                  </button>
                  <button className="px-8 py-3 rounded-sm bg-white font-mono text-[10px] uppercase tracking-widest text-black hover:bg-emerald-500 hover:text-white transition-all">
                    View on Dune
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-10 relative z-10">
                <div>
                  <h2 className="font-display text-4xl text-white tracking-tight">Contract Execution</h2>
                  <p className="mt-2 text-sm text-white/40 italic font-mono uppercase tracking-tighter">Final Phase: Cryptographic Binding</p>
                </div>

                <div className="rounded-sm border border-white/10 bg-white/[0.04] p-16 text-center space-y-8 backdrop-blur-lg relative">
                   <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-pink-500/50 to-transparent" />
                   <Fingerprint className={cn("mx-auto h-20 w-20 transition-all duration-1000", isExecuting ? "text-pink-500 animate-pulse scale-110" : "text-white/20")} />
                   <div className="max-w-xl mx-auto space-y-4">
                      <h3 className="text-3xl text-white font-display tracking-tight">Threshold Signature Required</h3>
                      <p className="text-[11px] text-white/40 leading-relaxed uppercase tracking-[0.1em] font-mono">
                        This operation requires an MPC-based threshold signature to bind the CDS agreement to your institutional wallet identity. 
                        By signing, you authorize the dynamic premium deduction and activate real-time hedging coverage.
                      </p>
                   </div>
                </div>

                <div className="flex flex-col gap-6">
                  <button 
                    onClick={() => {
                      setIsExecuting(true);
                      setTimeout(() => {
                        setIsExecuting(false);
                        setIsCompleted(true);
                      }, 3000);
                    }}
                    disabled={isExecuting}
                    className={cn(
                      "group relative w-full overflow-hidden rounded-sm py-6 font-mono text-base font-bold uppercase tracking-[0.4em] transition-all",
                      isExecuting ? "bg-white/5 text-white/30" : "bg-white text-black hover:bg-pink-500 hover:text-white"
                    )}
                  >
                    <span className="relative z-10">{isExecuting ? 'Binding Agreement...' : 'Authorize CDS Contract'}</span>
                    {isExecuting && (
                       <div className="absolute inset-0 bg-white/5">
                          <div className="h-full bg-pink-500/20 animate-[loading_3s_ease-in-out_infinite]" style={{ width: '0%' }} />
                       </div>
                    )}
                  </button>
                  <div className="flex items-center justify-center gap-4">
                     <div className="h-px w-12 bg-white/10" />
                     <p className="font-mono text-[9px] text-white/20 uppercase tracking-[0.4em]">
                       Auth Identity: {publicKey?.toBase58().slice(0, 12)}...
                     </p>
                     <div className="h-px w-12 bg-white/10" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Controls */}
        {!isCompleted && (
          <div className="mt-16 flex items-center justify-between pt-10 border-t border-white/5 relative z-10">
            <button
              onClick={back}
              disabled={currentStep === 1}
              className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-white/30 hover:text-white disabled:opacity-0 transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              Audit Review
            </button>
            <button
              onClick={next}
              disabled={currentStep === 5}
              className="group flex items-center gap-4 rounded-sm bg-white/5 px-10 py-4 font-mono text-[11px] uppercase tracking-[0.2em] text-white hover:bg-white/10 transition-all disabled:opacity-0"
            >
              {currentStep === 4 ? 'Confirm & Execute' : 'Continue Process'}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
