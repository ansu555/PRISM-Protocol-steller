import { NextRequest, NextResponse } from 'next/server';
import { Keypair, xdr } from '@stellar/stellar-sdk';

import {
  getCoreClient,
  keypairSigner,
  addr,
  nativeToScVal,
} from '@/app/lib/stellar';
import {
  USDC_CONTRACT_ID,
  VAULT_ID,
  TrancheKind,
  PTOKEN_PRIME_CONTRACT_ID,
  PTOKEN_CORE_CONTRACT_ID,
  PTOKEN_ALPHA_CONTRACT_ID,
  ENCRYPT_ORACLE_PUBKEY,
  CLOAK_ORACLE_PUBKEY,
  DEFAULT_DEMO_LOAN_PRINCIPAL,
} from '@/app/lib/constants';

// AlreadyInitialized = PrismError #50. The contract returns this when an
// init_* function is called on state that already exists. We treat it as a
// successful skip so the route is fully idempotent.
function isAlreadyInitialized(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('#50') || msg.includes('AlreadyInitialized');
}

async function tryInvoke(
  fn: () => Promise<void>,
  stepName: string,
  steps: string[],
  skipped: string[],
): Promise<void> {
  try {
    await fn();
    steps.push(stepName);
  } catch (err) {
    if (isAlreadyInitialized(err)) {
      skipped.push(stepName);
    } else {
      throw err;
    }
  }
}

export async function POST(req: NextRequest) {
  const seed = process.env.ADMIN_SECRET_SEED;
  if (!seed) {
    return NextResponse.json(
      { error: 'ADMIN_SECRET_SEED is not set on the server. Add it to .env.local.' },
      { status: 500 },
    );
  }

  let adminKeypair: Keypair;
  try {
    adminKeypair = Keypair.fromSecret(seed);
  } catch {
    return NextResponse.json(
      { error: 'ADMIN_SECRET_SEED is not a valid Stellar secret key (S...)' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const borrowerAddress: string = body.borrowerAddress ?? adminKeypair.publicKey();

  const signer = keypairSigner(adminKeypair);
  const core   = getCoreClient();
  const steps: string[]   = [];
  const skipped: string[] = [];

  try {
    // 1. init_config
    await tryInvoke(
      () => core.invoke(signer, 'init_config', [
        addr(adminKeypair.publicKey()),
        addr(USDC_CONTRACT_ID),
        nativeToScVal(800, { type: 'u32' }),
        xdr.ScVal.scvVec(
          [ENCRYPT_ORACLE_PUBKEY, CLOAK_ORACLE_PUBKEY].map((hex) =>
            nativeToScVal(Buffer.from(hex, 'hex'), { type: 'bytes' }),
          ),
        ),
      ]).then(() => {}),
      'init_config',
      steps,
      skipped,
    );

    // 2. init_vault
    await tryInvoke(
      () => core.invoke(signer, 'init_vault', [
        nativeToScVal(VAULT_ID, { type: 'u32' }),
      ]).then(() => {}),
      'init_vault',
      steps,
      skipped,
    );

    // 3. init_tranche × 3
    const trancheConfig = [
      { kind: TrancheKind.Prime, aprBps: 500,  ptoken: PTOKEN_PRIME_CONTRACT_ID },
      { kind: TrancheKind.Core,  aprBps: 800,  ptoken: PTOKEN_CORE_CONTRACT_ID  },
      { kind: TrancheKind.Alpha, aprBps: 1500, ptoken: PTOKEN_ALPHA_CONTRACT_ID },
    ];
    for (const { kind, aprBps, ptoken } of trancheConfig) {
      await tryInvoke(
        () => core.invoke(signer, 'init_tranche', [
          nativeToScVal(VAULT_ID, { type: 'u32' }),
          nativeToScVal(kind,     { type: 'u32' }),
          nativeToScVal(aprBps,   { type: 'u32' }),
          addr(ptoken),
        ]).then(() => {}),
        `init_tranche(${TrancheKind[kind]})`,
        steps,
        skipped,
      );
    }

    // 4. init_loan #0
    await tryInvoke(
      () => core.invoke(signer, 'init_loan', [
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(0,        { type: 'u32' }),
        addr(borrowerAddress),
        nativeToScVal(DEFAULT_DEMO_LOAN_PRINCIPAL, { type: 'i128' }),
        nativeToScVal(800, { type: 'u32' }),
        nativeToScVal(
          BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600),
          { type: 'u64' },
        ),
      ]).then(() => {}),
      'init_loan',
      steps,
      skipped,
    );

    return NextResponse.json({
      ok: true,
      steps,
      skipped,
      alreadyInitialized: steps.length === 0,
      adminAddress: adminKeypair.publicKey(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, steps, skipped }, { status: 500 });
  }
}
