'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

type ProtectionStateContextType = {
  exposureAmount: string;
  setExposureAmount: (val: string) => void;
  protectionNotional: string;
  setProtectionNotional: (val: string) => void;
  duration: number;
  setDuration: (val: number) => void;
  hedgeType: 'standard' | 'alpha' | 'total';
  setHedgeType: (val: 'standard' | 'alpha' | 'total') => void;
  basisPoints: number;
  setBasisPoints: (val: number) => void;
};

const ProtectionStateContext = createContext<ProtectionStateContextType | undefined>(undefined);

export function ProtectionProvider({ children }: { children: ReactNode }) {
  const [exposureAmount, setExposureAmount] = useState('125000');
  const [protectionNotional, setProtectionNotional] = useState('100000');
  const [duration, setDuration] = useState(90);
  const [hedgeType, setHedgeType] = useState<'standard' | 'alpha' | 'total'>('standard');
  const [basisPoints, setBasisPoints] = useState(250);

  return (
    <ProtectionStateContext.Provider value={{
      exposureAmount, setExposureAmount,
      protectionNotional, setProtectionNotional,
      duration, setDuration,
      hedgeType, setHedgeType,
      basisPoints, setBasisPoints
    }}>
      {children}
    </ProtectionStateContext.Provider>
  );
}

export function useProtectionState() {
  const context = useContext(ProtectionStateContext);
  if (context === undefined) {
    throw new Error('useProtectionState must be used within a ProtectionProvider');
  }
  return context;
}
