// Initialize the on-chain demo state: vault + 3 tranches + the seed loan.
//
// NOTE (XION): the global config (admin, usdc_token, oracle_allowlist) is set at
// contract *instantiate* time via InstantiateMsg — there is no `init_config`
// execute call. This route only runs the post-deploy execute steps. Idempotent:
// the contract returns "already initialized" for steps that already ran.

import { NextRequest, NextResponse } from 'next/server';

import { ACTIVE_XION, coreExecute, type XionSigner } from '@/app/lib/xion';
import { adminSigner, isContractError, xionErrorMessage } from '@/app/lib/xion-server';
import { VAULT_ID, TrancheKind, DEFAULT_DEMO_LOAN_PRINCIPAL } from '@/app/lib/constants';

export async function POST(req: NextRequest) {
  let signer: XionSigner;
  try {
    signer = await adminSigner();
  } catch (e) {
    return NextResponse.json({ error: xionErrorMessage(e) }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const borrowerAddress: string = body.borrowerAddress ?? signer.address;

  const steps: string[] = [];
  const skipped: string[] = [];

  const tryStep = async (name: string, fn: () => Promise<unknown>): Promise<void> => {
    try {
      await fn();
      steps.push(name);
    } catch (err) {
      if (isContractError(err, 'already initialized')) skipped.push(name);
      else throw err;
    }
  };

  try {
    await tryStep('init_vault', () => coreExecute(signer, { init_vault: { vault_id: VAULT_ID } }));

    const tranches = [
      { kind: TrancheKind.Prime, apy: 500, ptoken: ACTIVE_XION.ptokenPrime },
      { kind: TrancheKind.Core, apy: 800, ptoken: ACTIVE_XION.ptokenCore },
      { kind: TrancheKind.Alpha, apy: 1500, ptoken: ACTIVE_XION.ptokenAlpha },
    ];
    for (const t of tranches) {
      await tryStep(`init_tranche(${TrancheKind[t.kind]})`, () =>
        coreExecute(signer, {
          init_tranche: {
            vault_id: VAULT_ID,
            kind: t.kind,
            target_apy_bps: t.apy,
            ptoken: t.ptoken,
          },
        }),
      );
    }

    await tryStep('init_loan', () =>
      coreExecute(signer, {
        init_loan: {
          vault_id: VAULT_ID,
          loan_id: 0,
          borrower: borrowerAddress,
          principal: DEFAULT_DEMO_LOAN_PRINCIPAL.toString(),
          apr_bps: 800,
          maturity_ts: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
        },
      }),
    );

    return NextResponse.json({
      ok: true,
      steps,
      skipped,
      alreadyInitialized: steps.length === 0,
      adminAddress: signer.address,
    });
  } catch (err) {
    return NextResponse.json({ error: xionErrorMessage(err), steps, skipped }, { status: 500 });
  }
}
