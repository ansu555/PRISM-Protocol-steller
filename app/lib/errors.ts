// Human-readable Soroban / Stellar error messages.
//
// Call parseStellarError(err) anywhere you catch a thrown error before
// passing it to toast.error() or returning it in an API response.

// PrismError code → message (mirrors soroban/prism-core/src/errors.rs)
const PRISM_CONTRACT_ERRORS: Record<number, string> = {
  1:  'Vault is not active',
  2:  'Vault is paused',
  3:  'Invalid tranche type',
  4:  'Loan is in the wrong state for this action',
  5:  'Not enough liquidity in the vault',
  6:  'Slippage limit exceeded',
  7:  'Unauthorized — admin action required',
  10: 'Arithmetic overflow in contract calculation',
  11: 'Tranche has no NAV (empty tranche)',
  12: 'Invalid severity value (must be 0–10000)',
  13: 'Loss exceeds total tranche assets — or trustline missing for the target account (add trustlines first)',
  14: 'Tranche is wiped out — deposits not allowed',
  20: 'Borrower address does not match the loan',
  30: 'Encrypt default already proven for this loan',
  31: 'Encrypt oracle signature is invalid',
  32: 'Encrypt commitment mismatch',
  33: 'Encrypt default not yet proven',
  34: 'Oracle is not on the allowlist — register it first in Protocol Setup',
  35: 'Oracle allowlist is full',
  36: 'Oracle is already on the allowlist',
  40: 'Cloak payout already recorded for this batch',
  41: 'Cloak oracle signature is invalid',
  42: 'Cloak batch ID mismatch',
  43: 'Cloak payout not confirmed',
  50: 'Already initialized — nothing to do',
  51: 'Not initialized — run Protocol Setup first',
  60: 'No collateral record found — attach collateral first',
  61: 'Collateral already verified — cannot re-verify',
  62: 'Collateral status byte does not match the expected transition',
  63: 'Collateral attestation message is malformed',
  64: 'Collateral nonce already used — replay detected',
  65: 'Disbursal blocked — collateral not yet verified by oracle',
};

// SAC (Stellar Asset Contract) error messages
const SAC_PATTERNS: [RegExp, string][] = [
  [/trustline entry is missing/i,       'Trustline missing — the wallet must opt-in to TUSDC first (use Mint TUSDC → Add Trustline in Protocol Setup)'],
  [/balance is not sufficient to spend/, 'Insufficient balance — the vault does not have enough USDC to disburse this loan. Deposit more into the tranches first.'],
  [/not authorized/i,                    'Token operation not authorized — check SAC admin keypair'],
  [/below minimum/i,                     'Amount is below the token minimum'],
];

// Auth / host errors
const HOST_PATTERNS: [RegExp, string][] = [
  [/Error\(Auth,\s*InvalidAction\)/,  'Authorization failed — the signer does not have permission for this action'],
  [/Error\(Auth,\s*ExistingValue\)/,  'Auth conflict — duplicate authorization entry'],
  [/Error\(WasmVm,/,                  'Contract execution failed — check contract is deployed and WASM is correct'],
  [/Error\(Value,\s*InvalidInput\)/,  'Invalid input value passed to the contract'],
  [/Error\(Value,\s*ExistsValue\)/,   'Value already exists'],
  [/accountId is invalid/i,           'Invalid Stellar address — check the address format'],
  [/account not found/i,              'Account not found on the network — fund it with Friendbot first'],
  [/INSUFFICIENT_BALANCE/,            'Insufficient XLM balance to pay transaction fee'],
  [/tx_bad_auth/i,                    'Transaction signature is invalid or missing'],
  [/op_no_trust/i,                    'Trustline missing — add a trustline for this asset first'],
  [/op_line_full/i,                   'Trustline limit reached'],
  [/op_low_reserve/i,                 'Account below minimum XLM reserve — send more XLM first'],
  [/timeout/i,                        'Transaction timed out — the network may be congested, please retry'],
];

function extractContractError(message: string): string | null {
  // Matches both Error(Contract, #51) and HostError: Error(Contract, #51)
  const match = message.match(/Error\(Contract,\s*#(\d+)\)/);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  const label = PRISM_CONTRACT_ERRORS[code];
  return label ? `${label} (code #${code})` : `Contract error #${code}`;
}

export function parseStellarError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // 1. PRISM contract error codes
  const contractMsg = extractContractError(raw);
  if (contractMsg) return contractMsg;

  // 2. SAC patterns
  for (const [pattern, msg] of SAC_PATTERNS) {
    if (pattern.test(raw)) return msg;
  }

  // 3. Host / auth patterns
  for (const [pattern, msg] of HOST_PATTERNS) {
    if (pattern.test(raw)) return msg;
  }

  // 4. Strip boilerplate and return the core message
  return raw
    .replace(/^HostError:\s*/i, '')
    .replace(/\s*Event log \(newest first\):[\s\S]*/i, '')
    .replace(/Soroban (read|invoke) failed \([^)]+\):\s*/i, '')
    .replace(/Soroban invoke \w+ settled with status \w+:\s*/i, '')
    .trim() || 'An unexpected error occurred — check the console for details';
}
