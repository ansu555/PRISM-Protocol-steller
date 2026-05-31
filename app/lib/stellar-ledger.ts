import { USDC_ASSET_CODE } from './constants';
import { getBalances } from './horizon';

export type ProtocolEvent = {
  signature: string;
  timestamp: number;
  success: boolean;
  eventType: string;
  signer: string;
  contractId?: string;
};

export type LedgerBalance = {
  symbol: string;
  amount: string;
  amount_raw: string;
  decimals: number;
  token_address?: string;
  price_usd?: number;
  value_usd?: number;
};

export type FetchBalancesResult = {
  wallet_address: string;
  balances: LedgerBalance[];
};

export async function fetchStellarBalances(address: string): Promise<FetchBalancesResult> {
  try {
    const balances = await getBalances(address);
    return {
      wallet_address: address,
      balances: balances.map((balance) => ({
        symbol: balance.asset_type === 'native' ? 'XLM' : balance.asset_code ?? USDC_ASSET_CODE,
        amount: balance.balance,
        amount_raw: balance.balance,
        decimals: 7,
        token_address: balance.asset_issuer,
      })),
    };
  } catch {
    return { wallet_address: address, balances: [] };
  }
}
