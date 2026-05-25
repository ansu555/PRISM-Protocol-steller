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
  const fraction = rawFraction.padEnd(6, '0').slice(0, 6);
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

export function shortKey(value: { toBase58: () => string } | string): string {
  const key = typeof value === 'string' ? value : value.toBase58();
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
  if (endpoint.includes('devnet')) return 'Solana Devnet';
  if (endpoint.includes('testnet')) return 'Solana Testnet';
  return 'Solana Mainnet';
}
