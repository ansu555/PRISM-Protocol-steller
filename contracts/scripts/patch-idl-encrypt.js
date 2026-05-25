#!/usr/bin/env node
// Patches the prism_core IDL JSON with the new Encrypt FHE entries.
// Run from /contracts: `node scripts/patch-idl-encrypt.js`
// (or with a different IDL path: `node scripts/patch-idl-encrypt.js path/to/prism_core.json`)
//
// This script is idempotent — running it twice produces the same output.
// We need it because anchor-syn 0.30.1 IDL extraction is broken on Rust 1.95
// (calls the removed `proc_macro::Span::source_file()` API).

const fs = require('fs');
const path = require('path');

const idlPath = process.argv[2] || 'target/idl/prism_core.json';
const abs = path.resolve(idlPath);
const idl = JSON.parse(fs.readFileSync(abs, 'utf8'));

const ENCRYPT_HEALTH_SEED = Array.from(Buffer.from('encrypt_health'));

// ── Errors (codes follow source order in errors.rs) ──────────────────────
const newErrors = [
  // codes 6019, 6020 already present in source but missing from stale IDL.
  { code: 6019, name: 'OracleNotAllowlisted',         msg: 'Oracle public key is not in the global allowlist' },
  { code: 6020, name: 'CollateralAlreadyActive',      msg: 'Collateral account is already active and cannot be re-attached' },
  { code: 6021, name: 'EncryptAlreadyDefaultProven',  msg: 'Encrypt health is already DefaultProven; cannot re-prove' },
  { code: 6022, name: 'EncryptSignatureInvalid',      msg: 'Encrypt oracle signature invalid or message mismatch' },
  { code: 6023, name: 'EncryptCommitmentMismatch',    msg: 'score_commitment in attestation does not match registered commitment' },
  { code: 6024, name: 'EncryptDefaultNotProven',      msg: 'Encrypt FHE result byte is not 0x01 (default not proven by oracle)' },
];

const errorByName = new Map(idl.errors.map((e) => [e.name, e]));
for (const e of newErrors) {
  if (!errorByName.has(e.name)) idl.errors.push(e);
}
idl.errors.sort((a, b) => a.code - b.code);

// ── Instruction: attach_encrypt_score ────────────────────────────────────
const attachEncryptScore = {
  name: 'attach_encrypt_score',
  docs: [
    'Borrower registers a sha256 commitment of their Encrypt-sealed credit',
    'score on-chain. The actual score data stays encrypted off-chain.',
  ],
  discriminator: [66, 136, 69, 107, 179, 238, 28, 112],
  accounts: [
    { name: 'borrower', writable: true, signer: true },
    {
      name: 'config',
      pda: { seeds: [{ kind: 'const', value: Array.from(Buffer.from('config')) }] },
    },
    { name: 'loan' },
    {
      name: 'encrypt_health',
      writable: true,
      pda: {
        seeds: [
          { kind: 'const', value: ENCRYPT_HEALTH_SEED },
          { kind: 'account', path: 'loan' },
        ],
      },
    },
    { name: 'system_program', address: '11111111111111111111111111111111' },
  ],
  args: [
    { name: 'commitment', type: { array: ['u8', 32] } },
    { name: 'encrypt_oracle', type: 'pubkey' },
  ],
};

// ── Instruction: verify_encrypt_default ──────────────────────────────────
const verifyEncryptDefault = {
  name: 'verify_encrypt_default',
  docs: [
    'Must be called as instruction index 1 in a tx where index 0 is an',
    'ed25519 native-program instruction containing the Encrypt FHE oracle\'s',
    'signature over the 73-byte attestation. Atomically proves default via',
    'FHE attestation AND triggers the credit event cascade.',
  ],
  discriminator: [209, 6, 221, 214, 220, 246, 224, 166],
  accounts: [
    { name: 'signer', writable: true, signer: true },
    {
      name: 'config',
      pda: { seeds: [{ kind: 'const', value: Array.from(Buffer.from('config')) }] },
    },
    { name: 'loan' },
    {
      name: 'encrypt_health',
      writable: true,
      pda: {
        seeds: [
          { kind: 'const', value: ENCRYPT_HEALTH_SEED },
          { kind: 'account', path: 'loan' },
        ],
      },
    },
    { name: 'vault', writable: true },
    { name: 'tranche_prime', writable: true },
    { name: 'tranche_core', writable: true },
    { name: 'tranche_alpha', writable: true },
    { name: 'vault_usdc_reserve', writable: true },
    { name: 'loss_bucket', writable: true },
    { name: 'credit_event', writable: true },
    {
      name: 'token_program',
      address: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    },
    { name: 'system_program', address: '11111111111111111111111111111111' },
    { name: 'instructions_sysvar', address: 'Sysvar1nstructions1111111111111111111111111' },
  ],
  args: [
    { name: 'loss_amount', type: 'u64' },
    { name: 'severity_bps', type: 'u16' },
  ],
};

const ixByName = new Map(idl.instructions.map((i) => [i.name, i]));
for (const ix of [attachEncryptScore, verifyEncryptDefault]) {
  if (!ixByName.has(ix.name)) idl.instructions.push(ix);
}
idl.instructions.sort((a, b) => a.name.localeCompare(b.name));

// ── Account registry: EncryptLoanHealth ──────────────────────────────────
const encryptLoanHealthAccount = {
  name: 'EncryptLoanHealth',
  discriminator: [139, 132, 10, 198, 14, 145, 116, 159],
};

const accByName = new Map(idl.accounts.map((a) => [a.name, a]));
if (!accByName.has(encryptLoanHealthAccount.name)) {
  idl.accounts.push(encryptLoanHealthAccount);
}
idl.accounts.sort((a, b) => a.name.localeCompare(b.name));

// ── Types: EncryptStatus enum + EncryptLoanHealth struct ─────────────────
const encryptStatusType = {
  name: 'EncryptStatus',
  type: {
    kind: 'enum',
    variants: [
      { name: 'Pending' },
      { name: 'Verified' },
      { name: 'DefaultProven' },
    ],
  },
};

const encryptLoanHealthType = {
  name: 'EncryptLoanHealth',
  type: {
    kind: 'struct',
    fields: [
      { name: 'loan', type: 'pubkey' },
      { name: 'score_commitment', type: { array: ['u8', 32] } },
      { name: 'encrypt_oracle', type: 'pubkey' },
      { name: 'status', type: { defined: { name: 'EncryptStatus' } } },
      { name: 'default_proven_ts', type: 'i64' },
      { name: 'bump', type: 'u8' },
    ],
  },
};

const typeByName = new Map(idl.types.map((t) => [t.name, t]));
for (const t of [encryptStatusType, encryptLoanHealthType]) {
  if (!typeByName.has(t.name)) idl.types.push(t);
}
idl.types.sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(abs, JSON.stringify(idl, null, 2) + '\n', 'utf8');
console.log(`Patched IDL at ${abs}`);
console.log(`  instructions: ${idl.instructions.length}`);
console.log(`  accounts:     ${idl.accounts.length}`);
console.log(`  types:        ${idl.types.length}`);
console.log(`  errors:       ${idl.errors.length} (max code: ${Math.max(...idl.errors.map((e) => e.code))})`);
