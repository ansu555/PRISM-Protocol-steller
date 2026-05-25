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

const INSTRUCTION_MAP: Record<string, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdraw',
  accrue_yield: 'Yield Accrual',
  trigger_credit_event: 'Credit Event',
  disburse_loan: 'Disbursement',
  repay_loan: 'Repayment',
  initialize_vault: 'Vault Init',
  initialize_loan: 'Loan Created',
  swap: 'AMM Swap',
  add_liquidity: 'Add Liquidity',
  remove_liquidity: 'Remove Liquidity',
};

function inferEventType(logs?: string[]): string {
  if (!logs) return 'Transaction';
  for (const line of logs) {
    const match = line.match(/Program log: Instruction: (\w+)/);
    if (match) {
      const key = match[1].toLowerCase();
      if (INSTRUCTION_MAP[key]) return INSTRUCTION_MAP[key];
    }
  }
  return 'Transaction';
}

type RawDuneTx = {
  address: string;
  block_time: number;
  block_slot: number;
  chain: string;
  raw_transaction: {
    transaction: {
      signatures: string[];
      message: {
        accountKeys: string[];
      };
    };
    meta: {
      status: { err: unknown };
      logMessages?: string[];
    };
  };
};

export async function fetchProtocolEvents(
  address: string,
  limit = 50,
): Promise<FetchEventsResult> {
  try {
    // 1. Fetch from Dune SIM — /beta/svm/transactions (mainnet target)
    const dunePromise = fetch(
      `/api/dune?endpoint=beta/svm/transactions/${address}&limit=${limit}`,
    ).then(res => res.ok ? res.json() : { transactions: [] })
     .then(data => {
        const txs: RawDuneTx[] = data.transactions ?? [];
        return {
          count: txs.length,
          events: txs.map((tx) => ({
            timestamp: Math.floor(tx.block_time / 1_000_000),
            signature: tx.raw_transaction.transaction.signatures[0] ?? '',
            success: tx.raw_transaction.meta.status.err === null,
            signer: tx.raw_transaction.transaction.message.accountKeys[0] ?? '',
            eventType: inferEventType(tx.raw_transaction.meta.logMessages),
          })),
        };
     });

    // 2. Fetch from Local DB Indexer (Devnet/Testnet)
    const localPromise = fetch(`/api/events?limit=${limit}&sync=true`)
      .then(res => res.ok ? res.json() : { events: [] })
      .then(data => data.events as ProtocolEvent[]);

    const [duneResult, localEvents] = await Promise.all([dunePromise, localPromise]);

    const allEvents = [...localEvents, ...duneResult.events];
    const uniqueEvents = Array.from(new Map(allEvents.map(e => [e.signature, e])).values());

    return {
      events: uniqueEvents.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit),
      duneCount: duneResult.count,
    };
  } catch (err) {
    console.error('Error fetching events:', err);
    return { events: [], duneCount: 0 };
  }
}

export async function fetchDuneBalances(address: string): Promise<FetchBalancesResult> {
  try {
    const res = await fetch(`/api/dune?endpoint=beta/svm/balances/${address}`);
    if (!res.ok) return { wallet_address: address, balances: [] };
    const data = await res.json();
    return { wallet_address: address, balances: data.balances ?? [] };
  } catch {
    return { wallet_address: address, balances: [] };
  }
}
