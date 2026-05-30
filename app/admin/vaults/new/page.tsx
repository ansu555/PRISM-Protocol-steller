'use client';

import { useState } from 'react';
import { Activity, ArrowLeft, CheckCircle2, Layers, Loader2, Shield, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { PRISM_CORE_CONTRACT_ID, TrancheKind } from '@/app/lib/constants';
import { shortKey } from '@/app/lib/format';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { useRegisterVault, useVaultList } from '@/hooks/useVaultRegistry';

const TRANCHE_COPY = [
  { label: 'PRIME', kind: TrancheKind.Prime, color: 'text-sky-400', desc: 'Senior protected return' },
  { label: 'CORE', kind: TrancheKind.Core, color: 'text-amber-400', desc: 'Mezzanine balanced risk' },
  { label: 'ALPHA', kind: TrancheKind.Alpha, color: 'text-rose-400', desc: 'First-loss upside layer' },
] as const;

export default function NewVaultPage() {
  const router = useRouter();
  const wallet = useStellarWallet();
  const { setVaultId, addLog } = useAdminVault();
  const vaults = useVaultList();
  const registerVault = useRegisterVault();

  const [vaultId, setVaultIdInput] = useState('');
  const [name, setName] = useState('');
  const [primeApy, setPrimeApy] = useState('5.0');
  const [coreApy, setCoreApy] = useState('8.0');
  const [alphaApy, setAlphaApy] = useState('15.0');
  const [loanPrincipal, setLoanPrincipal] = useState('20000');
  const [maturityDays, setMaturityDays] = useState('365');

  const nextVaultId = vaults.data?.length
    ? Math.max(...vaults.data.map((vault) => vault.vault_id)) + 1
    : 1;
  const id = Number(vaultId || nextVaultId);

  async function createVault() {
    if (!name.trim()) return toast.error('Name the vault first');
    if (!Number.isFinite(id) || id < 0) return toast.error('Invalid vault id');

    try {
      await registerVault.mutateAsync({
        vaultId: id,
        name: name.trim(),
        primeBps: Math.round(Number(primeApy) * 100),
        coreBps: Math.round(Number(coreApy) * 100),
        alphaBps: Math.round(Number(alphaApy) * 100),
        loanPrincipal: BigInt(Math.round(Number(loanPrincipal) * 10_000_000)),
        maturityDays: Number(maturityDays),
      });
      setVaultId(id);
      addLog(`Vault #${id} registered for Stellar cutover. On-chain initialization remains testnet-scripted.`);
      toast.success(`Vault #${id} registered`);
      router.push(`/admin/vaults/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="min-h-full bg-background p-10">
      <div className="mx-auto max-w-[1300px] space-y-10">
        <Link href="/admin/vaults" className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-white/35 hover:text-white">
          <ArrowLeft className="h-3 w-3" /> Vault Registry
        </Link>

        <header className="rounded-[2.5rem] border border-white/[0.08] bg-white/[0.02] p-10">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.08]">
              <Layers className="h-7 w-7 text-emerald-300" />
            </div>
            <div>
              <h1 className="font-display text-4xl text-white">Register Stellar Vault</h1>
              <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.28em] text-white/25">
                Contract {shortKey(PRISM_CORE_CONTRACT_ID)} · {wallet.address ? 'wallet connected' : 'connect wallet for signed setup'}
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section className="rounded-[2rem] border border-white/[0.08] bg-white/[0.02] p-8">
            <div className="grid gap-5 md:grid-cols-2">
              <label className="space-y-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Vault ID</span>
                <input value={vaultId} onChange={(event) => setVaultIdInput(event.target.value)} placeholder={String(nextVaultId)} className="w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-white outline-none" />
              </label>
              <label className="space-y-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">Vault Name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Institutional Stablecoin Credit" className="w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 text-white outline-none" />
              </label>
              {[
                ['Prime APY', primeApy, setPrimeApy],
                ['Core APY', coreApy, setCoreApy],
                ['Alpha APY', alphaApy, setAlphaApy],
                ['Loan Principal', loanPrincipal, setLoanPrincipal],
                ['Maturity Days', maturityDays, setMaturityDays],
              ].map(([label, value, setter]) => (
                <label key={label as string} className="space-y-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">{label as string}</span>
                  <input value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} className="w-full rounded-2xl border border-white/[0.08] bg-black/30 px-4 py-3 font-mono text-white outline-none" />
                </label>
              ))}
            </div>

            <button
              onClick={createVault}
              disabled={registerVault.isPending}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-6 py-4 font-mono text-[11px] font-bold uppercase tracking-widest text-black transition hover:bg-white/90 disabled:opacity-40"
            >
              {registerVault.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Register Vault
            </button>
          </section>

          <aside className="space-y-4">
            {TRANCHE_COPY.map((tranche) => (
              <div key={tranche.kind} className="rounded-3xl border border-white/[0.06] bg-black/30 p-6">
                <div className={`font-display text-2xl ${tranche.color}`}>{tranche.label}</div>
                <p className="mt-2 text-sm text-white/40">{tranche.desc}</p>
              </div>
            ))}
            <div className="rounded-3xl border border-amber-400/15 bg-amber-400/[0.06] p-6">
              <div className="mb-3 flex items-center gap-2 text-amber-200">
                <Shield className="h-4 w-4" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Cutover Note</span>
              </div>
              <p className="text-sm leading-6 text-amber-100/60">
                This page registers dashboard metadata. Admin-signed Soroban initialization is intentionally left to testnet scripts while mainnet remains undeployed.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
