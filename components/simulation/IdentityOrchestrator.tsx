'use client';

import { useQuery } from '@tanstack/react-query';
import { BriefcaseBusiness, Crown, KeyRound, ShieldCheck } from 'lucide-react';

import { formatUsdc, shortKey } from '@/app/lib/format';
import { USDC_CONTRACT_ID } from '@/app/lib/constants';
import { addr, getUsdcClient } from '@/app/lib/stellar';
import { useIdentity, type Role } from '@/hooks/useIdentity';
import { useVaultState } from '@/hooks/useVaultState';

const ROLE_ICONS = {
  admin: KeyRound,
  senior: ShieldCheck,
  junior: Crown,
  borrower: BriefcaseBusiness,
} as const;

export function IdentityOrchestrator() {
  const { role, identities, setRole } = useIdentity();
  const vaultState = useVaultState();

  const balances = useQuery({
    queryKey: ['identity-balances', USDC_CONTRACT_ID],
    refetchInterval: 5000,
    queryFn: async () => {
      const result: Record<Role, { xlm: number; usdc: bigint }> = {
        admin: { xlm: 0, usdc: 0n },
        senior: { xlm: 0, usdc: 0n },
        junior: { xlm: 0, usdc: 0n },
        borrower: { xlm: 0, usdc: 0n },
      };

      const usdc = getUsdcClient();
      await Promise.all(
        (Object.keys(identities) as Role[]).map(async (key) => {
          const identity = identities[key];
          let usdcBal = 0n;
          try {
            const bal = await usdc.read<bigint | number | string>('balance', [addr(identity.address)]);
            usdcBal = BigInt(bal ?? 0);
          } catch {
            usdcBal = 0n;
          }
          result[key] = { xlm: 0, usdc: usdcBal };
        }),
      );

      return result;
    },
  });

  return (
    <section className="grid gap-3 xl:grid-cols-4" aria-label="Identity orchestrator">
      {(Object.keys(identities) as Role[]).map((key) => {
        const identity = identities[key];
        const active = key === role;
        const Icon = ROLE_ICONS[key];
        const balance = balances.data?.[key];

        return (
          <button
            key={key}
            type="button"
            onClick={() => setRole(key)}
            className={[
              'min-h-28 rounded-lg border p-4 text-left transition-colors',
              active
                ? 'border-white/45 bg-white text-black'
                : 'border-white/10 bg-white/[0.04] text-white hover:border-white/25 hover:bg-white/[0.07]',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md border',
                    active ? 'border-black/10 bg-black/5' : 'border-white/10 bg-white/5',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{identity.label}</div>
                  <div className={active ? 'text-xs text-black/55' : 'text-xs text-white/45'}>
                    {shortKey(identity.address)}
                  </div>
                </div>
              </div>
              <span
                className={[
                  'rounded-md px-2 py-1 font-mono text-[10px] uppercase',
                  active ? 'bg-black text-white' : 'bg-white/10 text-white/65',
                ].join(' ')}
              >
                {active ? 'Active' : 'Switch'}
              </span>
            </div>
            <p className={active ? 'mt-3 text-xs text-black/65' : 'mt-3 text-xs text-white/50'}>
              {identity.description}
            </p>
            <div
              className={[
                'mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]',
                active ? 'text-black/70' : 'text-white/55',
              ].join(' ')}
            >
              <span>XLM {balance ? balance.xlm.toFixed(4) : '--'}</span>
              <span>USDC {balance ? formatUsdc(balance.usdc, 2) : '--'}</span>
            </div>
          </button>
        );
      })}
    </section>
  );
}
