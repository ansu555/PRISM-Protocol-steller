'use client';

/**
 * PRISM Collateral Oracle hooks.
 *
 * Replaces hooks/useIkaCollateral.tsx for the Stellar build (§8.1).
 * The IKA dWallet flow is gone; collateral is now attested by the
 * PRISM-hosted Ed25519 oracle (§6.6 of stellar-migration-plan.md).
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  CollateralAttestation,
  CollateralStatusName,
  getCollateralAttestation,
} from '@/app/lib/collateral';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface AttachCollateralParams {
  loanId: number;
  /** Ed25519 oracle pubkey hex that will be registered on-chain */
  oraclePubkeyHex: string;
}

export interface VerifyCollateralParams {
  loanId: number;
  nonce: bigint;
  chainId?: number;
  assetAddressHex?: string;
  amountUsdMicro?: bigint;
  valuedAtTs?: bigint;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch oracle pubkey (so the UI can display it and pass to attach_collateral)
// ─────────────────────────────────────────────────────────────────────────────

export function useCollateralOraclePubkey() {
  return useQuery({
    queryKey: ['collateral-oracle-pubkey'],
    queryFn: async (): Promise<string> => {
      // The oracle returns its pubkey on any sign request — fetch with a dummy
      // nonce=0 on loan_id=0 just to get the pubkey. Status=attached, nonce=0
      // will fail on-chain (nonce must be > 0) but the pubkey extraction is valid.
      const res = await fetch('/api/collateral-oracle/attest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loan_id: 0, nonce: '1', status: 'attached' }),
      });
      if (!res.ok) throw new Error('Failed to fetch collateral oracle pubkey');
      const data = await res.json();
      return data.oracle_pubkey_hex as string;
    },
    staleTime: Infinity,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Get collateral attestation from oracle
// ─────────────────────────────────────────────────────────────────────────────

export function useGetCollateralAttestation() {
  return useMutation({
    mutationFn: async (
      params: VerifyCollateralParams & { status?: CollateralStatusName },
    ): Promise<CollateralAttestation> => {
      return getCollateralAttestation({
        loanId: params.loanId,
        nonce: params.nonce,
        chainId: params.chainId,
        assetAddressHex: params.assetAddressHex,
        amountUsdMicro: params.amountUsdMicro,
        valuedAtTs: params.valuedAtTs,
        status: params.status ?? 'attached',
      });
    },
    onError: (err) => toast.error(`Collateral oracle error: ${String(err)}`),
  });
}
