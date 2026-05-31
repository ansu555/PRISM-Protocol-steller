export interface ChainConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  vaultAddress: `0x${string}`;
  // Confirmations before attesting — higher = safer against reorgs
  confirmations: number;
  // chain_id in the 73-byte attestation message (0=BTC, 1=ETH, 2=SOL, 3=XLM)
  attestationChainId: number;
  // Poll interval in ms
  pollIntervalMs: number;
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const PRISM_API_BASE = optional(
  'PRISM_API_BASE_URL',
  'http://localhost:3000',
);

// Chains to watch — add more by extending this array
export function buildChainConfigs(): ChainConfig[] {
  const configs: ChainConfig[] = [];

  // Ethereum Sepolia (testnet)
  const ethSepoliaRpc = process.env.ETH_SEPOLIA_RPC_URL;
  const ethSepoliaVault = process.env.ETH_SEPOLIA_VAULT_ADDRESS;
  if (ethSepoliaRpc && ethSepoliaVault) {
    configs.push({
      name:               'eth-sepolia',
      chainId:            11155111,
      rpcUrl:             ethSepoliaRpc,
      vaultAddress:       ethSepoliaVault as `0x${string}`,
      confirmations:      3,   // testnet: 3 confirmations (~36s)
      attestationChainId: 1,
      pollIntervalMs:     12_000,
    });
  }

  // Base Sepolia (testnet)
  const baseSepoliaRpc = process.env.BASE_SEPOLIA_RPC_URL;
  const baseSepoliaVault = process.env.BASE_SEPOLIA_VAULT_ADDRESS;
  if (baseSepoliaRpc && baseSepoliaVault) {
    configs.push({
      name:               'base-sepolia',
      chainId:            84532,
      rpcUrl:             baseSepoliaRpc,
      vaultAddress:       baseSepoliaVault as `0x${string}`,
      confirmations:      3,
      attestationChainId: 1,
      pollIntervalMs:     6_000,
    });
  }

  // Base Mainnet
  const baseRpc = process.env.BASE_MAINNET_RPC_URL;
  const baseVault = process.env.BASE_MAINNET_VAULT_ADDRESS;
  if (baseRpc && baseVault) {
    configs.push({
      name:               'base',
      chainId:            8453,
      rpcUrl:             baseRpc,
      vaultAddress:       baseVault as `0x${string}`,
      confirmations:      12,  // mainnet: 12 confirmations (~144s)
      attestationChainId: 1,
      pollIntervalMs:     10_000,
    });
  }

  // Arbitrum Mainnet
  const arbRpc = process.env.ARB_MAINNET_RPC_URL;
  const arbVault = process.env.ARB_MAINNET_VAULT_ADDRESS;
  if (arbRpc && arbVault) {
    configs.push({
      name:               'arbitrum',
      chainId:            42161,
      rpcUrl:             arbRpc,
      vaultAddress:       arbVault as `0x${string}`,
      confirmations:      12,
      attestationChainId: 1,
      pollIntervalMs:     4_000,
    });
  }

  // Ethereum Mainnet
  const ethRpc = process.env.ETH_MAINNET_RPC_URL;
  const ethVault = process.env.ETH_MAINNET_VAULT_ADDRESS;
  if (ethRpc && ethVault) {
    configs.push({
      name:               'mainnet',
      chainId:            1,
      rpcUrl:             ethRpc,
      vaultAddress:       ethVault as `0x${string}`,
      confirmations:      12,
      attestationChainId: 1,
      pollIntervalMs:     15_000,
    });
  }

  if (configs.length === 0) {
    throw new Error(
      'No chains configured. Set at least one RPC_URL + VAULT_ADDRESS pair in .env',
    );
  }

  return configs;
}
