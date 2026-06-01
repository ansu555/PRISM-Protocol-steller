import { Q64_ONE, USDC_BASE_UNITS } from './constants';

export function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(value));
  if (typeof value === 'string') return BigInt(value);
  if (value && typeof (value as { toString: () => string }).toString === 'function') {
    return BigInt((value as { toString: () => string }).toString());
  }
  return 0n;
}

export function parseUsdc(value: string): bigint {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed) return 0n;
  const [whole = '0', rawFraction = ''] = trimmed.split('.');
  // PTUSDC has 7 decimal places — pad/truncate fraction to exactly 7 digits.
  const fraction = rawFraction.padEnd(7, '0').slice(0, 7);
  return BigInt(whole || '0') * USDC_BASE_UNITS + BigInt(fraction || '0');
}

export function formatUsdc(value: unknown, decimals = 6): string {
  const raw = toBigInt(value);
  const sign = raw < 0n ? '-' : '';
  const absolute = raw < 0n ? -raw : raw;
  const whole = absolute / USDC_BASE_UNITS;
  const fraction = (absolute % USDC_BASE_UNITS).toString().padStart(6, '0');
  return `${sign}${whole.toLocaleString()}.${fraction.slice(0, decimals)}`;
}

/**
 * Compact balance formatter — K/M/B/T magnitude suffix for large amounts, full
 * precision for everyday values. Input is raw 7-decimal base units (same as
 * `formatUsdc`). Trailing zeros in the mantissa are trimmed.
 *
 *   0.64               -> "0.64"
 *   1_234.56           -> "1.23K"
 *   1_500_000          -> "1.5M"
 *   922_337_203_685.47 -> "922.34B"   (e.g. a SAC issuer's i64::MAX sentinel)
 */
export function formatCompactUsdc(value: unknown, decimals = 2): string {
  const raw = toBigInt(value);
  const sign = raw < 0n ? '-' : '';
  const absolute = raw < 0n ? -raw : raw;
  const human = Number(absolute) / Number(USDC_BASE_UNITS);

  // Small/medium balances stay fully precise and grouped (e.g. "1,234.56").
  if (human < 1000) return formatUsdc(value, decimals);

  const units: Array<[number, string]> = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [threshold, suffix] of units) {
    if (human >= threshold) {
      const scaled = (human / threshold).toFixed(decimals);
      // Trim trailing zeros: "1.50" -> "1.5", "100.00" -> "100".
      const trimmed = scaled.includes('.')
        ? scaled.replace(/0+$/, '').replace(/\.$/, '')
        : scaled;
      return `${sign}${trimmed}${suffix}`;
    }
  }
  return formatUsdc(value, decimals);
}

export function formatBaseUnits(value: unknown): string {
  return `${toBigInt(value).toString()} units`;
}

export function formatNavQ(value: unknown): string {
  const q = toBigInt(value);
  if (q === 0n) return '0.000000';
  const scaled = (q * 1_000_000n) / Q64_ONE;
  const whole = scaled / 1_000_000n;
  const fraction = (scaled % 1_000_000n).toString().padStart(6, '0');
  return `${whole.toString()}.${fraction}`;
}

export function shortKey(value: { toBase58: () => string } | string | null | undefined): string {
  if (!value) return '—';
  const key = typeof value === 'string' ? value : value.toBase58();
  if (!key) return '—';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export function delta(before: bigint, after: bigint) {
  return {
    before: `${formatUsdc(before)} (${formatBaseUnits(before)})`,
    after: `${formatUsdc(after)} (${formatBaseUnits(after)})`,
    delta: `${after >= before ? '+' : ''}${formatUsdc(after - before)} (${formatBaseUnits(
      after - before,
    )})`,
  };
}

export function stateName(value: unknown): string {
  if (!value) return 'Missing';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys[0] ?? 'Unknown';
  }
  return 'Unknown';
}

export function getNetworkName(endpoint: string): string {
  if (endpoint.includes('devnet')) return 'Stellar Devnet';
  if (endpoint.includes('testnet')) return 'Stellar Testnet';
  return 'Stellar Mainnet';
}
