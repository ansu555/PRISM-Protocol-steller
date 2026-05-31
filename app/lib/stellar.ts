// Soroban client helpers — single place to spin up RPC + contract callers.
//
// Soroban contract interaction helpers.
//
// Usage:
//   const client = buildCoreClient(keypair);
//   const result = await client.read('get_vault', [nativeToScVal(0, { type: 'u32' })]);
//   const tx = await client.invoke(keypair, 'deposit', [
//     new Address(keypair.publicKey()).toScVal(),
//     nativeToScVal(0, { type: 'u32' }),
//     nativeToScVal(0, { type: 'u32' }),
//     nativeToScVal(1_000_0000n, { type: 'i128' }),
//   ]);

import {
  Account,
  Address,
  Contract,
  Horizon,
  Keypair,
  TransactionBuilder,
  rpc,
  scValToNative,
  type Memo,
  type MemoType,
  type Operation as OperationType,
  type Transaction,
  type xdr,
} from '@stellar/stellar-sdk';

import { parseStellarError } from './errors';

import {
  NETWORK_PASSPHRASE,
  PRISM_AMM_CONTRACT_ID,
  PRISM_CORE_CONTRACT_ID,
  USDC_CONTRACT_ID,
} from './constants';
import { CONTRACTS } from './addresses';

let _rpcServer: rpc.Server | null = null;
let _horizonServer: Horizon.Server | null = null;

/** Lazy singleton Soroban RPC client. Network-aware: re-creates if network changed. */
export function getRpcServer(): rpc.Server {
  resetSingletonsIfNetworkChanged();
  if (!_rpcServer) {
    const net = (_singletonNetwork ?? 'testnet') as 'testnet' | 'mainnet';
    const url = CONTRACTS[net].rpcUrl;
    _rpcServer = new rpc.Server(url, { allowHttp: url.startsWith('http://') });
  }
  return _rpcServer;
}

/** Lazy singleton Horizon client — used for getAccount (sequence numbers). */
export function getHorizonServer(): Horizon.Server {
  resetSingletonsIfNetworkChanged();
  if (!_horizonServer) {
    const net = (_singletonNetwork ?? 'testnet') as 'testnet' | 'mainnet';
    _horizonServer = new Horizon.Server(CONTRACTS[net].horizonUrl);
  }
  return _horizonServer;
}

/** A minimal wallet-shape — any signer that can produce a signature. */
export interface StellarSigner {
  publicKey(): string;
  sign(tx: Transaction<Memo<MemoType>, OperationType[]>): Promise<void> | void;
}

/** Wrap a Keypair as a StellarSigner. */
export function keypairSigner(keypair: Keypair): StellarSigner {
  return {
    publicKey: () => keypair.publicKey(),
    sign: (tx) => {
      tx.sign(keypair);
    },
  };
}

/**
 * Wrap a Freighter-style signTransaction function as a StellarSigner.
 * The signFn receives a base64 XDR string and returns the signed XDR.
 */
export function freighterSigner(
  publicKey: string,
  signFn: (xdr: string) => Promise<string>,
): StellarSigner {
  return {
    publicKey: () => publicKey,
    sign: async (tx) => {
      const { TransactionBuilder: TB } = await import('@stellar/stellar-sdk');
      const signedXdr = await signFn(tx.toXDR());
      const signed = TB.fromXDR(signedXdr, NETWORK_PASSPHRASE);
      // Copy signatures from the signed tx back onto the original tx object
      for (const sig of signed.signatures) {
        tx.signatures.push(sig);
      }
    },
  };
}

/** Result of an `invoke` call. */
export interface InvokeResult<T = unknown> {
  hash: string;
  result: T;
}

/** A typed client for one Soroban contract. */
export class ContractClient {
  readonly contract: Contract;

  constructor(public readonly contractId: string) {
    this.contract = new Contract(contractId);
  }

  /**
   * Read-only call — simulates the contract function without submitting a tx.
   * Returns the native-decoded return value.
   *
   * Useful for `get_vault`, `get_tranche`, balance reads, etc.
   */
  async read<T = unknown>(method: string, args: xdr.ScVal[] = []): Promise<T> {
    const server = getRpcServer();
    // We need *some* account to build the simulation tx, but it won't be
    // signed or submitted. Use the deployed admin address as simulation source —
    // it exists on testnet and has a valid sequence number.
    // IMPORTANT: the original GAAZI4... address was 55 chars (invalid), causing
    // every read() call to silently throw "accountId is invalid".
    const SIM_SOURCE =
      process.env.NEXT_PUBLIC_ADMIN_ADDRESS ??
      'GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO';
    const sourceAccount = await getHorizonServer()
      .loadAccount(SIM_SOURCE)
      .catch(() => new Account(SIM_SOURCE, '0'));

    const tx = new TransactionBuilder(sourceAccount as Account, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(parseStellarError(`Soroban read failed (${method}): ${sim.error}`));
    }
    if (!('result' in sim) || !sim.result) {
      return undefined as T;
    }
    return scValToNative(sim.result.retval) as T;
  }

  /**
   * Invoke a state-changing contract function. Builds, simulates, signs,
   * submits, and polls for the tx to settle. Returns the tx hash + the
   * native-decoded return value.
   */
  async invoke<T = unknown>(
    signer: StellarSigner,
    method: string,
    args: xdr.ScVal[] = [],
  ): Promise<InvokeResult<T>> {
    const server = getRpcServer();
    const sourceAccount = await getHorizonServer().loadAccount(signer.publicKey());

    let tx = new TransactionBuilder(sourceAccount, {
      fee: '1000',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(60)
      .build();

    // Prepare runs simulation and attaches the SorobanData / footprint that
    // the network needs to actually execute the contract call.
    tx = await server.prepareTransaction(tx);
    await signer.sign(tx);

    const sendResult = await server.sendTransaction(tx);
    if (sendResult.status === 'ERROR') {
      throw new Error(parseStellarError(JSON.stringify(sendResult.errorResult)));
    }

    // Poll until the tx settles.
    const finalStatus = await pollTransaction(sendResult.hash);
    if (finalStatus.status !== 'SUCCESS') {
      const resultXdr =
        'resultXdr' in finalStatus ? finalStatus.resultXdr?.toXDR('base64') ?? '' : '';
      throw new Error(parseStellarError(resultXdr || `Transaction failed with status: ${finalStatus.status}`));
    }

    let result: T = undefined as T;
    if (finalStatus.returnValue) {
      result = scValToNative(finalStatus.returnValue) as T;
    }

    return { hash: sendResult.hash, result };
  }
}

async function pollTransaction(hash: string, timeoutMs = 30_000) {
  const server = getRpcServer();
  const deadline = Date.now() + timeoutMs;
  let lastStatus: rpc.Api.GetTransactionResponse | null = null;
  while (Date.now() < deadline) {
    lastStatus = await server.getTransaction(hash);
    if (lastStatus.status !== 'NOT_FOUND') {
      return lastStatus;
    }
    await new Promise((r) => setTimeout(r, 1_500));
  }
  if (!lastStatus) {
    throw new Error(`Transaction ${hash} not found after ${timeoutMs}ms`);
  }
  return lastStatus;
}

// ── Module-level singletons for our two contracts + USDC SAC ─────────────────
// Keyed by network so a runtime network switch (localStorage) gets fresh clients.

let _singletonNetwork: string | null = null;
let _coreClient: ContractClient | null = null;
let _ammClient: ContractClient | null = null;
let _usdcClient: ContractClient | null = null;

function currentNetwork(): string {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem('prism_network') ?? 'testnet';
  }
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
}

function resetSingletonsIfNetworkChanged() {
  const net = currentNetwork();
  if (net !== _singletonNetwork) {
    _singletonNetwork = net;
    _coreClient = null;
    _ammClient = null;
    _usdcClient = null;
    _rpcServer = null;
    _horizonServer = null;
  }
}

export function getCoreClient(): ContractClient {
  resetSingletonsIfNetworkChanged();
  if (!_coreClient) {
    const net = (_singletonNetwork ?? 'testnet') as 'testnet' | 'mainnet';
    _coreClient = new ContractClient(CONTRACTS[net].prismCore);
  }
  return _coreClient;
}

export function getAmmClient(): ContractClient {
  resetSingletonsIfNetworkChanged();
  if (!_ammClient) _ammClient = new ContractClient(PRISM_AMM_CONTRACT_ID);
  return _ammClient;
}

export function getUsdcClient(): ContractClient {
  resetSingletonsIfNetworkChanged();
  if (!_usdcClient) {
    const net = (_singletonNetwork ?? 'testnet') as 'testnet' | 'mainnet';
    _usdcClient = new ContractClient(CONTRACTS[net].usdc);
  }
  return _usdcClient;
}

/** Convenience: get an Address ScVal from any Stellar address string. */
export function addr(addressStr: string): xdr.ScVal {
  return new Address(addressStr).toScVal();
}

// ── Re-exports so consumers don't need to import the SDK directly ───────────
export { Address, Keypair, scValToNative };
export { nativeToScVal } from '@stellar/stellar-sdk';
export type { xdr } from '@stellar/stellar-sdk';
