'use client';

// Ephemeral simulation identities.
//
// MIGRATION (Stellar → XION) — additive phase:
//   Each role still gets a synchronous Stellar `Keypair` (kept only for the
//   not-yet-migrated write flows — ActionPanel, StellarBorrowForm,
//   LoanRepayment, admin/protocol). Alongside it we now generate a CosmJS
//   `signer` (XION) asynchronously and expose its bech32 `xionAddress`. The
//   write hooks adopt `signer`/`xionAddress` in the wallet slice; the Stellar
//   `keypair`/`address` fields are removed in the final cleanup pass.
//
// The `admin` role has no client-side signer — its secret stays server-side
// (admin actions go through the /api/admin/* + /api/simulation/admin-action
// routes). Its `xionAddress` is pinned to the deployer address via env.

import { Keypair } from '@stellar/stellar-sdk';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { randomSigner, type XionSigner } from '@/app/lib/xion';

export type Role = 'admin' | 'senior' | 'junior' | 'borrower';

export interface SimulationIdentity {
  role: Role;
  label: string;
  description: string;
  /** Legacy Stellar keypair — back-compat for write flows not yet migrated to
   *  `signer`. Removed in the final Stellar cleanup pass. */
  keypair: Keypair;
  /** Legacy Stellar address (`G…`). */
  address: string;
  /** XION bech32 address (`xion1…`). Empty until `signer` resolves; admin is
   *  env-pinned to the deployer. */
  xionAddress: string;
  /** CosmJS signer for this role — `null` until async generation completes, and
   *  always `null` for `admin` (secret stays server-side). */
  signer: XionSigner | null;
}

interface IdentityContextValue extends SimulationIdentity {
  identities: Record<Role, SimulationIdentity>;
  setRole: (role: Role) => void;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

// Deployer address pinned to the admin role so admin-only flows resolve to the
// right signer server-side. Set NEXT_PUBLIC_ADMIN_ADDRESS to the XION (`xion1…`)
// deployer after the testnet deploy; the literal fallback below is a pre-deploy
// placeholder only.
const ADMIN_ADDRESS_HINT =
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS ??
  'GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO';

const GENERATED_ROLES: Role[] = ['senior', 'junior', 'borrower'];

interface BaseIdentity {
  role: Role;
  label: string;
  description: string;
  keypair: Keypair;
  address: string;
}

function makeBase(role: Role, label: string, description: string): BaseIdentity {
  const keypair = Keypair.random();
  return { role, label, description, keypair, address: keypair.publicKey() };
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  // Synchronous Stellar identities (unchanged) — available on first render.
  const baseIdentities = useMemo<Record<Role, BaseIdentity>>(
    () => ({
      admin: makeBase('admin', 'Protocol Admin', 'Credit events, yield triggers, and setup controls'),
      senior: makeBase('senior', 'Prime Investor', 'Prime tranche capital with priority protection'),
      junior: makeBase('junior', 'Alpha Investor', 'Alpha tranche first-loss capital and upside'),
      borrower: makeBase('borrower', 'Borrower', 'Receives deployed capital and repays cashflows'),
    }),
    [],
  );

  // CosmJS signers, generated async on mount (admin stays null).
  const [signers, setSigners] = useState<Record<Role, XionSigner | null>>({
    admin: null,
    senior: null,
    junior: null,
    borrower: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        GENERATED_ROLES.map(async (role) => [role, (await randomSigner()).signer] as const),
      );
      if (cancelled) return;
      setSigners((prev) => {
        const next = { ...prev };
        for (const [role, signer] of entries) next[role] = signer;
        return next;
      });
    })().catch(() => {
      // Generation failed (e.g. offline) — signers stay null; the demo still
      // renders read-only state. Write flows surface their own errors.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const identities = useMemo<Record<Role, SimulationIdentity>>(() => {
    const build = (role: Role): SimulationIdentity => ({
      ...baseIdentities[role],
      signer: signers[role],
      xionAddress: role === 'admin' ? ADMIN_ADDRESS_HINT : signers[role]?.address ?? '',
    });
    return {
      admin: build('admin'),
      senior: build('senior'),
      junior: build('junior'),
      borrower: build('borrower'),
    };
  }, [baseIdentities, signers]);

  const [role, setRole] = useState<Role>('admin');

  return (
    <IdentityContext.Provider value={{ ...identities[role], identities, setRole }}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity() {
  const value = useContext(IdentityContext);
  if (!value) {
    throw new Error('useIdentity must be used inside IdentityProvider');
  }
  return value;
}
