'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

// Collateral chain IDs matching the PRISM Collateral Oracle message layout (§6.6).
export type CollateralChain = 'XLM' | 'USDC';

export const COLLATERAL_CHAIN: Record<CollateralChain, number> = {
  XLM: 3,
  USDC: 4,
};

export type BorrowerType = 'individual' | 'institutional';
export type BorrowPurpose =
  | 'working-capital'
  | 'inventory-purchase'
  | 'equipment-financing'
  | 'trade-finance'
  | 'treasury-operations'
  | 'acquisition-financing';

interface BorrowerState {
  // Loan parameters
  amount: string;
  duration: number;
  purpose: BorrowPurpose;
  borrowerType: BorrowerType;
  chainId: CollateralChain;
  collateralUsd: string;
  // Vault selection (new)
  selectedVaultId: number | null;
  // Step management
  currentStep: number;
  // Setters
  setAmount: (v: string) => void;
  setDuration: (v: number) => void;
  setPurpose: (v: BorrowPurpose) => void;
  setBorrowerType: (v: BorrowerType) => void;
  setChainId: (v: CollateralChain) => void;
  setCollateralUsd: (v: string) => void;
  setSelectedVaultId: (v: number | null) => void;
  setCurrentStep: (v: number) => void;
}

const Ctx = createContext<BorrowerState | null>(null);

export function BorrowerProvider({ children }: { children: ReactNode }) {
  const [amount, setAmount] = useState('50000');
  const [duration, setDuration] = useState(90);
  const [purpose, setPurpose] = useState<BorrowPurpose>('working-capital');
  const [borrowerType, setBorrowerType] = useState<BorrowerType>('institutional');
  const [chainId, setChainId] = useState<CollateralChain>('XLM');
  const [collateralUsd, setCollateralUsd] = useState('75000');
  const [selectedVaultId, setSelectedVaultId] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  return (
    <Ctx.Provider value={{
      amount, duration, purpose, borrowerType, chainId, collateralUsd, selectedVaultId, currentStep,
      setAmount, setDuration, setPurpose, setBorrowerType, setChainId,
      setCollateralUsd, setSelectedVaultId, setCurrentStep,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useBorrowerState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBorrowerState must be used within BorrowerProvider');
  return ctx;
}
