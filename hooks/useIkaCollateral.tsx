'use client';

// IKA collateral integration was dropped for the Stellar build (Phase 0
// decision — IKA Network is Sui-native and doesn't have a Stellar
// attestation path yet). This stub keeps the export surface so existing
// imports compile; every hook reports "feature unavailable" and surfaces
// a friendly error if the user actually triggers the flow.
//
// If you want cross-chain BTC/ETH collateral back on the Stellar build,
// the path forward is: (a) IKA ships Stellar attestations, or (b) wire
// up a different MPC provider with Stellar support.

import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export type IkaChain = 'BTC' | 'ETH' | 'SUI';

export interface IkaCollateralState {
  loanId: number;
  dwalletId: Uint8Array;
  chainId: number;
  collateralAmountUsd: bigint;
  status: 'Pending' | 'Locked' | 'Released' | 'Liquidated';
  oraclePubkey: Uint8Array;
  lockedTs: number;
}

export interface IkaDwalletInfo {
  dwalletId: string;
  chain: IkaChain;
  fundedAmountUsd: bigint;
  address: string;
}

const UNAVAILABLE_MSG = 'IKA cross-chain collateral is not available on the Stellar build.';

export function useIkaCollateralAccount(_loanPubkey: unknown) {
  return useQuery<IkaCollateralState | null>({
    queryKey: ['ika-collateral', 'stellar-stub'],
    queryFn: async () => null,
    enabled: false,
    staleTime: Infinity,
  });
}

export function useCreateIkaDwallet() {
  return useMutation<IkaDwalletInfo, Error, { chain: IkaChain; usd: number }>({
    mutationFn: async () => {
      throw new Error(UNAVAILABLE_MSG);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAttachIkaCollateral() {
  return useMutation<string, Error, unknown>({
    mutationFn: async () => {
      throw new Error(UNAVAILABLE_MSG);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useVerifyIkaCollateral() {
  return useMutation<string, Error, unknown>({
    mutationFn: async () => {
      throw new Error(UNAVAILABLE_MSG);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReleaseIkaCollateral() {
  return useMutation<string, Error, unknown>({
    mutationFn: async () => {
      throw new Error(UNAVAILABLE_MSG);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useLiquidateIkaCollateral() {
  return useMutation<string, Error, unknown>({
    mutationFn: async () => {
      throw new Error(UNAVAILABLE_MSG);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// The old IKA hook also exposed a `useLoanAccount(loanPda)` reader. Stubbed
// here so legacy callers compile; returns null forever.
export function useLoanAccount(_loanPda: unknown) {
  return useQuery<unknown | null>({
    queryKey: ['ika-loan-account', 'stellar-stub'],
    queryFn: async () => null,
    enabled: false,
    staleTime: Infinity,
  });
}
