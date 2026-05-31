'use client';

// Collateral locking flows for PRISM borrowers.
//
// Two paths share the same prism-core contract calls at the end:
//   A) Stellar-native (XLM / Stellar USDC) — PRISM-hosted oracle signs
//   B) IKA cross-chain (BTC / ETH)          — IKA's MPC oracle signs
//
// Both paths end with attach_collateral + verify_collateral on prism-core.
// The contract doesn't care which oracle signed — it just checks the allowlist.
//
// Steps (both paths):
//   1. attach_collateral  — registers oracle pubkey on-chain (state=Pending)
//   2. oracle attest       — oracle signs the 73-byte col_atts message
//   3. verify_collateral  — submits attestation on-chain (state=Attached)

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getCoreClient, nativeToScVal, freighterSigner, addr } from '@/app/lib/stellar';
import { getCollateralAttestation } from '@/app/lib/collateral';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { VAULT_ID } from '@/app/lib/constants';
import {
  createIkaDWallet,
  getIkaDWalletStatus,
  getIkaOraclePubkeyHex,
  requestIkaAttestation,
  ikaChainId,
  type IkaChain,
  type IkaDWallet,
} from '@/app/lib/ika';

// Chain IDs supported (mirrors prism-core §6.6)
export const CHAIN_OPTIONS = [
  { id: 3, label: 'XLM (Stellar)', symbol: 'XLM' },
  { id: 4, label: 'USDC (Stellar)', symbol: 'USDC' },
  { id: 0, label: 'BTC', symbol: 'BTC' },
  { id: 1, label: 'ETH', symbol: 'ETH' },
] as const;

export interface CollateralFlowParams {
  loanId: number;
  chainId: number;
  amountUsd: number;
  assetAddressHex?: string;
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
        status,
      };
    },
  });
}

// ── Stellar-native path (PRISM-hosted oracle) ────────────────────────────────

export function useLockCollateral() {
  const wallet = useStellarWallet();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ loanId, chainId, amountUsd, assetAddressHex }: CollateralFlowParams) => {
      if (!wallet.address) throw new Error('Wallet not connected');

      const nonce = BigInt(Math.floor(Date.now()));
      const amountUsdMicro = BigInt(Math.round(amountUsd * 1_000_000));
      const valuedAtTs = BigInt(Math.floor(Date.now() / 1000));

      // 1. Get PRISM oracle attestation (signed server-side)
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
      const oraclePubkeyBytes = Buffer.from(oraclePubkeyHex, 'hex');

      // Build a Freighter signer from the connected wallet
      const signer = freighterSigner(wallet.address, wallet.signTransaction);
      const core = getCoreClient();

      // 2. attach_collateral — signed by the borrower via Freighter
      await core.invoke(signer, 'attach_collateral', [
        addr(wallet.address),
        nativeToScVal(loanId, { type: 'u32' }),
        nativeToScVal(oraclePubkeyBytes, { type: 'bytes' }),
      ]);

      // 3. verify_collateral — relayer can be anyone; use borrower for simplicity
      const msgBytes = Buffer.from(attestation.message);
      const sigBytes = Buffer.from(attestation.signature);

      await core.invoke(signer, 'verify_collateral', [
        addr(wallet.address),
        nativeToScVal(loanId, { type: 'u32' }),
        nativeToScVal(msgBytes, { type: 'bytes' }),
        nativeToScVal(sigBytes, { type: 'bytes' }),
      ]);
    },
    onSuccess: (_, { loanId }) => {
      qc.invalidateQueries({ queryKey: ['collateral-record', loanId] });
      qc.invalidateQueries({ queryKey: ['on-chain-loans'] });
    },
  });
}

// ── IKA cross-chain path (BTC / ETH via IKA dWallet) ────────────────────────
//
// useIkaCollateralFlow manages local dWallet state across the multi-step UI.
// It does NOT use useMutation so the UI can drive each step independently.

export interface IkaCollateralFlowState {
  dWallet: IkaDWallet | null;
  isCreating: boolean;
  isAttesting: boolean;
  createDWallet: (chain: IkaChain) => Promise<void>;
  pollAndAttest: (amountUsd: number) => Promise<void>;
  reset: () => void;
}

export function useIkaCollateralFlow(loanId: number): IkaCollateralFlowState {
  const wallet = useStellarWallet();
  const qc = useQueryClient();
  const [dWallet, setDWallet] = useState<IkaDWallet | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isAttesting, setIsAttesting] = useState(false);

  async function createDWallet(chain: IkaChain) {
    if (!wallet.address) {
      toast.error('Connect your Stellar wallet first.');
      throw new Error('Wallet not connected');
    }
    setIsCreating(true);
    try {
      const created = await createIkaDWallet(chain, wallet.address);
      setDWallet(created);
      toast.success(`${chain} dWallet created — send funds to the deposit address.`);
    } catch (err) {
      toast.error(`IKA dWallet creation failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }

  async function pollAndAttest(amountUsd: number) {
    if (!dWallet) throw new Error('No dWallet — call createDWallet first');
    if (!wallet.address) {
      toast.error('Connect your Stellar wallet first.');
      throw new Error('Wallet not connected');
    }

    setIsAttesting(true);
    try {
      // 1. Poll IKA for the latest funding status
      const status = await getIkaDWalletStatus(dWallet.dwalletId);
      if (!status.funded) {
        toast.error('Deposit not yet confirmed on-chain. Try again after a few minutes.');
        throw new Error('dWallet not funded');
      }
      setDWallet({ ...dWallet, confirmedBalance: status.confirmedBalance, funded: true });

      // 2. Get IKA oracle pubkey (needs to be in the allowlist already)
      const oraclePubkeyHex = await getIkaOraclePubkeyHex();
      const oraclePubkeyBytes = Buffer.from(oraclePubkeyHex, 'hex');

      const signer = freighterSigner(wallet.address, wallet.signTransaction);
      const core = getCoreClient();

      // 3. attach_collateral — signed by borrower via Freighter
      await core.invoke(signer, 'attach_collateral', [
        addr(wallet.address),
        nativeToScVal(loanId, { type: 'u32' }),
        nativeToScVal(oraclePubkeyBytes, { type: 'bytes' }),
      ]);

      // 4. Request IKA attestation
      const nonce = BigInt(Math.floor(Date.now()));
      const amountUsdMicro = BigInt(Math.round(amountUsd * 1_000_000));
      const chainId = ikaChainId(dWallet.chain);

      const attestation = await requestIkaAttestation({
        dwalletId: dWallet.dwalletId,
        loanId,
        chainId,
        amountUsdMicro,
        nonce,
      });

      // 5. verify_collateral — signed by borrower via Freighter
      const msgBytes = Buffer.from(attestation.messageHex, 'hex');
      const sigBytes = Buffer.from(attestation.signatureHex, 'hex');

      await core.invoke(signer, 'verify_collateral', [
        addr(wallet.address),
        nativeToScVal(loanId, { type: 'u32' }),
        nativeToScVal(msgBytes, { type: 'bytes' }),
        nativeToScVal(sigBytes, { type: 'bytes' }),
      ]);

      toast.success(`${dWallet.chain} collateral attached to loan #${loanId}.`);
      qc.invalidateQueries({ queryKey: ['collateral-record', loanId] });
      qc.invalidateQueries({ queryKey: ['on-chain-loans'] });
    } catch (err) {
      toast.error(`IKA attestation failed: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    } finally {
      setIsAttesting(false);
    }
  }

  function reset() {
    setDWallet(null);
    setIsCreating(false);
    setIsAttesting(false);
  }

  return { dWallet, isCreating, isAttesting, createDWallet, pollAndAttest, reset };
}
