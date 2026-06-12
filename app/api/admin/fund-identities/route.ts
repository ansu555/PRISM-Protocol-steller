// Fund simulation identities — server-side cw20 USDC mint (+ optional gas faucet).
//
// XION migration: Stellar friendbot + trustlines are gone. Minting a cw20 only
// needs the recipient address, so the body now takes XION addresses (no secret
// keys). Gas funding is optional: if XION_FAUCET_URL is set, each address is
// POSTed to the faucet; otherwise gas is skipped (the simulation roles don't
// sign until the wallet slice, and Abstraxion can sponsor gas later).
//
// NOTE: the caller (admin/protocol page) is updated in the wallet slice to send
// `{ wallets: [{ label, address }] }` (xion1…) instead of Stellar secrets.

import { NextRequest, NextResponse } from 'next/server';

import { ACTIVE_XION, type XionSigner } from '@/app/lib/xion';
import { usdcAdminSigner, cw20Mint, xionErrorMessage } from '@/app/lib/xion-server';

const MINT_AMOUNT = 100_000_000_000n; // 10,000 USDC (7 decimals)

interface WalletInput {
  label: string;
  address: string;
}

async function faucetGas(address: string): Promise<boolean> {
  const url = process.env.XION_FAUCET_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, denom: ACTIVE_XION.denom }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { wallets?: WalletInput[] };
  const wallets = body.wallets ?? [];
  if (!wallets.length) {
    return NextResponse.json({ error: 'No wallets provided' }, { status: 400 });
  }

  let minter: XionSigner;
  try {
    minter = await usdcAdminSigner();
  } catch (e) {
    return NextResponse.json({ error: xionErrorMessage(e) }, { status: 500 });
  }

  const results: { label: string; hash: string; actions: string[] }[] = [];

  for (const { label, address } of wallets) {
    if (!address || !address.startsWith(ACTIVE_XION.prefix)) {
      return NextResponse.json({ error: `Invalid XION address for ${label}: ${address}` }, { status: 400 });
    }
    const actions: string[] = [];
    try {
      if (await faucetGas(address)) actions.push('gas funded via faucet');
      const res = await cw20Mint(minter, ACTIVE_XION.usdc, address, MINT_AMOUNT);
      actions.push(`minted 10,000 USDC → ${res.transactionHash.slice(0, 8)}`);
      results.push({ label, hash: res.transactionHash, actions });
    } catch (err) {
      return NextResponse.json({ error: `${label}: ${xionErrorMessage(err)}`, steps: actions }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, results });
}
