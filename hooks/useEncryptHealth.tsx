'use client';

// Encrypt FHE oracle integration — Stellar build.
//
// Three exports:
//   - useEncryptHealth(loanId)  — reads EncryptLoanHealth via get_encrypt_health
//   - useAttachEncryptScore()   — borrower binds a sha256 commitment to a loan
//   - useVerifyEncryptDefault() — relayer submits oracle attestation → cascade
//
// The Soroban contract calls take raw (message, signature) — no Ed25519
// precompile / instructions sysvar plumbing on the client.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Buffer } from 'buffer';
import { TransactionBuilder } from '@stellar/stellar-sdk';
import { toast } from 'sonner';

import { NETWORK_PASSPHRASE, VAULT_ID } from '@/app/lib/constants';
import {
  pollEncryptAttestation,
  type EncryptAttestation,
} from '@/app/lib/encrypt';
import {
  addr,
  getCoreClient,
  getRpcServer,
  nativeToScVal,
} from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';

export type EncryptStatus = 'Pending' | 'Verified' | 'DefaultProven';

export interface EncryptHealthState {
  loanId: number;
  scoreCommitment: Uint8Array;
  encryptOracle: Uint8Array;
  status: EncryptStatus;
  defaultProvenTs: number;
}

interface EncryptHealthSnapshot {
  default_proven_ts: bigint;
  encrypt_oracle: Buffer | Uint8Array;
  loan_id: number;
  score_commitment: Buffer | Uint8Array;
  status: string;
}

function toBytesArray(x: unknown): Uint8Array {
  if (x instanceof Uint8Array) return x;
  if (Buffer.isBuffer(x)) return new Uint8Array(x);
  if (Array.isArray(x)) return new Uint8Array(x as number[]);
  if (typeof x === 'string') return new Uint8Array(Buffer.from(x, 'hex'));
  return new Uint8Array(0);
}

export function useEncryptHealth(loanId: number | null | undefined) {
  return useQuery<EncryptHealthState | null>({
    queryKey: ['encrypt-health', loanId ?? 'none'],
    enabled: typeof loanId === 'number',
    refetchInterval: 5_000,
    queryFn: async () => {
      if (typeof loanId !== 'number') return null;
      const core = getCoreClient();
      const acc = await core
        .read<EncryptHealthSnapshot | null>('get_encrypt_health', [
          nativeToScVal(loanId, { type: 'u32' }),
        ])
        .catch(() => null);
      if (!acc) return null;
      return {
        loanId: acc.loan_id,
        scoreCommitment: toBytesArray(acc.score_commitment),
        encryptOracle: toBytesArray(acc.encrypt_oracle),
        status: String(acc.status) as EncryptStatus,
        defaultProvenTs: Number(acc.default_proven_ts ?? 0),
      };
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Borrower attaches commitment
// ─────────────────────────────────────────────────────────────────────────────

export interface AttachEncryptScoreParams {
  loanId: number;
  /** sha256 of the borrower's Encrypt-sealed credit data (32 bytes). */
  commitment: Uint8Array;
  encryptOraclePubkey: Uint8Array; // 32 bytes
}

export function useAttachEncryptScore() {
  const wallet = useStellarWallet();
  const qc = useQueryClient();

  return useMutation<string, Error, AttachEncryptScoreParams>({
    mutationFn: async (params) => {
      if (!wallet.address) throw new Error('Connect a Stellar wallet first');
      if (params.commitment.length !== 32) {
        throw new Error(`commitment must be 32 bytes (got ${params.commitment.length})`);
      }
      if (params.encryptOraclePubkey.length !== 32) {
        throw new Error(
          `encryptOraclePubkey must be 32 bytes (got ${params.encryptOraclePubkey.length})`,
        );
      }

      const core = getCoreClient();
      const server = getRpcServer();
      const source = await server.getAccount(wallet.address);

      let tx = new TransactionBuilder(source, {
        fee: '1000',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          core.contract.call(
            'attach_encrypt_score',
            addr(wallet.address),
            nativeToScVal(params.loanId, { type: 'u32' }),
            nativeToScVal(params.commitment, { type: 'bytes' }),
            nativeToScVal(params.encryptOraclePubkey, { type: 'bytes' }),
          ),
        )
        .setTimeout(60)
        .build();

      tx = await server.prepareTransaction(tx);
      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResult = await server.sendTransaction(signedTx as never);
      if (sendResult.status === 'ERROR') {
        throw new Error(`attach_encrypt_score failed: ${JSON.stringify(sendResult.errorResult)}`);
      }

      let status = await server.getTransaction(sendResult.hash);
      const deadline = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        status = await server.getTransaction(sendResult.hash);
      }
      if (status.status !== 'SUCCESS') {
        throw new Error(`attach_encrypt_score failed: status=${status.status}`);
      }
      return sendResult.hash;
    },
    onSuccess: (hash, params) => {
      toast.success(`Encrypt score commitment attached (tx ${hash.slice(0, 8)}…)`);
      qc.invalidateQueries({ queryKey: ['encrypt-health', params.loanId] });
    },
    onError: (e) => toast.error(`Attach FHE score failed: ${e.message}`),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify default (the "magic moment" mutation)
// ─────────────────────────────────────────────────────────────────────────────

export interface VerifyEncryptDefaultParams {
  loanId: number;
  scoreCommitment: Uint8Array;
  vaultId?: number;
  lossAmount: bigint;
  severityBps: number;
}

export interface VerifyEncryptDefaultResult {
  signature: string;
  attestation: EncryptAttestation;
}

export function useVerifyEncryptDefault() {
  const wallet = useStellarWallet();
  const qc = useQueryClient();

  return useMutation<VerifyEncryptDefaultResult, Error, VerifyEncryptDefaultParams>({
    mutationFn: async (params) => {
      if (!wallet.address) throw new Error('Connect a Stellar wallet first');

      toast.loading('Encrypt FHE oracle: computing default attestation…', {
        id: 'encrypt-fhe',
        duration: 30_000,
      });

      const attestation = await pollEncryptAttestation(
        params.loanId,
        params.scoreCommitment,
      );

      if (!attestation.defaultProven) {
        throw new Error(
          'Encrypt FHE oracle: loan is NOT in default (total_repaid >= principal)',
        );
      }

      // Build the 73-byte message the contract will re-derive + verify.
      const message = (await import('@/app/lib/encrypt')).buildEncryptAttestationMessage({
        loanId: attestation.loanId,
        scoreCommitment: attestation.scoreCommitment,
        defaultProven: attestation.defaultProven,
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
            'verify_encrypt_default',
            addr(wallet.address),
            nativeToScVal(params.vaultId ?? VAULT_ID, { type: 'u32' }),
            nativeToScVal(params.loanId, { type: 'u32' }),
            nativeToScVal(new Uint8Array(message), { type: 'bytes' }),
            nativeToScVal(attestation.signature, { type: 'bytes' }),
            nativeToScVal(params.lossAmount, { type: 'i128' }),
            nativeToScVal(params.severityBps, { type: 'u32' }),
          ),
        )
        .setTimeout(60)
        .build();

      tx = await server.prepareTransaction(tx);
      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const sendResult = await server.sendTransaction(signedTx as never);
      if (sendResult.status === 'ERROR') {
        throw new Error(
          `verify_encrypt_default failed: ${JSON.stringify(sendResult.errorResult)}`,
        );
      }

      let status = await server.getTransaction(sendResult.hash);
      const deadline = Date.now() + 30_000;
      while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1_500));
        status = await server.getTransaction(sendResult.hash);
      }
      if (status.status !== 'SUCCESS') {
        throw new Error(`verify_encrypt_default failed: status=${status.status}`);
      }

      return { signature: sendResult.hash, attestation };
    },
    onSuccess: ({ signature, attestation }) => {
      toast.success(
        `FHE default proven on-chain (tx ${signature.slice(0, 8)}…). Cascade complete.`,
        { id: 'encrypt-fhe' },
      );
      qc.invalidateQueries({ queryKey: ['encrypt-health', attestation.loanId] });
      qc.invalidateQueries({ queryKey: ['vault-state'] });
    },
    onError: (e) => toast.error(`FHE verify failed: ${e.message}`, { id: 'encrypt-fhe' }),
  });
}
