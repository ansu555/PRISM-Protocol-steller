'use client';

import { AlertTriangle, CheckCircle2, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTrustlineCheck } from '@/hooks/useTrustlineCheck';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

export function TrustlineBanner() {
  const wallet = useStellarWallet();
  const { missing, checked, adding, addMissingTrustlines } = useTrustlineCheck();
  const [dismissed, setDismissed] = useState(false);

  // Only show when wallet is connected, check is done, and there are missing trustlines
  if (!wallet.connected || !checked || missing.length === 0 || dismissed) return null;

  async function handleAdd() {
    try {
      await addMissingTrustlines();
      toast.success('Trustlines added — you can now deposit and receive tokens');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add trustlines');
    }
  }

  return (
    <div className="mx-auto w-full px-1 pb-2">
      <div className="flex items-center gap-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />

        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] font-semibold text-amber-300 uppercase tracking-wider">
            Trustlines required
          </p>
          <p className="mt-0.5 text-xs text-amber-300/60">
            Your wallet is missing{' '}
            <span className="font-semibold text-amber-200">
              {missing.map(a => a.code).join(', ')}
            </span>
            {' '}— add them to deposit, receive pTokens, and repay loans.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-black hover:bg-amber-300 disabled:opacity-60 transition-all"
          >
            {adding ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Adding…</>
            ) : (
              <><CheckCircle2 className="h-3 w-3" /> Add Trustlines</>
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-lg p-1.5 text-amber-400/50 hover:text-amber-300 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
