import { USDC_ASSET_CODE } from './constants';
import { getBalances, getRecentTransactions } from './horizon';

export type ProtocolEvent = {
  signature: string;
  timestamp: number;
  success: boolean;
  eventType: string;
  signer: string;
};

export type DuneBalance = {
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
  balances: DuneBalance[];
};

export type FetchEventsResult = {
  events: ProtocolEvent[];
  duneCount: number;
};

export async function fetchProtocolEvents(address: string, limit = 50): Promise<FetchEventsResult> {
  try {
    const localEvents = await fetch(`/api/events?limit=${limit}&sync=true`)
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((data) => data.events as ProtocolEvent[]);

    const horizonEvents = await getRecentTransactions(address, limit).catch(() => []);
    const normalized = horizonEvents.map((record) => ({
      timestamp: record.created_at
        ? Math.floor(new Date(String(record.created_at)).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
      signature: String(record.hash ?? record.id ?? ''),
      success: Boolean(record.successful ?? true),
      signer: String(record.source_account ?? address),
      eventType: 'Stellar Transaction',
    }));

    const allEvents = [...localEvents, ...normalized];
    const uniqueEvents = Array.from(new Map(allEvents.map((event) => [event.signature, event])).values());
    return {
      events: uniqueEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit),
      duneCount: 0,
    };
  } catch (error) {
    console.error('Error fetching Stellar events:', error);
    return { events: [], duneCount: 0 };
  }
}

export async function fetchDuneBalances(address: string): Promise<FetchBalancesResult> {
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
