'use client';

import { AlertTriangle, Database, Landmark, RefreshCw } from 'lucide-react';

import { formatNavQ, formatUsdc, shortKey, stateName, toBigInt } from '@/app/lib/format';
import { LoanList } from '@/components/simulation/LoanList';
import { VaultSelector } from '@/components/simulation/VaultSelector';
import { useSelectedVaultId } from '@/hooks/useSelectedVault';
import { useVaultState } from '@/hooks/useVaultState';

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-2 font-mono text-xl text-white">{value}</div>
      {detail ? <div className="mt-1 truncate font-mono text-[11px] text-white/35">{detail}</div> : null}
    </div>
  );
}

export function VaultStateDashboard() {
  const vaultState = useVaultState();
  const { vaultId } = useSelectedVaultId();
  const data = vaultState.data;

  if (vaultState.isLoading) {
    return (
      <section className="rounded-lg border border-white/10 bg-black/30 p-5">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading on-chain vault accounts
        </div>
      </section>
    );
  }

  if (vaultState.error) {
    return (
      <section className="rounded-lg border border-red-400/20 bg-red-400/10 p-5 text-sm text-red-100">
        <AlertTriangle className="mb-3 h-5 w-5" />
        {(vaultState.error as Error).message}
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-label="Vault state dashboard">
      <div className="rounded-lg border border-white/10 bg-black/30 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Database className="h-4 w-4 text-white/60" />
              Vault State
            </div>
            <div className="mt-1 font-mono text-xs text-white/40">
              {data ? shortKey(data.vaultPda) : `Vault #${vaultId} not initialized`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <VaultSelector />
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs uppercase text-white/70">
              {stateName(data?.vault?.state)}
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Metric
            label="Vault Reserve"
            value={`${formatUsdc(data?.reserveBalance ?? 0n)} USDC`}
            detail={data ? shortKey(data.reservePda) : undefined}
          />
          <Metric
            label="Loss Bucket"
            value={`${formatUsdc(data?.lossBucketBalance ?? 0n)} USDC`}
            detail={data ? shortKey(data.lossBucketPda) : undefined}
          />
          <Metric
            label="Outstanding Principal"
            value={`${formatUsdc(toBigInt(data?.vault?.totalLoaned ?? 0))} USDC`}
            detail={data?.loan ? `Loan ${shortKey(data.loanPda)}` : 'Loan not initialized'}
          />
        </div>
      </div>

      <LoanList />

      <div className="grid gap-3 xl:grid-cols-3">
        {data?.tranches.map((tranche) => (
          <article
            key={tranche.key}
            className={[
              'rounded-lg border bg-black/30 p-5',
              tranche.border,
              tranche.bg,
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Landmark className={['h-4 w-4', tranche.tone].join(' ')} />
                <h3 className="text-sm font-semibold text-white">{tranche.label}</h3>
              </div>
              <span className="font-mono text-[11px] text-white/45">{shortKey(tranche.pda)}</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-white/45">NAV</div>
                <div className="mt-1 font-mono text-lg text-white">
                  {formatNavQ(tranche.navPerShareQ)}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/45">TVL</div>
                <div className="mt-1 font-mono text-lg text-white">
                  {formatUsdc(tranche.totalAssets)}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/45">Shares</div>
                <div className="mt-1 font-mono text-sm text-white/80">
                  {formatUsdc(tranche.totalSupply)}
                </div>
              </div>
              <div>
                <div className="text-xs text-white/45">AMM USDC</div>
                <div className="mt-1 font-mono text-sm text-white/80">
                  {formatUsdc(tranche.ammQuoteBalance)}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
