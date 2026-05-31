'use client';

// Collateral locking flow for the borrower:
//   1. attach_collateral  — registers the oracle pubkey on-chain (Pending)
//   2. oracle attest       — oracle signs the lock message
//   3. verify_collateral  — submits attestation on-chain (Pending → Attached)
//
// After Attached, disburse_loan is unblocked.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import { getCollateralAttestation } from '@/app/lib/collateral';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { VAULT_ID } from '@/app/lib/constants';

// Chain IDs supported (mirrors prism-core §6.6)
export const CHAIN_OPTIONS = [
  { id: 3, label: 'XLM (Stellar)', symbol: 'XLM' },
  { id: 4, label: 'USDC (Stellar)', symbol: 'USDC' },
] as const;

export interface CollateralFlowParams {
  loanId: number;
  chainId: number;
  amountUsd: number;           // human-readable USD value
  assetAddressHex?: string;    // 32-byte hex; defaults to zeros for Stellar-native
}

// ── Read current collateral record from chain ─────────────────────────────────
export function useCollateralRecord(loanId: number | undefined) {
  return useQuery({
    queryKey: ['collateral-record', loanId],
    enabled: loanId != null,
    refetchInterval: 8_000,
    queryFn: async () => {
      if (loanId == null) return null;
      const core = getCoreClient();
      const rec = await core
        .read<Record<string, unknown> | null>('get_collateral', [
          nativeToScVal(loanId, { type: 'u32' }),
        ])
        .catch(() => null);
      if (!rec) return null;

      const rawStatus = rec.status;
      const status: string = Array.isArray(rawStatus)
        ? String(rawStatus[0])
        : typeof rawStatus === 'string'
        ? rawStatus
        : Object.keys(rawStatus ?? {})[0] ?? 'Unknown';

      return {
        loanId: Number(rec.loan_id ?? loanId),
        borrower: String(rec.borrower ?? ''),
        amountUsdMicro: BigInt(String(rec.amount_usd_micro ?? '0')),
        valuedAtTs: BigInt(String(rec.valued_at_ts ?? '0')),
        status,  // 'Pending' | 'Attached' | 'Released' | 'Liquidated'
      };
    },
  });
}

// ── Step 1 + 2 + 3 combined: attach → oracle attest → verify ─────────────────
export function useLockCollateral() {
  const wallet = useStellarWallet();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ loanId, chainId, amountUsd, assetAddressHex }: CollateralFlowParams) => {
      if (!wallet.address) throw new Error('Wallet not connected');

      const core = getCoreClient();

      // 1. Get oracle pubkey from the oracle API
      const nonce = BigInt(Math.floor(Date.now()));
      const amountUsdMicro = BigInt(Math.round(amountUsd * 1_000_000));
      const valuedAtTs = BigInt(Math.floor(Date.now() / 1000));

      // Fetch attestation first to get the oracle pubkey for attach_collateral
      const attestation = await getCollateralAttestation({
        loanId,
        chainId,
        assetAddressHex: assetAddressHex ?? '00'.repeat(32),
        amountUsdMicro,
        valuedAtTs,
        nonce,
        status: 'attached',
      });

      const oraclePubkeyHex = Buffer.from(attestation.oraclePubkey).toString('hex');

      // 2. Build a signer from the wallet's Freighter signing capability
      //    For simulation we use the borrower's session keypair via useIdentity.
      //    For real wallet: we need to sign with Freighter — use a server-side route.
      //    Here we call a server action that signs with the borrower's known keypair.
      const attachRes = await fetch('/api/collateral/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId, oraclePubkeyHex, borrowerAddress: wallet.address }),
      });
      if (!attachRes.ok) {
        const e = await attachRes.json();
        throw new Error(e.error ?? 'attach_collateral failed');
      }

      // 3. verify_collateral with the oracle attestation
      const verifyRes = await fetch('/api/collateral/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId,
          messageHex: Buffer.from(attestation.message).toString('hex'),
          signatureHex: Buffer.from(attestation.signature).toString('hex'),
          borrowerAddress: wallet.address,
        }),
      });
      if (!verifyRes.ok) {
        const e = await verifyRes.json();
        throw new Error(e.error ?? 'verify_collateral failed');
      }

      return await verifyRes.json();
    },
    onSuccess: (_, { loanId }) => {
      qc.invalidateQueries({ queryKey: ['collateral-record', loanId] });
      qc.invalidateQueries({ queryKey: ['on-chain-loans'] });
    },
  });
}
