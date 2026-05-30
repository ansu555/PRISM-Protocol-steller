'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { VAULT_ID } from '@/app/lib/constants';

export interface LoanApplication {
  id: string;
  borrowerPubkey: string;
  requestedUSDC: number;
  maturityDays: number;
  purpose: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: number;
  loanId?: number;
  vaultId: number;
  approvedAprBps?: number;
}

function rowToApp(row: Record<string, unknown>): LoanApplication {
  return {
    id: String(row.id),
    borrowerPubkey: String(row.borrower_pubkey),
    requestedUSDC: Number(row.requested_usdc),
    maturityDays: Number(row.maturity_days),
    purpose: String(row.purpose ?? ''),
    status: String(row.status) as LoanApplication['status'],
    submittedAt: Number(row.submitted_at),
    loanId: row.loan_id != null ? Number(row.loan_id) : undefined,
    vaultId: Number(row.vault_id),
    approvedAprBps: row.approved_apr_bps != null ? Number(row.approved_apr_bps) : undefined,
  };
}

async function fetchApplications(vaultId: number): Promise<LoanApplication[]> {
  const res = await fetch(`/api/loan-applications?vaultId=${vaultId}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.applications as Record<string, unknown>[]).map(rowToApp);
}

interface ContextValue {
  applications: LoanApplication[];
  isLoading: boolean;
  submit: (app: Omit<LoanApplication, 'id' | 'status' | 'submittedAt'>) => Promise<void>;
  approve: (id: string, loanId: number, aprBps: number) => Promise<void>;
  reject: (id: string) => Promise<void>;
  getByBorrower: (pubkey: string) => LoanApplication | undefined;
}

const Ctx = createContext<ContextValue | null>(null);

export function LoanApplicationProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const vaultId = VAULT_ID;
  const qKey = ['loan-applications', vaultId];

  const { data: applications = [], isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => fetchApplications(vaultId),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: qKey }), [qc]);

  const submitMut = useMutation({
    mutationFn: async (app: Omit<LoanApplication, 'id' | 'status' | 'submittedAt'>) => {
      const id = crypto.randomUUID();
      const res = await fetch('/api/loan-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...app, borrowerPubkey: app.borrowerPubkey, submittedAt: Date.now() }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: invalidate,
  });

  const approveMut = useMutation({
    mutationFn: async ({ id, loanId, aprBps }: { id: string; loanId: number; aprBps: number }) => {
      const res = await fetch(`/api/loan-applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', loanId, approvedAprBps: aprBps }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: invalidate,
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/loan-applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' }),
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: invalidate,
  });

  const submit = useCallback(
    (app: Omit<LoanApplication, 'id' | 'status' | 'submittedAt'>) => submitMut.mutateAsync(app),
    [submitMut],
  );

  const approve = useCallback(
    (id: string, loanId: number, aprBps: number) => approveMut.mutateAsync({ id, loanId, aprBps }),
    [approveMut],
  );

  const reject = useCallback(
    (id: string) => rejectMut.mutateAsync(id),
    [rejectMut],
  );

  const getByBorrower = useCallback(
    (pubkey: string) =>
      [...applications].reverse().find((a) => a.borrowerPubkey === pubkey && a.status !== 'rejected'),
    [applications],
  );

  return (
    <Ctx.Provider value={{ applications, isLoading, submit, approve, reject, getByBorrower }}>
      {children}
    </Ctx.Provider>
  );
}

export function useLoanApplications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLoanApplications must be inside LoanApplicationProvider');
  return ctx;
}
