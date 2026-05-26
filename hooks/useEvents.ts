'use client';

import { useQuery } from '@tanstack/react-query';

import { PRISM_CORE_CONTRACT_ID } from '@/app/lib/constants';
import { fetchProtocolEvents, type FetchEventsResult } from '@/app/lib/dune-sim';

const EMPTY: FetchEventsResult = { events: [], duneCount: 0 };

export function useEvents() {
  return useQuery<FetchEventsResult>({
    queryKey: ['dune-events', PRISM_CORE_CONTRACT_ID],
    queryFn: () => fetchProtocolEvents(PRISM_CORE_CONTRACT_ID),
    refetchInterval: 15_000,
    staleTime: 10_000,
    initialData: EMPTY,
  });
}
