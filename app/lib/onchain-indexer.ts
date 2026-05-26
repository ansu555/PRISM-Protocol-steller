import { Connection, PublicKey } from '@solana/web3.js';
import { PRISM_CORE_PROGRAM_ID } from './constants';

export type OnChainEvent = {
  signature: string;
  timestamp: number;
  success: boolean;
  eventType: string;
  signer: string;
  logs: string[];
};

let eventCache: { data: OnChainEvent[], timestamp: number } | null = null;
const CACHE_TTL = 10000; // 10 seconds cache

export async function fetchOnChainEvents(
  connection: Connection,
  limit = 20
): Promise<OnChainEvent[]> {
  const now = Date.now();
  
  // Return cached data if valid
  if (eventCache && (now - eventCache.timestamp < CACHE_TTL)) {
    return eventCache.data.slice(0, limit);
  }

  try {
    // Fetch signatures
    const signatures = await connection.getSignaturesForAddress(PRISM_CORE_PROGRAM_ID, { limit });
    if (signatures.length === 0) return [];

    // Batch get transactions in chunks of 10 to avoid 429s on public RPCs
    const sigStrings = signatures.map((s) => s.signature);
    const CHUNK_SIZE = 10;
    let allTxs: any[] = [];

    for (let i = 0; i < sigStrings.length; i += CHUNK_SIZE) {
      const chunk = sigStrings.slice(i, i + CHUNK_SIZE);
      try {
        const chunkTxs = await connection.getParsedTransactions(
          chunk,
          { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }
        );
        allTxs = allTxs.concat(chunkTxs);
      } catch (txErr: any) {
        if (txErr.message?.includes('429') || txErr.code === 429) {
          console.warn(`RPC rate limit reached at chunk ${i/CHUNK_SIZE}. Returning partial data.`);
          break;
        }
        throw txErr;
      }
    }

    const result = allTxs
      .map((tx, idx) => {
        if (!tx) return null;
        const sig = sigStrings[idx];
        const logs = tx.meta?.logMessages || [];
        const success = tx.meta?.err === null;
        const timestamp = tx.blockTime || Math.floor(Date.now() / 1000);
        const signer = tx.transaction.message.accountKeys[0].pubkey.toBase58();

        // Infer instruction name from logs
        let eventType = 'Transaction';
        for (const log of logs) {
          const match = log.match(/Program log: Instruction: (\w+)/);
          if (match) {
            eventType = match[1];
            break;
          }
        }

        return {
          signature: sig,
          timestamp,
          success,
          eventType,
          signer,
          logs
        };
      })
      .filter((e): e is OnChainEvent => e !== null);

    // Update cache
    eventCache = { data: result, timestamp: now };
    return result;
  } catch (err) {
    console.error('Failed to fetch on-chain events:', err);
    return eventCache ? eventCache.data.slice(0, limit) : [];
  }
}
