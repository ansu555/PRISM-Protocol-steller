// Deployed contract registry — single source of truth for all Soroban contract IDs.
//
// Replaces Solana's pda.ts (PDAs are program-derived; Soroban contracts have
// stable addresses derived from WASM hash + salt at deploy time).
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
  /** pToken SAC for the Prime tranche. */
  ptokenPrime: string;
  /** pToken SAC for the Core tranche. */
  ptokenCore: string;
  /** pToken SAC for the Alpha tranche. */
  ptokenAlpha: string;
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
    ptokenPrime:
      process.env.NEXT_PUBLIC_PTOKEN_PRIME_CONTRACT_ID ??
      'CDFRSCBDTGIWCQSPVQEWHJJ7HVOGBLUTQBIKRYC3D5VQV5UDLBVGYM7H',
    ptokenCore:
      process.env.NEXT_PUBLIC_PTOKEN_CORE_CONTRACT_ID ??
      'CDBDYXZTY5ZEUCIZM7RTDS5GOOA43BT5ARQCGYKQQNOYCBZQAZC5JYBW',
    ptokenAlpha:
      process.env.NEXT_PUBLIC_PTOKEN_ALPHA_CONTRACT_ID ??
      'CB5DNWDNIMG75NSUN7GQXXH775TIEXNEIRWXIX4GDPVRR2YVGD3BGWBO',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    rpcUrl:
      process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ??
      'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },

  mainnet: {
    // Mainnet deployment is gated behind an admin pause flag until audit
    // completes (Phase 4 exit criterion). prismCore is still a placeholder
    // until the contract is deployed — all other addresses are live.
    prismCore:
      process.env.NEXT_PUBLIC_PRISM_CORE_MAINNET_ID ?? '',
    // Circle's official Stellar mainnet USDC Stellar Asset Contract.
    // Derived from the canonical asset USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
    // and verified on-chain (stellar contract invoke -- name → "USDC:GA5Z...").
    usdc: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    // Soroswap mainnet router + factory (verified via docs.soroswap.finance).
    soroswapRouter:
      process.env.NEXT_PUBLIC_SOROSWAP_ROUTER_MAINNET_ID ??
      'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH',
    soroswapFactory:
      process.env.NEXT_PUBLIC_SOROSWAP_FACTORY_MAINNET_ID ??
      'CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2',
    // Reflector oracle mainnet contract (verified via reflector.network docs).
    reflector:
      process.env.NEXT_PUBLIC_REFLECTOR_MAINNET_ID ??
      'CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN',
    // pToken SACs are deployed alongside prism_core on mainnet; fill these in
    // after running mainnet-deploy.sh (it prints them and writes mainnet.json).
    ptokenPrime: process.env.NEXT_PUBLIC_PTOKEN_PRIME_MAINNET_ID ?? '',
    ptokenCore: process.env.NEXT_PUBLIC_PTOKEN_CORE_MAINNET_ID ?? '',
    ptokenAlpha: process.env.NEXT_PUBLIC_PTOKEN_ALPHA_MAINNET_ID ?? '',
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
