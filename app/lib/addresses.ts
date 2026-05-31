// Deployed contract registry — single source of truth for all Soroban contract IDs.
//
// Soroban contracts have stable addresses derived from WASM hash + salt at deploy time.
//
// Usage:
//   import { CONTRACTS } from '@/app/lib/addresses';
//   const id = CONTRACTS.testnet.prismCore;

export interface ContractSet {
  /** prism_core Soroban contract (vaults, tranches, loans, waterfall, cascade). */
  prismCore: string;
  /** USDC token contract (Circle's SAC on testnet, or test TUSDC for scripted demo). */
  usdc: string;
  /** Soroswap AMM router. */
  soroswapRouter: string;
  /** Soroswap factory. */
  soroswapFactory: string;
  /** Reflector oracle contract. */
  reflector: string;
  /** Stellar Horizon base URL for this network. */
  horizonUrl: string;
  /** Soroban RPC URL. */
  rpcUrl: string;
  /** Stellar network passphrase. */
  passphrase: string;
}

export const CONTRACTS: Record<'testnet' | 'mainnet', ContractSet> = {
  testnet: {
    // Redeployed 2026-05-25. Test USDC (TUSDC) — issuer is the deployer so it
    // can be minted freely in scripts. Replace with Circle's real testnet SAC
    // when moving to a public-facing demo.
    prismCore:
      process.env.NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID ??
      'CCULBBT4PA64GWXSKT4G7HOYQ4RXRNYY2JP5MZ2G73VKRFAJ6CHB3RZK',
    usdc:
      process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ??
      'CDJND4DUKT4CJELQCFLNYQM345WECQ6JQORCKVXAT3HYPBOY4YLZZNAH',
    soroswapRouter:
      process.env.NEXT_PUBLIC_SOROSWAP_ROUTER_ID ??
      'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD',
    soroswapFactory:
      process.env.NEXT_PUBLIC_SOROSWAP_FACTORY_ID ??
      'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY',
    reflector:
      process.env.NEXT_PUBLIC_REFLECTOR_CONTRACT_ID ??
      'CCYOZJCOPG34LLQQ7N24YXBM7QM2ZKJKR2Z7LSYXQBGKM2KTEOXKBAX',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl:
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
      'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },

  mainnet: {
    // Mainnet deployment is gated behind an admin pause flag until audit
    // completes (Phase 4 exit criterion). These addresses are placeholders
    // until the contract is deployed — replace with the live contract IDs.
    prismCore:
      process.env.NEXT_PUBLIC_PRISM_CORE_MAINNET_ID ?? '',
    // Circle's official Stellar Classic USDC asset contract on mainnet.
    // Source: https://developers.circle.com/stablecoins/usdc-on-stellar
    usdc: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7EJJUD',
    soroswapRouter:
      process.env.NEXT_PUBLIC_SOROSWAP_ROUTER_MAINNET_ID ?? '',
    soroswapFactory:
      process.env.NEXT_PUBLIC_SOROSWAP_FACTORY_MAINNET_ID ?? '',
    reflector:
      process.env.NEXT_PUBLIC_REFLECTOR_MAINNET_ID ?? '',
    horizonUrl: 'https://horizon.stellar.org',
    rpcUrl:
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL_MAINNET ??
      'https://soroban.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
};

/** Which network to use. Defaults to testnet in all non-production environments. */
export const ACTIVE_NETWORK: 'testnet' | 'mainnet' =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK as 'testnet' | 'mainnet') ?? 'testnet';

/** Shorthand: the currently active contract set. */
export const ACTIVE_CONTRACTS: ContractSet = CONTRACTS[ACTIVE_NETWORK];
