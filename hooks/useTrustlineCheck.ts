'use client';

import { useEffect, useState } from 'react';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import {
  HORIZON_URL,
  USDC_ASSET_CODE,
  USDC_ASSET_ISSUER,
  NETWORK_PASSPHRASE,
} from '@/app/lib/constants';

export const REQUIRED_ASSETS = [
  { code: 'PTUSDC', issuer: USDC_ASSET_ISSUER, label: 'PTUSDC (testnet USDC)' },
  { code: 'PPRIME', issuer: USDC_ASSET_ISSUER, label: 'PPRIME (Prime tranche token)' },
  { code: 'PCORE',  issuer: USDC_ASSET_ISSUER, label: 'PCORE (Core tranche token)' },
  { code: 'PALPHA', issuer: USDC_ASSET_ISSUER, label: 'PALPHA (Alpha tranche token)' },
] as const;

export type MissingTrustline = (typeof REQUIRED_ASSETS)[number];

export function useTrustlineCheck() {
  const wallet = useStellarWallet();
  const [missing, setMissing]   = useState<MissingTrustline[]>([]);
  const [checked, setChecked]   = useState(false);
  const [adding,  setAdding]    = useState(false);

  useEffect(() => {
    if (!wallet.connected || !wallet.address) {
      setMissing([]);
      setChecked(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${HORIZON_URL}/accounts/${wallet.address}`);
        if (!res.ok) return; // account not yet on network — friendbot needed
        const data = await res.json();
        const existing = new Set<string>(
          (data.balances ?? []).map((b: { asset_code?: string }) => b.asset_code).filter(Boolean)
        );
        if (!cancelled) {
          setMissing(REQUIRED_ASSETS.filter(a => !existing.has(a.code)));
          setChecked(true);
        }
      } catch {
        // network error — silent, don't block the UI
      }
    })();

    return () => { cancelled = true; };
  }, [wallet.connected, wallet.address]);

  async function addMissingTrustlines() {
    if (!wallet.address || missing.length === 0) return;
    setAdding(true);
    try {
      const { Asset, TransactionBuilder, Operation, Account } =
        await import('@stellar/stellar-sdk');

      const res = await fetch(`${HORIZON_URL}/accounts/${wallet.address}`);
      if (!res.ok) throw new Error('Account not found — fund with Friendbot first');
      const data = await res.json();
      const account = new Account(wallet.address, data.sequence);

      const builder = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
      });
      for (const { code, issuer } of missing) {
        builder.addOperation(Operation.changeTrust({ asset: new Asset(code, issuer) }));
      }
      const tx = builder.setTimeout(30).build();

      const signedXdr = await wallet.signTransaction(tx.toXDR());
      const { TransactionBuilder: TB2 } = await import('@stellar/stellar-sdk');
      const signed = TB2.fromXDR(signedXdr, NETWORK_PASSPHRASE);

      const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ tx: signed.toXDR() }),
      });
      const submitData = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(
          submitData.extras?.result_codes?.operations?.[0] ??
          submitData.title ??
          'Trustline transaction failed'
        );
      }

      // All trustlines added — clear the banner
      setMissing([]);
    } finally {
      setAdding(false);
    }
  }

  return { missing, checked, adding, addMissingTrustlines };
}
