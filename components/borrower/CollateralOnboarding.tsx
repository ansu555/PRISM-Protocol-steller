'use client';

// CollateralOnboarding was the IKA cross-chain collateral surface (Sui dWallet
// DKG, BTC funding QR codes, oracle attestation). IKA is dropped in the
// Stellar build — this placeholder keeps the import surface so BorrowingWorkflow
// still mounts, and surfaces a clear message about why the feature is gone.

import { ShieldOff } from 'lucide-react';

interface Props {
  vaultId: number;
  loanId: number;
  defaultCollateralUsd?: number;
}

export function CollateralOnboarding({ vaultId, loanId }: Props) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/5">
          <ShieldOff className="h-5 w-5 text-amber-300" strokeWidth={1.5} />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-lg text-white">
            Cross-chain collateral unavailable
          </h3>
          <p className="max-w-md text-sm leading-relaxed text-white/60">
            Vault {vaultId}, Loan {loanId}: PRISM&apos;s IKA cross-chain
            collateral (BTC/ETH dWallets) was removed in the Stellar port — IKA
            doesn&apos;t yet support Stellar-side attestations. Use
            Stellar-native USDC or XLM as collateral instead, or check back
            once an MPC custody provider ships Stellar support.
          </p>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/30">
            v1 cut — see docs for the roadmap.
          </p>
        </div>
      </div>
    </div>
  );
}
