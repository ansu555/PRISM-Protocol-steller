'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

import { VAULT_ID } from '@/app/lib/constants';

type SelectedVaultCtx = {
  vaultId: number;
  setVaultId: (id: number) => void;
};

const SelectedVaultContext = createContext<SelectedVaultCtx>({
  vaultId: VAULT_ID,
  setVaultId: () => {},
});

export function SelectedVaultProvider({ children }: { children: ReactNode }) {
  const [vaultId, setVaultId] = useState(VAULT_ID);
  return (
    <SelectedVaultContext.Provider value={{ vaultId, setVaultId }}>
      {children}
    </SelectedVaultContext.Provider>
  );
}

export function useSelectedVaultId() {
  return useContext(SelectedVaultContext);
}
