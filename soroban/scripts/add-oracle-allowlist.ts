// One-shot script: add oracle pubkey to the mainnet allowlist.
// Usage: npx tsx soroban/scripts/add-oracle-allowlist.ts
import * as StellarSdk from '@stellar/stellar-sdk';
import { Contract, xdr, Address, nativeToScVal } from '@stellar/stellar-sdk';

const ADMIN_SECRET  = 'SBGD5QTYS45VHOVZOCCZD5BG6UZRE5DWXW5QUIRLVXUCZLKR7NOZN3OO';
const CONTRACT_ID   = 'CD2TXQSRGH2XHUWH3VIDGLQGVT6KXMBJPT6QR2RBBCGFVFVTRTD2E5SU';
const ORACLE_PUBKEY = '0c5ffb4b9978b86976392ec1a29c12482faee0e9aea7b969cc556a344d06bba2';
const RPC_URL       = 'https://mainnet.sorobanrpc.com';
const PASSPHRASE    = StellarSdk.Networks.PUBLIC;

async function main() {
  const keypair = StellarSdk.Keypair.fromSecret(ADMIN_SECRET);
  const server  = new StellarSdk.rpc.Server(RPC_URL, { allowHttp: false });
  const account = await server.getAccount(keypair.publicKey());

  const oracleBytes = xdr.ScVal.scvBytes(Buffer.from(ORACLE_PUBKEY, 'hex'));

  const contract = new Contract(CONTRACT_ID);
  const op = contract.call('add_oracle_to_allowlist', oracleBytes);

  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100000',
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const simResult = await server.simulateTransaction(tx);
  if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
    throw new Error(`Simulation failed: ${simResult.error}`);
  }

  const preparedTx = StellarSdk.rpc.assembleTransaction(tx, simResult).build();
  preparedTx.sign(keypair);

  console.log('Submitting add_oracle_to_allowlist…');
  const result = await server.sendTransaction(preparedTx);
  console.log('Submitted:', result.hash);

  // Poll for confirmation
  let status = result.status;
  while (status === 'PENDING' || status === 'NOT_FOUND') {
    await new Promise(r => setTimeout(r, 2000));
    const check = await server.getTransaction(result.hash);
    status = check.status;
    console.log('Status:', status);
  }

  if (status === 'SUCCESS') {
    console.log('✓ Oracle pubkey added to mainnet allowlist.');
  } else {
    console.error('✗ Transaction failed:', status);
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
