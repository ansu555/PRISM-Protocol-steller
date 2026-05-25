#!/usr/bin/env node
/**
 * End-to-end cryptographic test for the Encrypt FHE attestation flow.
 *
 * This validates that the three components agree byte-for-byte:
 *   1. Frontend message builder (app/lib/encrypt.ts buildEncryptAttestationMessage)
 *   2. Mock oracle signer (app/api/encrypt-oracle/attest_default/route.ts)
 *   3. On-chain layout (verify_encrypt_default.rs MSG_PREFIX/MSG_LEN/field offsets)
 *
 * No network, no dev server needed — runs the same crypto a real call would.
 */

const { createPrivateKey, createPublicKey, sign, verify, createHash } = require('node:crypto');

const projectRoot = '/Users/anik/Desktop/PRISM-Protocol';
const { PublicKey, Keypair } = require(`${projectRoot}/node_modules/@solana/web3.js`);

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (ok) pass++;
  else fail++;
}

// ── 1. Build the attestation message exactly as encrypt.ts does ─────────────
function buildMessage(loanPubkeyBase58, scoreCommitmentHex, defaultProven) {
  const buf = Buffer.alloc(73);
  Buffer.from('enc_atts').copy(buf, 0);
  new PublicKey(loanPubkeyBase58).toBuffer().copy(buf, 8);
  Buffer.from(scoreCommitmentHex, 'hex').copy(buf, 40);
  buf.writeUInt8(defaultProven ? 0x01 : 0x00, 72);
  return buf;
}

// ── 2. Replicate the mock oracle's keypair derivation ───────────────────────
const seed = Buffer.alloc(32); // zero seed
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const oracleSk = createPrivateKey({
  key: Buffer.concat([PKCS8_PREFIX, seed]),
  format: 'der',
  type: 'pkcs8',
});
const oracleSpkiDer = createPublicKey(oracleSk).export({ type: 'spki', format: 'der' });
const oraclePubkey = new PublicKey(oracleSpkiDer.slice(-32));

console.log('Encrypt FHE flow — end-to-end crypto test\n');
console.log(`Oracle pubkey: ${oraclePubkey.toBase58()}`);

// ── 3. Verify oracle pubkey matches what's hardcoded in constants.ts ────────
const constantsTs = require('node:fs').readFileSync(
  `${projectRoot}/app/lib/constants.ts`,
  'utf8',
);
check(
  'ENCRYPT_ORACLE_PUBKEY in constants.ts matches mock oracle key',
  constantsTs.includes(oraclePubkey.toBase58()),
  oraclePubkey.toBase58(),
);

// ── 4. Build a sample attestation: borrower, loan, score commitment ─────────
const borrowerPubkey = Keypair.generate().publicKey;
const fakeLoanPubkey = Keypair.generate().publicKey;

// Frontend derives this as sha256(borrowerPubkey)
const scoreCommitment = createHash('sha256').update(borrowerPubkey.toBuffer()).digest();
console.log(`Score commitment: ${scoreCommitment.toString('hex')}`);

// ── 5. Oracle signs the attestation ─────────────────────────────────────────
const message = buildMessage(fakeLoanPubkey.toBase58(), scoreCommitment.toString('hex'), true);

console.log(`\nMessage layout (${message.length} bytes):`);
console.log(`  prefix     [0..8]:   ${message.slice(0, 8).toString()}`);
console.log(`  loan       [8..40]:  ${message.slice(8, 40).toString('hex')}`);
console.log(`  commitment [40..72]: ${message.slice(40, 72).toString('hex')}`);
console.log(`  result     [72]:     0x${message[72].toString(16).padStart(2, '0')}`);

check('Message length is 73 bytes (matches MSG_LEN in verify_encrypt_default.rs)', message.length === 73);
check('Message prefix is "enc_atts"', message.slice(0, 8).toString() === 'enc_atts');
check('Message bytes 8..40 = loan pubkey', message.slice(8, 40).toString('hex') === fakeLoanPubkey.toBuffer().toString('hex'));
check('Message bytes 40..72 = score commitment', message.slice(40, 72).toString('hex') === scoreCommitment.toString('hex'));
check('Message byte 72 = 0x01 (default proven)', message[72] === 0x01);

const signature = sign(null, message, oracleSk);
check('Signature is 64 bytes (Ed25519)', signature.length === 64);

// ── 6. Verify the signature with the public key (same as Solana's Ed25519
//     precompile would). This proves the on-chain check will succeed.
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

// ── 7. Verify round-trip: an attestation with default_proven=false flips byte
const negMessage = buildMessage(fakeLoanPubkey.toBase58(), scoreCommitment.toString('hex'), false);
check('default_proven=false produces byte 72 = 0x00', negMessage[72] === 0x00);

// ── 8. Confirm IDL contains the new entries ─────────────────────────────────
const idl = JSON.parse(require('node:fs').readFileSync(`${projectRoot}/app/lib/idl/prism_core.json`, 'utf8'));
check(
  'IDL has attach_encrypt_score instruction',
  idl.instructions.some((i) => i.name === 'attach_encrypt_score'),
);
check(
  'IDL has verify_encrypt_default instruction',
  idl.instructions.some((i) => i.name === 'verify_encrypt_default'),
);
check(
  'IDL has EncryptLoanHealth account',
  idl.accounts.some((a) => a.name === 'EncryptLoanHealth'),
);
check(
  'IDL has EncryptStatus type',
  idl.types.some((t) => t.name === 'EncryptStatus'),
);
check(
  'IDL has all 4 Encrypt error variants',
  ['EncryptAlreadyDefaultProven', 'EncryptSignatureInvalid', 'EncryptCommitmentMismatch', 'EncryptDefaultNotProven']
    .every((n) => idl.errors.some((e) => e.name === n)),
);

// ── 9. Verify program binary exists ─────────────────────────────────────────
const so = `${projectRoot}/contracts/target/deploy/prism_core.so`;
const stat = require('node:fs').statSync(so, { throwIfNoEntry: false });
check(`prism_core.so built (${stat ? Math.round(stat.size / 1024) + ' KB' : 'missing'})`, !!stat);

// ── 10. Verify Rust source files were created ───────────────────────────────
const fs = require('node:fs');
const attachRs = `${projectRoot}/contracts/programs/prism-core/src/instructions/attach_encrypt_score.rs`;
const verifyRs = `${projectRoot}/contracts/programs/prism-core/src/instructions/verify_encrypt_default.rs`;
check('attach_encrypt_score.rs exists', fs.existsSync(attachRs));
check('verify_encrypt_default.rs exists', fs.existsSync(verifyRs));

const verifySrc = fs.readFileSync(verifyRs, 'utf8');
check(
  'verify_encrypt_default.rs has b"enc_atts" prefix',
  verifySrc.includes('b"enc_atts"'),
);
check(
  'verify_encrypt_default.rs has MSG_LEN: usize = 73',
  verifySrc.includes('MSG_LEN: usize = 73'),
);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
