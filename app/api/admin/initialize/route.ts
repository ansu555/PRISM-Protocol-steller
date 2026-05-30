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
    return NextResponse.json({ error: 'ADMIN_SECRET_SEED is not a valid Stellar secret key (S...)' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const borrowerAddress: string = body.borrowerAddress ?? adminKeypair.publicKey();

  const signer = keypairSigner(adminKeypair);
  const core = getCoreClient();
  const steps: string[] = [];

  try {
    // 1. init_config — only runs if no config exists yet
    const config = await core.read('get_config').catch(() => null);
    if (!config) {
      await core.invoke(signer, 'init_config', [
        addr(adminKeypair.publicKey()),
        addr(USDC_CONTRACT_ID),
        nativeToScVal(800, { type: 'u32' }),
        xdr.ScVal.scvVec(
          [ENCRYPT_ORACLE_PUBKEY, CLOAK_ORACLE_PUBKEY].map((hex) =>
            nativeToScVal(Buffer.from(hex, 'hex'), { type: 'bytes' }),
          ),
        ),
      ]);
      steps.push('init_config');
    }

    // 2. init_vault — only runs if vault #VAULT_ID doesn't exist
    const vault = await core
      .read('get_vault', [nativeToScVal(VAULT_ID, { type: 'u32' })])
      .catch(() => null);
    if (!vault) {
      await core.invoke(signer, 'init_vault', [
        nativeToScVal(VAULT_ID, { type: 'u32' }),
      ]);
      steps.push('init_vault');
    }

    // 3. init_tranche — once per kind
    const trancheConfig = [
      { kind: TrancheKind.Prime, aprBps: 500, ptoken: PTOKEN_PRIME_CONTRACT_ID },
      { kind: TrancheKind.Core, aprBps: 800, ptoken: PTOKEN_CORE_CONTRACT_ID },
      { kind: TrancheKind.Alpha, aprBps: 1500, ptoken: PTOKEN_ALPHA_CONTRACT_ID },
    ];

    for (const { kind, aprBps, ptoken } of trancheConfig) {
      const tranche = await core
        .read('get_tranche', [
          nativeToScVal(VAULT_ID, { type: 'u32' }),
          nativeToScVal(kind, { type: 'u32' }),
        ])
        .catch(() => null);
      if (!tranche) {
        await core.invoke(signer, 'init_tranche', [
          nativeToScVal(VAULT_ID, { type: 'u32' }),
          nativeToScVal(kind, { type: 'u32' }),
          nativeToScVal(aprBps, { type: 'u32' }),
          addr(ptoken),
        ]);
        steps.push(`init_tranche(${TrancheKind[kind]})`);
      }
    }

    // 4. init_loan — loan #0 for the demo flow
    const loan = await core
      .read('get_loan', [nativeToScVal(0, { type: 'u32' })])
      .catch(() => null);
    if (!loan) {
      await core.invoke(signer, 'init_loan', [
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(0, { type: 'u32' }),
        addr(borrowerAddress),
        nativeToScVal(DEFAULT_DEMO_LOAN_PRINCIPAL, { type: 'i128' }),
        nativeToScVal(800, { type: 'u32' }),
        nativeToScVal(
          BigInt(Math.floor(Date.now() / 1000) + 365 * 24 * 3600),
          { type: 'u64' },
        ),
      ]);
      steps.push('init_loan');
    }

    return NextResponse.json({
      ok: true,
      steps,
      alreadyInitialized: steps.length === 0,
      adminAddress: adminKeypair.publicKey(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
