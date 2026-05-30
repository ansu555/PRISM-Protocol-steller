// Horizon REST API helpers — used for balances and transaction history.
//
// Soroban RPC handles contract reads; Horizon handles account-level queries
// (native XLM balance, Stellar Classic asset balances, transaction history).
// For Soroban token balances (SEP-41 / SAC), prefer the ContractClient.read()
// path from stellar.ts — Horizon only sees Classic trustlines, not Soroban state.

import { HORIZON_URL } from './constants';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HorizonBalance {
  balance: string;
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12' | 'liquidity_pool_shares';
  asset_code?: string;
  asset_issuer?: string;
  liquidity_pool_id?: string;
}

export interface HorizonAccount {
  id: string;
  sequence: string;
  balances: HorizonBalance[];
  last_modified_ledger: number;
}

export interface HorizonPayment {
  id: string;
  type: string;
  transaction_hash: string;
  created_at: string;
  from?: string;
  to?: string;
  amount?: string;
  asset_type?: string;
  asset_code?: string;
  asset_issuer?: string;
}

// ── Account queries ───────────────────────────────────────────────────────────

/**
 * Fetch full account data from Horizon (balances, sequence, etc.).
 * Returns null if the account does not exist (unfunded).
 */
export async function getAccount(accountId: string): Promise<HorizonAccount | null> {
  const res = await fetch(`${HORIZON_URL}/accounts/${accountId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Horizon /accounts error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<HorizonAccount>;
}

/**
 * Fetch all balances for an account. Convenience wrapper over `getAccount`.
 * Returns an empty array if the account does not exist.
 */
export async function getBalances(accountId: string): Promise<HorizonBalance[]> {
  const account = await getAccount(accountId);
  return account?.balances ?? [];
}

/**
 * Return the XLM balance string for an account (e.g. "9.9999900").
 * Returns "0" if the account does not exist.
 */
export async function getNativeBalance(accountId: string): Promise<string> {
  const balances = await getBalances(accountId);
  const native = balances.find((b) => b.asset_type === 'native');
  return native?.balance ?? '0';
}

/**
 * Return the balance string for a specific Stellar Classic asset.
 * Returns "0" if the account has no trustline for the asset.
 *
 * @param accountId  Stellar account G address
 * @param assetCode  E.g. "USDC", "TUSDC"
 * @param issuer     E.g. "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
 */
export async function getAssetBalance(
  accountId: string,
  assetCode: string,
  issuer: string,
): Promise<string> {
  const balances = await getBalances(accountId);
  const match = balances.find(
    (b) => b.asset_code === assetCode && b.asset_issuer === issuer,
  );
  return match?.balance ?? '0';
}

// ── Transaction history ────────────────────────────────────────────────────────

/**
 * Fetch the most recent payments for an account (limit 20 by default).
 * Useful for surfacing transaction history in the dashboard without indexing.
 */
export async function getRecentPayments(
  accountId: string,
  limit = 20,
): Promise<HorizonPayment[]> {
  const url = `${HORIZON_URL}/accounts/${accountId}/payments?limit=${limit}&order=desc`;
  const res = await fetch(url);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Horizon /payments error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { _embedded: { records: HorizonPayment[] } };
  return data._embedded?.records ?? [];
}

/**
 * Fetch recent transactions for an account (limit 20 by default).
 * Returns the raw Horizon records — callers may want to parse `memo` or `result_xdr`.
 */
export async function getRecentTransactions(
  accountId: string,
  limit = 20,
): Promise<Record<string, unknown>[]> {
  const url = `${HORIZON_URL}/accounts/${accountId}/transactions?limit=${limit}&order=desc`;
  const res = await fetch(url);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Horizon /transactions error: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { _embedded: { records: Record<string, unknown>[] } };
  return data._embedded?.records ?? [];
}

export interface HorizonOperation {
  id: string;
  type: string;
  transaction_hash: string;
  source_account?: string;
  from?: string;
  to?: string;
  asset_code?: string;
  asset_issuer?: string;
  amount?: string;
  successful?: boolean;
  transaction_successful?: boolean;
}

/**
 * Fetch operations for a specific transaction hash.
 * Useful for better event classification than memo-only heuristics.
 */
export async function getTransactionOperations(
  transactionHash: string,
  limit = 20,
): Promise<HorizonOperation[]> {
  const url = `${HORIZON_URL}/transactions/${transactionHash}/operations?limit=${limit}&order=asc&include_failed=true`;
  const res = await fetch(url);
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Horizon tx operations error: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { _embedded: { records: HorizonOperation[] } };
  return data._embedded?.records ?? [];
}

// ── Explorer links ─────────────────────────────────────────────────────────────

/**
 * Return a stellar.expert explorer URL for a transaction hash.
 * Detects testnet vs mainnet from the HORIZON_URL environment variable.
 */
export function explorerTxUrl(hash: string): string {
  const network = HORIZON_URL.includes('testnet') ? 'testnet' : 'public';
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}

/**
 * Return a stellar.expert explorer URL for an account.
 */
export function explorerAccountUrl(accountId: string): string {
  const network = HORIZON_URL.includes('testnet') ? 'testnet' : 'public';
  return `https://stellar.expert/explorer/${network}/account/${accountId}`;
}
