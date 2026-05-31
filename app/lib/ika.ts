/**
 * IKA dWallet client for PRISM cross-chain collateral.
 *
 * Flow:
 *   1. createDWallet()       — borrower creates a new dWallet on IKA (Sui-hosted MPC)
 *   2. getDepositAddress()   — get the BTC/ETH deposit address for that dWallet
 *   3. pollDWalletFunding()  — wait until the chain confirms the deposit
 *   4. requestAttestation()  — IKA's oracle signs the 73-byte col_atts message
 *                              with its Ed25519 key (same format as PRISM oracle)
 *
 * The oracle pubkey that IKA uses must be registered in prism-core's
 * oracle_allowlist via oracle-allowlist.sh before verify_collateral will accept it.
 *
 * chain_id values (mirrors prism-core §6.6):
 *   0 = BTC, 1 = ETH, 2 = SOL, 3 = XLM, 4 = USDC-Stellar
 *
 * Environment:
 *   NEXT_PUBLIC_IKA_API_URL          — IKA API base URL (default: https://api.ika.xyz)
 *   NEXT_PUBLIC_IKA_ORACLE_PUBKEY    — IKA oracle Ed25519 pubkey hex (32 bytes)
 *                                      Must match what is registered in the allowlist.
 */

const IKA_API_BASE =
  process.env.NEXT_PUBLIC_IKA_API_URL?.replace(/\/$/, '') ?? 'https://api.ika.xyz';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type IkaChain = 'BTC' | 'ETH';

export interface IkaDWallet {
  /** Unique IKA dWallet identifier (Sui object ID). */
  dwalletId: string;
  /** Chain for which this dWallet holds collateral. */
  chain: IkaChain;
  /** Deposit address on the target chain (BTC bech32, ETH 0x…). */
  depositAddress: string;
  /** Current confirmed balance in the smallest unit (sats or wei). */
  confirmedBalance: bigint;
  /** Whether the confirmed balance meets or exceeds the requested collateral. */
  funded: boolean;
}

export interface IkaAttestation {
  /** 64-byte Ed25519 signature (hex), over the 73-byte col_atts message. */
  signatureHex: string;
  /** 32-byte IKA oracle Ed25519 pubkey (hex). */
  oraclePubkeyHex: string;
  /** The signed 73-byte message (hex) — pass directly to verify_collateral. */
  messageHex: string;
}

export interface IkaDWalletStatus {
  dwalletId: string;
  chain: IkaChain;
  depositAddress: string;
  confirmedBalance: bigint;
  funded: boolean;
  /** ISO-8601 timestamp of the last confirmed transaction. */
  lastConfirmedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

async function ikaFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${IKA_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`IKA API ${res.status} (${path}): ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a new IKA dWallet for the given chain.
 * Returns the dWallet object including the deposit address.
 *
 * @param chain        'BTC' or 'ETH'
 * @param ownerAddress Stellar G-address of the borrower (used as the dWallet owner claim)
 */
export async function createIkaDWallet(
  chain: IkaChain,
  ownerAddress: string,
): Promise<IkaDWallet> {
  const raw = await ikaFetch<{
    dwallet_id: string;
    chain: string;
    deposit_address: string;
    confirmed_balance: string;
    funded: boolean;
  }>('/v1/dwallet', {
    method: 'POST',
    body: JSON.stringify({ chain, owner: ownerAddress }),
  });

  return {
    dwalletId: raw.dwallet_id,
    chain: raw.chain as IkaChain,
    depositAddress: raw.deposit_address,
    confirmedBalance: BigInt(raw.confirmed_balance ?? '0'),
    funded: raw.funded ?? false,
  };
}

/**
 * Poll the current status of an existing dWallet.
 */
export async function getIkaDWalletStatus(dwalletId: string): Promise<IkaDWalletStatus> {
  const raw = await ikaFetch<{
    dwallet_id: string;
    chain: string;
    deposit_address: string;
    confirmed_balance: string;
    funded: boolean;
    last_confirmed_at?: string;
  }>(`/v1/dwallet/${encodeURIComponent(dwalletId)}`);

  return {
    dwalletId: raw.dwallet_id,
    chain: raw.chain as IkaChain,
    depositAddress: raw.deposit_address,
    confirmedBalance: BigInt(raw.confirmed_balance ?? '0'),
    funded: raw.funded ?? false,
    lastConfirmedAt: raw.last_confirmed_at,
  };
}

/**
 * Request an Ed25519 attestation from the IKA oracle for a funded dWallet.
 *
 * IKA signs the same 73-byte col_atts message format that PRISM's own oracle
 * uses, so verify_collateral on prism-core accepts it without any contract changes.
 *
 * @param dwalletId     The dWallet to attest (must be funded)
 * @param loanId        PRISM loan ID (u32)
 * @param chainId       PRISM chain ID (0=BTC, 1=ETH)
 * @param amountUsdMicro  Collateral value in USD micro-units (1 USD = 1_000_000)
 * @param nonce         Unique u64 nonce (use Date.now() as bigint)
 */
export async function requestIkaAttestation(params: {
  dwalletId: string;
  loanId: number;
  chainId: number;
  amountUsdMicro: bigint;
  nonce: bigint;
}): Promise<IkaAttestation> {
  const raw = await ikaFetch<{
    signature_hex: string;
    oracle_pubkey_hex: string;
    message_hex: string;
  }>('/v1/dwallet/attest', {
    method: 'POST',
    body: JSON.stringify({
      dwallet_id: params.dwalletId,
      loan_id: params.loanId,
      chain_id: params.chainId,
      amount_usd_micro: params.amountUsdMicro.toString(),
      nonce: params.nonce.toString(),
    }),
  });

  return {
    signatureHex: raw.signature_hex,
    oraclePubkeyHex: raw.oracle_pubkey_hex,
    messageHex: raw.message_hex,
  };
}

/**
 * Returns the IKA oracle Ed25519 pubkey hex that is registered in prism-core's
 * oracle_allowlist. This is the value you need to pass to attach_collateral.
 *
 * In production: set NEXT_PUBLIC_IKA_ORACLE_PUBKEY to IKA's announced pubkey.
 * In development: falls back to querying the IKA API.
 */
export async function getIkaOraclePubkeyHex(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_IKA_ORACLE_PUBKEY?.trim();
  if (fromEnv) return fromEnv;

  const raw = await ikaFetch<{ oracle_pubkey_hex: string }>('/v1/oracle/pubkey');
  return raw.oracle_pubkey_hex;
}

/**
 * Human-readable chain label.
 */
export function ikaChainLabel(chain: IkaChain): string {
  return chain === 'BTC' ? 'Bitcoin' : 'Ethereum';
}

/**
 * PRISM chain_id for a given IKA chain.
 */
export function ikaChainId(chain: IkaChain): number {
  return chain === 'BTC' ? 0 : 1;
}
