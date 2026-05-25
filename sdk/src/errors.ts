export enum PrismCoreError {
  VaultNotActive = 6000,
  VaultPaused = 6001,
  InvalidTrancheKind = 6002,
  LoanInWrongState = 6003,
  InsufficientLiquidity = 6004,
  SlippageExceeded = 6005,
  Unauthorized = 6006,
  ArithmeticOverflow = 6007,
  EmptyTrancheNav = 6008,
  InvalidSeverity = 6009,
  LossExceedsTotalAssets = 6010,
  BorrowerMismatch = 6011,
  TrancheWipedNoDepositsAllowed = 6012,
  OracleStale = 6013,
  CollateralNotLocked = 6014,
  OracleSignatureInvalid = 6015,
  DwalletIdMismatch = 6016,
  InsufficientCollateral = 6017,
  CollateralAlreadyLocked = 6018,
  OracleNotAllowlisted = 6019,
  CollateralAlreadyActive = 6020,
  EncryptAlreadyDefaultProven = 6021,
  EncryptSignatureInvalid = 6022,
  EncryptCommitmentMismatch = 6023,
  EncryptDefaultNotProven = 6024,
  CloakPayoutAlreadyRecorded = 6025,
  CloakSignatureInvalid = 6026,
  CloakBatchIdMismatch = 6027,
  CloakPayoutNotConfirmed = 6028,
}

export enum PrismAmmError {
  PoolNotInitialized = 6000,
  SlippageExceeded = 6001,
  InvalidFee = 6002,
  RatioMismatch = 6003,
  MinLiquidityViolation = 6004,
}

export const PRISM_CORE_ERROR_MESSAGES: Record<number, string> = {
  6000: 'Vault is not in Active state',
  6001: 'Vault is paused',
  6002: 'Invalid tranche kind',
  6003: 'Loan is not in expected state',
  6004: 'Insufficient liquidity in tranche',
  6005: 'Slippage exceeded — swap output below min_amount_out',
  6006: 'Unauthorized — caller is neither admin nor allowlisted oracle',
  6007: 'Arithmetic overflow',
  6008: 'NAV calculation: division by zero (empty tranche)',
  6009: 'CreditEvent severity exceeds 100% (10000 bps)',
  6010: 'Loss amount exceeds total vault assets',
  6011: 'Borrower account mismatch',
  6012: 'Tranche has been wiped (NAV = 0); deposits blocked until reset',
  6013: 'Switchboard feed value is older than freshness threshold',
  6014: 'IKA collateral is not in Locked state; disbursement blocked',
  6015: 'Oracle signature invalid or message mismatch',
  6016: 'dWallet ID in attestation does not match registered collateral',
  6017: 'Collateral USD value is insufficient to cover loan principal',
  6018: 'Collateral already locked; cannot re-verify',
  6019: 'Oracle public key is not in the global allowlist',
  6020: 'Collateral account is already active and cannot be re-attached',
  6021: 'Encrypt health is already DefaultProven; cannot re-prove',
  6022: 'Encrypt oracle signature invalid or message mismatch',
  6023: 'score_commitment in attestation does not match registered commitment',
  6024: 'Encrypt FHE result byte is not 0x01 (default not proven by oracle)',
  6025: 'Cloak payout already recorded for this vault epoch',
  6026: 'Cloak oracle signature invalid or message mismatch',
  6027: 'batch_id in attestation does not match expected commitment',
  6028: 'Cloak result byte is not 0x01 (batch not confirmed by oracle)',
};

export const PRISM_AMM_ERROR_MESSAGES: Record<number, string> = {
  6000: 'Pool reserves are empty',
  6001: 'Swap output below min_amount_out',
  6002: 'fee_bps exceeds MAX_FEE_BPS (1000)',
  6003: "add_liquidity ratio doesn't match current pool",
  6004: 'First LP must supply > MIN_LIQUIDITY (1000) shares',
};

export interface DecodedAnchorError {
  kind: 'core' | 'amm';
  code: number;
  error: string;
  message: string;
}

const CORE_NAME_BY_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(PrismCoreError)
    .filter(([k]) => Number.isNaN(Number(k)))
    .map(([name, code]) => [code as number, name as string]),
) as Record<number, string>;

const AMM_NAME_BY_CODE: Record<number, string> = Object.fromEntries(
  Object.entries(PrismAmmError)
    .filter(([k]) => Number.isNaN(Number(k)))
    .map(([name, code]) => [code as number, name as string]),
) as Record<number, string>;

/**
 * Decode a thrown Anchor program error into a typed structure.
 *
 * Handles three wrapping styles:
 *   1. AnchorError instance: { error: { errorCode: { code, number }, errorMessage } }
 *   2. ProgramError-shaped object: { code: number, msg?: string }
 *   3. Stringified Error 0xNNNN / "custom program error: 0xNNNN" patterns
 *
 * Returns `null` for unrecognized errors so callers can re-throw raw.
 *
 * The function checks the surrounding error message for "prism_amm" /
 * "prism_core" / known program IDs to disambiguate codes that overlap between
 * the two programs (e.g. core 6005 SlippageExceeded vs amm 6001 SlippageExceeded).
 * When ambiguous, it prefers `core`.
 */
export function decodeAnchorError(raw: unknown): DecodedAnchorError | null {
  if (!raw) return null;

  const code = extractCode(raw);
  if (code === null) return null;

  const programHint = extractProgramHint(raw);

  // Disambiguate by program hint when available; otherwise prefer core.
  const isAmm = programHint === 'amm';
  const isCore = programHint === 'core';

  if (isAmm && code in AMM_NAME_BY_CODE) {
    return {
      kind: 'amm',
      code,
      error: AMM_NAME_BY_CODE[code]!,
      message: PRISM_AMM_ERROR_MESSAGES[code] ?? '',
    };
  }

  if (isCore && code in CORE_NAME_BY_CODE) {
    return {
      kind: 'core',
      code,
      error: CORE_NAME_BY_CODE[code]!,
      message: PRISM_CORE_ERROR_MESSAGES[code] ?? '',
    };
  }

  if (code in CORE_NAME_BY_CODE) {
    return {
      kind: 'core',
      code,
      error: CORE_NAME_BY_CODE[code]!,
      message: PRISM_CORE_ERROR_MESSAGES[code] ?? '',
    };
  }

  if (code in AMM_NAME_BY_CODE) {
    return {
      kind: 'amm',
      code,
      error: AMM_NAME_BY_CODE[code]!,
      message: PRISM_AMM_ERROR_MESSAGES[code] ?? '',
    };
  }

  return null;
}

function extractCode(raw: unknown): number | null {
  if (typeof raw === 'number') return raw;

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;

    // AnchorError shape
    const err = obj.error as Record<string, unknown> | undefined;
    if (err) {
      const errorCode = err.errorCode as Record<string, unknown> | undefined;
      if (errorCode && typeof errorCode.number === 'number') {
        return errorCode.number;
      }
    }

    // ProgramError shape
    if (typeof obj.code === 'number') return obj.code;

    // Look at .message string for hex / decimal patterns
    if (typeof obj.message === 'string') {
      const fromString = extractCodeFromString(obj.message);
      if (fromString !== null) return fromString;
    }

    if (typeof obj.toString === 'function') {
      const fromString = extractCodeFromString(obj.toString());
      if (fromString !== null) return fromString;
    }
  }

  if (typeof raw === 'string') {
    return extractCodeFromString(raw);
  }

  return null;
}

function extractCodeFromString(s: string): number | null {
  const hexMatch = s.match(/0x([0-9a-fA-F]+)/);
  if (hexMatch) {
    const parsed = Number.parseInt(hexMatch[1]!, 16);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const decMatch = s.match(/(?:error|code)[^\d]*?(\d{4,5})/i);
  if (decMatch) {
    const parsed = Number.parseInt(decMatch[1]!, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function extractProgramHint(raw: unknown): 'core' | 'amm' | null {
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const haystack = [
      typeof obj.message === 'string' ? obj.message : '',
      typeof obj.toString === 'function' ? obj.toString() : '',
      JSON.stringify(obj.logs ?? ''),
    ]
      .join(' ')
      .toLowerCase();

    if (haystack.includes('prism_amm') || haystack.includes('prism-amm')) return 'amm';
    if (haystack.includes('prism_core') || haystack.includes('prism-core')) return 'core';
  }
  if (typeof raw === 'string') {
    const s = raw.toLowerCase();
    if (s.includes('prism_amm') || s.includes('prism-amm')) return 'amm';
    if (s.includes('prism_core') || s.includes('prism-core')) return 'core';
  }
  return null;
}
