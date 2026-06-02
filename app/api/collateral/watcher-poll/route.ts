// GET /api/collateral/watcher-poll
//
// One poll cycle of the Polygon collateral watcher.
// Called by Vercel Cron every minute (vercel.json) — do not call from the browser.
// Secured with CRON_SECRET (Vercel injects this automatically).
//
// Flow per invocation:
//   1. Read last processed block from DB
//   2. Fetch current Polygon tip
//   3. Scan up to MAX_RANGE blocks for CollateralLocked events
//   4. For each new event: call /api/collateral-oracle/attest → /api/collateral/verify
//   5. Write new last block back to DB

import { NextRequest, NextResponse } from 'next/server';
import { Interface } from 'ethers';
import { getLastBlock, setLastBlock } from '@/lib/watcherStore';

// Ask Vercel for up to 60s (Pro plan). Hobby plan caps at 10s regardless.
export const maxDuration = 60;

const VAULT_IFACE = new Interface([
  'event CollateralLocked(uint32 indexed stellarLoanId, address indexed borrower, address indexed token, uint256 amount, string stellarBorrower, uint256 lockedAt)',
]);

const CHAIN_ID      = 137;
const VAULT_ADDRESS = process.env.EVM_VAULT_ADDRESS_MAINNET ?? process.env.EVM_VAULT_ADDRESS ?? '';
const RPC_URL       = process.env.EVM_RPC_URL_MAINNET       ?? process.env.EVM_RPC_URL       ?? '';

// On Vercel, VERCEL_URL is auto-injected (no https:// prefix).
// NEXT_PUBLIC_APP_URL overrides both (useful for custom domains).
const APP_BASE = process.env.NEXT_PUBLIC_APP_URL
  ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

// Keep MAX_RANGE small — each getLogs call counts against RPC quota and adds latency.
// Polygon ~12 blocks/min, so 50 blocks covers 4 minutes of gaps comfortably.
const MAX_RANGE     = BigInt(process.env.WATCHER_MAX_BLOCK_RANGE ?? '50');
const LOOKBACK      = BigInt(process.env.WATCHER_LOOKBACK_BLOCKS ?? '500');
const CONFIRMATIONS = BigInt(process.env.WATCHER_CONFIRMATIONS   ?? '20');

const COLLATERAL_LOCKED_TOPIC =
  '0xd728dafd18936e772d08447587982a550d6dde56094634dbfcf6c184115682d9';


// ─── RPC helpers ─────────────────────────────────────────────────────────────

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const json = await res.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function getBlockNumber(): Promise<bigint> {
  return BigInt(await rpc('eth_blockNumber', []) as string);
}

interface RawLog {
  transactionHash: string;
  blockNumber: string;
  topics: string[];
  data: `0x${string}`;
  removed: boolean;
}

async function getLogs(from: bigint, to: bigint): Promise<RawLog[]> {
  const result = await rpc('eth_getLogs', [{
    address:   VAULT_ADDRESS,
    topics:    [COLLATERAL_LOCKED_TOPIC],
    fromBlock: `0x${from.toString(16)}`,
    toBlock:   `0x${to.toString(16)}`,
  }]) as RawLog[];
  return result.filter(l => !l.removed);
}

// ─── Internal API calls (same deployment) ────────────────────────────────────

function evmAddressTo32Bytes(address: string): string {
  return address.replace('0x', '').toLowerCase().padStart(64, '0');
}

async function internalPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${APP_BASE}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) throw new Error(`${path} ${res.status}: ${String(data.error ?? JSON.stringify(data))}`);
  return data;
}

// ─── Event handler ────────────────────────────────────────────────────────────

async function processLog(log: RawLog, tip: bigint): Promise<{ loanId: number; result: string }> {
  const blockNumber   = BigInt(log.blockNumber);
  const confirmations = tip - blockNumber;

  const parsed = VAULT_IFACE.parseLog({ topics: log.topics, data: log.data });
  if (!parsed) throw new Error('Failed to decode CollateralLocked log');
  const args = {
    stellarLoanId:   parsed.args[0] as bigint,
    borrower:        parsed.args[1] as string,
    token:           parsed.args[2] as string,
    amount:          parsed.args[3] as bigint,
    stellarBorrower: parsed.args[4] as string,
    lockedAt:        parsed.args[5] as bigint,
  };
  const loanId = Number(args.stellarLoanId);

  if (confirmations < CONFIRMATIONS) {
    return { loanId, result: `waiting (${confirmations}/${CONFIRMATIONS} confirmations)` };
  }

  const nonce      = BigInt(Date.now()).toString();
  const valuedAtTs = args.lockedAt.toString();

  // Step 1: get oracle attestation
  const attestData = await internalPost('/api/collateral-oracle/attest', {
    loan_id:          loanId,
    chain_id:         1,  // ETH family
    asset_address:    evmAddressTo32Bytes(args.token),
    amount_usd_micro: args.amount.toString(),
    valued_at_ts:     valuedAtTs,
    nonce,
    status:           'attached',
  }) as { message_hex: string; signature: string };

  // Step 2: submit verify_collateral on Stellar
  try {
    const verifyResult = await internalPost('/api/collateral/verify', {
      loanId,
      messageHex:      attestData.message_hex,
      signatureHex:    attestData.signature,
      borrowerAddress: args.stellarBorrower,
    });
    if (verifyResult.skipped) return { loanId, result: 'already_attached' };
    return { loanId, result: 'verified' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('needsAttach') || msg.includes('not registered yet')) {
      // Borrower hasn't signed attach_collateral via Freighter yet — expected
      return { loanId, result: 'needs_attach (waiting for borrower Freighter sign)' };
    }
    throw err;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verify Vercel Cron secret — skip check on localhost
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  if (!RPC_URL || !VAULT_ADDRESS) {
    return NextResponse.json({ error: 'EVM_RPC_URL_MAINNET and EVM_VAULT_ADDRESS_MAINNET must be set' }, { status: 500 });
  }

  const startMs = Date.now();
  const events: { loanId: number; result: string; tx: string }[] = [];

  try {
    const tip       = await getBlockNumber();
    let   lastBlock = await getLastBlock(CHAIN_ID);

    // First run: scan recent blocks
    if (lastBlock === 0n) {
      lastBlock = tip > LOOKBACK ? tip - LOOKBACK : 0n;
    }

    if (lastBlock >= tip) {
      return NextResponse.json({ ok: true, message: 'no new blocks', tip: tip.toString(), elapsedMs: Date.now() - startMs });
    }

    // Process in MAX_RANGE chunks
    let cursor   = lastBlock + 1n;
    let newTip   = lastBlock;

    while (cursor <= tip) {
      const to   = cursor + MAX_RANGE - 1n < tip ? cursor + MAX_RANGE - 1n : tip;
      const logs = await getLogs(cursor, to);

      for (const log of logs) {
        try {
          const r = await processLog(log, tip);
          events.push({ ...r, tx: log.transactionHash.slice(0, 12) + '…' });
        } catch (err) {
          events.push({ loanId: 0, result: `error: ${err instanceof Error ? err.message.slice(0, 80) : 'unknown'}`, tx: log.transactionHash.slice(0, 12) + '…' });
        }
      }

      newTip = to;
      cursor = to + 1n;
    }

    await setLastBlock(CHAIN_ID, newTip);

    return NextResponse.json({
      ok:        true,
      tip:       tip.toString(),
      scanned:   `${lastBlock + 1n}–${newTip}`,
      events:    events.length,
      details:   events,
      elapsedMs: Date.now() - startMs,
    });
  } catch (err) {
    return NextResponse.json({
      ok:        false,
      error:     err instanceof Error ? err.message : String(err),
      events:    events.length,
      elapsedMs: Date.now() - startMs,
    }, { status: 500 });
  }
}
