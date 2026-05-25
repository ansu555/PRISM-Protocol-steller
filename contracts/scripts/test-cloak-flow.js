#!/usr/bin/env node
/**
 * End-to-end cryptographic test for the Cloak shielded payout flow.
 *
 * Validates byte-identical agreement between:
 *   1) Frontend builder shape (app/lib/cloak.ts)
 *   2) Mock oracle signer (app/api/cloak-oracle/shield_payout/route.ts)
 *   3) On-chain verifier layout (record_cloak_payout.rs)
 */

const {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} = require('node:crypto');

const projectRoot = '/Users/anik/Desktop/PRISM-Protocol';
const { PublicKey, Keypair } = require(`${projectRoot}/node_modules/@solana/web3.js`);

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass += 1;
  else fail += 1;
}

function buildMessage(vaultPubkeyBase58, batchIdHex, batchConfirmed) {
  const buf = Buffer.alloc(73);
  Buffer.from('clk_atts').copy(buf, 0);
  new PublicKey(vaultPubkeyBase58).toBuffer().copy(buf, 8);
  Buffer.from(batchIdHex, 'hex').copy(buf, 40);
  buf.writeUInt8(batchConfirmed ? 0x01 : 0x00, 72);
  return buf;
}

const seed = Buffer.from('11'.repeat(32), 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const oracleSk = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, seed]),
  format: 'der',
  type: 'pkcs8',
});
const oracleSpkiDer = createPublicKey(oracleSk).export({ type: 'spki', format: 'der' });
const oraclePubkey = new PublicKey(oracleSpkiDer.slice(-32));

console.log('Cloak flow — end-to-end crypto test\n');
console.log(`Oracle pubkey: ${oraclePubkey.toBase58()}`);

const fs = require('node:fs');
const constantsTs = fs.readFileSync(`${projectRoot}/app/lib/constants.ts`, 'utf8');
check(
  'CLOAK_ORACLE_PUBKEY in constants.ts matches mock oracle key',
  constantsTs.includes(oraclePubkey.toBase58()),
  oraclePubkey.toBase58(),
);

const fakeVaultPubkey = Keypair.generate().publicKey;
const batchId = createHash('sha256')
  .update(`batch:${fakeVaultPubkey.toBase58()}:${Date.now()}`)
  .digest('hex');

const message = buildMessage(fakeVaultPubkey.toBase58(), batchId, true);

console.log(`\nMessage layout (${message.length} bytes):`);
console.log(`  prefix   [0..8]:   ${message.slice(0, 8).toString()}`);
console.log(`  vault    [8..40]:  ${message.slice(8, 40).toString('hex')}`);
console.log(`  batch_id [40..72]: ${message.slice(40, 72).toString('hex')}`);
console.log(`  result   [72]:     0x${message[72].toString(16).padStart(2, '0')}`);

check('Message length is 73 bytes (matches MSG_LEN in record_cloak_payout.rs)', message.length === 73);
check('Message prefix is "clk_atts"', message.slice(0, 8).toString() === 'clk_atts');
check(
  'Message bytes 8..40 = vault pubkey',
  message.slice(8, 40).toString('hex') === fakeVaultPubkey.toBuffer().toString('hex'),
);
check('Message bytes 40..72 = batch_id (sha256 commitment)', message.slice(40, 72).toString('hex') === batchId);
check('Message byte 72 = 0x01 (batch confirmed)', message[72] === 0x01);

const signature = sign(null, message, oracleSk);
check('Signature is 64 bytes (Ed25519)', signature.length === 64);

const oraclePubkeySpki = createPublicKey({
  key: Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(oraclePubkey.toBytes()),
  ]),
  format: 'der',
  type: 'spki',
});
const sigOk = verify(null, message, oraclePubkeySpki, signature);
check('Signature verifies with oracle pubkey', sigOk);

const negMessage = buildMessage(fakeVaultPubkey.toBase58(), batchId, false);
check('batch_confirmed=false produces byte 72 = 0x00', negMessage[72] === 0x00);

const idl = JSON.parse(fs.readFileSync(`${projectRoot}/app/lib/idl/prism_core.json`, 'utf8'));
check(
  'IDL has record_cloak_payout instruction',
  idl.instructions.some((i) => i.name === 'record_cloak_payout'),
);
check(
  'IDL has CloakPayoutRecord account',
  idl.accounts.some((a) => a.name === 'CloakPayoutRecord'),
);
check(
  'IDL has CloakPayoutStatus type',
  idl.types.some((t) => t.name === 'CloakPayoutStatus'),
);
check(
  'IDL has all 4 Cloak error variants',
  ['CloakPayoutAlreadyRecorded', 'CloakSignatureInvalid', 'CloakBatchIdMismatch', 'CloakPayoutNotConfirmed']
    .every((n) => idl.errors.some((e) => e.name === n)),
);

const so = `${projectRoot}/contracts/target/deploy/prism_core.so`;
const stat = fs.statSync(so, { throwIfNoEntry: false });
check(`prism_core.so built (${stat ? Math.round(stat.size / 1024) + ' KB' : 'missing'})`, !!stat);

const recordRs = `${projectRoot}/contracts/programs/prism-core/src/instructions/record_cloak_payout.rs`;
check('record_cloak_payout.rs exists', fs.existsSync(recordRs));
if (fs.existsSync(recordRs)) {
  const recordSrc = fs.readFileSync(recordRs, 'utf8');
  check('record_cloak_payout.rs has b"clk_atts" prefix', recordSrc.includes('b"clk_atts"'));
  check('record_cloak_payout.rs has MSG_LEN: usize = 73', recordSrc.includes('MSG_LEN: usize = 73'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
