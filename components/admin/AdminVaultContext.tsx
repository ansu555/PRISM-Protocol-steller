'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface AdminVaultContextValue {
  vaultId: number;
  setVaultId: (id: number) => void;
  log: string[];
  addLog: (msg: string) => void;
  clearLog: () => void;
}

const AdminVaultContext = createContext<AdminVaultContextValue>({
  vaultId: 0,
  setVaultId: () => {},
  log: [],
  addLog: () => {},
  clearLog: () => {},
});

export function AdminVaultProvider({ children }: { children: ReactNode }) {
  const [vaultId, setVaultId] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 300));
  }, []);

  const clearLog = useCallback(() => setLog([]), []);

  return (
    <AdminVaultContext.Provider value={{ vaultId, setVaultId, log, addLog, clearLog }}>
      {children}
    </AdminVaultContext.Provider>
  );
}

export function useAdminVault() {
  return useContext(AdminVaultContext);
}
