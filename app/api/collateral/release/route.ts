// release_collateral — called after borrower fully repays.
// 1. Signs a 0x02 (Released) attestation with the PRISM oracle
// 2. Submits release_collateral to prism-core on XION (Attached → Released)
// 3. EVM release stays a manual Gnosis Safe step (Safe is the vault admin)
//
// XION: the contract derives the relayer from info.sender (admin signer).

import { NextRequest, NextResponse } from 'next/server';

import { coreExecute, coreQuery, type XionSigner } from '@/app/lib/xion';
import { adminSigner, hex, isContractError, xionErrorMessage } from '@/app/lib/xion-server';

const ORACLE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function getOracleAttestation(loanId: number): Promise<{ messageHex: string; signatureHex: string }> {
  const nonce = BigInt(Date.now()).toString();
  const valuedAtTs = Math.floor(Date.now() / 1000).toString();
  const res = await fetch(`${ORACLE_URL}/api/collateral-oracle/attest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      loan_id: loanId,
      chain_id: 1,
      asset_address: '00'.repeat(32),
      amount_usd_micro: '0',
      valued_at_ts: valuedAtTs,
      nonce,
      status: 'released',
    }),
  });
  const data = (await res.json()) as Record<string, string>;
  if (!res.ok) throw new Error(`Oracle attest failed: ${data['error'] ?? res.status}`);
  return { messageHex: data['message_hex']!, signatureHex: data['signature']! };
}

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

  try {
    // 0. Guard: only release once the loan is fully repaid / defaulted.
    const loan = await coreQuery<{ state?: string } | null>({ get_loan: { loan_id: loanId } }).catch(
      () => null,
    );
    if (!loan) {
      return NextResponse.json({ error: `Loan #${loanId} not found on XION` }, { status: 400 });
    }
    const loanState = String(loan.state ?? '').toLowerCase();
    if (loanState !== 'repaid' && loanState !== 'defaulted') {
      return NextResponse.json(
        { error: `Loan #${loanId} is not fully repaid yet (state: ${loanState}) — collateral stays locked`, loanState, skipped: true },
        { status: 400 },
      );
    }

    // 1. Oracle 0x02 attestation. 2. release_collateral on XION.
    const { messageHex, signatureHex } = await getOracleAttestation(loanId);
    const res = await coreExecute(signer, {
      release_collateral: { loan_id: loanId, message: hex(messageHex), signature: hex(signatureHex) },
    });

    // 3. EVM release is manual — admin executes via Gnosis Safe.
    const vaultAddress = process.env.POLYGON_MAINNET_VAULT_ADDRESS ?? process.env.EVM_VAULT_ADDRESS ?? '';
    const safeAddress = process.env.EVM_SAFE_ADDRESS ?? '';
    const safeUrl = safeAddress
      ? `https://app.safe.global/apps/open?safe=matic:${safeAddress}&appUrl=https://apps.safe.global/tx-builder`
      : null;

    return NextResponse.json({
      ok: true,
      loanId,
      stellarHash: res.transactionHash, // field name kept for caller back-compat (now a XION tx hash)
      evmTxHash: null,
      status: 'ReleasedOnStellar',
      evmManual: {
        message: 'Collateral released on XION. EVM collateral requires a Gnosis Safe transaction.',
        vault: vaultAddress,
        call: `release(${loanId})`,
        safeUrl,
      },
    });
  } catch (err) {
    if (isContractError(err, 'collateral status mismatch', 'released')) {
      return NextResponse.json({ ok: true, loanId, status: 'AlreadyReleased', skipped: true });
    }
    return NextResponse.json({ error: xionErrorMessage(err), loanId }, { status: 500 });
  }
}
