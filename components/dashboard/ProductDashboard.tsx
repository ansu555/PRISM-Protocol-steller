'use client';

import { useState } from 'react';
import { useAnchorWallet, useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { AnchorProvider, BN, Program, type Idl } from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { SystemProgram } from '@solana/web3.js';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Database,
  ExternalLink,
  Landmark,
  Loader2,
  RefreshCw,
  Shield,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { TRANCHE_CONFIG, TrancheKind, USDC_MINT, VAULT_ID } from '@/app/lib/constants';
import { formatNavQ, formatUsdc, parseUsdc, stateName, toBigInt } from '@/app/lib/format';
import prismCoreIdl from '@/app/lib/idl/prism_core.json';
import {
  getConfigPda,
  getTrancheMintPda,
  getTranchePda,
  getVaultPda,
  getVaultReservePda,
} from '@/app/lib/pda';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useVaultState } from '@/hooks/useVaultState';

const Q64_ONE = 1n << 64n;

function bn(value: bigint) {
  return new BN(value.toString());
}

function apyLabel(bps: number) {
  if (bps === 0) return 'Residual';
  return `${(bps / 100).toFixed(0)}%`;
}

function riskLabel(kind: TrancheKind) {
  if (kind === TrancheKind.Prime) return 'Senior · Protected';
  if (kind === TrancheKind.Core) return 'Mezzanine';
  return 'Equity · First Loss';
}

function riskColor(kind: TrancheKind) {
  if (kind === TrancheKind.Prime) return 'text-sky-300/70';
  if (kind === TrancheKind.Core) return 'text-amber-300/70';
  return 'text-rose-300/70';
}

type ModalMode = 'deposit' | 'withdraw';

interface ModalState {
  kind: TrancheKind;
  mode: ModalMode;
}

export function ProductDashboard() {
  const { connection } = useConnection();
  const anchorWallet = useAnchorWallet();
  const { connected, publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const queryClient = useQueryClient();
  const vaultState = useVaultState();

  const [modal, setModal] = useState<ModalState | null>(null);
  const [amount, setAmount] = useState('');

  const userUsdcBalance = useQuery({
    queryKey: ['user-usdc', publicKey?.toBase58()],
    enabled: !!publicKey,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!publicKey) return 0n;
      const ata = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
      try {
        const info = await connection.getTokenAccountBalance(ata);
        return BigInt(info.value.amount);
      } catch {
        return 0n;
      }
    },
  });

  const userPositions = useQuery({
    queryKey: ['user-positions', publicKey?.toBase58(), vaultState.data?.vaultPda.toBase58()],
    enabled: !!publicKey && !!vaultState.data,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!publicKey || !vaultState.data) return null;
      const { vaultPda, programIds } = vaultState.data;
      const results: Partial<Record<TrancheKind, bigint>> = {};
      await Promise.all(
        ([TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const).map(async (kind) => {
          const [mintPda] = getTrancheMintPda(vaultPda, kind, programIds.core);
          const ata = getAssociatedTokenAddressSync(mintPda, publicKey);
          try {
            const info = await connection.getTokenAccountBalance(ata);
            results[kind] = BigInt(info.value.amount);
          } catch {
            results[kind] = 0n;
          }
        }),
      );
      return results;
    },
  });

  const deposit = useMutation({
    mutationFn: async ({ kind, rawAmount }: { kind: TrancheKind; rawAmount: bigint }) => {
      if (!anchorWallet) throw new Error('Wallet not connected');
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
      const program = new Program(prismCoreIdl as Idl, provider);
      const [configPda] = getConfigPda();
      const [vaultPda] = getVaultPda(VAULT_ID);
      const [tranchePda] = getTranchePda(vaultPda, kind);
      const [trancheMintPda] = getTrancheMintPda(vaultPda, kind);
      const [reservePda] = getVaultReservePda(vaultPda);
      const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, anchorWallet.publicKey);
      const userTrancheAta = getAssociatedTokenAddressSync(trancheMintPda, anchorWallet.publicKey);
      await (program.methods as any)
        .deposit(kind, bn(rawAmount))
        .accounts({
          user: anchorWallet.publicKey,
          config: configPda,
          vault: vaultPda,
          tranche: tranchePda,
          trancheMint: trancheMintPda,
          vaultUsdcReserve: reservePda,
          userUsdcAta,
          userTrancheAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });
    },
    onSuccess: () => {
      toast.success('Deposit confirmed');
      setModal(null);
      setAmount('');
      queryClient.invalidateQueries({ queryKey: ['vault-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-positions'] });
      queryClient.invalidateQueries({ queryKey: ['user-usdc'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message.slice(0, 200) : String(err)),
  });

  const withdraw = useMutation({
    mutationFn: async ({ kind, rawShares }: { kind: TrancheKind; rawShares: bigint }) => {
      if (!anchorWallet) throw new Error('Wallet not connected');
      const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
      const program = new Program(prismCoreIdl as Idl, provider);
      const [configPda] = getConfigPda();
      const [vaultPda] = getVaultPda(VAULT_ID);
      const [tranchePda] = getTranchePda(vaultPda, kind);
      const [trancheMintPda] = getTrancheMintPda(vaultPda, kind);
      const [reservePda] = getVaultReservePda(vaultPda);
      const userUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, anchorWallet.publicKey);
      const userTrancheAta = getAssociatedTokenAddressSync(trancheMintPda, anchorWallet.publicKey);
      await (program.methods as any)
        .withdraw(kind, bn(rawShares))
        .accounts({
          user: anchorWallet.publicKey,
          config: configPda,
          vault: vaultPda,
          tranche: tranchePda,
          trancheMint: trancheMintPda,
          vaultUsdcReserve: reservePda,
          userUsdcAta,
          userTrancheAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ commitment: 'confirmed' });
    },
    onSuccess: () => {
      toast.success('Withdrawal confirmed');
      setModal(null);
      setAmount('');
      queryClient.invalidateQueries({ queryKey: ['vault-state'] });
      queryClient.invalidateQueries({ queryKey: ['user-positions'] });
      queryClient.invalidateQueries({ queryKey: ['user-usdc'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message.slice(0, 200) : String(err)),
  });

  function openModal(kind: TrancheKind, mode: ModalMode) {
    setAmount('');
    setModal({ kind, mode });
  }

  const data = vaultState.data;
  const totalTvl = data?.tranches.reduce((sum, t) => sum + t.totalAssets, 0n) ?? 0n;
  const vaultStateName = stateName(data?.vault?.state) ?? 'Loading';
  const isLoading = vaultState.isLoading;

  const modalTranche = modal ? data?.tranches.find((t) => t.kind === modal.kind) : null;
  const parsedAmount = parseUsdc(amount || '0');
  const modalNavQ = toBigInt(modalTranche?.navPerShareQ ?? 0);

  const expectedOutput =
    modal?.mode === 'deposit' && modalNavQ > 0n
      ? (parsedAmount * Q64_ONE) / modalNavQ
      : modal?.mode === 'withdraw' && modalNavQ > 0n
        ? (parsedAmount * modalNavQ) / Q64_ONE
        : 0n;

  const isPending = deposit.isPending || withdraw.isPending;

  function handleConfirm() {
    if (!modal || !anchorWallet) return;
    const raw = parseUsdc(amount);
    if (raw === 0n) return;
    if (modal.mode === 'deposit') {
      deposit.mutate({ kind: modal.kind, rawAmount: raw });
    } else {
      withdraw.mutate({ kind: modal.kind, rawShares: raw });
    }
  }

  return (
    <div className="space-y-6">
      {/* Protocol Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/40 p-5">
        <div>
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-white/50" />
            <h1 className="text-sm font-semibold text-white">PRISM Protocol · Devnet</h1>
          </div>
          {isLoading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-white/40">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Loading vault state…
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-3 font-mono text-xs text-white/50">
              <span
                className={[
                  'rounded-md px-2 py-0.5 text-[11px] uppercase',
                  vaultStateName === 'Active'
                    ? 'bg-emerald-400/15 text-emerald-300'
                    : 'bg-amber-400/15 text-amber-300',
                ].join(' ')}
              >
                {vaultStateName}
              </span>
              <span>TVL {formatUsdc(totalTvl)} USDC</span>
              <span>Reserve {formatUsdc(data?.reserveBalance ?? 0n)} USDC</span>
            </div>
          )}
        </div>

        {connected && publicKey ? (
          <div className="text-right font-mono text-xs text-white/40">
            <div className="text-white/60">
              {publicKey.toBase58().slice(0, 6)}…{publicKey.toBase58().slice(-4)}
            </div>
            <div className="mt-0.5">
              USDC {userUsdcBalance.data !== undefined ? formatUsdc(userUsdcBalance.data, 2) : '—'}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setVisible(true)}
            className="flex items-center gap-2 rounded-full border border-pink-500/30 bg-pink-500/10 px-5 py-2.5 text-sm font-semibold text-pink-300 transition-colors hover:bg-pink-500/20"
          >
            <Wallet className="h-4 w-4" />
            Connect Wallet
          </button>
        )}
      </div>

      {/* Tranche Cards */}
      <div className="grid gap-4 xl:grid-cols-3">
        {isLoading
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-72 animate-pulse rounded-xl border border-white/10 bg-white/[0.03]"
              />
            ))
          : data?.tranches.map((tranche) => {
              const userShares = userPositions.data?.[tranche.kind] ?? 0n;
              const userValue =
                tranche.navPerShareQ > 0n
                  ? (userShares * tranche.navPerShareQ) / Q64_ONE
                  : 0n;
              const targetBps = tranche.account?.targetApyBps as number | undefined;

              return (
                <article
                  key={tranche.key}
                  className={[
                    'flex flex-col rounded-xl border p-6 transition-shadow hover:shadow-lg',
                    tranche.border,
                    tranche.bg,
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Landmark className={['h-4 w-4', tranche.tone].join(' ')} />
                        <h2 className="text-base font-bold text-white">{tranche.label}</h2>
                      </div>
                      <p className={['mt-0.5 text-xs', riskColor(tranche.kind)].join(' ')}>
                        {riskLabel(tranche.kind)}
                      </p>
                    </div>
                    <span
                      className={[
                        'rounded-md px-2 py-1 font-mono text-sm font-semibold',
                        tranche.tone,
                      ].join(' ')}
                    >
                      {targetBps !== undefined ? apyLabel(targetBps) : '—'}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-white/45">NAV / share</div>
                      <div className="mt-1 font-mono text-xl text-white">
                        {formatNavQ(tranche.navPerShareQ)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-white/45">TVL</div>
                      <div className="mt-1 font-mono text-xl text-white">
                        {formatUsdc(tranche.totalAssets, 2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-white/45">Total shares</div>
                      <div className="mt-1 font-mono text-sm text-white/70">
                        {formatUsdc(tranche.totalSupply, 2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-white/45">Cum. yield</div>
                      <div className="mt-1 font-mono text-sm text-white/70">
                        {formatUsdc(tranche.cumulativeYield, 2)}
                      </div>
                    </div>
                  </div>

                  {/* User position */}
                  <div className="mt-5 rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="text-xs text-white/45">Your position</div>
                    {connected ? (
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        <span className="font-mono text-sm text-white">
                          {formatUsdc(userShares, 4)} shares
                        </span>
                        <span className="font-mono text-xs text-white/50">
                          ≈ {formatUsdc(userValue, 2)} USDC
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1 text-xs text-white/35">Connect wallet to view</div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      disabled={!connected}
                      onClick={() => openModal(tranche.kind, 'deposit')}
                      className="gap-1.5"
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      Deposit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!connected || userShares === 0n}
                      onClick={() => openModal(tranche.kind, 'withdraw')}
                      className="gap-1.5"
                    >
                      <ArrowUpFromLine className="h-3.5 w-3.5" />
                      Withdraw
                    </Button>
                  </div>
                </article>
              );
            })}
      </div>

      {/* Error banner */}
      {vaultState.error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Vault unavailable</div>
            <div className="mt-0.5 text-xs text-red-200/70">
              {(vaultState.error as Error).message}
            </div>
          </div>
        </div>
      ) : null}

      {/* Waterfall legend */}
      <div className="rounded-xl border border-white/10 bg-black/30 p-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
          How it works
        </h3>
        <div className="grid gap-3 text-xs text-white/55 sm:grid-cols-3">
          <div className="flex items-start gap-2">
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400/70" />
            <span>
              <span className="text-white/80">Yield waterfall</span> — Prime paid first, Core
              second, Alpha gets the residual.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/70" />
            <span>
              <span className="text-white/80">Loss cascade</span> — Alpha absorbs losses first,
              then Core, then Prime.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-400/70" />
            <span>
              <span className="text-white/80">NAV tokens</span> — Each share appreciates or
              depreciates in USDC value based on on-chain yield and loss events.
            </span>
          </div>
        </div>
      </div>

      {/* Deposit / Withdraw Dialog */}
      <Dialog open={!!modal} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent className="border-white/10 bg-zinc-950 sm:max-w-md">
          {modal && modalTranche ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-white">
                  {modal.mode === 'deposit' ? 'Deposit into' : 'Withdraw from'}{' '}
                  {modalTranche.label}
                </DialogTitle>
                <DialogDescription className="text-white/50">
                  {modal.mode === 'deposit'
                    ? `Enter the amount of USDC to deposit. You have ${formatUsdc(userUsdcBalance.data ?? 0n, 2)} USDC available.`
                    : `Enter the number of shares to burn. You hold ${formatUsdc(userPositions.data?.[modal.kind] ?? 0n, 4)} shares.`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs text-white/50">
                    {modal.mode === 'deposit' ? 'USDC amount' : 'Shares to burn'}
                  </label>
                  <Input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.000000"
                    className="border-white/10 bg-white/5 font-mono text-white"
                    disabled={isPending}
                  />
                </div>

                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 font-mono text-xs text-white/55">
                  <div className="flex justify-between">
                    <span>NAV per share</span>
                    <span>{formatNavQ(modalTranche.navPerShareQ)}</span>
                  </div>
                  <div className="mt-2 flex justify-between">
                    <span>{modal.mode === 'deposit' ? 'Estimated shares out' : 'Estimated USDC out'}</span>
                    <span className="text-white/80">{formatUsdc(expectedOutput, 4)}</span>
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setModal(null)}
                  disabled={isPending}
                  className="text-white/60 hover:text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={isPending || parsedAmount === 0n || !anchorWallet}
                  className="gap-2"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Awaiting signature…
                    </>
                  ) : modal.mode === 'deposit' ? (
                    'Deposit'
                  ) : (
                    'Withdraw'
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
