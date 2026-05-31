// Server-side EVM vault client — ethers v6.
// Used by the collateral release and liquidation API routes.

import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const VAULT_ABI = [
  'function release(uint32 stellarLoanId) external',
  'function liquidate(uint32 stellarLoanId, address to) external',
  'function getLock(uint32 stellarLoanId) external view returns (tuple(address borrower, address token, uint256 amount, uint32 stellarLoanId, uint8 state, uint256 lockedAt, string stellarBorrower))',
  'function acceptedTokens(address token) external view returns (bool)',
];

export type LockState = 'Empty' | 'Locked' | 'Released' | 'Liquidated';

export interface EVMLock {
  borrower:        string;
  token:           string;
  amount:          bigint;
  stellarLoanId:   number;
  state:           LockState;
  lockedAt:        bigint;
  stellarBorrower: string;
}

const LOCK_STATES: LockState[] = ['Empty', 'Locked', 'Released', 'Liquidated'];

function getConfig() {
  const rpcUrl       = process.env.EVM_RPC_URL;
  const vaultAddress = process.env.EVM_VAULT_ADDRESS;
  const privateKey   = process.env.EVM_DEPLOYER_PRIVATE_KEY;
  const treasury     = process.env.EVM_TREASURY_ADDRESS;

  if (!rpcUrl || !vaultAddress || !privateKey) {
    throw new Error('Missing EVM env vars: EVM_RPC_URL, EVM_VAULT_ADDRESS, EVM_DEPLOYER_PRIVATE_KEY');
  }
  return { rpcUrl, vaultAddress, privateKey, treasury: treasury ?? vaultAddress };
}

export function getEvmVaultClient() {
  const { rpcUrl, vaultAddress, privateKey } = getConfig();
  const provider = new JsonRpcProvider(rpcUrl);
  const wallet   = new Wallet(privateKey, provider);
  const vault    = new Contract(vaultAddress, VAULT_ABI, wallet);
  return { vault, wallet, provider };
}

export async function getEvmLock(stellarLoanId: number): Promise<EVMLock | null> {
  const { vault } = getEvmVaultClient();
  try {
    const raw = await vault.getLock(stellarLoanId) as [string, string, bigint, number, number, bigint, string];
    const stateIdx = Number(raw[4]);
    return {
      borrower:        raw[0],
      token:           raw[1],
      amount:          raw[2],
      stellarLoanId:   Number(raw[3]),
      state:           LOCK_STATES[stateIdx] ?? 'Empty',
      lockedAt:        raw[5],
      stellarBorrower: raw[6],
    };
  } catch {
    return null;
  }
}

export async function evmRelease(stellarLoanId: number): Promise<string> {
  const { vault } = getEvmVaultClient();
  const tx = await vault.release(stellarLoanId) as { hash: string; wait: () => Promise<unknown> };
  await tx.wait();
  return tx.hash;
}

export async function evmLiquidate(stellarLoanId: number): Promise<string> {
  const { treasury } = getConfig();
  const { vault } = getEvmVaultClient();
  const tx = await vault.liquidate(stellarLoanId, treasury) as { hash: string; wait: () => Promise<unknown> };
  await tx.wait();
  return tx.hash;
}
