import { decodeEventLog, parseAbi, hexToBigInt } from 'viem';
import { type ChainConfig } from './config.js';
import { attestCollateral, type LockEvent } from './attester.js';

// keccak256("CollateralLocked(uint32,address,address,uint256,string,uint256)")
// Confirmed from on-chain event at block 10960547
const COLLATERAL_LOCKED_TOPIC =
  '0xd728dafd18936e772d08447587982a550d6dde56094634dbfcf6c184115682d9' as const;

const VAULT_ABI = parseAbi([
  'event CollateralLocked(uint32 indexed stellarLoanId, address indexed borrower, address indexed token, uint256 amount, string stellarBorrower, uint256 lockedAt)',
]);

interface RawLog {
  transactionHash: string;
  blockNumber:     string; // hex e.g. "0xa73f42"
  topics:          string[];
  data:            `0x${string}`;
  removed:         boolean;
}

const processed = new Set<string>();

// Alchemy free tier: max 10 blocks per eth_getLogs call
const MAX_RANGE = BigInt(process.env.MAX_BLOCK_RANGE ?? '10');

// ─── Plain-fetch helpers ──────────────────────────────────────────────────────

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

async function fetchBlockNumber(url: string): Promise<bigint> {
  const hex = await rpc(url, 'eth_blockNumber', []) as string;
  return hexToBigInt(hex as `0x${string}`);
}

async function fetchLogs(url: string, address: string, from: bigint, to: bigint): Promise<RawLog[]> {
  const result = await rpc(url, 'eth_getLogs', [{
    address,
    topics:    [COLLATERAL_LOCKED_TOPIC],
    fromBlock: `0x${from.toString(16)}`,
    toBlock:   `0x${to.toString(16)}`,
  }]) as RawLog[];
  return result.filter(l => !l.removed);
}

// ─── Watcher ──────────────────────────────────────────────────────────────────

export async function startWatcher(config: ChainConfig): Promise<void> {
  console.log(`[${config.name}] Watcher started — vault ${config.vaultAddress}`);

  const lookback = BigInt(process.env.LOOKBACK_BLOCKS ?? '500');
  let currentTip: bigint;
  try {
    currentTip = await fetchBlockNumber(config.rpcUrl);
  } catch (err) {
    console.error(`[${config.name}] Failed to fetch block number:`, err instanceof Error ? err.message : err);
    currentTip = 0n;
  }

  // ── Backfill: scan historical blocks in MAX_RANGE chunks ─────────────────
  let fromBlock = currentTip > lookback ? currentTip - lookback : 0n;

  if (currentTip > 0n) {
    console.log(`[${config.name}] Backfilling from block ${fromBlock} (${lookback} block lookback, ${MAX_RANGE}/req)…`);
    let cursor = fromBlock;
    let totalFound = 0;

    while (cursor <= currentTip) {
      const to = cursor + MAX_RANGE - 1n < currentTip ? cursor + MAX_RANGE - 1n : currentTip;
      try {
        const logs = await fetchLogs(config.rpcUrl, config.vaultAddress, cursor, to);
        if (logs.length > 0) {
          console.log(`[${config.name}] Backfill: ${logs.length} event(s) in ${cursor}–${to}`);
          totalFound += logs.length;
          for (const log of logs) await handleRawLog(log, currentTip, config);
        }
        cursor = to + 1n;
        // Short pause to stay within rate limits
        await new Promise(r => setTimeout(r, 150));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${config.name}] Backfill failed (${cursor}–${to}):`, msg.slice(0, 150));
        await new Promise(r => setTimeout(r, 2000));
        // retry same range
      }
    }

    fromBlock = currentTip + 1n;
    console.log(`[${config.name}] Backfill done — ${totalFound} total event(s). Live polling started.`);
  }

  // ── Live poll: watch new blocks every pollIntervalMs ─────────────────────
  const poll = async () => {
    let tip: bigint;
    try {
      tip = await fetchBlockNumber(config.rpcUrl);
    } catch {
      return; // silent — will retry next interval
    }

    if (tip < fromBlock) return;

    const to = tip - fromBlock > MAX_RANGE ? fromBlock + MAX_RANGE - 1n : tip;

    try {
      const logs = await fetchLogs(config.rpcUrl, config.vaultAddress, fromBlock, to);
      if (logs.length > 0) {
        console.log(`[${config.name}] ${logs.length} new event(s) in blocks ${fromBlock}–${to}`);
      }
      for (const log of logs) await handleRawLog(log, tip, config);
      fromBlock = to + 1n;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${config.name}] Poll failed (${fromBlock}–${to}):`, msg.slice(0, 150));
    }
  };

  await poll();
  setInterval(poll, config.pollIntervalMs);
}

// ─── Log handler ─────────────────────────────────────────────────────────────

async function handleRawLog(log: RawLog, currentBlock: bigint, config: ChainConfig): Promise<void> {
  const txHash = log.transactionHash ?? '';
  if (!txHash || processed.has(txHash)) return;

  const blockNumber   = hexToBigInt(log.blockNumber as `0x${string}`);
  const confirmations = currentBlock - blockNumber;

  let decoded: { stellarLoanId: number; borrower: string; token: string; amount: bigint; stellarBorrower: string; lockedAt: bigint; };
  try {
    const result = decodeEventLog({ abi: VAULT_ABI, data: log.data, topics: log.topics as [`0x${string}`, ...`0x${string}`[]] });
    const args = result.args as typeof decoded;
    decoded = { stellarLoanId: Number(args.stellarLoanId), borrower: args.borrower, token: args.token, amount: args.amount, stellarBorrower: args.stellarBorrower, lockedAt: args.lockedAt };
  } catch (err) {
    console.error(`[${config.name}] Decode failed ${txHash.slice(0, 12)}:`, err instanceof Error ? err.message : err);
    return;
  }

  if (confirmations < BigInt(config.confirmations)) {
    console.log(`[${config.name}] loan #${decoded.stellarLoanId} — waiting (${confirmations}/${config.confirmations} confirmations)`);
    return;
  }

  processed.add(txHash);

  const token = decoded.token === '0x0000000000000000000000000000000000000000' ? 'ETH' : `${decoded.token.slice(0, 10)}…`;
  console.log(`[${config.name}] ✓ CollateralLocked — loan #${decoded.stellarLoanId} borrower ${decoded.borrower.slice(0, 10)}… token ${token} amount ${decoded.amount} stellar ${decoded.stellarBorrower.slice(0, 16)}…`);

  try {
    await attestCollateral({ stellarLoanId: decoded.stellarLoanId, borrower: decoded.borrower, token: decoded.token, amount: decoded.amount, stellarBorrower: decoded.stellarBorrower, lockedAt: decoded.lockedAt, txHash, blockNumber, chainId: config.chainId, attestationChainId: config.attestationChainId });
  } catch (err) {
    processed.delete(txHash);
    console.error(`[${config.name}] Attestation failed loan #${decoded.stellarLoanId}:`, err instanceof Error ? err.message : err);
  }
}
