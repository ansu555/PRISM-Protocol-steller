// POST /api/watcher/poll
//
// One poll cycle of the collateral oracle watcher. Scans the EVM vault for
// CollateralLocked events (unchanged) and attests confirmed locks to prism-core
// on XION via verify_collateral. Protected by WATCHER_CRON_SECRET.

import { NextRequest, NextResponse } from 'next/server';

import { coreExecute } from '@/app/lib/xion';
import { adminSigner, hex, isContractError, xionErrorMessage } from '@/app/lib/xion-server';

// ─── Config ──────────────────────────────────────────────────────────────────

const COLLATERAL_LOCKED_TOPIC =
  '0xd728dafd18936e772d08447587982a550d6dde56094634dbfcf6c184115682d9';

const MAX_RANGE = BigInt(process.env.WATCHER_MAX_BLOCK_RANGE ?? '10');

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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

// ─── Attester ─────────────────────────────────────────────────────────────────

async function attestLock(log: RawLog, currentBlock: bigint): Promise<{ loanId: number; status: string }> {
  const blockNumber = BigInt(log.blockNumber);
  const confirmations = currentBlock - blockNumber;
  const requiredConfs = BigInt(process.env.WATCHER_CONFIRMATIONS ?? '20');

  if (confirmations < requiredConfs) {
    return { loanId: 0, status: `waiting_${confirmations}_of_${requiredConfs}` };
  }

  const stellarLoanId = parseInt(log.topics[1] ?? '0x0', 16);
  const nonce = BigInt(Date.now()).toString();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // 1. Get oracle attestation (server-internal call).
  const attestRes = await fetch(`${appUrl}/api/collateral-oracle/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loan_id: stellarLoanId,
      chain_id: 1,
      asset_address: '00'.repeat(32),
      amount_usd_micro: '0',
      valued_at_ts: parseInt(String(blockNumber), 10).toString(),
      nonce,
      status: 'attached',
    }),
  });
  const attestData = (await attestRes.json()) as { message_hex?: string; signature?: string; error?: string };
  if (!attestRes.ok || !attestData.message_hex) {
    throw new Error(`Oracle attest failed: ${attestData.error ?? attestRes.status}`);
  }

  // 2. verify_collateral on XION (admin as relayer — no borrower auth needed).
  const signer = await adminSigner();
  try {
    await coreExecute(signer, {
      verify_collateral: {
        loan_id: stellarLoanId,
        message: hex(attestData.message_hex),
        signature: hex(attestData.signature!),
      },
    });
    return { loanId: stellarLoanId, status: 'attested' };
  } catch (err) {
    if (isContractError(err, 'collateral already verified', 'already verified')) {
      return { loanId: stellarLoanId, status: 'already_attached' };
    }
    if (isContractError(err, 'collateral not attached')) {
      return { loanId: stellarLoanId, status: 'needs_attach_from_borrower' };
    }
    throw new Error(xionErrorMessage(err));
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret = process.env.WATCHER_CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rpcUrl = process.env.POLYGON_MAINNET_RPC_URL ?? process.env.EVM_RPC_URL;
  const vaultAddress = process.env.POLYGON_MAINNET_VAULT_ADDRESS ?? process.env.EVM_VAULT_ADDRESS;

  if (!rpcUrl || !vaultAddress) {
    return NextResponse.json({ error: 'POLYGON_MAINNET_RPC_URL or POLYGON_MAINNET_VAULT_ADDRESS not set' }, { status: 500 });
  }

  const startedAt = Date.now();
  const results: unknown[] = [];

  try {
    const currentBlock = BigInt((await rpc(rpcUrl, 'eth_blockNumber', [])) as string);
    const lookback = BigInt(process.env.LOOKBACK_BLOCKS ?? '500');

    if (!cachedFromBlock) {
      cachedFromBlock = currentBlock > lookback ? currentBlock - lookback : 0n;
    }
    if (currentBlock <= cachedFromBlock) {
      return NextResponse.json({ ok: true, message: 'No new blocks', currentBlock: currentBlock.toString() });
    }

    const toBlock =
      currentBlock - cachedFromBlock > MAX_RANGE ? cachedFromBlock + MAX_RANGE - 1n : currentBlock;

    const logs = (await rpc(rpcUrl, 'eth_getLogs', [
      {
        address: vaultAddress,
        topics: [COLLATERAL_LOCKED_TOPIC],
        fromBlock: `0x${cachedFromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
      },
    ])) as RawLog[];

    const activeLogs = logs.filter((l) => !l.removed);

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
      ok: true,
      scannedRange: `${cachedFromBlock! - MAX_RANGE}–${toBlock}`,
      logsFound: activeLogs.length,
      results,
      ms: Date.now() - startedAt,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - startedAt }, { status: 500 });
  }
}
