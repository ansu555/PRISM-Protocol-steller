// XION contract registry — the CosmWasm counterpart to `addresses.ts`.
//
// Kept as a separate module during the migration so the existing Stellar build
// continues to compile. Once the cutover is complete, this replaces
// `addresses.ts` and the Stellar registry is deleted.
//
// Usage:
//   import { ACTIVE_XION } from '@/app/lib/xion-addresses';
//   const id = ACTIVE_XION.prismCore;

export interface XionContractSet {
  /** prism-core CosmWasm contract (vaults, tranches, loans, waterfall, cascade). */
  prismCore: string;
  /** cw20 USDC contract. */
  usdc: string;
  /** cw20 pToken for the Prime tranche. */
  ptokenPrime: string;
  /** cw20 pToken for the Core tranche. */
  ptokenCore: string;
  /** cw20 pToken for the Alpha tranche. */
  ptokenAlpha: string;
  /** Self-deployed CW AMM pair/router used for tranche-token swaps (optional until seeded). */
  dexRouter?: string;
  /** Treasury contract for Abstraxion gasless fee grants (optional). */
  treasury?: string;
  /** CometBFT RPC endpoint. */
  rpcUrl: string;
  /** LCD/REST endpoint. */
  restUrl: string;
  /** Cosmos chain id (replaces the Stellar network passphrase). */
  chainId: string;
  /** Bech32 address prefix. */
  prefix: string;
  /** Native gas denom. */
  denom: string;
  /** Gas price string for `auto` fee estimation, e.g. "0.025uxion". */
  gasPrice: string;
}

export const XION_NETWORKS: Record<'testnet' | 'mainnet', XionContractSet> = {
  testnet: {
    prismCore: process.env.NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID ?? '',
    usdc: process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ?? '',
    ptokenPrime: process.env.NEXT_PUBLIC_PTOKEN_PRIME_CONTRACT_ID ?? '',
    ptokenCore: process.env.NEXT_PUBLIC_PTOKEN_CORE_CONTRACT_ID ?? '',
    ptokenAlpha: process.env.NEXT_PUBLIC_PTOKEN_ALPHA_CONTRACT_ID ?? '',
    dexRouter: process.env.NEXT_PUBLIC_DEX_ROUTER_ID,
    treasury: process.env.NEXT_PUBLIC_TREASURY_CONTRACT_ID,
    rpcUrl: process.env.NEXT_PUBLIC_XION_RPC_URL ?? 'https://rpc.xion-testnet-2.burnt.com:443',
    restUrl: process.env.NEXT_PUBLIC_XION_REST_URL ?? 'https://api.xion-testnet-2.burnt.com',
    chainId: process.env.NEXT_PUBLIC_XION_CHAIN_ID ?? 'xion-testnet-2',
    prefix: 'xion',
    denom: 'uxion',
    gasPrice: process.env.NEXT_PUBLIC_XION_GAS_PRICE ?? '0.025uxion',
  },
  mainnet: {
    prismCore: process.env.NEXT_PUBLIC_PRISM_CORE_MAINNET_ID ?? '',
    usdc: process.env.NEXT_PUBLIC_USDC_MAINNET_ID ?? '',
    ptokenPrime: process.env.NEXT_PUBLIC_PTOKEN_PRIME_MAINNET_ID ?? '',
    ptokenCore: process.env.NEXT_PUBLIC_PTOKEN_CORE_MAINNET_ID ?? '',
    ptokenAlpha: process.env.NEXT_PUBLIC_PTOKEN_ALPHA_MAINNET_ID ?? '',
    dexRouter: process.env.NEXT_PUBLIC_DEX_ROUTER_MAINNET_ID,
    treasury: process.env.NEXT_PUBLIC_TREASURY_MAINNET_ID,
    rpcUrl: process.env.NEXT_PUBLIC_XION_RPC_URL_MAINNET ?? 'https://rpc.xion-mainnet-1.burnt.com:443',
    restUrl: process.env.NEXT_PUBLIC_XION_REST_URL_MAINNET ?? 'https://api.xion-mainnet-1.burnt.com',
    chainId: process.env.NEXT_PUBLIC_XION_CHAIN_ID_MAINNET ?? 'xion-mainnet-1',
    prefix: 'xion',
    denom: 'uxion',
    gasPrice: process.env.NEXT_PUBLIC_XION_GAS_PRICE ?? '0.025uxion',
  },
};

function resolveNetwork(): 'testnet' | 'mainnet' {
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem('prism_network');
    if (stored === 'mainnet' || stored === 'testnet') return stored;
  }
  return (process.env.NEXT_PUBLIC_STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet';
}

export const ACTIVE_XION_NETWORK: 'testnet' | 'mainnet' = resolveNetwork();
export const ACTIVE_XION: XionContractSet = XION_NETWORKS[ACTIVE_XION_NETWORK];
