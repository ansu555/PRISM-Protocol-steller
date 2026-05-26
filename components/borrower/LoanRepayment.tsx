'use client';

import { useEffect, useState } from 'react';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { AnchorProvider, Program, BN, type Idl } from '@coral-xyz/anchor';
import { SystemProgram } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { toast } from 'sonner';
import { Banknote, CheckCircle2, CreditCard, Loader2, ShieldCheck } from 'lucide-react';

import {
  PRISM_CORE_PROGRAM_ID,
  USDC_MINT,
  VAULT_ID,
} from '@/app/lib/constants';
import {
  getConfigPda,
  getVaultPda,
  getVaultReservePda,
  getLoanPda,
} from '@/app/lib/pda';
import prismCoreIdl from '@/app/lib/idl/prism_core.json';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDodoCheckout } from '@/hooks/useDodoCheckout';
import {
  useFiatRepaymentStatus,
  type FiatRepaymentStatus,
} from '@/hooks/useFiatRepaymentStatus';

interface LoanRepaymentProps {
  loanId: number;
  vaultId?: number;
}

export function LoanRepayment({ loanId, vaultId = VAULT_ID }: LoanRepaymentProps) {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const [repayAmount, setRepayAmount] = useState('');
  const [fiatAmount, setFiatAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const dodoCheckout = useDodoCheckout();
  const fiatStatusQuery = useFiatRepaymentStatus(loanId);
  const fiatStatus = (fiatStatusQuery.data?.status ?? 'none') as FiatRepaymentStatus;
  const fiatTxSig = fiatStatusQuery.data?.txSig ?? null;
  const creditedAmountUsdMicro = fiatStatusQuery.data?.amountUsdMicro;
  const fiatPaymentId = fiatStatusQuery.data?.paymentId ?? null;

  // Track which credited Dodo intents have already been settled on-chain.
  // Keyed by paymentId — survives reloads via localStorage.
  const [onChainTxSig, setOnChainTxSig] = useState<string | null>(null);
  const settledKey = fiatPaymentId ? `prism_dodo_settled_${fiatPaymentId}` : null;
  useEffect(() => {
    if (!settledKey) return;
    const cached = localStorage.getItem(settledKey);
    setOnChainTxSig(cached);
  }, [settledKey]);
  const alreadySettled = !!onChainTxSig;

  // ── On-chain settlement (existing path, refactored to accept an amount) ──
  async function settleOnChain(amountUsd: number) {
    if (!wallet) {
      toast.error('Connect wallet first');
      return;
    }
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      toast.error('Enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
      });
      const core = new Program(prismCoreIdl as Idl, provider) as any;

      const [config] = getConfigPda(PRISM_CORE_PROGRAM_ID);
      const [vault] = getVaultPda(vaultId, PRISM_CORE_PROGRAM_ID);
      const [reserve] = getVaultReservePda(vault, PRISM_CORE_PROGRAM_ID);
      const [loan] = getLoanPda(vault, loanId, PRISM_CORE_PROGRAM_ID);

      const amount = new BN(Math.round(amountUsd * 1_000_000));
      const borrowerUsdcAta = await getAssociatedTokenAddress(
        USDC_MINT,
        wallet.publicKey,
      );

      const sig = await core.methods
        .repayLoan(amount)
        .accounts({
          borrower: wallet.publicKey,
          config,
          vault,
          loan,
          borrowerUsdcAta,
          vaultUsdcReserve: reserve,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      toast.success('Repayment settled on-chain');
      setRepayAmount('');
      console.log('Repayment signature:', sig);
    } catch (e: any) {
      console.error(e);
      toast.error(`Repayment failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  function handleManualRepay() {
    void settleOnChain(parseFloat(repayAmount));
  }

  function handleSettleFromFiat() {
    if (alreadySettled) {
      toast.info('This payment has already been settled on-chain');
      return;
    }
    if (!creditedAmountUsdMicro) {
      toast.error('No credited amount yet — wait for the webhook to confirm');
      return;
    }
    const amountUsd = Number(BigInt(creditedAmountUsdMicro)) / 1_000_000;
    void settleOnChainAndMark(amountUsd);
  }

  async function settleOnChainAndMark(amountUsd: number) {
    if (!wallet || !settledKey) return;
    setLoading(true);
    try {
      const provider = new AnchorProvider(connection, wallet as any, {
        commitment: 'confirmed',
      });
      const core = new Program(prismCoreIdl as Idl, provider) as any;

      const [config] = getConfigPda(PRISM_CORE_PROGRAM_ID);
      const [vault] = getVaultPda(vaultId, PRISM_CORE_PROGRAM_ID);
      const [reserve] = getVaultReservePda(vault, PRISM_CORE_PROGRAM_ID);
      const [loan] = getLoanPda(vault, loanId, PRISM_CORE_PROGRAM_ID);

      const amount = new BN(Math.round(amountUsd * 1_000_000));
      const borrowerUsdcAta = await getAssociatedTokenAddress(
        USDC_MINT,
        wallet.publicKey,
      );

      const sig = await core.methods
        .repayLoan(amount)
        .accounts({
          borrower: wallet.publicKey,
          config,
          vault,
          loan,
          borrowerUsdcAta,
          vaultUsdcReserve: reserve,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      localStorage.setItem(settledKey, sig);
      setOnChainTxSig(sig);
      toast.success('Repayment settled on-chain');
      console.log('Settlement signature:', sig);
    } catch (e: any) {
      console.error(e);
      const msg = e?.message ?? 'Repayment failed';
      if (typeof msg === 'string' && msg.includes('0x1')) {
        toast.error(
          'Insufficient USDC — this payment may already be settled. Refresh to verify.',
        );
      } else {
        toast.error(`Repayment failed: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }

  // ── Dodo checkout submit ────────────────────────────────────────────────
  function handleStartDodo() {
    if (!wallet) {
      toast.error('Connect wallet first');
      return;
    }
    const amount = parseFloat(fiatAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    dodoCheckout.mutate({
      loanId,
      amountUsd: amount,
      borrowerPubkey: wallet.publicKey.toBase58(),
    });
  }

  // ── Tab auto-switch when returning from Dodo redirect ──────────────────
  const [tab, setTab] = useState<'usdc' | 'fiat'>('usdc');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('dodo') === 'success') {
      setTab('fiat');
    }
  }, []);

  return (
    <div className="rounded-md border border-white/10 bg-black/35 p-6 shadow-[0_8px_24px_rgba(60,46,22,0.05)]">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Banknote className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Loan Repayment</h3>
          <p className="text-sm text-emerald-400/70">Loan ID: {loanId}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'usdc' | 'fiat')}>
        <TabsList className="grid w-full grid-cols-2 bg-white/[0.04]">
          <TabsTrigger value="usdc">Repay with USDC</TabsTrigger>
          <TabsTrigger value="fiat">Pay with Dodo (UPI/Cards)</TabsTrigger>
        </TabsList>

        <TabsContent value="usdc" className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="text-xs text-white/30 uppercase font-bold tracking-widest">
              Amount to Repay (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-white/20 uppercase">
                USDC
              </div>
            </div>
          </div>

          <button
            onClick={handleManualRepay}
            disabled={loading || !repayAmount}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30 py-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/30 disabled:opacity-40 transition-all shadow-[0_0_20px_rgba(16,185,129,0.05)]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Complete Repayment
              </>
            )}
          </button>

          <p className="text-xs text-center text-white/30 leading-relaxed italic">
            Repayment will restore the vault&apos;s USDC reserves. Once fully repaid,
            your IKA collateral will be eligible for withdrawal.
          </p>
        </TabsContent>

        <TabsContent value="fiat" className="mt-4 space-y-4">
          <FiatStatusBanner status={fiatStatus} txSig={fiatTxSig} />

          {fiatStatus !== 'credited' ? (
            <>
              <div className="space-y-2">
                <label className="text-xs text-white/30 uppercase font-bold tracking-widest">
                  Amount to Pay (USD)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={fiatAmount}
                    onChange={(e) => setFiatAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                    disabled={
                      fiatStatus === 'pending' ||
                      fiatStatus === 'paid' ||
                      dodoCheckout.isPending
                    }
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-white/20 uppercase">
                    USD
                  </div>
                </div>
              </div>

              <button
                onClick={handleStartDodo}
                disabled={
                  !fiatAmount ||
                  dodoCheckout.isPending ||
                  fiatStatus === 'pending' ||
                  fiatStatus === 'paid'
                }
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-500/20 border border-purple-500/30 py-3 text-sm font-semibold text-purple-100 hover:bg-purple-500/30 disabled:opacity-40 transition-all"
              >
                {dodoCheckout.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    Pay with Dodo
                  </>
                )}
              </button>
              <p className="text-xs text-center text-white/30 italic">
                UPI, cards, and 40+ payment methods across 220+ countries via Dodo
                Payments. Fiat is bridged to USDC server-side; you sign the final
                on-chain settlement yourself.
              </p>
            </>
          ) : alreadySettled ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 flex items-start gap-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="font-semibold">Settled on-chain</div>
                  <div className="text-sm opacity-80 mt-0.5">
                    Your fiat payment has been bridged to USDC and the loan was
                    repaid on Solana. Vault reserve restored.
                  </div>
                  <a
                    href={`https://explorer.solana.com/tx/${onChainTxSig}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block break-all text-sm underline opacity-80 hover:opacity-100"
                  >
                    {onChainTxSig?.slice(0, 24)}…
                  </a>
                </div>
              </div>
              <p className="text-xs text-center text-white/30 italic">
                If your loan is fully repaid, head back to the collateral panel
                to release your IKA-attested collateral.
              </p>
            </div>
          ) : (
            <button
              onClick={handleSettleFromFiat}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-500/30 border border-emerald-500/50 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/40 disabled:opacity-40 transition-all shadow-[0_0_24px_rgba(16,185,129,0.18)]"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Sign on-chain settlement
                </>
              )}
            </button>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FiatStatusBanner({
  status,
  txSig,
}: {
  status: FiatRepaymentStatus;
  txSig: string | null;
}) {
  if (status === 'none') return null;
  const meta = STATUS_META[status];
  return (
    <div
      className={
        'rounded-md border px-3 py-3 text-xs flex items-start gap-3 ' + meta.classes
      }
    >
      <div className="mt-0.5">{meta.icon}</div>
      <div className="flex-1">
        <div className="font-semibold">{meta.title}</div>
        <div className="text-sm opacity-80">{meta.body}</div>
        {txSig ? (
          <a
            href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-block break-all underline opacity-80 hover:opacity-100"
          >
            {txSig.slice(0, 16)}…
          </a>
        ) : null}
      </div>
    </div>
  );
}

const STATUS_META: Record<
  Exclude<FiatRepaymentStatus, 'none'>,
  { title: string; body: string; classes: string; icon: React.ReactNode }
> = {
  pending: {
    title: 'Awaiting fiat payment',
    body: 'Complete the checkout on Dodo. We will pick up the webhook automatically.',
    classes: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  paid: {
    title: 'Fiat received — bridging USDC',
    body: 'Dodo confirmed your payment. Admin treasury is sending USDC to your wallet.',
    classes: 'border-blue-500/30 bg-blue-500/10 text-blue-100',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  credited: {
    title: 'USDC received — sign to settle',
    body: 'The bridge transfer landed. Sign the on-chain settlement to repay your loan.',
    classes: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  failed: {
    title: 'Payment failed',
    body: 'Dodo reported the payment did not complete. Try again or use direct USDC.',
    classes: 'border-red-500/30 bg-red-500/10 text-red-200',
    icon: <Banknote className="h-4 w-4" />,
  },
};
