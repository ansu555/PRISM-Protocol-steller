// POST /api/collateral/reattest
// Manually triggers the full attach + verify flow for a loan whose collateral
// is locked on EVM but was never attested to XION (e.g. watcher was down).
//
// Body: { loanId: number, borrowerAddress: string }

import { NextRequest, NextResponse } from 'next/server';

import { coreExecute, type XionSigner } from '@/app/lib/xion';
import { adminSigner, hex, isContractError, xionErrorMessage } from '@/app/lib/xion-server';
import { getEvmLock } from '@/app/lib/evmVault';

const ORACLE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { loanId?: number; borrowerAddress?: string };
  const { loanId, borrowerAddress } = body;
  if (loanId == null || !borrowerAddress) {
    return NextResponse.json({ error: 'Missing: loanId, borrowerAddress' }, { status: 400 });
  }

  let signer: XionSigner;
  try {
    signer = await adminSigner();
  } catch (e) {
    return NextResponse.json({ error: xionErrorMessage(e) }, { status: 500 });
  }

  // 1. Fetch EVM lock to get real chain data (unchanged — EVM side).
  const chainId = 1;
  let assetAddressHex = '00'.repeat(32);
  let amountUsdMicro = '0';
  let valuedAtTs = Math.floor(Date.now() / 1000).toString();
  try {
    const lock = await getEvmLock(loanId);
    if (!lock || lock.state === 'Empty') {
      return NextResponse.json({ error: `No EVM collateral found for loan #${loanId} — lock it first` }, { status: 400 });
    }
    if (lock.state !== 'Locked') {
      return NextResponse.json({ error: `EVM collateral state is ${lock.state} — only Locked can be re-attested` }, { status: 400 });
    }
    assetAddressHex = lock.token.replace('0x', '').toLowerCase().padStart(64, '0');
    amountUsdMicro = lock.amount.toString();
    valuedAtTs = lock.lockedAt > 0n ? lock.lockedAt.toString() : valuedAtTs;
  } catch (evmErr) {
    console.warn('[reattest] Could not fetch EVM lock — using defaults:', evmErr instanceof Error ? evmErr.message : evmErr);
  }

  const nonce = BigInt(Date.now()).toString();

  try {
    // 2. Oracle attestation (status=attached, 0x01).
    const attestRes = await fetch(`${ORACLE_URL}/api/collateral-oracle/attest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loan_id: loanId,
        chain_id: chainId,
        asset_address: assetAddressHex,
        amount_usd_micro: amountUsdMicro,
        valued_at_ts: valuedAtTs,
        nonce,
        status: 'attached',
      }),
    });
    const attestData = (await attestRes.json()) as Record<string, string>;
    if (!attestRes.ok) throw new Error(`Oracle attest failed: ${attestData['error'] ?? attestRes.status}`);

    const oraclePubkeyHex = attestData['oracle_pubkey_hex']!;
    const messageHex = attestData['message_hex']!;
    const signatureHex = attestData['signature']!;

    // 3. attach_collateral (idempotent — safe if already attached).
    let attachHash: string | null = null;
    try {
      const res = await coreExecute(signer, {
        attach_collateral: { loan_id: loanId, oracle_pubkey: hex(oraclePubkeyHex) },
      });
      attachHash = res.transactionHash;
    } catch (attachErr) {
      if (!isContractError(attachErr, 'collateral already verified', 'already verified', 'already initialized')) {
        throw new Error(`attach_collateral failed: ${xionErrorMessage(attachErr)}`);
      }
    }

    // 4. verify_collateral — advances Pending → Attached.
    const verify = await coreExecute(signer, {
      verify_collateral: { loan_id: loanId, message: hex(messageHex), signature: hex(signatureHex) },
    });

    return NextResponse.json({
      ok: true,
      loanId,
      attachHash,
      verifyHash: verify.transactionHash,
      status: 'Attached',
      message: `Loan #${loanId} collateral successfully attested to XION`,
    });
  } catch (err) {
    if (isContractError(err, 'collateral already verified', 'already verified')) {
      return NextResponse.json({ ok: true, loanId, status: 'AlreadyAttached', skipped: true });
    }
    return NextResponse.json({ error: xionErrorMessage(err), loanId }, { status: 500 });
  }
}
