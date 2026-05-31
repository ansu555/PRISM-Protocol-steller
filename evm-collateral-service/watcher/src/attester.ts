import { PRISM_API_BASE } from './config.js';

export interface LockEvent {
  stellarLoanId:      number;
  borrower:           string;
  token:              string;
  amount:             bigint;
  stellarBorrower:    string;
  lockedAt:           bigint;
  txHash:             string;
  blockNumber:        bigint;
  chainId:            number;
  attestationChainId: number;
}

function evmAddressTo32Bytes(address: string): string {
  return address.replace('0x', '').toLowerCase().padStart(64, '0');
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const url = `${PRISM_API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`POST ${path} failed (${res.status}): ${data['error'] ?? JSON.stringify(data)}`);
  }
  return data;
}

async function getAttestation(event: LockEvent): Promise<{ messageHex: string; signatureHex: string; oraclePubkeyHex: string }> {
  const nonce      = BigInt(Date.now()).toString();
  const valuedAtTs = event.lockedAt.toString();

  const data = await post('/api/collateral-oracle/attest', {
    loan_id:          event.stellarLoanId,
    chain_id:         event.attestationChainId,
    asset_address:    evmAddressTo32Bytes(event.token),
    amount_usd_micro: event.amount.toString(),
    valued_at_ts:     valuedAtTs,
    nonce,
    status:           'attached',
  }) as { message_hex: string; signature: string; oracle_pubkey_hex: string };

  return {
    messageHex:      data.message_hex,
    signatureHex:    data.signature,
    oraclePubkeyHex: data.oracle_pubkey_hex,
  };
}

// The watcher skips attach_collateral — that requires borrower.require_auth()
// which only the borrower's Freighter wallet can satisfy. attach_collateral is
// called by the borrower from the /borrow page after EVM lock.
// The watcher only calls verify_collateral (admin as relayer — no borrower auth needed).
export async function attestCollateral(event: LockEvent): Promise<void> {
  console.log(`[attester] Attesting loan #${event.stellarLoanId} (tx ${event.txHash.slice(0, 10)}…)`);

  const { messageHex, signatureHex } = await getAttestation(event);

  let result: Record<string, unknown>;
  try {
    result = await post('/api/collateral/verify', {
      loanId:          event.stellarLoanId,
      messageHex,
      signatureHex,
      borrowerAddress: event.stellarBorrower,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('needsAttach') || msg.includes('not registered yet')) {
      // Borrower hasn't called attach_collateral via Freighter yet — this is expected.
      // The /borrow page will prompt them to sign. Don't mark as processed so we retry.
      console.log(`[attester] loan #${event.stellarLoanId} — waiting for borrower to register on Stellar (attach_collateral via Freighter)`);
      throw new Error('needs_attach'); // causes processed.delete so we retry next poll
    }
    throw err;
  }

  if (result['skipped']) {
    console.log(`[attester] loan #${event.stellarLoanId} — already Attached on Stellar`);
  } else {
    console.log(`[attester] loan #${event.stellarLoanId} — verify_collateral done ✓ Attached on Stellar`);
  }
}
