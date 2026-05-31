// Stellar / Soroban deployment constants.
//
// All addresses below are 56-char Stellar StrKey contract IDs (CXX...) or
// account IDs (GXX...). The legacy `PublicKey` import is gone — these
// values are plain strings now. Use `import { Address } from '@stellar/stellar-sdk'`
// when you need to wrap one for Soroban invocation.
//
// Network-switching: all contract IDs and URLs are derived from ACTIVE_CONTRACTS
// (addresses.ts), which reads NEXT_PUBLIC_STELLAR_NETWORK to pick testnet vs mainnet.
// Individual NEXT_PUBLIC_* env vars still override per-key if set.

import { ACTIVE_CONTRACTS, ACTIVE_NETWORK } from './addresses';

export const PRISM_CORE_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID ?? ACTIVE_CONTRACTS.prismCore;

// Legacy internal AMM — kept as a shim so old imports don't break.
// Phase 4 deletes this. New swap paths go through SOROSWAP_ROUTER_ID.
export const PRISM_AMM_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PRISM_AMM_CONTRACT_ID ??
  'CAH22DWPILDNYWXBNY7NTUY75FU2ZMJ63ALL2AJ4TPEHOYFYVEJ3YLPY';

// ── Soroswap (Phase 2) ───────────────────────────────────────────────────────
export const SOROSWAP_ROUTER_ID =
  process.env.NEXT_PUBLIC_SOROSWAP_ROUTER_ID ?? ACTIVE_CONTRACTS.soroswapRouter;

export const SOROSWAP_FACTORY_ID =
  process.env.NEXT_PUBLIC_SOROSWAP_FACTORY_ID ?? ACTIVE_CONTRACTS.soroswapFactory;

// ── Reflector oracle (Phase 2) ───────────────────────────────────────────────
export const REFLECTOR_CONTRACT_ID =
  process.env.NEXT_PUBLIC_REFLECTOR_CONTRACT_ID ?? ACTIVE_CONTRACTS.reflector;

export const USDC_CONTRACT_ID =
  process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ?? ACTIVE_CONTRACTS.usdc;

// Classic-asset reference for the SAC above, needed when users add the
// trustline through Freighter ("Add asset" → manual entry).
export const USDC_ASSET_CODE =
  process.env.NEXT_PUBLIC_USDC_ASSET_CODE ?? 'PTUSDC';
export const USDC_ASSET_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ASSET_ISSUER ??
  'GCZFPAJEJHMQPZ4BQUWUEBV7KJQ7GEKDF4FAWYUW4NOIRSWXCMDEOESW';

// Legacy alias kept so old `import { USDC_MINT }` lines don't break.
// New code should import `USDC_CONTRACT_ID` directly.
export const USDC_MINT = USDC_CONTRACT_ID;

export const VAULT_ID = Number.parseInt(process.env.NEXT_PUBLIC_VAULT_ID ?? '0', 10);

// Stellar USDC has 7 decimals.
export const USDC_DECIMALS = 7;
export const USDC_BASE_UNITS = 10_000_000n;
export const Q64_ONE = 1n << 64n;

// Soroban RPC endpoint. Stellar's public testnet RPC.
export const SOROBAN_RPC_URL =
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? ACTIVE_CONTRACTS.rpcUrl;

export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ?? ACTIVE_CONTRACTS.passphrase;

export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? ACTIVE_CONTRACTS.horizonUrl;

// Legacy program-id aliases. Kept so old `import { PRISM_CORE_PROGRAM_ID }`
// lines don't break — they now resolve to the same Stellar contract string.
export const PRISM_CORE_PROGRAM_ID = PRISM_CORE_CONTRACT_ID;
export const PRISM_AMM_PROGRAM_ID = PRISM_AMM_CONTRACT_ID;

export enum TrancheKind {
  Prime = 0,
  Core = 1,
  Alpha = 2,
}

export const TRANCHE_CONFIG = {
  [TrancheKind.Prime]: {
    key: 'prime',
    label: 'Prime',
    tone: 'text-sky-200',
    border: 'border-sky-300/25',
    bg: 'bg-sky-400/10',
  },
  [TrancheKind.Core]: {
    key: 'core',
    label: 'Core',
    tone: 'text-amber-200',
    border: 'border-amber-300/25',
    bg: 'bg-amber-400/10',
  },
  [TrancheKind.Alpha]: {
    key: 'alpha',
    label: 'Alpha',
    tone: 'text-rose-200',
    border: 'border-rose-300/25',
    bg: 'bg-rose-400/10',
  },
} as const;

export const DEFAULT_DEMO_LOSS_AMOUNT = 65_000_000_000n; // 6_500 USDC (7-dec)
export const DEFAULT_DEMO_YIELD_AMOUNT = 1_000_000_000n; // 100 USDC (7-dec)
export const DEFAULT_DEMO_LOAN_PRINCIPAL = 200_000_000_000n; // 20_000 USDC (7-dec)

// ── Protocol risk parameters (single source of truth) ─────────────────────────
export const PROTOCOL_DEFAULT_APR_PCT = 8.5;
export const PROTOCOL_MIN_COLLATERAL_RATIO = 1.2;
export const PROTOCOL_MAX_LTV_PCT = 80;
export const INSTITUTIONAL_CREDIT_LIMIT_USD = 500_000;
export const INDIVIDUAL_CREDIT_LIMIT_USD = 100_000;

// Pool display names keyed by vault id.
export const POOL_NAMES: Record<number, string> = {
  0: 'Institutional Stablecoin Credit',
  1: 'BTC Treasury Lending',
  2: 'Real Estate Credit Pool',
  3: 'Growth Capital Market',
};

// pToken contract IDs (one per tranche, deployed alongside prism-core).
// Network-aware via ACTIVE_CONTRACTS: testnet uses the known SACs; mainnet
// reads NEXT_PUBLIC_PTOKEN_*_MAINNET_ID (populated after mainnet-deploy.sh).
export const PTOKEN_PRIME_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PTOKEN_PRIME_CONTRACT_ID ?? ACTIVE_CONTRACTS.ptokenPrime;

export const PTOKEN_CORE_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PTOKEN_CORE_CONTRACT_ID ?? ACTIVE_CONTRACTS.ptokenCore;

export const PTOKEN_ALPHA_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PTOKEN_ALPHA_CONTRACT_ID ?? ACTIVE_CONTRACTS.ptokenAlpha;

// Ed25519 pubkey of the Encrypt oracle (32-byte hex, no Stellar StrKey wrapping).
// SECURITY: the demo defaults below correspond to publicly-known seeds and must
// NEVER be used on mainnet — anyone with the seed could forge attestations. On
// mainnet the default is empty so the on-chain allowlist stays empty until a
// real production key is added via oracle-allowlist.sh; set
// NEXT_PUBLIC_ENCRYPT_ORACLE_PUBKEY_HEX to that key explicitly.
const DEMO_ENCRYPT_ORACLE_PUBKEY_HEX =
  '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29';
const DEMO_CLOAK_ORACLE_PUBKEY_HEX =
  '8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c';

export const ENCRYPT_ORACLE_PUBKEY_HEX =
  process.env.NEXT_PUBLIC_ENCRYPT_ORACLE_PUBKEY_HEX ??
  (ACTIVE_NETWORK === 'mainnet' ? '' : DEMO_ENCRYPT_ORACLE_PUBKEY_HEX);

export const CLOAK_ORACLE_PUBKEY_HEX =
  process.env.NEXT_PUBLIC_CLOAK_ORACLE_PUBKEY_HEX ??
  (ACTIVE_NETWORK === 'mainnet' ? '' : DEMO_CLOAK_ORACLE_PUBKEY_HEX);

// Legacy aliases. Stored as 32-byte hex strings now (no PublicKey wrapping).
export const ENCRYPT_ORACLE_PUBKEY = ENCRYPT_ORACLE_PUBKEY_HEX;
export const CLOAK_ORACLE_PUBKEY = CLOAK_ORACLE_PUBKEY_HEX;
export const CLOAK_PROGRAM_ID = ''; // No equivalent on Stellar; kept for import compatibility.
