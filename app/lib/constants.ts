// Stellar / Soroban deployment constants.
//
// All addresses below are 56-char Stellar StrKey contract IDs (CXX...) or
// account IDs (GXX...). The legacy `PublicKey` import is gone — these
// values are plain strings now. Use `import { Address } from '@stellar/stellar-sdk'`
// when you need to wrap one for Soroban invocation.

// Deployed Soroban contract IDs (Soroban testnet, May 2026).
// Override with NEXT_PUBLIC_* env vars if you redeploy.
// NOTE: Redeployed 2026-05-25 with a test USDC (TUSDC) that the deployer can
// mint freely — Circle's real testnet USDC requires browser-only faucet
// interaction and we want a fully scriptable demo. Issuer of TUSDC is the
// deployer (GDSI…HUXO).
export const PRISM_CORE_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PRISM_CORE_CONTRACT_ID ??
  'CB5ISNJPZDN4XIO6AQEUN2N3ILSQDPY6FTUDT7IXXXHEMGBEAA3LUJNC';

// Legacy internal AMM — kept as a shim so old imports don't break.
// Phase 4 deletes this. New swap paths go through SOROSWAP_ROUTER_ID.
export const PRISM_AMM_CONTRACT_ID =
  process.env.NEXT_PUBLIC_PRISM_AMM_CONTRACT_ID ??
  'CAH22DWPILDNYWXBNY7NTUY75FU2ZMJ63ALL2AJ4TPEHOYFYVEJ3YLPY';

// ── Soroswap (Phase 2) ───────────────────────────────────────────────────────
// Soroswap is the Uniswap-V2 CPMM on Stellar. We use it for pTranche/USDC pools.
// Source: https://github.com/soroswap/core (public/testnet.contracts.json)
export const SOROSWAP_ROUTER_ID =
  process.env.NEXT_PUBLIC_SOROSWAP_ROUTER_ID ??
  'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD';

export const SOROSWAP_FACTORY_ID =
  process.env.NEXT_PUBLIC_SOROSWAP_FACTORY_ID ??
  'CDP3HMUH6SMS3S7NPGNDJLULCOXXEPSHY4JKUKMBNQMATHDHWXRRJTBY';

// ── Reflector oracle (Phase 2) ───────────────────────────────────────────────
// Reflector is the decentralized price oracle on Stellar Soroban (SEP-40).
// Set NEXT_PUBLIC_REFLECTOR_CONTRACT_ID to the testnet instance when running
// against testnet (Reflector testnet is permissioned — request access at
// https://reflector.network). Mainnet address is the public Reflector Pulse feed.
export const REFLECTOR_CONTRACT_ID =
  process.env.NEXT_PUBLIC_REFLECTOR_CONTRACT_ID ??
  'CCYOZJCOPG34LLQQ7N24YXBM7QM2ZKJKR2Z7LSYXQBGKM2KTEOXKBAX';

// Test USDC (TUSDC:GDSI…HUXO) — deployer is issuer, can mint freely. Replace
// with Circle's real testnet USDC SAC (CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA)
// when going to a public-facing demo.
export const USDC_CONTRACT_ID =
  process.env.NEXT_PUBLIC_USDC_CONTRACT_ID ??
  'CDW6NVPNLRJN6SE4A44EHGUM45NEQ2ZCHN2OAXJQV6NRCCCZODS6KOOS';

// Classic-asset reference for the SAC above, needed when users add the
// trustline through Freighter ("Add asset" → manual entry).
export const USDC_ASSET_CODE =
  process.env.NEXT_PUBLIC_USDC_ASSET_CODE ?? 'TUSDC';
export const USDC_ASSET_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ASSET_ISSUER ??
  'GDSIRM73CJE7NMYFJFXFTDVYNNYTPE3J7OPBM7BUJ7RKNMQ45M26HUXO';

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
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org';

// Stellar testnet network passphrase. Used for transaction signing.
export const NETWORK_PASSPHRASE =
  process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE ??
  'Test SDF Network ; September 2015';

// Horizon endpoint (for account / asset queries that aren't Soroban contract calls).
export const HORIZON_URL =
  process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';

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

// Ed25519 pubkey of the demo Encrypt FHE oracle. 32-byte hex (no Stellar StrKey
// wrapping — these are raw oracle keys, used by `env.crypto().ed25519_verify`
// inside the contract). The mock oracle at /api/encrypt-oracle/* uses the
// matching secret (deterministic zero seed).
export const ENCRYPT_ORACLE_PUBKEY_HEX =
  process.env.NEXT_PUBLIC_ENCRYPT_ORACLE_PUBKEY_HEX ??
  '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29';

// Demo Cloak oracle pubkey (deterministic 0x11... seed).
export const CLOAK_ORACLE_PUBKEY_HEX =
  process.env.NEXT_PUBLIC_CLOAK_ORACLE_PUBKEY_HEX ??
  '8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c';

// Legacy aliases. Stored as 32-byte hex strings now (no PublicKey wrapping).
export const ENCRYPT_ORACLE_PUBKEY = ENCRYPT_ORACLE_PUBKEY_HEX;
export const CLOAK_ORACLE_PUBKEY = CLOAK_ORACLE_PUBKEY_HEX;
export const CLOAK_PROGRAM_ID = ''; // No equivalent on Stellar; kept for import compatibility.
