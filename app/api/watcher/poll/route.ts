// POST /api/watcher/poll
//
// One poll cycle of the collateral oracle watcher.
// Called by cron-job.org every 60 seconds (free tier).
// Protected by WATCHER_CRON_SECRET header to block unauthorized calls.
//
// Persists fromBlock in the KV store (or falls back to looking back 500 blocks).
// Runs under Vercel's 60s function timeout (Pro) or 10s (Hobby).

import { NextRequest, NextResponse } from 'next/server';
import { parseStellarError } from '@/app/lib/errors';
import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import { Keypair } from '@stellar/stellar-sdk';

// ─── Config ──────────────────────────────────────────────────────────────────

const COLLATERAL_LOCKED_TOPIC =
  '0xd728dafd18936e772d08447587982a550d6dde56094634dbfcf6c184115682d9';

const MAX_RANGE = BigInt(process.env.WATCHER_MAX_BLOCK_RANGE ?? '10');

// Use a simple in-process variable as fromBlock cache.
// On Vercel, serverless functions are warm for ~5 min — good enough for 1-min cron.
// On cold start, falls back to current block − LOOKBACK.
let cachedFromBlock: bigint | null = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface RawLog {
  transactionHash: string;
  blockNumber: string;
  topics: string[];
  data: `0x${string}`;
  removed: boolean;
}

async function rpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// ─── Attester ─────────────────────────────────────────────────────────────────

async function attestLock(log: RawLog, currentBlock: bigint): Promise<{ loanId: number; status: string }> {
  const blockNumber   = BigInt(log.blockNumber);
  const confirmations = currentBlock - blockNumber;
  const requiredConfs = BigInt(process.env.WATCHER_CONFIRMATIONS ?? '20');

  if (confirmations < requiredConfs) {
    return { loanId: 0, status: `waiting_${confirmations}_of_${requiredConfs}` };
  }

  // Decode indexed topics: topic[1]=stellarLoanId, topic[2]=borrower, topic[3]=token
  const stellarLoanId = parseInt(log.topics[1] ?? '0x0', 16);
  const nonce = BigInt(Date.now()).toString();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // 1. Get oracle attestation (server-internal call)
  const attestRes = await fetch(`${appUrl}/api/collateral-oracle/attest`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loan_id:          stellarLoanId,
      chain_id:         1,
      asset_address:    '00'.repeat(32),
      amount_usd_micro: '0',
      valued_at_ts:     parseInt(String(blockNumber), 10).toString(),
      nonce,
      status:           'attached',
    }),
  });
  const attestData = await attestRes.json() as { message_hex?: string; signature?: string; error?: string };
  if (!attestRes.ok || !attestData.message_hex) {
    throw new Error(`Oracle attest failed: ${attestData.error ?? attestRes.status}`);
  }

  // 2. verify_collateral on Stellar (admin as relayer — no borrower auth needed)
  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) throw new Error('ADMIN_SECRET_SEED not set');
  const keypair = Keypair.fromSecret(seed);
  const core    = getCoreClient();
  const signer  = keypairSigner(keypair);

  const msgBytes = Buffer.from(attestData.message_hex, 'hex');
  const sigBytes = Buffer.from(attestData.signature!, 'hex');

  try {
    await core.invoke(signer, 'verify_collateral', [
      addr(keypair.publicKey()),
      nativeToScVal(stellarLoanId, { type: 'u32' }),
      nativeToScVal(msgBytes, { type: 'bytes' }),
      nativeToScVal(sigBytes, { type: 'bytes' }),
    ]);
    return { loanId: stellarLoanId, status: 'attested' };
  } catch (err) {
    const msg = parseStellarError(err);
    if (msg.includes('#61') || msg.includes('AlreadyVerified')) {
      return { loanId: stellarLoanId, status: 'already_attached' };
    }
    if (msg.includes('#60') || msg.includes('CollateralNotAttached')) {
      return { loanId: stellarLoanId, status: 'needs_attach_from_borrower' };
    }
    throw new Error(msg);
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check — cron-job.org sends this header
  const secret = process.env.WATCHER_CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rpcUrl       = process.env.POLYGON_MAINNET_RPC_URL ?? process.env.EVM_RPC_URL;
  const vaultAddress = process.env.POLYGON_MAINNET_VAULT_ADDRESS ?? process.env.EVM_VAULT_ADDRESS;

  if (!rpcUrl || !vaultAddress) {
    return NextResponse.json({ error: 'POLYGON_MAINNET_RPC_URL or POLYGON_MAINNET_VAULT_ADDRESS not set' }, { status: 500 });
  }

  const startedAt = Date.now();
  const results: unknown[] = [];

  try {
    const currentBlock = BigInt((await rpc(rpcUrl, 'eth_blockNumber', [])) as string);
    const lookback     = BigInt(process.env.LOOKBACK_BLOCKS ?? '500');

    if (!cachedFromBlock) {
      cachedFromBlock = currentBlock > lookback ? currentBlock - lookback : 0n;
    }
    if (currentBlock <= cachedFromBlock) {
      return NextResponse.json({ ok: true, message: 'No new blocks', currentBlock: currentBlock.toString() });
    }

    const toBlock = currentBlock - cachedFromBlock > MAX_RANGE
      ? cachedFromBlock + MAX_RANGE - 1n
      : currentBlock;

    const logs = await rpc(rpcUrl, 'eth_getLogs', [{
      address:   vaultAddress,
      topics:    [COLLATERAL_LOCKED_TOPIC],
      fromBlock: `0x${cachedFromBlock.toString(16)}`,
      toBlock:   `0x${toBlock.toString(16)}`,
    }]) as RawLog[];

    const activeLogs = logs.filter(l => !l.removed);

    for (const log of activeLogs) {
      try {
        const result = await attestLock(log, currentBlock);
        results.push({ tx: log.transactionHash.slice(0, 12), ...result });
      } catch (err) {
        results.push({ tx: log.transactionHash.slice(0, 12), error: err instanceof Error ? err.message.slice(0, 100) : String(err) });
      }
    }

    cachedFromBlock = toBlock + 1n;

    return NextResponse.json({
      ok:           true,
      scannedRange: `${cachedFromBlock! - MAX_RANGE}–${toBlock}`,
      logsFound:    activeLogs.length,
      results,
      ms:           Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json({
      ok:    false,
      error: err instanceof Error ? err.message : String(err),
      ms:    Date.now() - startedAt,
    }, { status: 500 });
  }
}
