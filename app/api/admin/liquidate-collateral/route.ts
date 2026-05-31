// liquidate_collateral — admin-triggered on borrower default.
// 1. Signs a 0x03 (Liquidated) attestation with the PRISM oracle
// 2. Submits liquidate_collateral to Stellar — fires loss cascade against tranches
// 3. Calls liquidate() on the EVM vault → collateral sent to PRISM treasury

import { NextRequest, NextResponse } from 'next/server';
import { Keypair } from '@stellar/stellar-sdk';
import { getCoreClient, keypairSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import { parseStellarError } from '@/app/lib/errors';
import { evmLiquidate, getEvmLock } from '@/app/lib/evmVault';

const ORACLE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function getOracleAttestation(loanId: number): Promise<{
  messageHex: string;
  signatureHex: string;
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
      status:           'liquidated',
    }),
  });
  const data = await res.json() as Record<string, string>;
  if (!res.ok) throw new Error(`Oracle attest failed: ${data['error'] ?? res.status}`);
  return { messageHex: data['message_hex']!, signatureHex: data['signature']! };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    loanId?: number;
    lossAmount?: string;   // i128 in micro-USDC (7 decimals)
    severityBps?: number;  // 0–10000
  };

  const { loanId, lossAmount, severityBps } = body;

  if (loanId == null || !lossAmount || severityBps == null) {
    return NextResponse.json({ error: 'Missing: loanId, lossAmount, severityBps' }, { status: 400 });
  }
  if (severityBps < 0 || severityBps > 10000) {
    return NextResponse.json({ error: 'severityBps must be 0–10000' }, { status: 400 });
  }

  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) return NextResponse.json({ error: 'ADMIN_SECRET_SEED not set' }, { status: 500 });

  let keypair: Keypair;
  try { keypair = Keypair.fromSecret(seed); }
  catch { return NextResponse.json({ error: 'Invalid ADMIN_SECRET_SEED' }, { status: 500 }); }

  try {
    // 1. Get 0x03 liquidated attestation
    const { messageHex, signatureHex } = await getOracleAttestation(loanId);

    // 2. Submit liquidate_collateral to Stellar — fires loss cascade
    const core   = getCoreClient();
    const signer = keypairSigner(keypair);

    const msgBytes  = Buffer.from(messageHex, 'hex');
    const sigBytes  = Buffer.from(signatureHex, 'hex');
    const lossAmt   = BigInt(lossAmount);

    const { hash: stellarHash } = await core.invoke(signer, 'liquidate_collateral', [
      addr(keypair.publicKey()),                        // admin
      nativeToScVal(loanId,       { type: 'u32'  }),
      nativeToScVal(msgBytes,     { type: 'bytes' }),
      nativeToScVal(sigBytes,     { type: 'bytes' }),
      nativeToScVal(lossAmt,      { type: 'i128'  }),
      nativeToScVal(severityBps,  { type: 'u32'  }),
    ]);

    // 3. EVM liquidation is manual — admin executes via Gnosis Safe.
    const vaultAddress = process.env.POLYGON_MAINNET_VAULT_ADDRESS ?? process.env.EVM_VAULT_ADDRESS ?? '';
    const treasury     = process.env.EVM_TREASURY_ADDRESS ?? '';
    const safeAddress  = process.env.EVM_SAFE_ADDRESS ?? '';
    const safeUrl = safeAddress
      ? `https://app.safe.global/apps/open?safe=matic:${safeAddress}&appUrl=https://apps.safe.global/tx-builder`
      : null;

    return NextResponse.json({
      ok: true,
      loanId,
      stellarHash,
      evmManual: {
        message: 'Stellar liquidation complete. Execute EVM collateral seizure via Gnosis Safe.',
        vault: vaultAddress,
        call: `liquidate(${loanId}, ${treasury})`,
        safeUrl,
      },
      lossAmount,
      severityBps,
      status: 'Liquidated',
    });
  } catch (err) {
    return NextResponse.json({ error: parseStellarError(err) }, { status: 500 });
  }
}
