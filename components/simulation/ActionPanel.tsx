'use client';

import { Keypair, Address } from '@stellar/stellar-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  ExternalLink,
  Flame,
  Landmark,
  Lock,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  WalletCards,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  DEFAULT_DEMO_LOSS_AMOUNT,
  DEFAULT_DEMO_YIELD_AMOUNT,
  ENCRYPT_ORACLE_PUBKEY,
  TRANCHE_CONFIG,
  TrancheKind,
  VAULT_ID,
} from '@/app/lib/constants';
import { delta, formatNavQ, formatUsdc, parseUsdc } from '@/app/lib/format';
import {
  getCoreClient,
  getUsdcClient,
  nativeToScVal as ntsv,
  addr,
  keypairSigner,
} from '@/app/lib/stellar';
import { explorerTxUrl } from '@/app/lib/horizon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useAttachEncryptScore,
  useEncryptHealth,
  useVerifyEncryptDefault,
} from '@/hooks/useEncryptHealth';
import { useUpsertLoan } from '@/hooks/useActiveLoans';
import { useIdentity } from '@/hooks/useIdentity';
import { useIdentityBalances } from '@/hooks/useIdentityBalances';
import { useSimulationActions } from '@/hooks/useSimulationActions';
import { useSimulationLog } from '@/hooks/useSimulationLog';
import { useReactivateVault } from '@/hooks/useReactivateVault';
import { useVaultState } from '@/hooks/useVaultState';
import { useSwap, SWAP_DIR_TRANCHE_TO_USDC } from '@/hooks/useSwap';

// Market maker keypair — derived deterministically from a fixed seed so the
// MM address is stable across demo resets. Fund it with testnet XLM + TUSDC
// via the Stellar Friendbot and the demo minting script before running Trade #2.
function mmKeypair(): Keypair {
  const seed = new Uint8Array(32);
  // Deterministic seed: spell out "PRISM-MM" in the first bytes
  [0x50, 0x52, 0x49, 0x53, 0x4d, 0x2d, 0x4d, 0x4d].forEach((b, i) => { seed[i] = b; });
  return Keypair.fromRawEd25519Seed(Buffer.from(seed));
}

function formatError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('InsufficientLiquidity') || message.includes('InsufficientReserve')) {
    return 'Vault reserve is insufficient for this withdrawal. Use the AMM emergency exit path for immediate liquidity at market price.';
  }
  if (message.includes('SlippageExceeded')) {
    return 'AMM slippage protection rejected the transaction.';
  }
  if (message.includes('User rejected')) {
    return 'Transaction was rejected by the signer.';
  }
  return message.slice(0, 280);
}

interface BalanceSnapshot {
  walletUsdc: bigint;
  trancheShares: bigint;
  vaultReserve: bigint;
  lossBucket: bigint;
}

async function readBalance(contractId: string, ownerAddress: string): Promise<bigint> {
  try {
    const client = getCoreClient(); // reuse RPC
    const usdcClient = { contractId };
    const raw = await getUsdcClient().read<bigint>('balance', [
      new Address(ownerAddress).toScVal(),
    ]);
    return typeof raw === 'bigint' ? raw : BigInt(String(raw));
  } catch {
    return 0n;
  }
}

async function takeSnapshot(
  ownerAddress: string,
  trancheKind: TrancheKind,
  vaultId: number,
): Promise<BalanceSnapshot> {
  const core = getCoreClient();
  try {
    const [walletUsdc, trancheData, vaultData] = await Promise.all([
      getUsdcClient().read<bigint>('balance', [new Address(ownerAddress).toScVal()]),
      core.read<Record<string, unknown>>('get_tranche', [
        ntsv(vaultId, { type: 'u32' }),
        ntsv(trancheKind, { type: 'u32' }),
      ]),
      core.read<Record<string, unknown>>('get_vault', [ntsv(vaultId, { type: 'u32' })]),
    ]);
    const trancheShares =
      typeof trancheData?.total_supply === 'bigint'
        ? trancheData.total_supply
        : BigInt(String(trancheData?.total_supply ?? 0));
    const vaultReserve =
      typeof vaultData?.total_deposits === 'bigint'
        ? vaultData.total_deposits
        : BigInt(String(vaultData?.total_deposits ?? 0));
    return {
      walletUsdc: typeof walletUsdc === 'bigint' ? walletUsdc : BigInt(String(walletUsdc ?? 0)),
      trancheShares,
      vaultReserve,
      lossBucket: 0n,
    };
  } catch {
    return { walletUsdc: 0n, trancheShares: 0n, vaultReserve: 0n, lossBucket: 0n };
  }
}

async function navSnapshot(vaultId: number): Promise<string> {
  const core = getCoreClient();
  const parts = await Promise.all(
    ([TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const).map(async (kind) => {
      try {
        const t = await core.read<Record<string, unknown>>('get_tranche', [
          ntsv(vaultId, { type: 'u32' }),
          ntsv(kind, { type: 'u32' }),
        ]);
        const nav = t?.nav_per_share_q ?? 0;
        return `${TRANCHE_CONFIG[kind].label} NAV ${formatNavQ(typeof nav === 'bigint' ? nav : BigInt(String(nav)))}`;
      } catch {
        return `${TRANCHE_CONFIG[kind].label} NAV —`;
      }
    }),
  );
  return parts.join(' | ');
}

export function ActionPanel() {
  const queryClient = useQueryClient();
  const identity = useIdentity();
  const { data: balances } = useIdentityBalances();
  const { addEntry } = useSimulationLog();
  const { registerActions } = useSimulationActions();
  const vaultState = useVaultState();
  const swap = useSwap();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  const [depositAmount, setDepositAmount] = useState('100.000000');
  const [withdrawShares, setWithdrawShares] = useState('1.000000');
  const [yieldAmount, setYieldAmount] = useState(formatUsdc(DEFAULT_DEMO_YIELD_AMOUNT));
  const [lossAmount, setLossAmount] = useState(formatUsdc(DEFAULT_DEMO_LOSS_AMOUNT));
  const [loanAmount, setLoanAmount] = useState('10.000000');
  const [swapAmount, setSwapAmount] = useState('10.000000');

  const upsertLoan = useUpsertLoan();

  const investorTranche =
    identity.role === 'senior'
      ? TrancheKind.Prime
      : identity.role === 'junior'
        ? TrancheKind.Alpha
        : TrancheKind.Prime;

  const investorTrancheConfig = TRANCHE_CONFIG[investorTranche];

  function recordSuccess(
    action: string,
    role: string,
    before: BalanceSnapshot,
    after: BalanceSnapshot,
    nav: string,
    signature: string,
  ) {
    addEntry({
      action,
      role,
      signature,
      status: 'success',
      navSnapshot: nav,
      deltas: {
        'Wallet USDC': delta(before.walletUsdc, after.walletUsdc),
        'Tranche Shares': delta(before.trancheShares, after.trancheShares),
        'Vault Reserve': delta(before.vaultReserve, after.vaultReserve),
        'Loss Bucket': delta(before.lossBucket, after.lossBucket),
      },
    });

    toast.success(`${action} confirmed`, {
      description: (
        <a
          href={explorerTxUrl(signature)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-mono text-[10px] text-emerald-400 hover:underline"
        >
          View on Explorer: {signature.slice(0, 8)}...{signature.slice(-8)}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ),
      duration: 5000,
    });
  }

  async function afterMutation() {
    await queryClient.invalidateQueries({ queryKey: ['vault-state'] });
  }

  async function syncLoanToDb(loanId: number) {
    try {
      const core = getCoreClient();
      const loan = await core.read<Record<string, unknown>>('get_loan', [
        ntsv(loanId, { type: 'u32' }),
      ]);
      if (!loan) return;
      const stateKey = Object.keys(loan.state as Record<string, unknown>)[0] ?? 'Originated';
      await upsertLoan.mutateAsync({
        loanId,
        pda: `${VAULT_ID}-${loanId}`,
        borrower: String(loan.borrower ?? ''),
        principal: BigInt(String(loan.principal ?? 0)),
        aprBps: Number(loan.apr_bps ?? 0),
        originationTs: Number(loan.origination_ts ?? 0),
        maturityTs: Number(loan.maturity_ts ?? 0),
        state: stateKey,
        totalRepaid: BigInt(String(loan.total_repaid ?? 0)),
      });
    } catch {
      // non-critical
    }
  }

  const deposit = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(depositAmount);
      const signer = keypairSigner(identity.keypair);
      const before = await takeSnapshot(signer.publicKey(), investorTranche, VAULT_ID);
      const core = getCoreClient();
      const result = await core.invoke(signer, 'deposit', [
        addr(signer.publicKey()),
        ntsv(VAULT_ID, { type: 'u32' }),
        ntsv(investorTranche, { type: 'u32' }),
        ntsv(amount, { type: 'i128' }),
      ]);
      const after = await takeSnapshot(signer.publicKey(), investorTranche, VAULT_ID);
      recordSuccess(
        `${identity.label} Deposit (${formatUsdc(amount)} USDC → ${investorTrancheConfig.label})`,
        identity.label,
        before,
        after,
        await navSnapshot(VAULT_ID),
        result.hash,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const shares = parseUsdc(withdrawShares);
      const signer = keypairSigner(identity.keypair);
      const before = await takeSnapshot(signer.publicKey(), investorTranche, VAULT_ID);
      const core = getCoreClient();
      const result = await core.invoke(signer, 'withdraw', [
        addr(signer.publicKey()),
        ntsv(VAULT_ID, { type: 'u32' }),
        ntsv(investorTranche, { type: 'u32' }),
        ntsv(shares, { type: 'i128' }),
      ]);
      const after = await takeSnapshot(signer.publicKey(), investorTranche, VAULT_ID);
      recordSuccess(
        `${identity.label} Withdraw (${formatUsdc(shares)} ${investorTrancheConfig.label} shares)`,
        identity.label,
        before,
        after,
        await navSnapshot(VAULT_ID),
        result.hash,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const accrueYield = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(yieldAmount);
      const admin = keypairSigner(identity.identities.admin.keypair);
      const borrower = keypairSigner(identity.identities.borrower.keypair);
      const before = await takeSnapshot(borrower.publicKey(), TrancheKind.Prime, VAULT_ID);
      const core = getCoreClient();
      const result = await core.invoke(admin, 'accrue_yield', [
        addr(admin.publicKey()),
        ntsv(VAULT_ID, { type: 'u32' }),
        addr(borrower.publicKey()),
        ntsv(amount, { type: 'i128' }),
      ]);
      const after = await takeSnapshot(borrower.publicKey(), TrancheKind.Prime, VAULT_ID);
      recordSuccess(
        'Admin Accrue Yield',
        'Protocol Admin',
        before,
        after,
        await navSnapshot(VAULT_ID),
        result.hash,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const triggerDefault = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(lossAmount);
      const admin = keypairSigner(identity.identities.admin.keypair);
      const before = await takeSnapshot(admin.publicKey(), TrancheKind.Alpha, VAULT_ID);
      const core = getCoreClient();
      const result = await core.invoke(admin, 'trigger_credit_event', [
        addr(admin.publicKey()),
        ntsv(VAULT_ID, { type: 'u32' }),
        ntsv(0, { type: 'u32' }), // event_type: Default
        ntsv(amount, { type: 'i128' }),
        ntsv(5000, { type: 'u32' }), // severity_bps
        ntsv(0, { type: 'u32' }), // loan_id
      ]);
      const after = await takeSnapshot(admin.publicKey(), TrancheKind.Alpha, VAULT_ID);
      recordSuccess(
        'Admin Trigger Default (50% demo severity)',
        'Protocol Admin',
        before,
        after,
        await navSnapshot(VAULT_ID),
        result.hash,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  // ── Encrypt FHE flow ─────────────────────────────────────────────────────
  const demoLoanId = 0;
  const verifyEncryptDefault = useVerifyEncryptDefault();
  const attachEncryptScore = useAttachEncryptScore();
  const encryptHealth = useEncryptHealth(demoLoanId);

  async function deriveDemoCommitment(): Promise<Uint8Array> {
    const borrowerKey = Keypair.fromPublicKey(
      identity.identities.borrower.keypair.publicKey(),
    ).rawPublicKey();
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(borrowerKey));
      return new Uint8Array(digest);
    }
    const { createHash } = await import('node:crypto');
    return new Uint8Array(createHash('sha256').update(borrowerKey).digest());
  }

  const attachFheScore = useMutation({
    mutationFn: async () => {
      const commitment = await deriveDemoCommitment();
      await attachEncryptScore.mutateAsync({
        loanId: 0,
        commitment,
        encryptOraclePubkey: Uint8Array.from(Buffer.from(ENCRYPT_ORACLE_PUBKEY, 'hex')),
      });
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const verifyDefaultViaFhe = useMutation({
    mutationFn: async () => {
      const admin = keypairSigner(identity.identities.admin.keypair);
      const core = getCoreClient();
      const health = await core.read<Record<string, unknown>>('get_encrypt_health', [
        ntsv(VAULT_ID, { type: 'u32' }),
        ntsv(0, { type: 'u32' }),
      ]);
      if (!health) {
        throw new Error(
          'No FHE health record found. The borrower must run "Attach FHE Score" first.',
        );
      }
      const before = await takeSnapshot(admin.publicKey(), TrancheKind.Alpha, VAULT_ID);
      const commitment = new Uint8Array(health.score_commitment as number[]);
      const result = await verifyEncryptDefault.mutateAsync({
        vaultId: VAULT_ID,
        loanId: 0,
        scoreCommitment: commitment,
        lossAmount: parseUsdc(lossAmount),
        severityBps: 5000,
      });
      const after = await takeSnapshot(admin.publicKey(), TrancheKind.Alpha, VAULT_ID);
      recordSuccess(
        'Encrypt FHE — Default Proven',
        'Protocol Admin',
        before,
        after,
        await navSnapshot(VAULT_ID),
        result.signature,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const emergencySell = useMutation({
    mutationFn: async () => {
      await swap.mutateAsync({
        trancheKind: investorTranche,
        amountIn: parseUsdc(swapAmount),
        minAmountOut: 0n,
        direction: SWAP_DIR_TRANCHE_TO_USDC,
      });
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const marketReaction = useMutation({
    mutationFn: async () => {
      const mm = keypairSigner(mmKeypair());
      const mmAddress = mm.publicKey();
      const core = getCoreClient();

      // Sell 5 × pALPHA lots
      for (let i = 0; i < 5; i += 1) {
        const before = await takeSnapshot(mmAddress, TrancheKind.Alpha, VAULT_ID);
        const result = await core.invoke(mm, 'soroswap_swap', [
          addr(mmAddress),
          ntsv(VAULT_ID, { type: 'u32' }),
          ntsv(TrancheKind.Alpha, { type: 'u32' }),
          ntsv(400_000_000n, { type: 'i128' }),
          ntsv(0n, { type: 'i128' }),
          ntsv(0, { type: 'u32' }), // tranche → USDC
        ]);
        const after = await takeSnapshot(mmAddress, TrancheKind.Alpha, VAULT_ID);
        recordSuccess(
          `Market Reaction pALPHA sell ${i + 1}/5`,
          mmAddress.slice(0, 8),
          before,
          after,
          await navSnapshot(VAULT_ID),
          result.hash,
        );
      }
      // Sell 2 × pCORE lots
      for (let i = 0; i < 2; i += 1) {
        const before = await takeSnapshot(mmAddress, TrancheKind.Core, VAULT_ID);
        const result = await core.invoke(mm, 'soroswap_swap', [
          addr(mmAddress),
          ntsv(VAULT_ID, { type: 'u32' }),
          ntsv(TrancheKind.Core, { type: 'u32' }),
          ntsv(250_000_000n, { type: 'i128' }),
          ntsv(0n, { type: 'i128' }),
          ntsv(0, { type: 'u32' }), // tranche → USDC
        ]);
        const after = await takeSnapshot(mmAddress, TrancheKind.Core, VAULT_ID);
        recordSuccess(
          `Market Reaction pCORE sell ${i + 1}/2`,
          mmAddress.slice(0, 8),
          before,
          after,
          await navSnapshot(VAULT_ID),
          result.hash,
        );
      }
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const disburse = useMutation({
    mutationFn: async () => {
      const admin = keypairSigner(identity.identities.admin.keypair);
      const borrower = keypairSigner(identity.identities.borrower.keypair);
      const before = await takeSnapshot(borrower.publicKey(), TrancheKind.Prime, VAULT_ID);
      const core = getCoreClient();
      const result = await core.invoke(admin, 'disburse_loan', [
        ntsv(VAULT_ID, { type: 'u32' }),
        ntsv(0, { type: 'u32' }), // loan_id
      ]);
      const after = await takeSnapshot(borrower.publicKey(), TrancheKind.Prime, VAULT_ID);
      recordSuccess(
        'Borrower Disbursement (admin-authorized)',
        'Borrower',
        before,
        after,
        await navSnapshot(VAULT_ID),
        result.hash,
      );
    },
    onSuccess: async () => {
      await afterMutation();
      await syncLoanToDb(0);
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const repay = useMutation({
    mutationFn: async () => {
      const borrower = keypairSigner(identity.identities.borrower.keypair);
      const amount = parseUsdc(loanAmount);
      const before = await takeSnapshot(borrower.publicKey(), TrancheKind.Prime, VAULT_ID);
      const core = getCoreClient();
      const result = await core.invoke(borrower, 'repay_loan', [
        addr(borrower.publicKey()),
        ntsv(0, { type: 'u32' }), // loan_id
        ntsv(amount, { type: 'i128' }),
      ]);
      const after = await takeSnapshot(borrower.publicKey(), TrancheKind.Prime, VAULT_ID);
      recordSuccess(
        'Borrower Repay Loan',
        'Borrower',
        before,
        after,
        await navSnapshot(VAULT_ID),
        result.hash,
      );
    },
    onSuccess: async () => {
      await afterMutation();
      await syncLoanToDb(0);
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const initialize = useMutation({
    mutationFn: async () => {
      const borrowerAddress = identity.identities.borrower.keypair.publicKey();
      const res = await fetch('/api/admin/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ borrowerAddress }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Initialize failed');

      const msg = json.alreadyInitialized
        ? 'All components already existed on-chain — nothing to do.'
        : `Initialized: ${json.steps.join(', ')}`;

      addEntry({
        action: 'Initialize Vault Scaffold',
        role: 'Protocol Admin',
        status: 'info',
        message: msg,
        navSnapshot: await navSnapshot(VAULT_ID),
        deltas: {},
      });

      return json;
    },
    onSuccess: async () => {
      await afterMutation();
      await syncLoanToDb(0);
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const fundIdentities = useMutation({
    mutationFn: async () => {
      const roles: Array<{ label: string; address: string }> = [
        { label: 'Senior', address: identity.identities.senior.keypair.publicKey() },
        { label: 'Junior', address: identity.identities.junior.keypair.publicKey() },
        { label: 'Borrower', address: identity.identities.borrower.keypair.publicKey() },
      ];
      const results: string[] = [];
      for (const { label, address } of roles) {
        const res = await fetch('/api/admin/mint-usdc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: address, amount: '100000000000' }), // 10,000 TUSDC each
        });
        const json = await res.json();
        if (!res.ok) throw new Error(`Mint to ${label} failed: ${json.error}`);
        results.push(`${label}: ${json.hash?.slice(0, 8) ?? 'ok'}`);
      }
      addEntry({
        action: 'Fund Identities with TUSDC',
        role: 'Protocol Admin',
        status: 'info',
        message: `Minted 10,000 TUSDC to Senior, Junior, Borrower. ${results.join(' | ')}`,
        navSnapshot: await navSnapshot(VAULT_ID),
        deltas: {},
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['identity-balances'] });
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const reactivate = useReactivateVault(VAULT_ID);

  const mutateYield = accrueYield.mutate;
  const mutateDefault = triggerDefault.mutate;
  const mutateMarket = marketReaction.mutate;

  useEffect(() => {
    return registerActions({
      yield: () => mutateYield(),
      default: () => mutateDefault(),
      market: () => mutateMarket(),
    });
  }, [mutateYield, mutateDefault, mutateMarket, registerActions]);

  const busy =
    deposit.isPending ||
    withdraw.isPending ||
    accrueYield.isPending ||
    triggerDefault.isPending ||
    emergencySell.isPending ||
    marketReaction.isPending ||
    disburse.isPending ||
    repay.isPending ||
    initialize.isPending ||
    fundIdentities.isPending ||
    attachFheScore.isPending ||
    verifyDefaultViaFhe.isPending ||
    verifyEncryptDefault.isPending ||
    attachEncryptScore.isPending ||
    reactivate.isPending;

  if (!isMounted) return null;

  return (
    <section className="rounded-lg border border-white/10 bg-black/30 p-5" aria-label="Action panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">Action Panel</div>
          <p className="mt-1 text-xs text-white/45">{identity.label} signed transactions only.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="rounded-md bg-white/10 px-2 py-1 font-mono text-[10px] uppercase text-white/60">
            confirmed
          </span>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-emerald-400/80">
            <CreditCard className="h-2.5 w-2.5" />
            {formatUsdc(balances?.usdc ?? 0n, 2)} USDC
          </div>
        </div>
      </div>

      {identity.role === 'senior' || identity.role === 'junior' ? (
        <div className="mt-5 space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Landmark className="h-4 w-4 text-white/50" />
              {investorTrancheConfig.label} tranche entry
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} />
              <Button disabled={busy} onClick={() => deposit.mutate()} className="w-full gap-2 sm:w-auto">
                <WalletCards className="h-4 w-4" />
                Deposit
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Banknote className="h-4 w-4 text-white/50" />
              Withdraw or emergency exit
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input value={withdrawShares} onChange={(event) => setWithdrawShares(event.target.value)} />
              <Button disabled={busy} variant="secondary" onClick={() => withdraw.mutate()} className="w-full sm:w-auto">
                Withdraw
              </Button>
              <Button disabled={busy} variant="outline" onClick={() => emergencySell.mutate()} className="w-full gap-2 sm:w-auto">
                <TrendingDown className="h-4 w-4" />
                AMM Exit
              </Button>
            </div>
            <Input className="mt-2" value={swapAmount} onChange={(event) => setSwapAmount(event.target.value)} />
          </div>
        </div>
      ) : null}

      {identity.role === 'borrower' ? (
        <div className="mt-5 space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="text-sm font-medium text-white">Loan lifecycle</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input value={loanAmount} onChange={(event) => setLoanAmount(event.target.value)} />
              <Button disabled={busy} onClick={() => disburse.mutate()} className="w-full sm:w-auto">
                Disburse
              </Button>
              <Button disabled={busy} variant="secondary" onClick={() => repay.mutate()} className="w-full sm:w-auto">
                Repay
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Lock className="h-4 w-4 text-emerald-300" />
              Encrypt FHE credit score
            </div>
            <p className="mt-1 text-xs text-white/55">
              Register a sha256 commitment of your Encrypt-sealed credit data on-chain. The
              actual score never leaves your device — the FHE oracle proves default conditions
              homomorphically.
            </p>
            <div className="mt-3">
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => attachFheScore.mutate()}
                className="w-full gap-2"
              >
                <Lock className="h-4 w-4" />
                {encryptHealth.data ? 'Re-attach FHE Score' : 'Attach FHE Score'}
              </Button>
            </div>
            {encryptHealth.data ? (
              <div className="mt-3 font-mono text-[11px] text-white/55">
                Status: <span className="text-emerald-300">{encryptHealth.data.status}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {identity.role === 'admin' ? (
        <div className="mt-5 space-y-5">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Play className="h-4 w-4 text-white/50" />
              Protocol operations
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input value={yieldAmount} onChange={(event) => setYieldAmount(event.target.value)} />
              <Button disabled={busy} onClick={() => accrueYield.mutate()} className="w-full sm:w-auto">
                Accrue Yield
              </Button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input value={lossAmount} onChange={(event) => setLossAmount(event.target.value)} />
              <Button disabled={busy} variant="destructive" onClick={() => triggerDefault.mutate()} className="w-full gap-2 sm:w-auto">
                <ShieldAlert className="h-4 w-4" />
                Trigger Default
              </Button>
            </div>
            <div className="mt-3">
              <Button
                disabled={busy || !encryptHealth.data}
                variant="outline"
                onClick={() => verifyDefaultViaFhe.mutate()}
                className="w-full gap-2 border-emerald-300/30 text-emerald-200 hover:bg-emerald-300/10"
                title={
                  encryptHealth.data
                    ? 'Verifies an Encrypt FHE attestation on-chain and atomically cascades losses'
                    : 'Borrower must Attach FHE Score before this becomes available'
                }
              >
                {verifyDefaultViaFhe.isPending ? (
                  <>
                    <ShieldCheck className="h-4 w-4 animate-pulse" />
                    Awaiting Encrypt FHE oracle…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Verify Default via FHE (Encrypt)
                  </>
                )}
              </Button>
              {!encryptHealth.data ? (
                <p className="mt-1 font-mono text-[10px] text-white/40">
                  Borrower must run Attach FHE Score first.
                </p>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button disabled={busy} variant="secondary" onClick={() => initialize.mutate()} className="w-full gap-2">
                <RotateCcw className="h-4 w-4" />
                {initialize.isPending ? 'Initializing…' : 'Initialize Vault'}
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => fundIdentities.mutate()}
                className="w-full gap-2 border-sky-500/30 text-sky-300 hover:bg-sky-500/10"
                title="Mint 10,000 TUSDC to Senior, Junior, and Borrower identities"
              >
                <Banknote className="h-4 w-4" />
                {fundIdentities.isPending ? 'Funding…' : 'Fund Identities'}
              </Button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Button disabled={busy} variant="outline" onClick={() => marketReaction.mutate()} className="w-full gap-2">
                <Flame className="h-4 w-4" />
                Run Market Reaction
              </Button>
              <Button
                disabled={busy}
                variant="outline"
                onClick={() => reactivate.mutate()}
                className="w-full gap-2 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10"
              >
                <Zap className="h-4 w-4" />
                Reactivate Vault
              </Button>
            </div>
          </div>
          <div className="flex gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Failed withdrawals surface the on-chain error and point the user to AMM exit liquidity.
          </div>
        </div>
      ) : null}
    </section>
  );
}
