import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { type NextRequest } from 'next/server';

import { addEvent } from '@/lib/eventStore';

const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60;

type RateLimitBucket = {
  windowStartMs: number;
  count: number;
};

const globalOracleSecurity = globalThis as typeof globalThis & {
  oracleRateLimitBuckets?: Map<string, RateLimitBucket>;
};

function getRateLimitBuckets(): Map<string, RateLimitBucket> {
  if (!globalOracleSecurity.oracleRateLimitBuckets) {
    globalOracleSecurity.oracleRateLimitBuckets = new Map();
  }
  return globalOracleSecurity.oracleRateLimitBuckets;
}

function parseSeed(seedHex: string, envName: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length !== 64) {
    throw new Error(`${envName} must be exactly 64 hex chars (32 bytes)`);
  }
  return Buffer.from(seedHex, 'hex');
}

function derivePrivateKey(seedHex: string, envName: string): KeyObject {
  const seed = parseSeed(seedHex, envName);
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: 'der',
    type: 'pkcs8',
  });
}

function derivePublicKeyHex(privateKey: KeyObject): string {
  return createPublicKey(privateKey)
    .export({ type: 'spki', format: 'der' })
    .slice(-32)
    .toString('hex');
}

function resolveRequiredSeed(
  primaryEnv: string,
  legacyEnvs: string[] = [],
  devEnv?: string,
): { seedHex: string; source: 'primary' | 'dev' } {
  const primary = process.env[primaryEnv]?.trim();
  if (primary) return { seedHex: primary, source: 'primary' };

  for (const legacyEnv of legacyEnvs) {
    const legacy = process.env[legacyEnv]?.trim();
    if (legacy) return { seedHex: legacy, source: 'primary' };
  }

  const dev = devEnv ? process.env[devEnv]?.trim() : undefined;
  if (dev) return { seedHex: dev, source: 'dev' };

  throw new Error(
    `Missing oracle seed: set ${primaryEnv}${devEnv ? ` (or ${devEnv} for local dev)` : ''}`,
  );
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function parseClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  const forwardedVercel = req.headers.get('x-vercel-forwarded-for');
  if (forwardedVercel) return forwardedVercel.split(',')[0]?.trim() || 'unknown';
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

export type ManagedOracleConfig = {
  oracleName: 'collateral' | 'encrypt' | 'cloak';
  primarySeedEnv: string;
  legacySeedEnvs?: string[];
  devSeedEnv?: string;
  nextSeedEnv?: string;
  activeKeyIdEnv: string;
  primaryKeyIdEnv: string;
  nextKeyIdEnv: string;
};

export type ManagedOracleSigner = {
  keyId: string;
  privateKey: KeyObject;
  publicKeyHex: string;
  source: 'primary' | 'next' | 'dev';
};

export type ManagedOracleSignerBundle = {
  oracleName: ManagedOracleConfig['oracleName'];
  activeKeyId: string;
  activeSigner: ManagedOracleSigner;
  signersById: Map<string, ManagedOracleSigner>;
};

export function loadManagedOracleSigner(config: ManagedOracleConfig): ManagedOracleSignerBundle {
  const primary = resolveRequiredSeed(
    config.primarySeedEnv,
    config.legacySeedEnvs ?? [],
    config.devSeedEnv,
  );
  const primaryKeyId = process.env[config.primaryKeyIdEnv]?.trim() || 'primary';
  const signersById = new Map<string, ManagedOracleSigner>();

  const primarySigner: ManagedOracleSigner = {
    keyId: primaryKeyId,
    privateKey: derivePrivateKey(primary.seedHex, config.primarySeedEnv),
    publicKeyHex: '',
    source: primary.source,
  };
  primarySigner.publicKeyHex = derivePublicKeyHex(primarySigner.privateKey);
  signersById.set(primaryKeyId, primarySigner);

  const nextSeedRaw = config.nextSeedEnv ? process.env[config.nextSeedEnv]?.trim() : undefined;
  if (nextSeedRaw) {
    const nextKeyId = process.env[config.nextKeyIdEnv]?.trim() || 'next';
    if (!signersById.has(nextKeyId)) {
      const nextSigner: ManagedOracleSigner = {
        keyId: nextKeyId,
        privateKey: derivePrivateKey(nextSeedRaw, config.nextSeedEnv!),
        publicKeyHex: '',
        source: 'next',
      };
      nextSigner.publicKeyHex = derivePublicKeyHex(nextSigner.privateKey);
      signersById.set(nextKeyId, nextSigner);
    }
  }

  const activeKeyId = process.env[config.activeKeyIdEnv]?.trim() || primaryKeyId;
  const activeSigner = signersById.get(activeKeyId);
  if (!activeSigner) {
    throw new Error(
      `Invalid ${config.activeKeyIdEnv}: "${activeKeyId}" is not a configured signer key id.`,
    );
  }

  return {
    oracleName: config.oracleName,
    activeKeyId,
    activeSigner,
    signersById,
  };
}

export function selectOracleSigner(
  bundle: ManagedOracleSignerBundle,
  requestedKeyId?: string,
): ManagedOracleSigner {
  if (!requestedKeyId) return bundle.activeSigner;
  const signer = bundle.signersById.get(requestedKeyId);
  if (!signer) {
    throw new Error(
      `Unknown oracle key_id "${requestedKeyId}". Known key ids: ${[...bundle.signersById.keys()].join(', ')}`,
    );
  }
  return signer;
}

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtEpochSeconds: number;
  clientKey: string;
};

export function enforceOracleRateLimit(
  req: NextRequest,
  routeScope: string,
  perMinuteEnv: string,
): RateLimitDecision {
  const limit = parsePositiveInt(process.env[perMinuteEnv], DEFAULT_RATE_LIMIT_PER_MINUTE);
  const windowSeconds = parsePositiveInt(
    process.env.ORACLE_RATE_LIMIT_WINDOW_SECONDS,
    DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
  );
  const windowMs = windowSeconds * 1000;
  const now = Date.now();

  const ip = parseClientIp(req);
  const userAgent = req.headers.get('user-agent')?.slice(0, 64) || 'unknown';
  const clientKey = `${ip}|${userAgent}`;
  const bucketKey = `${routeScope}:${clientKey}`;
  const buckets = getRateLimitBuckets();
  const existing = buckets.get(bucketKey);

  let bucket: RateLimitBucket;
  if (!existing || now - existing.windowStartMs >= windowMs) {
    bucket = { windowStartMs: now, count: 0 };
  } else {
    bucket = existing;
  }

  const allowed = bucket.count < limit;
  if (allowed) {
    bucket.count += 1;
    buckets.set(bucketKey, bucket);
  }

  // Opportunistic pruning to avoid unbounded memory in long-lived processes.
  if (buckets.size > 10_000) {
    for (const [key, value] of buckets) {
      if (now - value.windowStartMs >= windowMs * 2) buckets.delete(key);
      if (buckets.size <= 5_000) break;
    }
  }

  const remaining = allowed ? Math.max(limit - bucket.count, 0) : 0;
  return {
    allowed,
    limit,
    remaining,
    resetAtEpochSeconds: Math.floor((bucket.windowStartMs + windowMs) / 1000),
    clientKey,
  };
}

export async function recordOracleOperationalEvent(input: {
  route: string;
  oracle: ManagedOracleConfig['oracleName'];
  outcome: 'signed' | 'rate_limited' | 'invalid_request' | 'error';
  signer?: ManagedOracleSigner;
  clientKey: string;
  success: boolean;
  detail?: Record<string, unknown>;
}) {
  const eventTypeByOutcome: Record<(typeof input)['outcome'], string> = {
    signed: 'OracleAttestationSigned',
    rate_limited: 'OracleRateLimitBlocked',
    invalid_request: 'OracleAttestationRejected',
    error: 'OracleAttestationError',
  };
  const timestamp = Math.floor(Date.now() / 1000);

  try {
    await addEvent({
      signature: `${input.route}:${timestamp}:${input.outcome}`,
      eventType: eventTypeByOutcome[input.outcome],
      signer: input.signer?.publicKeyHex ?? 'oracle-route',
      success: input.success,
      timestamp,
      message: `${input.oracle} oracle ${input.outcome}`,
      metadata: {
        route: input.route,
        oracle: input.oracle,
        key_id: input.signer?.keyId,
        key_source: input.signer?.source,
        client_key: input.clientKey,
        ...input.detail,
      },
    });
  } catch (error) {
    // Best effort: route behavior must not depend on database health.
    console.error('Failed to record oracle operational event:', error);
  }
}
