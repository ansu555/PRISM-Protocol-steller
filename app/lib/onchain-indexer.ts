import { ACTIVE_CONTRACTS } from './addresses';
import { getRecentTransactions, getTransactionOperations } from './horizon';

export type OnChainEvent = {
  signature: string;
  timestamp: number;
  success: boolean;
  eventType: string;
  classificationConfidence: 'high' | 'medium' | 'low';
  classificationReason: string;
  signer: string;
  operationTypes: string[];
  logs: string[];
};

let eventCache: { data: OnChainEvent[]; timestamp: number } | null = null;
const CACHE_TTL = 10_000;

function inferEventType(
  record: Record<string, unknown>,
  operationTypes: string[],
): Pick<OnChainEvent, 'eventType' | 'classificationConfidence' | 'classificationReason'> {
  const successful = Boolean(record.successful ?? true);
  if (!successful) {
    return {
      eventType: 'Failed Transaction',
      classificationConfidence: 'high',
      classificationReason: 'Horizon transaction marked as unsuccessful',
    };
  }

  const memo = typeof record.memo === 'string' ? record.memo : '';
  const memoLower = memo.toLowerCase();

  if (memoLower.includes('deposit')) {
    return {
      eventType: 'Deposit',
      classificationConfidence: 'high',
      classificationReason: 'memo contains "deposit"',
    };
  }
  if (memoLower.includes('withdraw')) {
    return {
      eventType: 'Withdraw',
      classificationConfidence: 'high',
      classificationReason: 'memo contains "withdraw"',
    };
  }
  if (memoLower.includes('yield')) {
    return {
      eventType: 'Yield Accrual',
      classificationConfidence: 'high',
      classificationReason: 'memo contains "yield"',
    };
  }
  if (
    memoLower.includes('default') ||
    memoLower.includes('liquidat') ||
    memoLower.includes('credit event')
  ) {
    return {
      eventType: 'Credit Event',
      classificationConfidence: 'high',
      classificationReason: 'memo indicates a default/liquidation event',
    };
  }
  if (
    memoLower.includes('oracle') ||
    memoLower.includes('attest') ||
    memoLower.includes('collateral') ||
    memoLower.includes('encrypt') ||
    memoLower.includes('cloak')
  ) {
    return {
      eventType: 'Oracle Attestation',
      classificationConfidence: 'high',
      classificationReason: 'memo indicates oracle attestation flow',
    };
  }

  if (operationTypes.includes('invoke_host_function')) {
    return {
      eventType: 'Soroban Contract Invocation',
      classificationConfidence: 'medium',
      classificationReason: 'operation type includes invoke_host_function',
    };
  }
  if (operationTypes.includes('payment')) {
    return {
      eventType: 'Payment',
      classificationConfidence: 'medium',
      classificationReason: 'operation type includes payment',
    };
  }

  return {
    eventType: 'Stellar Transaction',
    classificationConfidence: 'low',
    classificationReason: 'no known memo/operation classification matched',
  };
}

export async function fetchOnChainEvents(limit = 20): Promise<OnChainEvent[]> {
  const now = Date.now();
  if (eventCache && now - eventCache.timestamp < CACHE_TTL) {
    return eventCache.data.slice(0, limit);
  }

  try {
    const records = await getRecentTransactions(ACTIVE_CONTRACTS.prismCore, limit);
    const events = await Promise.all(
      records.map(async (record) => {
        const signature = String(record.hash ?? record.id ?? '');
        let operations = [] as Awaited<ReturnType<typeof getTransactionOperations>>;
        if (signature) {
          try {
            operations = await getTransactionOperations(signature, 20);
          } catch (error) {
            console.warn(`Failed to fetch operations for tx ${signature}:`, error);
          }
        }
        const operationTypes = operations.map((operation) => operation.type);
        const classification = inferEventType(record, operationTypes);

        return {
          signature,
          timestamp: record.created_at
            ? Math.floor(new Date(String(record.created_at)).getTime() / 1000)
            : Math.floor(Date.now() / 1000),
          success: Boolean(record.successful ?? true),
          eventType: classification.eventType,
          classificationConfidence: classification.classificationConfidence,
          classificationReason: classification.classificationReason,
          signer: String(record.source_account ?? ACTIVE_CONTRACTS.prismCore),
          operationTypes,
          logs: operationTypes,
        };
      }),
    );
    eventCache = { data: events, timestamp: now };
    return events.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch Stellar events:', error);
    return eventCache ? eventCache.data.slice(0, limit) : [];
  }
}
