'use client';

// Ephemeral simulation identities for the Stellar build.
//
// Each role gets a Stellar Keypair generated in-memory on page load. The
// `admin` role is pre-seeded as the testnet deployer address — that's the
// only role that can actually call admin-gated contract functions against
// the live deployment. Other roles are throwaway addresses; they can be
// used as user-facing display identities and as `Address` arguments inside
// `mock_all_auths`-style flows, but they can't initiate signed transactions
// against the live network without first being funded with XLM.
//
// Replaces the Solana version which loaded `contracts/keys/*.json` Solana
// secret arrays.

import { Keypair } from '@stellar/stellar-sdk';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Role = 'admin' | 'senior' | 'junior' | 'borrower';

export interface SimulationIdentity {
  role: Role;
  label: string;
  description: string;
  /** Stellar Keypair for this role. */
  keypair: Keypair;
  /** The 56-char Stellar address (`G...`) for this role. */
  address: string;
}

interface IdentityContextValue extends SimulationIdentity {
  identities: Record<Role, SimulationIdentity>;
  setRole: (role: Role) => void;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

// Testnet deployer pubkey — wired into the admin role so admin-only calls
// (init_loan, disburse_loan, accrue_yield, trigger_credit_event) succeed
// against the deployed `prism-core` contract.
//
// We can't ship the secret here, of course. Admin signing on the client
// requires the user to provide a wallet that controls this address, or the
// app talks to a backend that holds it. For demo purposes the admin button
// flows will surface a "needs deployer wallet" message rather than silently
// fail.
const ADMIN_ADDRESS_HINT =
  process.env.NEXT_PUBLIC_ADMIN_ADDRESS ??
  'GBF7XEKX6ZP7NYMS2IMFGAYVDZIZ66HHVLIAXAOPYFA5PF5Z6LI7PHMO';

function makeRole(
  role: Role,
  label: string,
  description: string,
  forcedPubkey?: string,
): SimulationIdentity {
  // Random keypair — represents this role for UI display + signature shape.
  // The forcedPubkey override is purely informational (we surface it as the
  // canonical address users should fund); the secret behind it is not on the
  // client.
  const kp = Keypair.random();
  const address = forcedPubkey ?? kp.publicKey();
  return { role, label, description, keypair: kp, address };
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const identities = useMemo<Record<Role, SimulationIdentity>>(
    () => ({
      admin: makeRole(
        'admin',
        'Protocol Admin',
        'Credit events, yield triggers, and setup controls',
        ADMIN_ADDRESS_HINT,
      ),
      senior: makeRole(
        'senior',
        'Prime Investor',
        'Prime tranche capital with priority protection',
      ),
      junior: makeRole(
        'junior',
        'Alpha Investor',
        'Alpha tranche first-loss capital and upside',
      ),
      borrower: makeRole(
        'borrower',
        'Borrower',
        'Receives deployed capital and repays cashflows',
      ),
    }),
    [],
  );

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
