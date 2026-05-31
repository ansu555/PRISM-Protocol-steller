'use client';

import { ShieldCheck } from 'lucide-react';

interface Props {
  vaultId: number;
  loanId: number;
  defaultCollateralUsd?: number;
}

export function CollateralOnboarding({ vaultId, loanId, defaultCollateralUsd = 0 }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/5">
          <ShieldCheck className="h-5 w-5 text-amber-300" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-lg text-white">
            Register verified collateral
          </h3>
          <p className="max-w-md text-sm leading-relaxed text-white/60">
            Vault {vaultId}, Loan {loanId}: attach a Stellar-native USDC or XLM
            collateral record valued at ${defaultCollateralUsd.toLocaleString()} or more.
            PRISM&apos;s signed collateral oracle verifies the record before
            protocol-side disbursement is enabled.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
            Soroban attestation flow · Stellar testnet
          </p>
        </div>
      </div>
    </div>
  );
}
