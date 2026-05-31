'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useState, type ReactNode } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { IdentityProvider } from '@/hooks/useIdentity';
import { SimulationActionProvider } from '@/hooks/useSimulationActions';
import { SimulationLogProvider } from '@/hooks/useSimulationLog';
import { LoanApplicationProvider } from '@/hooks/useLoanApplications';
import { SelectedVaultProvider } from '@/hooks/useSelectedVault';

// The wallet provider talks to a browser extension API, so we dynamic-import
// it with SSR disabled. The rest of the app still renders during SSR; wallet UI
// shows a placeholder until hydration completes.
const StellarWalletProvider = dynamic(
  () => import('./stellar-wallet-provider').then((m) => m.StellarWalletProvider),
  { ssr: false },
);

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <StellarWalletProvider>
      <QueryClientProvider client={queryClient}>
        <SelectedVaultProvider>
          <IdentityProvider>
            <SimulationLogProvider>
              <SimulationActionProvider>
                <LoanApplicationProvider>{children}</LoanApplicationProvider>
              </SimulationActionProvider>
            </SimulationLogProvider>
          </IdentityProvider>
        </SelectedVaultProvider>
        <Toaster richColors position="bottom-right" />
      </QueryClientProvider>
    </StellarWalletProvider>
  );
}
