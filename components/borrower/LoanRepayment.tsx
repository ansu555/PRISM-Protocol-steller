'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Banknote, CheckCircle2, Loader2 } from 'lucide-react';

import { VAULT_ID } from '@/app/lib/constants';
import { getCoreClient, nativeToScVal as ntsv, addr } from '@/app/lib/stellar';
import { useIdentity } from '@/hooks/useIdentity';

interface LoanRepaymentProps {
  loanId: number;
  vaultId?: number;
}

export function LoanRepayment({ loanId, vaultId = VAULT_ID }: LoanRepaymentProps) {
  const identity = useIdentity();
  const [repayAmount, setRepayAmount] = useState('');
  const [loading, setLoading] = useState(false);

  async function settleOnChain(amountUsd: number) {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      // 7-decimal USDC: 1 USDC = 10_000_000 base units
      const amountBaseUnits = BigInt(Math.round(amountUsd * 10_000_000));
      const borrower = identity.identities.borrower.keypair;
      const core = getCoreClient();

      const result = await core.invoke(borrower, 'repay_loan', [
        addr(borrower.publicKey()),
        ntsv(vaultId, { type: 'u32' }),
        ntsv(loanId, { type: 'u32' }),
        ntsv(amountBaseUnits, { type: 'i128' }),
      ]);

      toast.success('Repayment confirmed', {
        description: `Tx: ${result.hash.slice(0, 16)}…`,
      });
      setRepayAmount('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message.slice(0, 200));
    } finally {
      setLoading(false);
    }
  }

  function handleManualRepay() {
    const parsed = parseFloat(repayAmount);
    void settleOnChain(parsed);
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/40 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Banknote className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="font-medium text-white text-sm">Repay Loan #{loanId}</h3>
          <p className="text-xs text-white/40">Vault {vaultId}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <input
            type="number"
            value={repayAmount}
            onChange={(e) => setRepayAmount(e.target.value)}
            placeholder="Amount in USDC"
            className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-white/20 uppercase">
            USDC
          </div>
        </div>
      </div>

      <button
        onClick={handleManualRepay}
        disabled={loading || !repayAmount}
        className="mt-4 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(16,185,129,0.05)]"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Complete Repayment
          </>
        )}
      </button>

      <p className="mt-3 text-xs text-center text-white/30 leading-relaxed italic">
        Repayment will restore the vault&apos;s USDC reserves.
      </p>
    </div>
  );
}
