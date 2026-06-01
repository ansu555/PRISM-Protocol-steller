// One-off mainnet pool diagnostic. Read-only (simulateTransaction); signs nothing.
import {
  rpc, Contract, Address, Account, TransactionBuilder, nativeToScVal, scValToNative,
} from '@stellar/stellar-sdk';

const RPC = 'https://mainnet.sorobanrpc.com';
const PASS = 'Public Global Stellar Network ; September 2015';
const USDC   = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const PPRIME = 'CBI2NXIZQ33L3K5RMQW53OGV52HDHZU2AUISCUFXDYTDR345VKPHAQEP';
const ROUTER  = 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH';
const FACTORY = 'CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2';
const SRC = 'GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO';

const server = new rpc.Server(RPC, { allowHttp: false });

async function call(cid, fn, args = []) {
  const acct = new Account(SRC, '0');
  const tx = new TransactionBuilder(acct, { fee: '100', networkPassphrase: PASS })
    .addOperation(new Contract(cid).call(fn, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) return { err: sim.error };
  try { return { ok: scValToNative(sim.result.retval) }; }
  catch (e) { return { ok: '(undecodable)', raw: sim.result?.retval?.toXDR?.('base64') }; }
}

const addr = (a) => new Address(a).toScVal();

console.log('\n=== Which factory does the ROUTER use? ===');
for (const fn of ['get_factory', 'factory', 'router_get_factory']) {
  const r = await call(ROUTER, fn);
  console.log(`router.${fn}:`, r.err ? `ERR ${r.err.split('\n')[0]}` : r.ok);
}

console.log('\n=== Factory health ===');
console.log('factory.all_pairs_length:', JSON.stringify((await call(FACTORY, 'all_pairs_length')).ok ?? (await call(FACTORY,'all_pairs_length')).err?.split('\n')[0]));

console.log('\n=== get_pair(USDC, pPRIME) on the UI factory ===');
for (const [a, b, label] of [[USDC, PPRIME, 'USDC,pPRIME'], [PPRIME, USDC, 'pPRIME,USDC']]) {
  const r = await call(FACTORY, 'get_pair', [addr(a), addr(b)]);
  console.log(`get_pair(${label}):`, r.err ? `ERR ${r.err.split('\n')[0]}` : r.ok);
  if (r.ok && typeof r.ok === 'string') {
    const res = await call(r.ok, 'get_reserves');
    console.log(`   pair ${r.ok}`);
    console.log('   get_reserves:', res.err ? `ERR ${res.err.split('\n')[0]}` : JSON.stringify(res.ok, (_, v) => typeof v === 'bigint' ? v.toString() : v));
  }
}

console.log('\n=== Does the router expose router_pair_for / get_pair? ===');
for (const fn of ['router_pair_for', 'pair_for', 'get_pair']) {
  const r = await call(ROUTER, fn, [addr(USDC), addr(PPRIME)]);
  console.log(`router.${fn}:`, r.err ? `ERR ${r.err.split('\n')[0]}` : r.ok);
}
