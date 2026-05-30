'use client';

import { useQuery } from '@tanstack/react-query';
import { scValToNative } from '@stellar/stellar-sdk';

import {
  PRISM_CORE_CONTRACT_ID,
  PRISM_AMM_CONTRACT_ID,
  PTOKEN_PRIME_CONTRACT_ID,
  PTOKEN_CORE_CONTRACT_ID,
  PTOKEN_ALPHA_CONTRACT_ID,
} from '@/app/lib/constants';
import { getRpcServer } from '@/app/lib/stellar';

export type ProtocolEvent = {
  signature: string;
  timestamp: number;
  success: boolean;
  eventType: string;
  signer: string;
  contractId: string;
};

export type FetchEventsResult = {
  events: ProtocolEvent[];
  duneCount: number;
};

const EMPTY: FetchEventsResult = { events: [], duneCount: 0 };

function findAddressInScVal(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string' && (val.startsWith('G') || val.startsWith('C')) && val.length === 56) {
    return val;
  }
  if (Array.isArray(val)) {
    for (const item of val) {
      const res = findAddressInScVal(item);
      if (res) return res;
    }
  } else if (typeof val === 'object') {
    for (const k in val) {
      const res = findAddressInScVal(val[k]);
      if (res) return res;
    }
  }
  return null;
}

export function useEvents() {
  return useQuery<FetchEventsResult>({
    queryKey: ['soroban-events', PRISM_CORE_CONTRACT_ID],
    refetchInterval: 10_000,
    staleTime: 5_000,
    initialData: EMPTY,
    queryFn: async () => {
      try {
        const server = getRpcServer();
        const latest = await server.getLatestLedger();
        
        // Scan last 3000 ledgers (roughly 4 hours of history)
        const startLedger = Math.max(1, latest.sequence - 3000);

        const contractIds = [
          PRISM_CORE_CONTRACT_ID,
          PRISM_AMM_CONTRACT_ID,
          PTOKEN_PRIME_CONTRACT_ID,
          PTOKEN_CORE_CONTRACT_ID,
          PTOKEN_ALPHA_CONTRACT_ID,
        ].filter(Boolean);

        const res = await server.getEvents({
          startLedger,
          filters: [
            {
              type: 'contract',
              contractIds,
            },
          ],
          limit: 50,
        });

        const mapped: ProtocolEvent[] = (res.events || []).map((e) => {
          let nativeTopics: any[] = [];
          try {
            nativeTopics = e.topic.map((t) => scValToNative(t));
          } catch {
            nativeTopics = ['*'];
          }

          let nativeVal: any = null;
          try {
            nativeVal = scValToNative(e.value);
          } catch {}

          const contractId = typeof e.contractId === 'string'
            ? e.contractId
            : e.contractId && typeof e.contractId === 'object' && 'toString' in e.contractId
            ? String(e.contractId)
            : PRISM_CORE_CONTRACT_ID;

          const signer =
            findAddressInScVal(nativeTopics) ||
            findAddressInScVal(nativeVal) ||
            contractId ||
            PRISM_CORE_CONTRACT_ID;

          // Standardize event types (e.g., Symbol topics)
          const firstTopic = nativeTopics[0];
          const eventType = typeof firstTopic === 'string'
            ? firstTopic.toUpperCase()
            : firstTopic && typeof firstTopic === 'object' && 'toString' in firstTopic
            ? String(firstTopic).toUpperCase()
            : 'CONTRACT EVENT';

          const timestamp = e.ledgerClosedAt
            ? Math.floor(new Date(e.ledgerClosedAt).getTime() / 1000)
            : Math.floor(Date.now() / 1000);

          return {
            signature: e.txHash,
            timestamp,
            success: e.inSuccessfulContractCall ?? true,
            eventType,
            signer,
            contractId,
          };
        });

        // De-duplicate and sort by timestamp desc
        const uniqueEvents = Array.from(
          new Map(mapped.map((event) => [event.signature, event])).values()
        );

        return {
          events: uniqueEvents.sort((a, b) => b.timestamp - a.timestamp),
          duneCount: 0,
        };
      } catch (error) {
        console.error('Error fetching Soroban events:', error);
        return EMPTY;
      }
    },
  });
}
