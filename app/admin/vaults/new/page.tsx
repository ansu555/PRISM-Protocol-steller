'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ChevronRight, 
  Layers, 
  Loader2, 
  Plus, 
  ShieldCheck, 
  Info,
  Activity,
  Coins,
  Database,
  BarChart3,
  TrendingUp,
  Zap,
  AlertTriangle,
  Server,
  Code,
  Globe,
  Settings2,
  Lock
} from 'lucide-react';
import { useWallet, useConnection } from '@/components/providers/stellar-wallet-context';
import { toast } from 'sonner';

import { PRISM_CORE_PROGRAM_ID, TrancheKind } from '@/app/lib/constants';
import {
  getVaultPda,
  getVaultReservePda,
  getLossBucketPda,
  getTrancheMintPda,
} from '@/app/lib/pda';
import { useAdminVault } from '@/components/admin/AdminVaultContext';

export default function NewVaultPage() {
  const router = useRouter();
  const wallet = useWallet();
  const { connection } = useConnection();
  const { addLog } = useAdminVault();

  // Basic Configuration
  const [creating, setCreating] = useState(false);
  const [vaultId, setVaultId] = useState('');
  const [vaultName, setVaultName] = useState('');
  const [marketCategory, setMarketCategory] = useState('Institutional Credit');
  const [riskRating, setRiskRating] = useState('AA-');
  
  // Tranche Configuration
  const [primeApy, setPrimeApy] = useState('5.0');
  const [coreApy, setCoreApy] = useState('8.0');
  const [alphaApy, setAlphaApy] = useState('15.0');
  
  // Waterfall & Risk Configuration
  const [alphaAbsorb, setAlphaAbsorb] = useState('20');
  const [coreAbsorb, setCoreAbsorb] = useState('15');
  const [reservePct, setReservePct] = useState('2.5');
  
  // AMM Configuration
  const [ammFee, setAmmFee] = useState('0.3');
  const [initialLiquidity, setInitialLiquidity] = useState('100000');

  // Computed PDAs for preview
  const pdaPreview = useMemo(() => {
    const id = parseInt(vaultId);
    if (isNaN(id)) return null;
    
    const [vault] = getVaultPda(id, PRISM_CORE_PROGRAM_ID);
    const [reserve] = getVaultReservePda(vault, PRISM_CORE_PROGRAM_ID);
    const [lossBucket] = getLossBucketPda(vault, PRISM_CORE_PROGRAM_ID);
    const [primeMint] = getTrancheMintPda(vault, TrancheKind.Prime, PRISM_CORE_PROGRAM_ID);
    
    return {
      vault: vault.toString(),
      reserve: reserve.toString(),
      lossBucket: lossBucket.toString(),
      primeMint: primeMint.toString(),
    };
  }, [vaultId]);

  async function handleDeploy() {
    if (!wallet.connected) { toast.error('Connect wallet'); return; }
    const id = parseInt(vaultId);
    if (isNaN(id) || id < 0) { toast.error('Enter a valid vault ID'); return; }

    setCreating(true);
    try {
      throw new Error('Not yet migrated to Stellar — use the simulation panel instead.');
    } catch (e: any) {
      const msg = e.message || String(e);
      addLog(`✗ Infrastructure deployment failed: ${msg}`);
      toast.error(`Deployment failed: ${msg}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-full bg-background p-10 font-sans">
      <div className="mx-auto max-w-[1600px] space-y-10">
        
        {/* Header Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-3xl tracking-tight text-white">Market Infrastructure Deployment</h1>
                <div className="rounded-full border border-purple-500/20 bg-purple-500/[0.05] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-purple-400/80">
                  Instance Initialization
                </div>
              </div>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.3em] text-white/20">
                Configure Structured Credit Pool · Programmable Waterfall Parameters
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] font-mono text-white/30">
                <Globe className="h-3.5 w-3.5" />
                Network: <span className="text-emerald-400/60">Solana Devnet</span>
             </div>
             <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-[11px] font-mono text-white/30">
                <Lock className="h-3.5 w-3.5" />
                Auth: <span className="text-white/60">Protocol Admin</span>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_420px]">
          {/* PRIMARY WORKSPACE (LEFT) */}
          <div className="space-y-10">
            
            {/* Section 1: Market Identity */}
            <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10 shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                  <Server className="h-24 w-24 text-white" strokeWidth={0.5} />
               </div>
               <div className="mb-8 flex items-center gap-3 border-b border-white/[0.06] pb-6">
                 <Database className="h-5 w-5 text-purple-400/60" />
                 <h2 className="font-display text-xl text-white/90">Market Identity & Origin</h2>
               </div>
               
               <div className="grid grid-cols-2 gap-x-12 gap-y-8">
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Vault Identifier</label>
                    <input
                      type="number"
                      placeholder="Sequence ID (e.g. 2)"
                      value={vaultId}
                      onChange={(e) => setVaultId(e.target.value)}
                      className="w-full rounded-2xl border border-white/[0.1] bg-white/[0.03] px-5 py-4 font-mono text-lg text-white transition-all focus:border-purple-500/40 focus:bg-white/[0.05] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Instrument Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Institutional Yield Pool"
                      value={vaultName}
                      onChange={(e) => setVaultName(e.target.value)}
                      className="w-full rounded-2xl border border-white/[0.1] bg-white/[0.03] px-5 py-4 font-sans text-lg text-white transition-all focus:border-purple-500/40 focus:bg-white/[0.05] focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Market Category</label>
                    <select
                      value={marketCategory}
                      onChange={(e) => setMarketCategory(e.target.value)}
                      className="w-full rounded-2xl border border-white/[0.1] bg-white/[0.03] px-5 py-4 font-sans text-sm text-white/60 appearance-none focus:border-purple-500/40 focus:outline-none"
                    >
                      <option>Institutional Credit</option>
                      <option>SME Direct Lending</option>
                      <option>Consumer Real Estate</option>
                      <option>Cross-Border Trade</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Target Risk Rating</label>
                    <div className="flex gap-2">
                       {['AAA', 'AA-', 'A+', 'BBB'].map(r => (
                          <button 
                            key={r}
                            onClick={() => setRiskRating(r)}
                            className={`flex-1 py-4 rounded-2xl border font-mono text-xs transition-all ${riskRating === r ? 'border-purple-500/40 bg-purple-500/10 text-white' : 'border-white/[0.06] bg-white/[0.02] text-white/20 hover:border-white/20'}`}
                          >
                             {r}
                          </button>
                       ))}
                    </div>
                  </div>
               </div>
            </section>

            {/* Section 2: Tranche Engineering */}
            <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10 shadow-sm relative">
               <div className="mb-8 flex items-center justify-between border-b border-white/[0.06] pb-6">
                 <div className="flex items-center gap-3">
                    <Activity className="h-5 w-5 text-sky-400/60" />
                    <h2 className="font-display text-xl text-white/90">Tranche Capital Engineering</h2>
                 </div>
                 <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-white/10 italic">Strict Priority Waterfall</div>
               </div>

               <div className="grid grid-cols-3 gap-8">
                  {[
                    { label: 'PRIME', kind: 'Senior', apy: primeApy, set: setPrimeApy, color: 'text-sky-400', border: 'border-sky-500/20', bg: 'bg-sky-500/[0.02]', icon: ShieldCheck, desc: 'Highest protection, fixed low yield' },
                    { label: 'CORE', kind: 'Mezzanine', apy: coreApy, set: setCoreApy, color: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/[0.02]', icon: Activity, desc: 'Balanced risk, priority return' },
                    { label: 'ALPHA', kind: 'Equity', apy: alphaApy, set: setAlphaApy, color: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/[0.02]', icon: Zap, desc: 'Highest risk, leveraged yield' },
                  ].map((t) => (
                    <div key={t.label} className={`rounded-3xl border ${t.border} ${t.bg} p-8 flex flex-col items-center text-center space-y-6 transition-all hover:bg-white/[0.03]`}>
                       <div className={`p-4 rounded-2xl bg-white/[0.03] border border-white/5`}>
                          <t.icon className={`h-6 w-6 ${t.color}`} />
                       </div>
                       <div>
                          <div className={`font-mono text-[10px] font-bold tracking-[0.25em] ${t.color}`}>{t.label}</div>
                          <div className="text-[9px] uppercase tracking-widest text-white/20 mt-1">{t.kind}</div>
                       </div>
                       <div className="relative w-full">
                          <input 
                            type="text"
                            value={t.apy}
                            onChange={(e) => t.set(e.target.value)}
                            className="w-full bg-transparent text-center font-display text-4xl text-white focus:outline-none"
                          />
                          <div className="font-mono text-[10px] text-white/20 mt-1">Target APY (%)</div>
                       </div>
                       <p className="text-[10px] leading-relaxed text-white/30 italic px-4">
                          {t.desc}
                       </p>
                    </div>
                  ))}
               </div>
            </section>

            {/* Section 3: Waterfall & Loss Protection */}
            <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10 shadow-sm relative overflow-hidden">
               <div className="absolute bottom-0 right-0 p-8 opacity-5">
                  <TrendingUp className="h-24 w-24 text-white" strokeWidth={0.5} />
               </div>
               <div className="mb-8 flex items-center gap-3 border-b border-white/[0.06] pb-6">
                 <Zap className="h-5 w-5 text-amber-400/60" />
                 <h2 className="font-display text-xl text-white/90">Loss Waterfall & Protection Reserve</h2>
               </div>

               <div className="grid grid-cols-2 gap-12">
                  <div className="space-y-8">
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                           <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Alpha Absorption Cap</label>
                           <span className="font-mono text-xs text-white/60">{alphaAbsorb}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="100" step="1"
                          value={alphaAbsorb} onChange={(e) => setAlphaAbsorb(e.target.value)}
                          className="w-full h-1 bg-white/[0.06] rounded-full appearance-none accent-rose-500/50 cursor-pointer"
                        />
                        <p className="text-[10px] text-white/15 leading-relaxed">Percentage of pool losses absorbed by Alpha tranche before Core exposure.</p>
                     </div>
                     <div className="space-y-4">
                        <div className="flex justify-between items-center">
                           <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Core Absorption Cap</label>
                           <span className="font-mono text-xs text-white/60">{coreAbsorb}%</span>
                        </div>
                        <input 
                          type="range" min="0" max="100" step="1"
                          value={coreAbsorb} onChange={(e) => setCoreAbsorb(e.target.value)}
                          className="w-full h-1 bg-white/[0.06] rounded-full appearance-none accent-amber-500/50 cursor-pointer"
                        />
                        <p className="text-[10px] text-white/15 leading-relaxed">Percentage of pool losses absorbed by Core tranche before Prime exposure.</p>
                     </div>
                  </div>
                  <div className="space-y-8">
                     <div className="p-8 rounded-3xl border border-white/[0.06] bg-white/[0.02] flex flex-col justify-center text-center space-y-4">
                        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Protection Reserve Ratio</div>
                        <div className="font-display text-5xl text-white">{reservePct}%</div>
                        <p className="text-[10px] text-white/15 italic">Liquid USDC buffer maintained in Vault Reserve account at all times.</p>
                     </div>
                     <div className="flex items-center gap-4 p-5 rounded-2xl bg-amber-500/[0.03] border border-amber-500/10">
                        <AlertTriangle className="h-4 w-4 text-amber-500/40 shrink-0" />
                        <span className="text-[10px] text-amber-500/40 font-mono uppercase tracking-widest leading-relaxed">Automatic Loss Cascade Enabled: Alpha ➔ Core ➔ Prime ➔ Reserve Bucket</span>
                     </div>
                  </div>
               </div>
            </section>

            {/* Section 4: AMM Configuration */}
            <section className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10 shadow-sm relative overflow-hidden">
               <div className="mb-8 flex items-center gap-3 border-b border-white/[0.06] pb-6">
                 <Coins className="h-5 w-5 text-emerald-400/60" />
                 <h2 className="font-display text-xl text-white/90">AMM Infrastructure & Liquidity</h2>
               </div>

               <div className="grid grid-cols-2 gap-12">
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Protocol LP Fee (%)</label>
                    <input
                      type="text"
                      value={ammFee}
                      onChange={(e) => setAmmFee(e.target.value)}
                      className="w-full rounded-2xl border border-white/[0.1] bg-white/[0.03] px-5 py-4 font-mono text-lg text-white focus:border-purple-500/40 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/20">Initial Depth (USDC)</label>
                    <input
                      type="text"
                      value={initialLiquidity}
                      onChange={(e) => setInitialLiquidity(e.target.value)}
                      className="w-full rounded-2xl border border-white/[0.1] bg-white/[0.03] px-5 py-4 font-mono text-lg text-white focus:border-purple-500/40 focus:outline-none"
                    />
                  </div>
               </div>
            </section>

          </div>

          {/* SIDEBAR / DEPLOYMENT INTELLIGENCE (RIGHT) */}
          <div className="space-y-8">
             
             {/* Deployment Summary */}
             <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.03] p-8 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5">
                   <Code className="h-20 w-20 text-white" strokeWidth={0.5} />
                </div>
                <h3 className="mb-6 font-display text-lg text-white">Deployment Intelligence</h3>
                
                <div className="space-y-6">
                   <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-mono uppercase tracking-widest text-white/20">
                         <span>Infrastructure Readiness</span>
                         <span className="text-emerald-400/60">Ready</span>
                      </div>
                      <div className="h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
                         <div className="h-full bg-emerald-500/40 w-[100%]" />
                      </div>
                   </div>

                   <div className="space-y-4 border-y border-white/[0.06] py-6">
                      {[
                        { label: 'Vault Identifier', val: `#${vaultId || 'N/A'}` },
                        { label: 'Market Tier', val: marketCategory.split(' ')[0] },
                        { label: 'Tx Sequence Count', val: '6 Instructions' },
                        { label: 'Est. Compute Units', val: '284,000' },
                        { label: 'Authorized Signer', val: 'Admin' },
                      ].map(row => (
                        <div key={row.label} className="flex justify-between items-center">
                           <span className="text-[11px] text-white/30 font-mono uppercase tracking-widest">{row.label}</span>
                           <span className="text-xs text-white/80 font-medium">{row.val}</span>
                        </div>
                      ))}
                   </div>

                   <div className="space-y-3">
                      <div className="font-mono text-[10px] uppercase tracking-widest text-white/20 mb-1">Generated PDA States</div>
                      <div className="p-4 rounded-2xl bg-black/40 border border-white/[0.04] space-y-3">
                         {[
                           { label: 'VAULT', addr: pdaPreview?.vault },
                           { label: 'RESERVE', addr: pdaPreview?.reserve },
                           { label: 'BUCKET', addr: pdaPreview?.lossBucket },
                           { label: 'MINT_P', addr: pdaPreview?.primeMint },
                         ].map(p => (
                           <div key={p.label} className="flex flex-col gap-1">
                              <span className="text-[9px] font-mono text-purple-400/40 tracking-[0.2em]">{p.label}</span>
                              <span className="text-[9px] font-mono text-white/20 truncate">{p.addr || '0x0000...0000'}</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   <button
                     onClick={handleDeploy}
                     disabled={creating || !wallet.connected || !vaultId}
                     className="group relative w-full overflow-hidden rounded-2xl bg-white px-6 py-5 text-sm font-bold text-black transition-all hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-20 shadow-[0_0_40px_rgba(255,255,255,0.05)]"
                   >
                     <div className="flex items-center justify-center gap-3">
                       {creating ? (
                         <Loader2 className="h-5 w-5 animate-spin" />
                       ) : (
                         <Server className="h-5 w-5" strokeWidth={2.5} />
                       )}
                       <span className="uppercase tracking-[0.1em]">{creating ? 'Initializing Infrastructure…' : 'Finalize & Deploy Market'}</span>
                     </div>
                   </button>

                   <div className="flex items-start gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                      <Info className="h-4 w-4 text-white/20 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-white/30 leading-relaxed italic">
                         Deployment creates a globally unique credit pool on Solana. This action is immutable and protocol-authoritative.
                      </p>
                   </div>
                </div>
             </div>

             {/* Deployment Steps Visual */}
             <div className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-8 shadow-sm">
                <h3 className="mb-6 font-mono text-[10px] uppercase tracking-[0.3em] text-white/20">Operational Workflow</h3>
                <div className="space-y-6">
                   {[
                     { step: '01', label: 'Configure Core Identity', status: vaultId ? 'complete' : 'active' },
                     { step: '02', label: 'Define Capital Waterfall', status: 'pending' },
                     { step: '03', label: 'Initialize Reserve Logic', status: 'pending' },
                     { step: '04', label: 'Maturity & AMM Params', status: 'pending' },
                     { step: '05', label: 'On-Chain Sequence Execution', status: 'pending' },
                   ].map(s => (
                     <div key={s.step} className="flex items-center gap-4">
                        <div className={`h-8 w-8 rounded-full border flex items-center justify-center font-mono text-[10px] ${s.status === 'complete' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : s.status === 'active' ? 'border-purple-500/40 bg-purple-500/10 text-purple-400' : 'border-white/10 text-white/10'}`}>
                           {s.status === 'complete' ? <ShieldCheck className="h-3.5 w-3.5" /> : s.step}
                        </div>
                        <span className={`text-[11px] font-mono ${s.status === 'complete' ? 'text-white/40' : s.status === 'active' ? 'text-white/80' : 'text-white/10'}`}>{s.label}</span>
                     </div>
                   ))}
                </div>
             </div>

          </div>
        </div>

        {/* Footer Technical Note */}
        <div className="flex items-center justify-between border-t border-white/[0.06] pt-8 opacity-20">
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                 <Settings2 className="h-4 w-4" />
                 <span className="font-mono text-[9px] uppercase tracking-widest">Protocol Version: 0.1.0</span>
              </div>
              <div className="flex items-center gap-2">
                 <Lock className="h-4 w-4" />
                 <span className="font-mono text-[9px] uppercase tracking-widest">Encrypted Session: Active</span>
              </div>
           </div>
           <div className="font-mono text-[9px] uppercase tracking-widest">PRISM Credit Protocol · Mission Control Center</div>
        </div>

      </div>
    </div>
  );
}
