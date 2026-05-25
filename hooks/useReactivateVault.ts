'use client';

// Stub: no `reactivate_vault` exists in the Stellar prism-core contract.
// Closest equivalent is calling `trigger_credit_event` with event_type =
// Recovery (which flips Defaulted → Active inside the contract logic). The
// admin UI flow that called this in the Solana build isn't wired up yet on
// the Stellar side — surfacing a clear error so we don't quietly fail.

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export function useReactivateVault(vaultId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      throw new Error(
        'reactivate_vault is not exposed on the Stellar build yet. ' +
          'Trigger a Recovery credit event via the admin panel to revive vault ' +
          `#${vaultId}.`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault-state'] });
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Reactivation unavailable');
    },
  });
}
