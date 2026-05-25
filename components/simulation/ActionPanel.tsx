'use client';

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
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TransactionBuilder } from '@stellar/stellar-sdk';

import {
  CLOAK_ORACLE_PUBKEY,
  DEFAULT_DEMO_LOSS_AMOUNT,
  DEFAULT_DEMO_YIELD_AMOUNT,
  NETWORK_PASSPHRASE,
  TRANCHE_CONFIG,
  TrancheKind,
  VAULT_ID,
} from '@/app/lib/constants';
import { formatNavQ, formatUsdc, parseUsdc, toBigInt } from '@/app/lib/format';
import {
  addr,
  getAmmClient,
  getCoreClient,
  getRpcServer,
  nativeToScVal,
} from '@/app/lib/stellar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import { useIdentity } from '@/hooks/useIdentity';
import { useIdentityBalances } from '@/hooks/useIdentityBalances';
import { useSimulationActions } from '@/hooks/useSimulationActions';
import { useSimulationLog } from '@/hooks/useSimulationLog';
import { useReactivateVault } from '@/hooks/useReactivateVault';
import { useVaultState } from '@/hooks/useVaultState';

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

async function submitContractCall(
  wallet: ReturnType<typeof useStellarWallet>,
  contractCall: ReturnType<typeof getCoreClient>['contract']['call'],
  ...args: Parameters<typeof getCoreClient>['contract']['call']>
) {
  if (!wallet.address) throw new Error('Connect a Stellar wallet first');
  const server = getRpcServer();
  const source = await server.getAccount(wallet.address);
  let tx = new TransactionBuilder(source, {
    fee: '1000',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contractCall(...args))
    .setTimeout(60)
    .build();

  tx = await server.prepareTransaction(tx);
  const signedXdr = await wallet.signTransaction(tx.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const sendResult = await server.sendTransaction(signedTx as never);
  if (sendResult.status === 'ERROR') {
    throw new Error(`Transaction failed: ${JSON.stringify(sendResult.errorResult)}`);
  }

  let status = await server.getTransaction(sendResult.hash);
  const deadline = Date.now() + 30_000;
  while (status.status === 'NOT_FOUND' && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1_500));
    status = await server.getTransaction(sendResult.hash);
  }
  if (status.status !== 'SUCCESS') {
    throw new Error(`Transaction failed: status=${status.status}`);
  }
  return sendResult.hash;
}

export function ActionPanel() {
  const wallet = useStellarWallet();
  const queryClient = useQueryClient();
  const identity = useIdentity();
  const { data: balances } = useIdentityBalances();
  const { addEntry } = useSimulationLog();
  const { registerActions } = useSimulationActions();
  const vaultState = useVaultState();

  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);
  const [depositAmount, setDepositAmount] = useState('100.0000000');
  const [withdrawShares, setWithdrawShares] = useState('1.0000000');
  const [yieldAmount, setYieldAmount] = useState(formatUsdc(DEFAULT_DEMO_YIELD_AMOUNT));
  const [lossAmount, setLossAmount] = useState(formatUsdc(DEFAULT_DEMO_LOSS_AMOUNT));
  const [loanAmount, setLoanAmount] = useState('10.0000000');
  const [swapAmount, setSwapAmount] = useState('10.0000000');

  const investorTranche =
    identity.role === 'senior'
      ? TrancheKind.Prime
      : identity.role === 'junior'
        ? TrancheKind.Alpha
        : TrancheKind.Prime;

  const investorTrancheConfig = TRANCHE_CONFIG[investorTranche];

  function recordSuccess(action: string, role: string, hash: string) {
    addEntry({
      action,
      role,
      signature: hash,
      status: 'success',
      navSnapshot: '',
      deltas: {},
    });
    toast.success(`${action} confirmed`, {
      description: (
        <a
          href={`https://stellar.expert/explorer/testnet/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 font-mono text-[10px] text-emerald-400 hover:underline"
        >
          View on Explorer: {hash.slice(0, 8)}...{hash.slice(-8)}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ),
      duration: 5000,
    });
  }

  async function afterMutation() {
    await queryClient.invalidateQueries({ queryKey: ['vault-state'] });
    await queryClient.invalidateQueries({ queryKey: ['identity-balances'] });
  }

  const core = getCoreClient();
  const amm = getAmmClient();

  const deposit = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(depositAmount);
      const hash = await submitContractCall(
        wallet,
        core.contract.call.bind(core.contract),
        'deposit',
        addr(wallet.address!),
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(investorTranche, { type: 'u32' }),
        nativeToScVal(amount, { type: 'i128' }),
      );
      recordSuccess(
        `${identity.label} Deposit (${formatUsdc(amount)} USDC -> ${investorTrancheConfig.label})`,
        identity.label,
        hash,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const shares = parseUsdc(withdrawShares);
      const hash = await submitContractCall(
        wallet,
        core.contract.call.bind(core.contract),
        'withdraw',
        addr(wallet.address!),
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(investorTranche, { type: 'u32' }),
        nativeToScVal(shares, { type: 'i128' }),
      );
      recordSuccess(
        `${identity.label} Withdraw (${formatUsdc(shares)} ${investorTrancheConfig.label} shares)`,
        identity.label,
        hash,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const accrueYield = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(yieldAmount);
      const hash = await submitContractCall(
        wallet,
        core.contract.call.bind(core.contract),
        'accrue_yield',
        addr(wallet.address!),
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        addr(wallet.address!),
        nativeToScVal(amount, { type: 'i128' }),
      );
      recordSuccess('Admin Accrue Yield', 'Protocol Admin', hash);
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const triggerDefault = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(lossAmount);
      const hash = await submitContractCall(
        wallet,
        core.contract.call.bind(core.contract),
        'trigger_credit_event',
        addr(wallet.address!),
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(0, { type: 'u32' }),
        nativeToScVal(amount, { type: 'i128' }),
        nativeToScVal(5000, { type: 'u32' }),
        nativeToScVal(1, { type: 'u32' }),
      );
      recordSuccess('Admin Trigger Default (50% demo severity)', 'Protocol Admin', hash);
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const disburse = useMutation({
    mutationFn: async () => {
      const hash = await submitContractCall(
        wallet,
        core.contract.call.bind(core.contract),
        'disburse_loan',
        nativeToScVal(VAULT_ID, { type: 'u32' }),
        nativeToScVal(1, { type: 'u32' }),
      );
      recordSuccess('Borrower Disbursement (admin-authorized)', 'Borrower', hash);
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const repay = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(loanAmount);
      const hash = await submitContractCall(
        wallet,
        core.contract.call.bind(core.contract),
        'repay_loan',
        addr(wallet.address!),
        nativeToScVal(1, { type: 'u32' }),
        nativeToScVal(amount, { type: 'i128' }),
      );
      recordSuccess('Borrower Repay Loan', 'Borrower', hash);
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const emergencySell = useMutation({
    mutationFn: async () => {
      const trancheData = vaultState.data?.tranches?.[investorTranche];
      const ptokenAddr = trancheData?.mint;
      if (!ptokenAddr) throw new Error('Tranche pToken not initialized');

      const amount = parseUsdc(swapAmount);
      const hash = await submitContractCall(
        wallet,
        amm.contract.call.bind(amm.contract),
        'swap',
        addr(wallet.address!),
        addr(ptokenAddr),
        nativeToScVal(amount, { type: 'i128' }),
        nativeToScVal(0n, { type: 'i128' }),
        nativeToScVal(0, { type: 'u32' }),
      );
      recordSuccess(`${identity.label} AMM Emergency Exit`, identity.label, hash);
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const initialize = useMutation({
    mutationFn: async () => {
      toast.info('Protocol initialization on Stellar is done via CLI deployment scripts. Use `stellar contract invoke` to set up the vault.');
      addEntry({
        action: 'Initialize Vault Scaffold',
        role: 'Protocol Admin',
        status: 'info',
        message: 'On Stellar, vault initialization is handled via deployment scripts. Connect the admin wallet and use the admin panel.',
        navSnapshot: '',
        deltas: {},
      });
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const reactivate = useReactivateVault(VAULT_ID);

  const mutateYield = accrueYield.mutate;
  const mutateDefault = triggerDefault.mutate;

  useEffect(() => {
    return registerActions({
      yield: () => mutateYield(),
      default: () => mutateDefault(),
    });
  }, [mutateYield, mutateDefault, registerActions]);

  const busy =
    deposit.isPending ||
    withdraw.isPending ||
    accrueYield.isPending ||
    triggerDefault.isPending ||
    emergencySell.isPending ||
    disburse.isPending ||
    repay.isPending ||
    initialize.isPending ||
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
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Button disabled={busy} variant="secondary" onClick={() => initialize.mutate()} className="w-full gap-2">
                <RotateCcw className="h-4 w-4" />
                Initialize
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
