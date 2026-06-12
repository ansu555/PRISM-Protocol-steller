// liquidate_collateral — admin-triggered on borrower default.
// 1. Signs a 0x03 (Liquidated) attestation with the PRISM oracle
// 2. Submits liquidate_collateral to prism-core on XION — fires the loss cascade
// 3. EVM liquidation stays a manual Gnosis Safe step

import { NextRequest, NextResponse } from 'next/server';

import { coreExecute, type XionSigner } from '@/app/lib/xion';
import { adminSigner, hex, xionErrorMessage } from '@/app/lib/xion-server';

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
      status: 'liquidated',
    }),
  });
  const data = (await res.json()) as Record<string, string>;
  if (!res.ok) throw new Error(`Oracle attest failed: ${data['error'] ?? res.status}`);
  return { messageHex: data['message_hex']!, signatureHex: data['signature']! };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    loanId?: number;
    lossAmount?: string; // micro-USDC (7 decimals)
    severityBps?: number; // 0–10000
  };
  const { loanId, lossAmount, severityBps } = body;

  if (loanId == null || !lossAmount || severityBps == null) {
    return NextResponse.json({ error: 'Missing: loanId, lossAmount, severityBps' }, { status: 400 });
  }
  if (severityBps < 0 || severityBps > 10000) {
    return NextResponse.json({ error: 'severityBps must be 0–10000' }, { status: 400 });
  }

  let signer: XionSigner;
  try {
    signer = await adminSigner();
  } catch (e) {
    return NextResponse.json({ error: xionErrorMessage(e) }, { status: 500 });
  }

  try {
    const { messageHex, signatureHex } = await getOracleAttestation(loanId);
    const res = await coreExecute(signer, {
      liquidate_collateral: {
        loan_id: loanId,
        message: hex(messageHex),
        signature: hex(signatureHex),
        loss_amount: BigInt(lossAmount).toString(),
        severity_bps: severityBps,
      },
    });

    const vaultAddress = process.env.POLYGON_MAINNET_VAULT_ADDRESS ?? process.env.EVM_VAULT_ADDRESS ?? '';
    const treasury = process.env.EVM_TREASURY_ADDRESS ?? '';
    const safeAddress = process.env.EVM_SAFE_ADDRESS ?? '';
    const safeUrl = safeAddress
      ? `https://app.safe.global/apps/open?safe=matic:${safeAddress}&appUrl=https://apps.safe.global/tx-builder`
      : null;

    return NextResponse.json({
      ok: true,
      loanId,
      stellarHash: res.transactionHash, // field name kept for caller back-compat (now a XION tx hash)
      evmManual: {
        message: 'XION liquidation complete. Execute EVM collateral seizure via Gnosis Safe.',
        vault: vaultAddress,
        call: `liquidate(${loanId}, ${treasury})`,
        safeUrl,
      },
      lossAmount,
      severityBps,
      status: 'Liquidated',
    });
  } catch (err) {
    return NextResponse.json({ error: xionErrorMessage(err), loanId }, { status: 500 });
  }
}
