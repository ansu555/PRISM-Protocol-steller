// MoneyGram Access — SEP-24 interactive deposit client.
//
// MoneyGram Access fiat ramp for borrower USDC funding.
//
// Flow:
//   1. Fetch stellar.toml from the anchor domain to discover SEP-10 + SEP-24 URLs.
//   2. Run SEP-10 Web Authentication to get a JWT for the user's keypair.
//   3. Call SEP-24 interactive deposit endpoint to get the popup URL.
//   4. Caller opens the URL — the rest is handled by MoneyGram's hosted UI.
//
// Env vars (all optional, have sensible defaults):
//   NEXT_PUBLIC_MONEYGRAM_ANCHOR_DOMAIN   anchor home domain
//   NEXT_PUBLIC_MONEYGRAM_ASSET_CODE      asset code, default 'USDC'

import { Keypair, Transaction, StellarToml } from '@stellar/stellar-sdk';
import { NETWORK_PASSPHRASE } from '@/app/lib/constants';

export const MONEYGRAM_ANCHOR_DOMAIN =
  process.env.NEXT_PUBLIC_MONEYGRAM_ANCHOR_DOMAIN ?? 'stellar.moneygram.com';

export const MONEYGRAM_ASSET_CODE =
  process.env.NEXT_PUBLIC_MONEYGRAM_ASSET_CODE ?? 'USDC';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MoneyGramDepositResult {
  /** Interactive URL — open in a new tab or popup. */
  url: string;
  /** SEP-24 transaction ID for status polling via /sep24/transaction?id=... */
  transactionId: string;
}

// ─── TOML discovery ───────────────────────────────────────────────────────────

interface AnchorEndpoints {
  sep10Url: string;
  sep24Url: string;
}

async function resolveAnchorEndpoints(domain: string): Promise<AnchorEndpoints> {
  const toml = await StellarToml.Resolver.resolve(domain);

  const sep10Url = (toml as Record<string, unknown>).WEB_AUTH_ENDPOINT as string | undefined;
  const sep24Url = (toml as Record<string, unknown>).TRANSFER_SERVER_SEP0024 as string | undefined;

  if (!sep10Url) {
    throw new Error(`Anchor ${domain}: WEB_AUTH_ENDPOINT missing from stellar.toml`);
  }
  if (!sep24Url) {
    throw new Error(`Anchor ${domain}: TRANSFER_SERVER_SEP0024 missing from stellar.toml`);
  }

  return { sep10Url, sep24Url };
}

// ─── SEP-10 Web Auth ──────────────────────────────────────────────────────────

async function sep10GetJwt(
  sep10Url: string,
  keypair: Keypair,
  networkPassphrase: string,
): Promise<string> {
  // 1. Fetch challenge transaction from anchor
  const challengeRes = await fetch(`${sep10Url}?account=${keypair.publicKey()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!challengeRes.ok) {
    const body = await challengeRes.text();
    throw new Error(`SEP-10 challenge failed (${challengeRes.status}): ${body}`);
  }
  const { transaction: challengeXdr } = await challengeRes.json() as { transaction: string };
  if (!challengeXdr) throw new Error('SEP-10: anchor returned no transaction XDR');

  // 2. Sign with keypair
  const tx = new Transaction(challengeXdr, networkPassphrase);
  tx.sign(keypair);
  const signedXdr = tx.toEnvelope().toXDR('base64');

  // 3. Exchange signed XDR for JWT
  const jwtRes = await fetch(sep10Url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signedXdr }),
  });
  if (!jwtRes.ok) {
    const body = await jwtRes.text();
    throw new Error(`SEP-10 JWT exchange failed (${jwtRes.status}): ${body}`);
  }
  const { token } = await jwtRes.json() as { token?: string };
  if (!token) throw new Error('SEP-10: anchor returned no token');
  return token;
}

// ─── SEP-24 Interactive Deposit ───────────────────────────────────────────────

async function sep24StartDeposit(
  sep24Url: string,
  jwt: string,
  account: string,
  assetCode: string,
  amountUsdc?: number,
): Promise<MoneyGramDepositResult> {
  const body = new FormData();
  body.append('asset_code', assetCode);
  body.append('account', account);
  if (amountUsdc !== undefined && amountUsdc > 0) {
    body.append('amount', amountUsdc.toFixed(2));
  }

  const res = await fetch(`${sep24Url}/transactions/deposit/interactive`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SEP-24 deposit failed (${res.status}): ${text}`);
  }
  const data = await res.json() as { url?: string; id?: string };
  if (!data.url) throw new Error('SEP-24: anchor returned no interactive URL');

  return {
    url: data.url,
    transactionId: data.id ?? '',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initiate a MoneyGram fiat-to-USDC deposit via SEP-24.
 *
 * @param keypair           User's Stellar keypair (for SEP-10 signing).
 * @param amountUsdc        Optional suggested deposit amount in USD.
 * @param assetCode         Asset to deposit; defaults to NEXT_PUBLIC_MONEYGRAM_ASSET_CODE.
 * @param anchorDomain      Anchor home domain; defaults to NEXT_PUBLIC_MONEYGRAM_ANCHOR_DOMAIN.
 * @param networkPassphrase Stellar network passphrase; defaults to NETWORK_PASSPHRASE constant.
 * @returns Interactive URL to open in a popup or new tab.
 */
export async function initiateMoneyGramDeposit({
  keypair,
  amountUsdc,
  assetCode = MONEYGRAM_ASSET_CODE,
  anchorDomain = MONEYGRAM_ANCHOR_DOMAIN,
  networkPassphrase = NETWORK_PASSPHRASE,
}: {
  keypair: Keypair;
  amountUsdc?: number;
  assetCode?: string;
  anchorDomain?: string;
  networkPassphrase?: string;
}): Promise<MoneyGramDepositResult> {
  const { sep10Url, sep24Url } = await resolveAnchorEndpoints(anchorDomain);
  const jwt = await sep10GetJwt(sep10Url, keypair, networkPassphrase);
  return sep24StartDeposit(sep24Url, jwt, keypair.publicKey(), assetCode, amountUsdc);
}
