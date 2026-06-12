// XION (CosmWasm) client helpers — the counterpart to `stellar.ts`.
//
// Drop-in shape: where the Stellar code did
//   const client = getCoreClient();
//   await client.read('get_vault', [nativeToScVal(0, { type: 'u32' })]);
//   await client.invoke(signer, 'deposit', [...]);
// the XION code does
//   await coreQuery({ get_vault: { vault_id: 0 } });
//   await coreExecute(signer, { deposit: { vault_id: 0, kind: 2, amount: '100' } });
//
// CosmWasm messages are plain JSON (no XDR / ScVal). i128/u128 values are
// strings (`Uint128`), so pass BigInt-derived strings, never JS numbers for
// token amounts.

import { CosmWasmClient, SigningCosmWasmClient, type ExecuteResult } from '@cosmjs/cosmwasm-stargate';
import {
  DirectSecp256k1HdWallet,
  DirectSecp256k1Wallet,
  type OfflineSigner,
} from '@cosmjs/proto-signing';
import { GasPrice } from '@cosmjs/stargate';

import { ACTIVE_XION, type XionContractSet } from './xion-addresses';

// ── Network-aware singletons ─────────────────────────────────────────────────

let _singletonNetwork: string | null = null;
let _queryClient: CosmWasmClient | null = null;

function currentNetwork(): string {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('prism_network');
    if (stored === 'mainnet' || stored === 'testnet') return stored;
  }
  return process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet';
}

function resetIfNetworkChanged() {
  const net = currentNetwork();
  if (net !== _singletonNetwork) {
    _singletonNetwork = net;
    _queryClient = null;
  }
}

function config(): XionContractSet {
  return ACTIVE_XION;
}

/** Lazy singleton read-only CosmWasm client. */
export async function getQueryClient(): Promise<CosmWasmClient> {
  resetIfNetworkChanged();
  if (!_queryClient) {
    _queryClient = await CosmWasmClient.connect(config().rpcUrl);
  }
  return _queryClient;
}

/** Build a signing client for a given offline signer (one per tx flow). */
export async function getSigningClient(signer: OfflineSigner): Promise<SigningCosmWasmClient> {
  const cfg = config();
  return SigningCosmWasmClient.connectWithSigner(cfg.rpcUrl, signer, {
    gasPrice: GasPrice.fromString(cfg.gasPrice),
  });
}

// ── Signer abstraction (parity with StellarSigner) ───────────────────────────

/** A resolved signer: a bech32 address + its offline signer. */
export interface XionSigner {
  address: string;
  offlineSigner: OfflineSigner;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function toSigner(offlineSigner: OfflineSigner): Promise<XionSigner> {
  const [account] = await offlineSigner.getAccounts();
  return { address: account.address, offlineSigner };
}

/** Build a signer from a 32-byte secp256k1 private key (hex). */
export async function signerFromPrivateKeyHex(hex: string): Promise<XionSigner> {
  const wallet = await DirectSecp256k1Wallet.fromKey(hexToBytes(hex), config().prefix);
  return toSigner(wallet);
}

/** Build a signer from a BIP-39 mnemonic. */
export async function signerFromMnemonic(mnemonic: string): Promise<XionSigner> {
  const wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, { prefix: config().prefix });
  return toSigner(wallet);
}

/**
 * Generate a fresh random signer — used by the demo simulation harness
 * (`useIdentity`) to mint per-session role keypairs, mirroring the Stellar
 * `Keypair.random()` model.
 */
export async function randomSigner(): Promise<{ signer: XionSigner; mnemonic: string }> {
  const wallet = await DirectSecp256k1HdWallet.generate(24, { prefix: config().prefix });
  return { signer: await toSigner(wallet), mnemonic: wallet.mnemonic };
}

// ── Generic contract query / execute ─────────────────────────────────────────

export async function queryContract<T = unknown>(contract: string, msg: object): Promise<T> {
  const client = await getQueryClient();
  return client.queryContractSmart(contract, msg) as Promise<T>;
}

export async function executeContract(
  signer: XionSigner,
  contract: string,
  msg: object,
  funds: { denom: string; amount: string }[] = [],
  memo = '',
): Promise<ExecuteResult> {
  const client = await getSigningClient(signer.offlineSigner);
  return client.execute(signer.address, contract, msg, 'auto', memo, funds);
}

// ── prism-core helpers (parity with getCoreClient) ───────────────────────────

export async function coreQuery<T = unknown>(msg: object): Promise<T> {
  return queryContract<T>(config().prismCore, msg);
}

export async function coreExecute(signer: XionSigner, msg: object): Promise<ExecuteResult> {
  return executeContract(signer, config().prismCore, msg);
}

// ── cw20 helpers (USDC + pTokens) ────────────────────────────────────────────

export async function cw20Balance(token: string, address: string): Promise<bigint> {
  const res = await queryContract<{ balance: string }>(token, { balance: { address } });
  return BigInt(res.balance);
}

/**
 * Grant prism-core an allowance to pull `amount` of `token` from the signer.
 * Required before `deposit` (USDC), `withdraw` (pToken), `accrue_yield` (USDC),
 * and `repay_loan` (USDC) — CosmWasm has no Soroban-style nested auth, so the
 * caller approves first, then the contract pulls via `TransferFrom`/`BurnFrom`.
 */
export async function increaseAllowance(
  signer: XionSigner,
  token: string,
  spender: string,
  amount: bigint,
): Promise<ExecuteResult> {
  return executeContract(signer, token, {
    increase_allowance: { spender, amount: amount.toString(), expires: null },
  });
}

// ── High-level flows that bundle the allowance + the core call ───────────────

export async function deposit(
  signer: XionSigner,
  vaultId: number,
  kind: number,
  amount: bigint,
): Promise<ExecuteResult> {
  const cfg = config();
  await increaseAllowance(signer, cfg.usdc, cfg.prismCore, amount);
  return coreExecute(signer, {
    deposit: { vault_id: vaultId, kind, amount: amount.toString() },
  });
}

export async function withdraw(
  signer: XionSigner,
  vaultId: number,
  kind: number,
  shares: bigint,
): Promise<ExecuteResult> {
  const cfg = config();
  const ptoken = [cfg.ptokenPrime, cfg.ptokenCore, cfg.ptokenAlpha][kind];
  await increaseAllowance(signer, ptoken, cfg.prismCore, shares);
  return coreExecute(signer, {
    withdraw: { vault_id: vaultId, kind, shares: shares.toString() },
  });
}

export async function repayLoan(
  signer: XionSigner,
  loanId: number,
  amount: bigint,
): Promise<ExecuteResult> {
  const cfg = config();
  await increaseAllowance(signer, cfg.usdc, cfg.prismCore, amount);
  return coreExecute(signer, { repay_loan: { loan_id: loanId, amount: amount.toString() } });
}

export { ACTIVE_XION } from './xion-addresses';
