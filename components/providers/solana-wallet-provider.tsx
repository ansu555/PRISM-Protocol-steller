// Renamed Stellar build keeps the old `SolanaWalletProvider` export to avoid
// rewiring every layout. Real implementation lives in stellar-wallet-provider.tsx.
'use client';

export { StellarWalletProvider as SolanaWalletProvider } from './stellar-wallet-provider';
