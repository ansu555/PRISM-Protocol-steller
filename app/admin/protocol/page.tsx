'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  Settings2,
  XCircle,
} from 'lucide-react';
import { useWallet, useConnection } from '@/components/providers/stellar-wallet-context';
import { toast } from 'sonner';

import { formatUsdc } from '@/app/lib/format';
import { useVaultState } from '@/hooks/useVaultState';
import { useAdminVault } from '@/components/admin/AdminVaultContext';

type StepStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

const STEPS = [
  { label: 'Global Config',   desc: 'Initialize protocol config PDA' },
  { label: 'Vault + Reserves', desc: 'Create vault, USDC reserve, and loss bucket' },
  { label: 'Tranches',        desc: 'Init Prime, Core, Alpha tranche mints' },
  { label: 'Loan',            desc: 'Seed initial loan account' },
  { label: 'AMM Pools',       desc: 'Initialize constant-product AMM pools' },
];

export default function ProtocolPage() {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { vaultId, addLog } = useAdminVault();
  const vaultState = useVaultState(vaultId);
  const vd = vaultState.data;

  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(STEPS.map(() => 'idle'));
  const [running, setRunning] = useState(false);
  const [loanPrincipal, setLoanPrincipal] = useState('20000');
  const [loanApr, setLoanApr] = useState('8');
  const [loanMaturity, setLoanMaturity] = useState('365');
  const [localLog, setLocalLog] = useState<string[]>([]);

  function log(msg: string) {
    const ts = `[${new Date().toLocaleTimeString()}] ${msg}`;
    setLocalLog((p) => [ts, ...p].slice(0, 30));
    addLog(msg);
  }

  function setStep(i: number, s: StepStatus) {
    setStepStatuses((prev) => { const n = [...prev]; n[i] = s; return n; });
  }

  function notMigrated(): never {
    throw new Error('Not yet migrated to Stellar — use the simulation panel instead.');
  }

  async function step0_GlobalConfig(): Promise<boolean> {
    setStep(0, 'running');
    try {
      notMigrated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ Global config: ${msg}`);
      setStep(0, 'error');
      return false;
    }
  }

  async function step1_Vault(): Promise<boolean> {
    setStep(1, 'running');
    try {
      notMigrated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ Vault: ${msg}`);
      setStep(1, 'error');
      return false;
    }
  }

  async function step2_Tranches(): Promise<boolean> {
    setStep(2, 'running');
    try {
      notMigrated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ Tranches: ${msg}`);
      setStep(2, 'error');
      return false;
    }
  }

  async function step3_Loan(): Promise<boolean> {
    if (!wallet.connected) { toast.error('Connect wallet for loan setup'); return false; }
    setStep(3, 'running');
    try {
      notMigrated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ Loan: ${msg}`);
      setStep(3, 'error');
      return false;
    }
  }

  async function step4_AmmPools(): Promise<boolean> {
    setStep(4, 'running');
    try {
      notMigrated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`✗ AMM: ${msg}`);
      setStep(4, 'error');
      return false;
    }
  }

  async function runFullSetup() {
    if (!wallet.connected) { toast.error('Connect wallet first'); return; }
    setRunning(true);
    setStepStatuses(STEPS.map(() => 'idle'));
    setLocalLog([]);
    log('Starting full protocol setup…');
    try {
      if (!await step0_GlobalConfig()) return;
      if (!await step1_Vault()) return;
      if (!await step2_Tranches()) return;
      if (!await step3_Loan()) return;
      if (!await step4_AmmPools()) return;
      log('');
      log('🎉 Protocol ready — investors can now deposit');
      toast.success('Protocol initialized!');
      vaultState.refetch();
    } catch {
      toast.error('Setup failed — check the log');
    } finally {
      setRunning(false);
    }
  }

  const stepFns = [step0_GlobalConfig, step1_Vault, step2_Tranches, step3_Loan, step4_AmmPools];

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-[15px] font-semibold text-white">Protocol Setup</h1>
        <p className="mt-0.5 font-mono text-[10px] text-white/30">
          Initialization wizard · Global config · Vault #{vaultId}
        </p>
      </div>

      {/* Protocol state overview */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: 'Config',  value: vd?.config ? 'Initialized' : 'Not initialized', ok: !!vd?.config },
          { label: 'Vault',   value: vd?.vault  ? 'Active'      : 'Not initialized', ok: !!vd?.vault  },
          { label: 'Tranches',value: (vd?.tranches ?? []).filter(t => t.account !== null).length + '/3 active', ok: (vd?.tranches ?? []).some(t => t.account !== null) },
          { label: 'Loan',    value: vd?.loan   ? 'Exists'      : 'Not initialized', ok: !!vd?.loan   },
        ].map(({ label, value, ok }) => (
          <div key={label} className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707] px-4 py-4">
            <div className={`absolute inset-y-0 left-0 w-[2px] rounded-l-xl ${ok ? 'bg-emerald-500' : 'bg-white/10'}`} />
            <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-white/22">{label}</div>
            <div className={`font-mono text-[13px] font-medium ${ok ? 'text-emerald-300' : 'text-white/35'}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        {/* Setup steps */}
        <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
          <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-white/25" strokeWidth={1.5} />
              <span className="text-[12px] font-medium text-white/70">Initialization Wizard</span>
            </div>
            <button
              onClick={runFullSetup}
              disabled={running || !wallet.connected}
              className="flex items-center gap-2 rounded-lg border border-purple-500/25 bg-purple-500/[0.08] px-4 py-1.5 font-mono text-[11px] text-purple-200 transition-all hover:bg-purple-500/[0.14] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {running ? 'Running…' : 'Run Full Setup'}
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Step pipeline */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {STEPS.map((step, i) => {
                const s = stepStatuses[i];
                return (
                  <div key={step.label} className="flex items-center gap-1 shrink-0">
                    <div className={`flex flex-col items-center gap-1.5 rounded-lg border px-3 py-2.5 min-w-[90px] text-center transition-all ${
                      s === 'done' || s === 'skipped' ? 'border-emerald-500/20 bg-emerald-500/[0.05]' :
                      s === 'running' ? 'border-yellow-500/30 bg-yellow-500/[0.06]' :
                      s === 'error'   ? 'border-rose-500/25 bg-rose-500/[0.05]'    :
                      'border-white/[0.06] bg-white/[0.02]'
                    }`}>
                      {s === 'done' || s === 'skipped' ? <CheckCircle2 className="h-4 w-4 text-emerald-400" strokeWidth={1.5} /> :
                       s === 'running' ? <Loader2 className="h-4 w-4 animate-spin text-yellow-400" /> :
                       s === 'error'   ? <XCircle className="h-4 w-4 text-rose-400" strokeWidth={1.5} /> :
                       <Circle className="h-4 w-4 text-white/15" strokeWidth={1.5} />}
                      <span className={`font-mono text-[9px] leading-tight ${
                        s === 'done' || s === 'skipped' ? 'text-emerald-300' :
                        s === 'running' ? 'text-yellow-300 animate-pulse' :
                        s === 'error'   ? 'text-rose-300' :
                        'text-white/30'
                      }`}>{step.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="h-px w-3 bg-white/[0.06] shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Individual step buttons */}
            <div className="space-y-1.5">
              <div className="font-mono text-[9px] uppercase tracking-widest text-white/22 px-1 mb-2">Manual Controls</div>
              {STEPS.map((step, i) => (
                <button
                  key={step.label}
                  onClick={() => stepFns[i]()}
                  disabled={running || !wallet.connected}
                  className="flex w-full items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-2.5 text-left transition-all hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <div>
                    <div className="text-[11px] font-medium text-white/65">{step.label}</div>
                    <div className="font-mono text-[9px] text-white/25">{step.desc}</div>
                  </div>
                  <div className={`font-mono text-[10px] ${
                    stepStatuses[i] === 'done' || stepStatuses[i] === 'skipped' ? 'text-emerald-400' :
                    stepStatuses[i] === 'error' ? 'text-rose-400' :
                    stepStatuses[i] === 'running' ? 'text-yellow-400 animate-pulse' :
                    'text-white/15'
                  }`}>
                    {stepStatuses[i] === 'done' ? '✓ done' :
                     stepStatuses[i] === 'skipped' ? '✓ skipped' :
                     stepStatuses[i] === 'error' ? '✗ error' :
                     stepStatuses[i] === 'running' ? '◉ running' : '→ run'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Config params */}
        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
            <div className="border-b border-white/[0.05] px-5 py-3.5">
              <span className="text-[12px] font-medium text-white/70">Loan Parameters</span>
              <span className="ml-2 font-mono text-[9px] text-white/28">used in Step 4</span>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Principal (USDC)', value: loanPrincipal, set: setLoanPrincipal },
                { label: 'APR (%)',           value: loanApr,      set: setLoanApr       },
                { label: 'Maturity (days)',   value: loanMaturity, set: setLoanMaturity  },
              ].map(({ label, value, set }) => (
                <div key={label} className="space-y-1">
                  <label className="font-mono text-[9px] uppercase tracking-widest text-white/28">{label}</label>
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 font-mono text-[12px] text-white focus:border-white/20 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Current vault state */}
          {vd?.vault && (
            <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
              <div className="border-b border-white/[0.05] px-5 py-3.5">
                <span className="text-[12px] font-medium text-white/70">Vault #{vaultId} State</span>
              </div>
              <div className="p-5 space-y-2">
                {[
                  { label: 'Reserve', value: `$${formatUsdc(vd.reserveBalance, 2)}` },
                  { label: 'Loss Bucket', value: `$${formatUsdc(vd.lossBucketBalance, 2)}` },
                  { label: 'Core Program', value: String(vd.programIds.core).slice(0, 12) + '…' },
                  { label: 'AMM Program', value: String(vd.programIds.amm).slice(0, 12) + '…' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between">
                    <span className="font-mono text-[10px] text-white/28">{label}</span>
                    <span className="font-mono text-[10px] text-white/55">{value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Setup log */}
      {localLog.length > 0 && (
        <section className="rounded-xl border border-white/[0.06] bg-[#070707] p-5">
          <div className="mb-3 font-mono text-[9px] uppercase tracking-widest text-white/22">Setup Log</div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {localLog.map((e, i) => (
              <div key={i} className={`font-mono text-[10px] leading-relaxed ${
                e.includes('✓') ? 'text-emerald-400/70' :
                e.includes('✗') ? 'text-rose-400/70' :
                e.includes('🎉') ? 'text-purple-300/80' :
                'text-white/30'
              }`}>{e}</div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
