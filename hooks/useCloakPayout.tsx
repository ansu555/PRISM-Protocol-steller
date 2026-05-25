'use client';

// Cloak shielded-payout oracle integration — Stellar build.
//
// - useCloakPayout(vaultId, seq) reads CloakPayoutRecord via get_cloak_payout
// - useRecordCloakPayout() fetches an attestation, builds a single Soroban
//   contract call, signs through the user's wallet, polls for settlement
// - useCloakViewingKeys() is a session-store backed read of the most recent
//   shielding's viewing keys

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Buffer } from 'buffer';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import { NETWORK_PASSPHRASE } from '@/app/lib/constants';
import {
  buildCloakAttestationMessage,
  fetchCloakAttestation,
  type CloakAttestation,
  type CloakViewingKeys,
} from '@/app/lib/cloak';
import {
  addr,
  getCoreClient,
  getRpcServer,
  nativeToScVal,
} from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

export type CloakPayoutStatus = 'Pending' | 'Shielded';

export interface CloakPayoutState {
  vaultId: number;
  cloakOracle: Uint8Array;
  batchId: Uint8Array;
  totalShieldedAmount: bigint;
  yieldEpochTs: number;
  status: CloakPayoutStatus;
  confirmedTs: number;
}

export interface RecordCloakPayoutParams {
  vaultId: number;
  /** 32-byte oracle pubkey (raw bytes, must be in config.oracle_allowlist). */
  cloakOraclePubkey: Uint8Array;
  totalShieldedAmount: bigint;
}

export interface RecordCloakPayoutResult {
  signature: string;
  attestation: CloakAttestation;
}

export const CLOAK_VIEWING_KEYS_QUERY_KEY = ['cloak-viewing-keys'] as const;
const CLOAK_VIEWING_KEYS_STORAGE_KEY = 'prism-cloak-viewing-keys';

interface CloakSnapshot {
  batch_id: Buffer | Uint8Array;
  cloak_oracle: Buffer | Uint8Array;
  confirmed_ts: bigint;
  status: string;
  total_shielded_amount: bigint;
  vault_id: number;
  yield_epoch_ts: bigint;
}

function toBytesArray(x: unknown): Uint8Array {
  if (x instanceof Uint8Array) return x;
  if (Buffer.isBuffer(x)) return new Uint8Array(x);
  if (Array.isArray(x)) return new Uint8Array(x as number[]);
  if (typeof x === 'string') return new Uint8Array(Buffer.from(x, 'hex'));
  return new Uint8Array(0);
}

function readViewingKeysFromStorage(): CloakViewingKeys | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CLOAK_VIEWING_KEYS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CloakViewingKeys>;
    if (!parsed.prime || !parsed.core || !parsed.alpha) return null;
    return {
      prime: parsed.prime,
      core: parsed.core,
      alpha: parsed.alpha,
    };
  } catch {
    return null;
  }
}

function writeViewingKeysToStorage(keys: CloakViewingKeys) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(CLOAK_VIEWING_KEYS_STORAGE_KEY, JSON.stringify(keys));
}

/** Reads CloakPayoutRecord by (vault_id, seq). seq defaults to 1 (first batch). */
export function useCloakPayout(vaultId: number | null | undefined, seq: number = 1) {
  return useQuery<CloakPayoutState | null>({
    queryKey: ['cloak-payout', vaultId ?? 'none', seq],
    enabled: typeof vaultId === 'number',
    refetchInterval: 5_000,
    queryFn: async () => {
      if (typeof vaultId !== 'number') return null;
      const core = getCoreClient();
      const acc = await core
        .read<CloakSnapshot | null>('get_cloak_payout', [
          nativeToScVal(vaultId, { type: 'u32' }),
          nativeToScVal(seq, { type: 'u32' }),
        ])
        .catch(() => null);
      if (!acc) return null;
      return {
        vaultId: acc.vault_id,
        cloakOracle: toBytesArray(acc.cloak_oracle),
        batchId: toBytesArray(acc.batch_id),
        totalShieldedAmount: BigInt(acc.total_shielded_amount?.toString?.() ?? 0),
        yieldEpochTs: Number(acc.yield_epoch_ts ?? 0),
        status: String(acc.status) as CloakPayoutStatus,
        confirmedTs: Number(acc.confirmed_ts ?? 0),
      };
    },
  });
}

export function useCloakViewingKeys() {
  return useQuery<CloakViewingKeys | null>({
    queryKey: CLOAK_VIEWING_KEYS_QUERY_KEY,
    queryFn: async () => readViewingKeysFromStorage(),
    staleTime: Infinity,
  });
}

export function useRecordCloakPayout() {
  const wallet = useStellarWallet();
  const qc = useQueryClient();

  return useMutation<RecordCloakPayoutResult, Error, RecordCloakPayoutParams>({
    mutationFn: async (params) => {
      if (!wallet.address) throw new Error('Connect a Stellar wallet first');
      if (params.cloakOraclePubkey.length !== 32) {
        throw new Error(
          `cloakOraclePubkey must be 32 bytes (got ${params.cloakOraclePubkey.length})`,
        );
      }

      toast.loading('Cloak oracle: preparing shielded batch attestation…', {
        id: 'cloak-shield',
        duration: 30_000,
      });

      const attestation = await fetchCloakAttestation({
        vaultId: params.vaultId,
        totalShieldedAmount: params.totalShieldedAmount,
      });

      if (!attestation.batchConfirmed) {
        throw new Error('Cloak oracle did not confirm the payout batch (result=0x00)');
      }

      const message = buildCloakAttestationMessage({
        vaultId: params.vaultId,
        batchId: attestation.batchId,
        batchConfirmed: attestation.batchConfirmed,
      });

      const core = getCoreClient();
      const server = getRpcServer();
      const source = await server.getAccount(wallet.address);

      let tx = new TransactionBuilder(source, {
        fee: '1000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          core.contract.call(
            'record_cloak_payout',
            addr(wallet.address),
            nativeToScVal(params.vaultId, { type: 'u32' }),
            nativeToScVal(params.cloakOraclePubkey, { type: 'bytes' }),
            nativeToScVal(new Uint8Array(message), { type: 'bytes' }),
            nativeToScVal(attestation.signature, { type: 'bytes' }),
            nativeToScVal(params.totalShieldedAmount, { type: 'i128' }),
          ),
        )
        .setTimeout(60)
        .build();

      tx = await server.prepareTransaction(tx);
      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResult = await server.sendTransaction(signedTx as never);
      if (sendResult.status === 'ERROR') {
        throw new Error(`record_cloak_payout failed: ${JSON.stringify(sendResult.errorResult)}`);
      }

      let status = await server.getTransaction(sendResult.hash);
      const deadline = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        status = await server.getTransaction(sendResult.hash);
      }
      if (status.status !== 'SUCCESS') {
        throw new Error(`record_cloak_payout failed: status=${status.status}`);
      }

      return { signature: sendResult.hash, attestation };
    },
    onSuccess: ({ signature, attestation }, params) => {
      writeViewingKeysToStorage(attestation.viewingKeys);
      qc.setQueryData(CLOAK_VIEWING_KEYS_QUERY_KEY, attestation.viewingKeys);

      qc.invalidateQueries({ queryKey: ['cloak-payout', params.vaultId] });
      qc.invalidateQueries({ queryKey: ['vault-state'] });

      toast.success(
        `Yield shielded via Cloak (tx ${signature.slice(0, 8)}…). Viewing keys are ready.`,
        { id: 'cloak-shield' },
      );
    },
    onError: (e) => {
      toast.error(`Cloak shield failed: ${e.message}`, { id: 'cloak-shield' });
    },
  });
}
