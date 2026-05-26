'use client';

// Compatibility shim. The old `buildPrograms(connection, signer)` returned
// `{ core, amm, provider }` where each was an Anchor `Program`. Components
// and hooks that haven't been rewritten yet still call this.
//
// New code should use `getCoreClient()` / `getAmmClient()` from
// `app/lib/stellar` directly.
//
// This shim returns objects with `.programId` (Stellar contract id string)
// so legacy access patterns like `program.programId.toBase58()` still
// resolve to *something*. We expose a `.read()` and `.invoke()` passthrough
// to the underlying ContractClient so partially-migrated code can call
// `core.read('get_vault', ...)` without breaking.

import { Keypair } from '@stellar/stellar-sdk';

import { PRISM_AMM_CONTRACT_ID, PRISM_CORE_CONTRACT_ID } from './constants';
import { ContractClient, getAmmClient, getCoreClient, keypairSigner } from './stellar';

export interface AnchorWallet {
  publicKey: { toBase58: () => string };
  signTransaction<T>(tx: T): Promise<T>;
  signAllTransactions<T>(txs: T[]): Promise<T[]>;
}

// Stand-in PublicKey shape so old `programId.toBase58()` calls don't crash.
function asPubkey(id: string) {
  return {
    toBase58: () => id,
    toString: () => id,
    equals: (other: { toBase58?: () => string }) =>
      typeof other?.toBase58 === 'function' && other.toBase58() === id,
  };
}

function wrapClient(client: ContractClient) {
  return {
    programId: asPubkey(client.contractId),
    contractId: client.contractId,
    read: client.read.bind(client),
    invoke: client.invoke.bind(client),
    // Legacy `program.account.X.fetchNullable(pda)` API stub. Returns null —
    // any hook that still uses this needs to be rewritten to call
    // `client.read('get_xxx', args)` directly. We export this so the build
    // doesn't crash on imports; callers will simply see no data.
    account: new Proxy(
      {},
      {
        get: () => ({
          fetchNullable: async () => null,
          fetch: async () => {
            throw new Error(
              'Legacy account.X.fetch() called on Stellar build. Rewrite hook to use ContractClient.read().',
            );
          },
        }),
      },
    ),
  };
}

export function buildProvider(_connection?: unknown, _signer?: unknown) {
  // Provider shape kept for compatibility; nothing actually consumes it on
  // the Stellar side because RPC + signer are wired separately.
  return {
    connection: { rpcEndpoint: PRISM_CORE_CONTRACT_ID, getTokenAccountBalance: async () => ({ value: { amount: '0' } }) },
    wallet: null,
  };
}

export function buildPrograms(_connection?: unknown, _signer?: Keypair | AnchorWallet) {
  return {
    provider: buildProvider(),
    core: wrapClient(getCoreClient()),
    amm: wrapClient(getAmmClient()),
  };
}

// Re-export so old `import { Keypair }` lines keep working — note this is now
// a Stellar Keypair.
export { Keypair } from '@stellar/stellar-sdk';
