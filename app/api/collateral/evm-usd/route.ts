// GET /api/collateral/evm-usd?loanId=X
//
// Reads the EVM vault lock for this loan, fetches the Chainlink USD price for
// the locked token, and returns amount_usd_micro for the oracle attestation.
// Server-side — uses EVM_RPC_URL from env, no client-side key exposure.

import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Contract } from 'ethers';
import { getEvmLock } from '@/app/lib/evmVault';

const CHAINLINK_ABI = [
  'function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() external view returns (uint8)',
];

// Chainlink price feeds — keyed by lowercase token address
// Native token (address(0)) maps to the chain's native/gas token price feed
const PRICE_FEEDS: Record<string, string> = {
  // ── Polygon Mainnet (chain 137) ───────────────────────────────────────────
  // MATIC/POL native
  '0x0000000000000000000000000000000000000000': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
  // wETH on Polygon → ETH/USD
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': '0xF9680D99D6C9589e2a93a78A04A279e509205945',
  // wBTC on Polygon → WBTC/USD
  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': '0xDE31F8bFBD8c84b5360CFACCa3539B938dd78ae6',
  // USDC on Polygon — stablecoin
  '0x3c499c542ceF5E3811e1192ce70d8cC03d5c3359': 'STABLE',
  // USDT on Polygon — stablecoin
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 'STABLE',
  // WMATIC
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',

  // ── Ethereum Sepolia (testnet, chain 11155111) ────────────────────────────
  // ETH/USD Sepolia — also used for wETH
  // Note: address(0) is overwritten above for Polygon; for Sepolia the RPC URL
  // determines which feed is queried against which chain.
  // MockWETH Sepolia → ETH/USD Sepolia
  '0xc426c75d79d833e9924de6ca26378fdcf49e912c': '0x694AA1769357215DE4FAC081bf1f309aDC325306',
  // MockUSDC Sepolia — stablecoin
  '0x12a70376258f53bbad1d7387bcba4084df4b4211': 'STABLE',
};

// Token decimals
const TOKEN_DECIMALS: Record<string, number> = {
  // Polygon
  '0x0000000000000000000000000000000000000000': 18, // MATIC
  '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619': 18, // wETH
  '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6': 8,  // wBTC
  '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359': 6,  // USDC
  '0xc2132d05d31c914a87c6611c10748aeb04b58e8f': 6,  // USDT
  '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270': 18, // WMATIC
  // Sepolia
  '0xc426c75d79d833e9924de6ca26378fdcf49e912c': 18, // MockWETH
  '0x12a70376258f53bbad1d7387bcba4084df4b4211': 6,  // MockUSDC
};

async function getUsdPrice(tokenAddress: string, provider: JsonRpcProvider): Promise<number> {
  const addr   = tokenAddress.toLowerCase();
  const feedAddr = PRICE_FEEDS[addr];

  if (!feedAddr) return 0;
  if (feedAddr === 'STABLE') return 1;

  const feed = new Contract(feedAddr, CHAINLINK_ABI, provider);
  const [, answer, , updatedAt] = await feed.latestRoundData() as [unknown, bigint, unknown, bigint];
  const decimals = await feed.decimals() as number;

  // Reject stale data older than 2 hours
  const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
  if (age > 7200) return 0;

  return Number(answer) / 10 ** Number(decimals);
}

export async function GET(req: NextRequest) {
  const loanId = Number(req.nextUrl.searchParams.get('loanId'));
  if (!loanId && loanId !== 0) {
    return NextResponse.json({ error: 'Missing loanId' }, { status: 400 });
  }

  const rpcUrl = process.env.EVM_RPC_URL;
  if (!rpcUrl) return NextResponse.json({ error: 'EVM_RPC_URL not set' }, { status: 500 });

  try {
    const lock = await getEvmLock(loanId);
    if (!lock || lock.state !== 'Locked') {
      return NextResponse.json({ usdMicro: '0', reason: 'no lock' });
    }

    const provider  = new JsonRpcProvider(rpcUrl);
    const tokenAddr = lock.token.toLowerCase();
    const decimals  = TOKEN_DECIMALS[tokenAddr] ?? 18;

    // Convert raw amount to human-readable token amount
    const tokenAmount = Number(lock.amount) / 10 ** decimals;

    const usdPrice = await getUsdPrice(lock.token, provider);
    const usdValue = tokenAmount * usdPrice;
    const usdMicro = Math.round(usdValue * 1_000_000).toString();

    return NextResponse.json({
      usdMicro,
      usdValue:    usdValue.toFixed(2),
      tokenAmount: tokenAmount.toFixed(6),
      tokenSymbol: lock.token === '0x0000000000000000000000000000000000000000' ? 'ETH' : lock.token.slice(0, 10),
      usdPrice:    usdPrice.toFixed(2),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed', usdMicro: '0' }, { status: 500 });
  }
}
