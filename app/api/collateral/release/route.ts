// release_collateral — called after borrower fully repays on Stellar.
// 1. Signs a 0x02 (Released) attestation with the PRISM oracle
// 2. Submits release_collateral to Stellar (Attached → Released)
// 3. Calls release() on the EVM vault → collateral returned to borrower

import { NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import { parseStellarError } from '@/app/lib/errors';
import { evmRelease, getEvmLock } from '@/app/lib/evmVault';

const ORACLE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function getOracleAttestation(loanId: number, statusByte: 'released'): Promise<{
  messageHex: string;
  signatureHex: string;
  oraclePubkeyHex: string;
}> {
  const nonce = BigInt(Date.now()).toString();
  const valuedAtTs = Math.floor(Date.now() / 1000).toString();

  const res = await fetch(`${ORACLE_URL}/api/collateral-oracle/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loan_id:          loanId,
      chain_id:         1,
      asset_address:    '00'.repeat(32),
      amount_usd_micro: '0',
      valued_at_ts:     valuedAtTs,
      nonce,
      status:           statusByte,
    }),
  });
  const data = await res.json() as Record<string, string>;
  if (!res.ok) throw new Error(`Oracle attest failed: ${data['error'] ?? res.status}`);
  return {
    messageHex:      data['message_hex']!,
    signatureHex:    data['signature']!,
    oraclePubkeyHex: data['oracle_pubkey_hex']!,
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { loanId?: number; borrowerAddress?: string };
  const { loanId, borrowerAddress } = body;

  if (loanId == null || !borrowerAddress) {
    return NextResponse.json({ error: 'Missing: loanId, borrowerAddress' }, { status: 400 });
  }

  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) return NextResponse.json({ error: 'ADMIN_SECRET_SEED not set' }, { status: 500 });

  let keypair: Keypair;
  try { keypair = Keypair.fromSecret(seed); }
  catch { return NextResponse.json({ error: 'Invalid ADMIN_SECRET_SEED' }, { status: 500 }); }

  try {
    // 0. Guard: only release if the loan is fully repaid on Stellar
    const core = getCoreClient();
    const loan = await core.read<Record<string, unknown> | null>(
      'get_loan', [nativeToScVal(loanId, { type: 'u32' })]
    ).catch(() => null);

    if (!loan) {
      return NextResponse.json({ error: `Loan #${loanId} not found on Stellar` }, { status: 400 });
    }

    const loanState = (() => {
      const s = loan['state'] ?? loan['status'];
      if (typeof s === 'object' && s !== null) return Object.keys(s as object)[0];
      return String(s ?? '');
    })();

    if (loanState !== 'Repaid' && loanState !== 'Defaulted') {
      return NextResponse.json({
        error: `Loan #${loanId} is not fully repaid yet (state: ${loanState}) — collateral stays locked`,
        loanState,
        skipped: true,
      }, { status: 400 });
    }

    // 1. Get 0x02 attestation from oracle
    const { messageHex, signatureHex } = await getOracleAttestation(loanId, 'released');

    // 2. Submit release_collateral to Stellar (borrower.require_auth — admin key in demo)
    const core   = getCoreClient();
    const signer = keypairSigner(keypair);

    const msgBytes = Buffer.from(messageHex, 'hex');
    const sigBytes = Buffer.from(signatureHex, 'hex');

    const { hash: stellarHash } = await core.invoke(signer, 'release_collateral', [
      addr(keypair.publicKey()),           // borrower (admin key in demo)
      nativeToScVal(loanId, { type: 'u32' }),
      nativeToScVal(msgBytes, { type: 'bytes' }),
      nativeToScVal(sigBytes, { type: 'bytes' }),
    ]);

    // 3. Release on EVM vault — only if collateral is actually locked there
    let evmTxHash: string | null = null;
    try {
      const lock = await getEvmLock(loanId);
      if (lock?.state === 'Locked') {
        evmTxHash = await evmRelease(loanId);
      }
    } catch (evmErr) {
      // EVM release failure is non-fatal — log and continue (Stellar release succeeded)
      console.error('[release] EVM vault release failed:', evmErr instanceof Error ? evmErr.message : evmErr);
    }

    return NextResponse.json({ ok: true, loanId, stellarHash, evmTxHash, status: 'Released' });
  } catch (err) {
    const msg = parseStellarError(err);
    // CollateralStatusMismatch means already released — treat as ok
    if (msg.includes('#62') || msg.includes('StatusMismatch') || msg.includes('Released')) {
      return NextResponse.json({ ok: true, loanId, status: 'AlreadyReleased', skipped: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
