import { ACTIVE_CONTRACTS } from './addresses';
import { getRecentTransactions } from './horizon';

export type OnChainEvent = {
  signature: string;
  timestamp: number;
  success: boolean;
  eventType: string;
  signer: string;
  logs: string[];
};

let eventCache: { data: OnChainEvent[]; timestamp: number } | null = null;
const CACHE_TTL = 10_000;

function inferEventType(record: Record<string, unknown>): string {
  const memo = typeof record.memo === 'string' ? record.memo : '';
  if (memo.toLowerCase().includes('deposit')) return 'Deposit';
  if (memo.toLowerCase().includes('withdraw')) return 'Withdraw';
  if (memo.toLowerCase().includes('yield')) return 'Yield Accrual';
  if (memo.toLowerCase().includes('default')) return 'Credit Event';
  return 'Stellar Transaction';
}

export async function fetchOnChainEvents(limit = 20): Promise<OnChainEvent[]> {
  const now = Date.now();
  if (eventCache && now - eventCache.timestamp < CACHE_TTL) {
    return eventCache.data.slice(0, limit);
  }

  try {
    const records = await getRecentTransactions(ACTIVE_CONTRACTS.prismCore, limit);
    const events = records.map((record) => ({
      signature: String(record.hash ?? record.id ?? ''),
      timestamp: record.created_at
        ? Math.floor(new Date(String(record.created_at)).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
      success: Boolean(record.successful ?? true),
      eventType: inferEventType(record),
      signer: String(record.source_account ?? ACTIVE_CONTRACTS.prismCore),
      logs: [],
    }));
    eventCache = { data: events, timestamp: now };
    return events.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch Stellar events:', error);
    return eventCache ? eventCache.data.slice(0, limit) : [];
  }
}
