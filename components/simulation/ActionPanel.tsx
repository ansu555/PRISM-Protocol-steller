'use client';

import { BN } from '@coral-xyz/anchor';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
} from '@solana/spl-token';
import { useConnection, useWallet, useAnchorWallet } from '@solana/wallet-adapter-react';
import { Keypair, SYSVAR_RENT_PUBKEY, SystemProgram } from '@solana/web3.js';
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
  CLOAK_ORACLE_PUBKEY,
  DEFAULT_DEMO_LOAN_PRINCIPAL,
  DEFAULT_DEMO_LOSS_AMOUNT,
  DEFAULT_DEMO_YIELD_AMOUNT,
  ENCRYPT_ORACLE_PUBKEY,
  TRANCHE_CONFIG,
  TrancheKind,
  USDC_MINT,
  VAULT_ID,
} from '@/app/lib/constants';
import { delta, formatNavQ, formatUsdc, parseUsdc, toBigInt } from '@/app/lib/format';
import {
  getConfigPda,
  getCreditEventPda,
  getLoanPda,
  getLossBucketPda,
  getLpMintPda,
  getPoolPda,
  getPoolQuoteReservePda,
  getPoolTrancheReservePda,
  getTrancheMintPda,
  getTranchePda,
  getVaultPda,
  getVaultReservePda,
} from '@/app/lib/pda';
import { buildPrograms, type AnchorWallet } from '@/app/lib/program';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import mmSecret from '@/contracts/keys/mm.json';
import {
  useAttachEncryptScore,
  useEncryptHealth,
  useVerifyEncryptDefault,
} from '@/hooks/useEncryptHealth';
import { useUpsertLoan } from '@/hooks/useActiveLoans';
import { useCloakPayout, useRecordCloakPayout } from '@/hooks/useCloakPayout';
import { useIdentity } from '@/hooks/useIdentity';
import { useIdentityBalances } from '@/hooks/useIdentityBalances';
import { useSimulationActions } from '@/hooks/useSimulationActions';
import { useSimulationLog } from '@/hooks/useSimulationLog';
import { useReactivateVault } from '@/hooks/useReactivateVault';
import { useVaultState } from '@/hooks/useVaultState';

function bn(value: bigint) {
  return new BN(value.toString());
}

function mmKeypair() {
  return Keypair.fromSecretKey(Uint8Array.from(mmSecret as number[]));
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

export function ActionPanel() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const { publicKey } = useWallet();
  const queryClient = useQueryClient();
  const identity = useIdentity();
  const { data: balances } = useIdentityBalances();
  const { addEntry } = useSimulationLog();
  const { registerActions } = useSimulationActions();
  const vaultState = useVaultState();

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

  const common = useMemo(() => {
    const signer = wallet || identity.keypair;
    const { provider, core, amm } = buildPrograms(connection, signer);
    const [config] = getConfigPda(core.programId);
    const [vault] = getVaultPda(VAULT_ID, core.programId);
    const [reserve] = getVaultReservePda(vault, core.programId);
    const [lossBucket] = getLossBucketPda(vault, core.programId);
    const [loan] = getLoanPda(vault, 0, core.programId);
    return { provider, core, amm, config, vault, reserve, lossBucket, loan };
  }, [connection, identity.keypair, wallet]);

  async function tokenBalance(address: Awaited<ReturnType<typeof getAssociatedTokenAddress>>) {
    try {
      const balance = await connection.getTokenAccountBalance(address);
      return BigInt(balance.value.amount);
    } catch {
      return 0n;
    }
  }

  async function navSnapshot() {
    const programs = buildPrograms(connection, identity.keypair);
    const [vault] = getVaultPda(VAULT_ID, programs.core.programId);
    const parts = await Promise.all(
      ([TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const).map(async (kind) => {
        const [pda] = getTranchePda(vault, kind, programs.core.programId);
        const account = await programs.core.account.tranche.fetchNullable(pda);
        return `${TRANCHE_CONFIG[kind].label} NAV ${formatNavQ(account?.navPerShareQ ?? 0)}`;
      }),
    );
    return parts.join(' | ');
  }

  async function snapshot(signer: { publicKey: import('@solana/web3.js').PublicKey }, kind: TrancheKind) {
    const data = vaultState.data;
    const usdcMint = data?.usdcMint ?? USDC_MINT;
    const [vault] = getVaultPda(VAULT_ID, common.core.programId);
    const [mint] = getTrancheMintPda(vault, kind, common.core.programId);
    const userUsdcAta = await getAssociatedTokenAddress(usdcMint, signer.publicKey);
    const userTrancheAta = await getAssociatedTokenAddress(mint, signer.publicKey);
    const [poolTrancheReserve] = getPoolTrancheReservePda(mint, common.amm.programId);
    const [poolQuoteReserve] = getPoolQuoteReservePda(mint, common.amm.programId);
    return {
      walletUsdc: await tokenBalance(userUsdcAta),
      trancheShares: await tokenBalance(userTrancheAta),
      vaultReserve: await tokenBalance(common.reserve),
      lossBucket: await tokenBalance(common.lossBucket),
      ammTranche: await tokenBalance(poolTrancheReserve),
      ammQuote: await tokenBalance(poolQuoteReserve),
    };
  }

  function recordSuccess(
    action: string,
    role: string,
    before: Awaited<ReturnType<typeof snapshot>>,
    after: Awaited<ReturnType<typeof snapshot>>,
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
        'AMM Tranche Reserve': delta(before.ammTranche, after.ammTranche),
        'AMM Quote Reserve': delta(before.ammQuote, after.ammQuote),
      },
    });

    toast.success(`${action} confirmed`, {
      description: (
        <a 
          href={`https://explorer.solana.com/tx/${signature}?cluster=devnet`}
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
      const { core } = buildPrograms(connection, identity.keypair);
      const [vaultPda] = getVaultPda(VAULT_ID, core.programId);
      const [loanPda] = getLoanPda(vaultPda, loanId, core.programId);
      const loan = await core.account.loan.fetchNullable(loanPda);
      if (!loan) return;
      const stateKey = Object.keys(loan.state as Record<string, unknown>)[0] ?? 'Originated';
      await upsertLoan.mutateAsync({
        loanId,
        pda: loanPda.toBase58(),
        borrower: loan.borrower.toBase58(),
        principal: BigInt(loan.principal.toString()),
        aprBps: loan.aprBps,
        originationTs: Number(loan.originationTs.toString()),
        maturityTs: Number(loan.maturityTs.toString()),
        state: stateKey,
        totalRepaid: BigInt(loan.totalRepaid.toString()),
      });
    } catch {
      // non-critical — UI still works without DB sync
    }
  }

  const deposit = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(depositAmount);
      const before = await snapshot(identity.keypair, investorTranche);
      const usdcMint = vaultState.data?.usdcMint ?? USDC_MINT;
      const [tranche] = getTranchePda(common.vault, investorTranche, common.core.programId);
      const [mint] = getTrancheMintPda(common.vault, investorTranche, common.core.programId);
      const userPubkey = common.provider.publicKey;
      const signature = await common.core.methods
        .deposit(investorTranche, bn(amount))
        .accounts({
          user: userPubkey,
          config: common.config,
          vault: common.vault,
          tranche,
          trancheMint: mint,
          userUsdcAta: await getAssociatedTokenAddress(usdcMint, userPubkey),
          vaultUsdcReserve: common.reserve,
          userTrancheAta: await getAssociatedTokenAddress(mint, userPubkey),
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers(wallet ? [] : [identity.keypair])
        .rpc({ commitment: 'confirmed' });
      const after = await snapshot(identity.keypair, investorTranche);
      recordSuccess(
        `${identity.label} Deposit (${formatUsdc(amount)} USDC -> ${investorTrancheConfig.label})`,
        identity.label,
        before,
        after,
        await navSnapshot(),
        signature,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const withdraw = useMutation({
    mutationFn: async () => {
      const shares = parseUsdc(withdrawShares);
      const before = await snapshot(identity.keypair, investorTranche);
      const usdcMint = vaultState.data?.usdcMint ?? USDC_MINT;
      const [tranche] = getTranchePda(common.vault, investorTranche, common.core.programId);
      const [mint] = getTrancheMintPda(common.vault, investorTranche, common.core.programId);
      const userPubkey = common.provider.publicKey;
      const signature = await common.core.methods
        .withdraw(investorTranche, bn(shares))
        .accounts({
          user: userPubkey,
          config: common.config,
          vault: common.vault,
          tranche,
          trancheMint: mint,
          userUsdcAta: await getAssociatedTokenAddress(usdcMint, userPubkey),
          vaultUsdcReserve: common.reserve,
          userTrancheAta: await getAssociatedTokenAddress(mint, userPubkey),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers(wallet ? [] : [identity.keypair])
        .rpc({ commitment: 'confirmed' });
      const after = await snapshot(identity.keypair, investorTranche);
      recordSuccess(
        `${identity.label} Withdraw (${formatUsdc(shares)} ${investorTrancheConfig.label} shares)`,
        identity.label,
        before,
        after,
        await navSnapshot(),
        signature,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const accrueYield = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(yieldAmount);
      const authorityPubkey = common.provider.publicKey;
      const borrower = identity.identities.borrower.keypair;
      const before = await snapshot(borrower, TrancheKind.Prime);
      const signature = await common.core.methods
        .accrueYield(bn(amount))
        .accounts({
          authority: authorityPubkey,
          config: common.config,
          vault: common.vault,
          tranchePrime: getTranchePda(common.vault, TrancheKind.Prime, common.core.programId)[0],
          trancheCore: getTranchePda(common.vault, TrancheKind.Core, common.core.programId)[0],
          trancheAlpha: getTranchePda(common.vault, TrancheKind.Alpha, common.core.programId)[0],
          vaultUsdcReserve: common.reserve,
          borrower: borrower.publicKey,
          borrowerUsdcAta: await getAssociatedTokenAddress(vaultState.data?.usdcMint ?? USDC_MINT, borrower.publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([borrower]) // Anchor will automatically add common.provider.wallet if it's a signer in the account list
        .rpc({ commitment: 'confirmed' });
      const after = await snapshot(borrower, TrancheKind.Prime);
      recordSuccess('Admin Accrue Yield', 'Protocol Admin', before, after, await navSnapshot(), signature);
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const triggerDefault = useMutation({
    mutationFn: async () => {
      const amount = parseUsdc(lossAmount);
      const authorityPubkey = common.provider.publicKey;
      const admin = identity.identities.admin.keypair;
      const before = await snapshot(admin, TrancheKind.Alpha);
      const seq = Number(toBigInt(vaultState.data?.vault?.creditEventSeq ?? 0));
      const signature = await common.core.methods
        .triggerCreditEvent(0, bn(amount), 5000)
        .accounts({
          authority: authorityPubkey,
          config: common.config,
          vault: common.vault,
          tranchePrime: getTranchePda(common.vault, TrancheKind.Prime, common.core.programId)[0],
          trancheCore: getTranchePda(common.vault, TrancheKind.Core, common.core.programId)[0],
          trancheAlpha: getTranchePda(common.vault, TrancheKind.Alpha, common.core.programId)[0],
          vaultUsdcReserve: common.reserve,
          lossBucket: common.lossBucket,
          creditEvent: getCreditEventPda(common.vault, seq, common.core.programId)[0],
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });
      const after = await snapshot(identity.identities.admin.keypair, TrancheKind.Alpha);
      recordSuccess('Admin Trigger Default (50% demo severity)', 'Protocol Admin', before, after, await navSnapshot(), signature);
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  // ── Encrypt FHE flow ─────────────────────────────────────────────────────
  const verifyEncryptDefault = useVerifyEncryptDefault();
  const attachEncryptScore = useAttachEncryptScore();
  const encryptHealth = useEncryptHealth(common.loan);

  /**
   * Borrower's deterministic Encrypt-sealed-data commitment for the demo.
   * In production this is sha256 of the ciphertext returned by the Encrypt SDK
   * after sealing the borrower's credit data with the FHE oracle's pubkey.
   * For the demo we derive it deterministically from the borrower pubkey so it
   * matches whatever the mock oracle expects.
   */
  async function deriveDemoCommitment(): Promise<Uint8Array> {
    const borrowerKey = new Uint8Array(
      identity.identities.borrower.keypair.publicKey.toBytes(),
    );
    const subtle = globalThis.crypto?.subtle ?? null;
    if (subtle) {
      const digest = await subtle.digest('SHA-256', borrowerKey);
      return new Uint8Array(digest);
    }
    // Node fallback (SSR / API tests)
    const { createHash } = await import('node:crypto');
    return new Uint8Array(createHash('sha256').update(borrowerKey).digest());
  }

  const attachFheScore = useMutation({
    mutationFn: async () => {
      const borrower = identity.identities.borrower.keypair;
      const commitment = await deriveDemoCommitment();
      await attachEncryptScore.mutateAsync({
        borrower,
        loanPda: common.loan,
        configPda: common.config,
        commitment,
        encryptOracle: ENCRYPT_ORACLE_PUBKEY,
      });
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const verifyDefaultViaFhe = useMutation({
    mutationFn: async () => {
      const admin = identity.identities.admin.keypair;
      const programs = buildPrograms(connection, admin);
      const [encryptHealthPda] = (await import('@/app/lib/pda')).getEncryptHealthPda(
        common.loan,
        programs.core.programId,
      );
      const healthAcc = await programs.core.account.encryptLoanHealth.fetchNullable(
        encryptHealthPda,
      );
      if (!healthAcc) {
        throw new Error(
          'No FHE health record found. The borrower must run "Attach FHE Score" first.',
        );
      }
      const seq = Number(toBigInt(vaultState.data?.vault?.creditEventSeq ?? 0));
      const before = await snapshot(admin, TrancheKind.Alpha);
      const result = await verifyEncryptDefault.mutateAsync({
        signer: admin,
        loanPubkey: common.loan,
        scoreCommitment: new Uint8Array(healthAcc.scoreCommitment as number[]),
        configPda: common.config,
        vaultPda: common.vault,
        tranchePrimePda: getTranchePda(common.vault, TrancheKind.Prime, programs.core.programId)[0],
        trancheCorePda: getTranchePda(common.vault, TrancheKind.Core, programs.core.programId)[0],
        trancheAlphaPda: getTranchePda(common.vault, TrancheKind.Alpha, programs.core.programId)[0],
        vaultReservePda: common.reserve,
        lossBucketPda: common.lossBucket,
        creditEventPda: getCreditEventPda(common.vault, seq, programs.core.programId)[0],
        lossAmount: parseUsdc(lossAmount),
        severityBps: 5000,
      });
      const after = await snapshot(admin, TrancheKind.Alpha);
      recordSuccess(
        'Encrypt FHE — Default Proven',
        'Protocol Admin',
        before,
        after,
        await navSnapshot(),
        result.signature,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  // ── Cloak shielded payout flow ───────────────────────────────────────────
  const cloakPayout = useCloakPayout(common.vault);
  const recordCloakPayout = useRecordCloakPayout();

  const shieldYieldViaCloak = useMutation({
    mutationFn: async () => {
      const totalShieldedAmount = parseUsdc(yieldAmount);
      const admin = identity.identities.admin.keypair;
      const before = await snapshot(admin, TrancheKind.Prime);

      const result = await recordCloakPayout.mutateAsync({
        signer: admin,
        vaultPda: common.vault,
        configPda: common.config,
        totalShieldedAmount,
      });

      const after = await snapshot(admin, TrancheKind.Prime);
      recordSuccess(
        'Cloak — Shield Yield Batch',
        'Protocol Admin',
        before,
        after,
        await navSnapshot(),
        result.signature,
      );
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  async function sellOnAmm(signer: Keypair | AnchorWallet, kind: TrancheKind, amount: bigint, label: string) {
    const programs = buildPrograms(connection, signer);
    const before = await snapshot(signer, kind);
    const [mint] = getTrancheMintPda(common.vault, kind, programs.core.programId);
    const signature = await programs.amm.methods
      .swap(bn(amount), new BN(0), 0)
      .accounts({
        user: signer.publicKey,
        pool: getPoolPda(mint, programs.amm.programId)[0],
        trancheReserve: getPoolTrancheReservePda(mint, programs.amm.programId)[0],
        quoteReserve: getPoolQuoteReservePda(mint, programs.amm.programId)[0],
        userTrancheAta: await getAssociatedTokenAddress(mint, signer.publicKey),
        userQuoteAta: await getAssociatedTokenAddress(vaultState.data?.usdcMint ?? USDC_MINT, signer.publicKey),
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc({ commitment: 'confirmed' });
    const after = await snapshot(signer, kind);
    recordSuccess(label, signer.publicKey.toBase58(), before, after, await navSnapshot(), signature);
  }

  const emergencySell = useMutation({
    mutationFn: async () => {
      const signer = wallet || identity.keypair;
      await sellOnAmm(signer, investorTranche, parseUsdc(swapAmount), `${identity.label} AMM Emergency Exit`);
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const marketReaction = useMutation({
    mutationFn: async () => {
      const mm = mmKeypair();
      for (let i = 0; i < 5; i += 1) {
        await sellOnAmm(mm, TrancheKind.Alpha, 400_000_000n, `Market Reaction pALPHA sell ${i + 1}/5`);
      }
      for (let i = 0; i < 2; i += 1) {
        await sellOnAmm(mm, TrancheKind.Core, 250_000_000n, `Market Reaction pCORE sell ${i + 1}/2`);
      }
    },
    onSuccess: afterMutation,
    onError: (error) => toast.error(formatError(error)),
  });

  const disburse = useMutation({
    mutationFn: async () => {
      const adminPubkey = common.provider.publicKey;
      const borrower = identity.identities.borrower.keypair;
      const before = await snapshot(borrower, TrancheKind.Prime);
      const signature = await common.core.methods
        .disburseLoan()
        .accounts({
          admin: adminPubkey,
          config: common.config,
          vault: common.vault,
          loan: common.loan,
          vaultUsdcReserve: common.reserve,
          borrowerUsdcAta: await getAssociatedTokenAddress(vaultState.data?.usdcMint ?? USDC_MINT, borrower.publicKey),
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ commitment: 'confirmed' });
      const after = await snapshot(borrower, TrancheKind.Prime);
      recordSuccess('Borrower Disbursement (admin-authorized)', 'Borrower', before, after, await navSnapshot(), signature);
    },
    onSuccess: async () => {
      await afterMutation();
      await syncLoanToDb(0);
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const repay = useMutation({
    mutationFn: async () => {
      const borrowerPubkey = common.provider.publicKey;
      const amount = parseUsdc(loanAmount);
      const before = await snapshot({ publicKey: borrowerPubkey }, TrancheKind.Prime);
      const signature = await common.core.methods
        .repayLoan(bn(amount))
        .accounts({
          borrower: borrowerPubkey,
          config: common.config,
          vault: common.vault,
          loan: common.loan,
          borrowerUsdcAta: await getAssociatedTokenAddress(vaultState.data?.usdcMint ?? USDC_MINT, borrowerPubkey),
          vaultUsdcReserve: common.reserve,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });
      const after = await snapshot({ publicKey: borrowerPubkey }, TrancheKind.Prime);
      recordSuccess('Borrower Repay Loan', 'Borrower', before, after, await navSnapshot(), signature);
    },
    onSuccess: async () => {
      await afterMutation();
      await syncLoanToDb(0);
    },
    onError: (error) => toast.error(formatError(error)),
  });

  const initialize = useMutation({
    mutationFn: async () => {
      const adminPubkey = common.provider.publicKey;
      const [config] = getConfigPda(common.core.programId);
      const [vault] = getVaultPda(VAULT_ID, common.core.programId);
      const [reserve] = getVaultReservePda(vault, common.core.programId);
      const [lossBucket] = getLossBucketPda(vault, common.core.programId);
      const [loan] = getLoanPda(vault, 0, common.core.programId);

      if (!(await common.core.account.globalConfig.fetchNullable(config))) {
        await common.core.methods
          .initializeGlobalConfig(0, [
            identity.identities.borrower.keypair.publicKey,
            ENCRYPT_ORACLE_PUBKEY,
            CLOAK_ORACLE_PUBKEY,
          ])
          .accounts({
            admin: adminPubkey,
            config,
            usdcMint: vaultState.data?.usdcMint ?? USDC_MINT,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'confirmed' });
      }

      if (!(await common.core.account.vault.fetchNullable(vault))) {
        await common.core.methods
          .initializeVault(VAULT_ID)
          .accounts({ admin: adminPubkey, config, vault, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
        await common.core.methods
          .initializeVaultReserves()
          .accounts({
            admin: adminPubkey,
            config,
            vault,
            usdcMint: vaultState.data?.usdcMint ?? USDC_MINT,
            vaultUsdcReserve: reserve,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'confirmed' });
        await common.core.methods
          .initializeVaultLossBucket()
          .accounts({
            admin: adminPubkey,
            config,
            vault,
            usdcMint: vaultState.data?.usdcMint ?? USDC_MINT,
            lossBucket,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'confirmed' });
      }

      for (const kind of [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const) {
        const [tranche] = getTranchePda(vault, kind, common.core.programId);
        if (await common.core.account.tranche.fetchNullable(tranche)) continue;
        await common.core.methods
          .initializeTranche(kind, kind === TrancheKind.Prime ? 500 : kind === TrancheKind.Core ? 800 : 1500)
          .accounts({
            admin: adminPubkey,
            config,
            vault,
            tranche,
            trancheMint: getTrancheMintPda(vault, kind, common.core.programId)[0],
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc({ commitment: 'confirmed' });
      }

      if (!(await common.core.account.loan.fetchNullable(loan))) {
        await common.core.methods
          .initializeLoan(
            0,
            bn(DEFAULT_DEMO_LOAN_PRINCIPAL),
            800,
            new BN(Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60),
            identity.identities.borrower.keypair.publicKey,
          )
          .accounts({ admin: adminPubkey, config, vault, loan, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
      }

      const usdcMint = vaultState.data?.usdcMint ?? USDC_MINT;

      // Initialize AMM pools for each tranche
      for (const kind of [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const) {
        const [trancheMint] = getTrancheMintPda(vault, kind, common.core.programId);
        const [pool] = getPoolPda(trancheMint, common.amm.programId);
        if (!(await common.amm.account.ammPool.fetchNullable(pool))) {
          await common.amm.methods
            .initializePool(30)
            .accounts({
              admin: adminPubkey,
              trancheMint,
              quoteMint: usdcMint,
              pool,
              systemProgram: SystemProgram.programId,
            })
            .rpc({ commitment: 'confirmed' });
          await common.amm.methods
            .initializePoolReserves()
            .accounts({
              admin: adminPubkey,
              pool,
              trancheMint,
              quoteMint: usdcMint,
              trancheReserve: getPoolTrancheReservePda(trancheMint, common.amm.programId)[0],
              quoteReserve: getPoolQuoteReservePda(trancheMint, common.amm.programId)[0],
              lpMint: getLpMintPda(trancheMint, common.amm.programId)[0],
              tokenProgram: TOKEN_PROGRAM_ID,
              systemProgram: SystemProgram.programId,
            })
            .rpc({ commitment: 'confirmed' });
        }
      }

      // Ensure borrower USDC ATA exists
      const borrower = identity.identities.borrower.keypair;
      const borrowerAta = await getAssociatedTokenAddress(usdcMint, borrower.publicKey);
      if (!(await connection.getAccountInfo(borrowerAta))) {
        const { Transaction: Tx } = await import('@solana/web3.js');
        const tx = new Tx().add(
          createAssociatedTokenAccountInstruction(adminPubkey, borrowerAta, borrower.publicKey, usdcMint),
        );
        // If wallet connected, use wallet to send this one-off tx
        if (wallet) {
          tx.feePayer = adminPubkey;
          tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
          const signed = await wallet.signTransaction(tx);
          await connection.sendRawTransaction(signed.serialize());
        } else {
          await common.provider.sendAndConfirm(tx, [identity.identities.admin.keypair]);
        }
      }

      addEntry({
        action: 'Initialize Vault Scaffold',
        role: 'Protocol Admin',
        status: 'info',
        message: 'Config, vault, reserves, tranches, loan, AMM pools, and borrower ATA were checked or initialized on-chain.',
        navSnapshot: await navSnapshot(),
        deltas: {},
      });
    },
    onSuccess: async () => {
      await afterMutation();
      await syncLoanToDb(0);
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

  const cloakAlreadyShielded = cloakPayout.data?.status === 'Shielded';

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
    attachFheScore.isPending ||
    verifyDefaultViaFhe.isPending ||
    verifyEncryptDefault.isPending ||
    attachEncryptScore.isPending ||
    shieldYieldViaCloak.isPending ||
    recordCloakPayout.isPending ||
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
            <div className="mt-3">
              <Button
                disabled={busy || cloakAlreadyShielded}
                variant="outline"
                onClick={() => shieldYieldViaCloak.mutate()}
                className="w-full gap-2 border-sky-300/30 text-sky-200 hover:bg-sky-300/10"
                title="Verifies Cloak oracle attestation and records a shielded batch payout"
              >
                <Lock className="h-4 w-4" />
                {shieldYieldViaCloak.isPending
                  ? 'Shielding Yield via Cloak…'
                  : cloakAlreadyShielded
                    ? 'Yield Already Shielded via Cloak'
                    : 'Shield Yield via Cloak 🔒'}
              </Button>
              <p className="mt-1 font-mono text-[10px] text-white/40">
                {cloakPayout.data
                  ? `Cloak status: ${cloakPayout.data.status}`
                  : 'No Cloak payout record yet.'}
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Button disabled={busy} variant="outline" onClick={() => marketReaction.mutate()} className="w-full gap-2">
                <Flame className="h-4 w-4" />
                Run Market Reaction
              </Button>
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
