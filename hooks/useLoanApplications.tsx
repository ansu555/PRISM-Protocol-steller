'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export interface LoanApplication {
  id: string;
  borrowerPubkey: string;
  requestedUSDC: number;   // display units (not micro)
  maturityDays: number;
  purpose: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: number;
  loanId?: number;          // set by admin after on-chain origination
  vaultId: number;          // the capital pool selected during application
  approvedAprBps?: number;
}

const LS_KEY = 'prism_loan_applications';

interface ContextValue {
  applications: LoanApplication[];
  submit: (app: Omit<LoanApplication, 'id' | 'status' | 'submittedAt'>) => void;
  updateStatus: (id: string, status: 'pending' | 'approved' | 'rejected') => void;
  approve: (id: string, loanId: number, aprBps: number) => void;
  reject: (id: string) => void;
  getByBorrower: (pubkey: string) => LoanApplication | undefined;
  clearApplications: () => void;
}

const Ctx = createContext<ContextValue | null>(null);

function loadFromStorage(): LoanApplication[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function LoanApplicationProvider({ children }: { children: ReactNode }) {
  const [applications, setApplications] = useState<LoanApplication[]>(loadFromStorage);

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(applications));
  }, [applications]);

  const submit = useCallback((app: Omit<LoanApplication, 'id' | 'status' | 'submittedAt'>) => {
    setApplications((prev) => [
      ...prev,
      {
        ...app,
        id: crypto.randomUUID(),
        status: 'pending',
        submittedAt: Date.now(),
      },
    ]);
  }, []);

  const updateStatus = useCallback((id: string, status: 'pending' | 'approved' | 'rejected') => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const approve = useCallback((id: string, loanId: number, aprBps: number) => {
    setApplications((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'approved', loanId, approvedAprBps: aprBps } : a)),
    );
  }, []);

  const reject = useCallback((id: string) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'rejected' } : a)));
  }, []);

  const getByBorrower = useCallback(
    (pubkey: string) => [...applications].reverse().find((a) => a.borrowerPubkey === pubkey && a.status !== 'rejected'),
    [applications],
  );

  const clearApplications = useCallback(() => {
    setApplications([]);
    localStorage.removeItem(LS_KEY);
  }, []);

  return (
    <Ctx.Provider value={{ applications, submit, updateStatus, approve, reject, getByBorrower, clearApplications }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLoanApplications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLoanApplications must be inside LoanApplicationProvider');
  return ctx;
}
