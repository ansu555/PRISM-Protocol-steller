import { PRISM_CORE_CONTRACT_ID, SOROBAN_RPC_URL } from './constants';

export type OnChainEvent = {
  signature: string;
  timestamp: number;
  success: boolean;
  eventType: string;
  signer: string;
  logs: string[];
};

let eventCache: { data: OnChainEvent[], timestamp: number } | null = null;
const CACHE_TTL = 10000;

export async function fetchOnChainEvents(
  _connection?: unknown,
  limit = 20
): Promise<OnChainEvent[]> {
  const now = Date.now();

  if (eventCache && (now - eventCache.timestamp < CACHE_TTL)) {
    return eventCache.data.slice(0, limit);
  }

  try {
    const res = await fetch(SOROBAN_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getEvents',
        params: {
          startLedger: 0,
          filters: [
            {
              type: 'contract',
              contractIds: [PRISM_CORE_CONTRACT_ID],
            },
          ],
          pagination: { limit },
        },
      }),
    });

    if (!res.ok) return eventCache ? eventCache.data.slice(0, limit) : [];

    const json = await res.json();
    const events = json?.result?.events ?? [];

    const result: OnChainEvent[] = events.map((e: { id: string; ledgerClosed: string; type: string; contractId: string }) => ({
      signature: e.id ?? '',
      timestamp: e.ledgerClosed ? Math.floor(new Date(e.ledgerClosed).getTime() / 1000) : Math.floor(Date.now() / 1000),
      success: true,
      eventType: e.type ?? 'ContractEvent',
      signer: e.contractId ?? PRISM_CORE_CONTRACT_ID,
      logs: [],
    }));

    eventCache = { data: result, timestamp: now };
    return result.slice(0, limit);
  } catch (err) {
    console.error('Failed to fetch on-chain events:', err);
    return eventCache ? eventCache.data.slice(0, limit) : [];
  }
}
