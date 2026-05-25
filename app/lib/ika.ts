// IKA integration was dropped for the Stellar build. This stub keeps the
// historical type exports so consumers still compile. None of the runtime
// functions actually work — see hooks/useIkaCollateral.tsx for the stub
// React layer.

export type IkaChain = 'BTC' | 'ETH' | 'SUI';

/** Legacy chain-id mapping kept so old `IKA_CHAIN.BTC` references compile. */
export const IKA_CHAIN: Record<IkaChain, number> = { BTC: 0, ETH: 1, SUI: 2 };

/** Stub for the old DKG step indicator. */
export type IkaDkgStep =
  | 'idle'
  | 'connecting_sui'
  | 'preparing_dkg'
  | 'submitting_dkg'
  | 'waiting_for_lock'
  | 'done'
  | 'error';

/** Stub: there's no dWallet on the Stellar build. Returns an empty string. */
export function getDWalletAddress(_dwalletId: string, _chain: IkaChain): string {
  return '';
}

export interface IkaDwalletInfo {
  dwalletId: string;
  chain: IkaChain;
  fundedAmountUsd: bigint;
  address: string;
}

export interface IkaOracleAttestation {
  signature: Uint8Array;
  message: Uint8Array;
  oraclePubkey: Uint8Array;
}

const UNAVAILABLE = new Error(
  'IKA cross-chain collateral is not available on the Stellar build.',
);

export async function pollOracleAttestation(): Promise<IkaOracleAttestation> {
  throw UNAVAILABLE;
}

export async function buildVerifyCollateralTx(): Promise<never> {
  throw UNAVAILABLE;
}

export async function createIkaDwallet(): Promise<IkaDwalletInfo> {
  throw UNAVAILABLE;
}
