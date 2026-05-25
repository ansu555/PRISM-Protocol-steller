'use client';

import { useState } from 'react';
import {
  Activity,
  BarChart,
  ChevronRight,
  Database,
  Filter,
  Layers,
  Shield,
  TrendingUp,
} from 'lucide-react';
import { useLoanApplications } from '@/hooks/useLoanApplications';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useVaultState } from '@/hooks/useVaultState';
import { formatNavQ, formatUsdc } from '@/app/lib/format';
import { AnchorProvider, Program, BN, type Idl } from '@coral-xyz/anchor';
import { SystemProgram, SYSVAR_RENT_PUBKEY, PublicKey, Transaction, Keypair } from '@solana/web3.js';
import adminSecret from '@/contracts/keys/admin.json';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createMintToInstruction,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { toast } from 'sonner';

import { ActionPanel } from '@/components/simulation/ActionPanel';
import { LoanList } from '@/components/simulation/LoanList';
import { useSelectedVaultId } from '@/hooks/useSelectedVault';
import { useVaultList, useRegisterVault } from '@/hooks/useVaultRegistry';
import {
  PRISM_CORE_PROGRAM_ID,
  PRISM_AMM_PROGRAM_ID,
  USDC_MINT,
  VAULT_ID,
  TrancheKind,
} from '@/app/lib/constants';
import {
  getConfigPda,
  getVaultPda,
  getTranchePda,
  getTrancheMintPda,
  getVaultReservePda,
  getLossBucketPda,
  getLoanPda,
  getCreditEventPda,
  getIkaCollateralPda,
  getPoolPda,
  getPoolTrancheReservePda,
  getPoolQuoteReservePda,
  getLpMintPda,
} from '@/app/lib/pda';
import prismCoreIdl from '@/app/lib/idl/prism_core.json';
import prismAmmIdl from '@/app/lib/idl/prism_amm.json';
import { buildPrograms } from '@/app/lib/program';

import {
  useIkaCollateralAccount,
} from '@/hooks/useIkaCollateral';

type StepStatus = 'idle' | 'running' | 'done' | 'error';

const SETUP_STEPS = [
  'Global Config',
  'Vault + Reserves',
  'Tranches',
  'Loan',
  'AMM Pools',
];

export function AdminPanel() {
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const { applications, approve, reject } = useLoanApplications();
  const [log, setLog] = useState<string[]>([]);
  const [setupRunning, setSetupRunning] = useState(false);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    SETUP_STEPS.map(() => 'idle'),
  );

  // Manual parameters state
  const [params, setParams] = useState({
    loanPrincipal: '20000',
    loanApr: '8',
    loanMaturityDays: '365',
    yieldAmount: '100',
    lossAmount: '6500',
    severity: '100',
    repayAmount: '20000',
    faucetAmount: '1000',
  });

  const [activeMode, setActiveMode] = useState<'auto' | 'manual'>('auto');
  const [logFilter, setLogFilter] = useState('');
  const [showPdaInspector, setShowPdaInspector] = useState(false);

  // Live on-chain data
  const vaultState = useVaultState();
  const vd = vaultState.data;
  const tvl = (vd?.tranches ?? []).reduce((sum, t) => sum + t.totalAssets, 0n);
  const reserveBal = vd?.reserveBalance ?? 0n;
  const lossBucketBal = vd?.lossBucketBalance ?? 0n;
  const totalExposure = applications
    .filter(a => a.status === 'approved')
    .reduce((sum, a) => sum + BigInt(Math.round(a.requestedUSDC * 1_000_000)), 0n);
  const isHealthy = lossBucketBal === 0n;
  const filteredLog = logFilter
    ? log.filter(l => l.toLowerCase().includes(logFilter.toLowerCase()))
    : log;

  // ── Multi-vault ──────────────────────────────────────────────────────────
  const { vaultId: selectedVaultId, setVaultId: setSelectedVaultId } = useSelectedVaultId();
  const { data: registeredVaults } = useVaultList();
  const registerVaultMutation = useRegisterVault();
  const [newVaultForm, setNewVaultForm] = useState({
    name: '',
    primeBps: '500',
    coreBps: '800',
    alphaBps: '1500',
    loanPrincipal: '20000',
    maturityDays: '365',
  });
  const [vaultCreateRunning, setVaultCreateRunning] = useState(false);

  function nextVaultId(): number {
    if (!registeredVaults || registeredVaults.length === 0) return 1;
    return Math.max(...registeredVaults.map((v) => v.vault_id)) + 1;
  }

  async function handleCreateVault() {
    if (!wallet || !newVaultForm.name.trim()) return;
    const id = nextVaultId();
    setVaultCreateRunning(true);
    addLog(`Creating vault #${id} "${newVaultForm.name}"…`);
    try {
      const { core, amm, adminKeypair } = getPrograms();
      const admin = adminKeypair.publicKey;
      const [config] = getConfigPda(PRISM_CORE_PROGRAM_ID);
      const [vault] = getVaultPda(id, PRISM_CORE_PROGRAM_ID);
      const [reserve] = getVaultReservePda(vault, PRISM_CORE_PROGRAM_ID);
      const [lossBucket] = getLossBucketPda(vault, PRISM_CORE_PROGRAM_ID);
      const [loan] = getLoanPda(vault, 0, PRISM_CORE_PROGRAM_ID);

      // Config (shared — skip if exists)
      if (!(await core.account.globalConfig.fetchNullable(config))) {
        const TEST_ORACLE = new PublicKey('5nmEq5cNc9yXpK1ySrb4XH65zccBvRK2hwKnEJePjcrf');
        await core.methods
          .initializeGlobalConfig(0, [admin, TEST_ORACLE])
          .accounts({ admin, config, usdcMint: USDC_MINT, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
      }

      // Vault
      if (!(await core.account.vault.fetchNullable(vault))) {
        await core.methods
          .initializeVault(id)
          .accounts({ admin, config, vault, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
        addLog(`✓ Vault #${id} created`);
        await core.methods
          .initializeVaultReserves()
          .accounts({ admin, config, vault, usdcMint: USDC_MINT, vaultUsdcReserve: reserve, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
        await core.methods
          .initializeVaultLossBucket()
          .accounts({ admin, config, vault, usdcMint: USDC_MINT, lossBucket, tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
        addLog('✓ Reserves initialized');
      }

      // Tranches with custom APR bps
      const aprMap = [Number(newVaultForm.primeBps), Number(newVaultForm.coreBps), Number(newVaultForm.alphaBps)];
      for (const kind of [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const) {
        const [tranche] = getTranchePda(vault, kind, PRISM_CORE_PROGRAM_ID);
        if (!(await core.account.tranche.fetchNullable(tranche))) {
          await core.methods
            .initializeTranche(kind, aprMap[kind])
            .accounts({
              admin, config, vault, tranche,
              trancheMint: getTrancheMintPda(vault, kind, PRISM_CORE_PROGRAM_ID)[0],
              tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId, rent: SYSVAR_RENT_PUBKEY,
            })
            .rpc({ commitment: 'confirmed' });
        }
      }
      addLog('✓ Tranches initialized');

      // Loan
      const principal = BigInt(Math.round(Number(newVaultForm.loanPrincipal) * 1_000_000));
      const maturityTs = Math.floor(Date.now() / 1000) + Number(newVaultForm.maturityDays) * 86400;
      if (!(await core.account.loan.fetchNullable(loan))) {
        await core.methods
          .initializeLoan(0, new BN(principal.toString()), Number(newVaultForm.coreBps), new BN(maturityTs), adminKeypair.publicKey)
          .accounts({ admin, config, vault, loan, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
        addLog('✓ Loan initialized');
      }

      // AMM pools
      for (const kind of [TrancheKind.Prime, TrancheKind.Core, TrancheKind.Alpha] as const) {
        const [trancheMint] = getTrancheMintPda(vault, kind, PRISM_CORE_PROGRAM_ID);
        const [pool] = getPoolPda(trancheMint, PRISM_AMM_PROGRAM_ID);
        if (!(await amm.account.ammPool.fetchNullable(pool))) {
          await amm.methods.initializePool(30)
            .accounts({ admin, trancheMint, quoteMint: USDC_MINT, pool, systemProgram: SystemProgram.programId })
            .rpc({ commitment: 'confirmed' });
          await amm.methods.initializePoolReserves()
            .accounts({
              admin, pool, trancheMint, quoteMint: USDC_MINT,
              trancheReserve: getPoolTrancheReservePda(trancheMint, PRISM_AMM_PROGRAM_ID)[0],
              quoteReserve: getPoolQuoteReservePda(trancheMint, PRISM_AMM_PROGRAM_ID)[0],
              lpMint: getLpMintPda(trancheMint, PRISM_AMM_PROGRAM_ID)[0],
              tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
            })
            .rpc({ commitment: 'confirmed' });
        }
      }
      addLog('✓ AMM pools initialized');

      // Register in DB
      await registerVaultMutation.mutateAsync({
        vaultId: id,
        name: newVaultForm.name.trim(),
        primeBps: Number(newVaultForm.primeBps),
        coreBps: Number(newVaultForm.coreBps),
        alphaBps: Number(newVaultForm.alphaBps),
        loanPrincipal: principal,
        maturityDays: Number(newVaultForm.maturityDays),
      });

      addLog(`✓ Vault #${id} "${newVaultForm.name}" registered`);
      setNewVaultForm({ name: '', primeBps: '500', coreBps: '800', alphaBps: '1500', loanPrincipal: '20000', maturityDays: '365' });
      setSelectedVaultId(id);
      toast.success(`Vault #${id} created and selected`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog(`✗ ${msg}`);
      toast.error(msg.slice(0, 120));
    } finally {
      setVaultCreateRunning(false);
    }
  }

  // Track collateral for the most recent approved loan
  const lastApprovedLoan = applications
    .filter(a => a.status === 'approved' && a.loanId !== undefined)
    .sort((a, b) => b.submittedAt - a.submittedAt)[0];
  
  const currentLoanId = lastApprovedLoan?.loanId ?? 0;
  const pdas = getPdas(currentLoanId);
  const { data: ikaCollateral } = useIkaCollateralAccount(pdas.loan);
  const ikaStatus = ikaCollateral?.status;

  function addLog(msg: string) {
    setLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }

  function setStep(i: number, status: StepStatus) {
    setStepStatuses((prev) => {
      const next = [...prev];
      next[i] = status;
      return next;
    });
  }

  function getAdminKeypair() {
    return Keypair.fromSecretKey(Uint8Array.from(adminSecret as number[]));
  }

  function getPrograms() {
    const admin = getAdminKeypair();
    const { core, amm } = buildPrograms(connection, admin);
    return { core, amm, adminKeypair: admin };
  }

  function getPdas(loanId: number = 0) {
    const [config] = getConfigPda(PRISM_CORE_PROGRAM_ID);
    const [vault] = getVaultPda(VAULT_ID, PRISM_CORE_PROGRAM_ID);
    const [trancheP] = getTranchePda(vault, TrancheKind.Prime, PRISM_CORE_PROGRAM_ID);
    const [trancheC] = getTranchePda(vault, TrancheKind.Core, PRISM_CORE_PROGRAM_ID);
    const [trancheA] = getTranchePda(vault, TrancheKind.Alpha, PRISM_CORE_PROGRAM_ID);
    const [mintP] = getTrancheMintPda(vault, TrancheKind.Prime, PRISM_CORE_PROGRAM_ID);
    const [mintC] = getTrancheMintPda(vault, TrancheKind.Core, PRISM_CORE_PROGRAM_ID);
    const [mintA] = getTrancheMintPda(vault, TrancheKind.Alpha, PRISM_CORE_PROGRAM_ID);
    const [reserve] = getVaultReservePda(vault, PRISM_CORE_PROGRAM_ID);
    const [lossBucket] = getLossBucketPda(vault, PRISM_CORE_PROGRAM_ID);
    const [loan] = getLoanPda(vault, loanId, PRISM_CORE_PROGRAM_ID);
    const [poolP] = getPoolPda(mintP, PRISM_AMM_PROGRAM_ID);
    const [poolC] = getPoolPda(mintC, PRISM_AMM_PROGRAM_ID);
    const [poolA] = getPoolPda(mintA, PRISM_AMM_PROGRAM_ID);
    return {
      config, vault,
      tranches: { prime: trancheP, core: trancheC, alpha: trancheA },
      mints: { prime: mintP, core: mintC, alpha: mintA },
      reserve, lossBucket, loan,
      pools: { prime: poolP, core: poolC, alpha: poolA },
    };
  }

  // ── Individual Step Functions ──────────────────────────────────────────

  async function setupGlobalConfig() {
    const { core, adminKeypair } = getPrograms();
    const p = getPdas();
    const admin = adminKeypair.publicKey;
    setStep(0, 'running');
    try {
      console.log('Using config PDA:', p.config.toBase58());
      const TEST_ORACLE = new PublicKey('5nmEq5cNc9yXpK1ySrb4XH65zccBvRK2hwKnEJePjcrf');
      const existing = await core.account.globalConfig.fetchNullable(p.config);
      if (existing) {
        addLog('Global config already exists — skipping');
      } else {
        await core.methods
          .initializeGlobalConfig(0, [admin, TEST_ORACLE])
          .accounts({ admin, config: p.config, usdcMint: USDC_MINT, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
        addLog('✓ Global config initialized');
      }
      setStep(0, 'done');
      return true;
    } catch (e: any) {
      addLog(`✗ Global config: ${e.message}`);
      console.error(e);
      setStep(0, 'error');
      return false;
    }
  }

  async function setupVault() {
    const { core, adminKeypair } = getPrograms();
    const p = getPdas();
    const admin = adminKeypair.publicKey;
    setStep(1, 'running');
    try {
      const existing = await core.account.vault.fetchNullable(p.vault);
      if (existing) {
        addLog('Vault already exists — skipping');
      } else {
        await core.methods
          .initializeVault(VAULT_ID)
          .accounts({ admin, config: p.config, vault: p.vault, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
        addLog('✓ Vault created');

        await core.methods
          .initializeVaultReserves()
          .accounts({
            admin, config: p.config, vault: p.vault, usdcMint: USDC_MINT,
            vaultUsdcReserve: p.reserve, tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'confirmed' });
        addLog('✓ Vault reserve initialized');

        await core.methods
          .initializeVaultLossBucket()
          .accounts({
            admin, config: p.config, vault: p.vault, usdcMint: USDC_MINT,
            lossBucket: p.lossBucket, tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'confirmed' });
        addLog('✓ Loss bucket initialized');
      }
      setStep(1, 'done');
      return true;
    } catch (e: any) {
      addLog(`✗ Vault: ${e.message}`);
      console.error(e);
      setStep(1, 'error');
      return false;
    }
  }

  async function setupTranches() {
    const { core, adminKeypair } = getPrograms();
    const p = getPdas();
    const admin = adminKeypair.publicKey;
    setStep(2, 'running');
    try {
      const trancheParams = [
        { kind: TrancheKind.Prime, apy: 500,  pda: p.tranches.prime, mint: p.mints.prime, label: 'Prime' },
        { kind: TrancheKind.Core,  apy: 800,  pda: p.tranches.core,  mint: p.mints.core,  label: 'Core'  },
        { kind: TrancheKind.Alpha, apy: 1500, pda: p.tranches.alpha, mint: p.mints.alpha, label: 'Alpha' },
      ];
      for (const t of trancheParams) {
        const existing = await core.account.tranche.fetchNullable(t.pda);
        if (existing) {
          addLog(`${t.label} tranche already exists — skipping`);
          continue;
        }
        await core.methods
          .initializeTranche(t.kind, t.apy)
          .accounts({
            admin, config: p.config, vault: p.vault,
            tranche: t.pda, trancheMint: t.mint,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc({ commitment: 'confirmed' });
        addLog(`✓ ${t.label} tranche initialized`);
      }
      setStep(2, 'done');
      return true;
    } catch (e: any) {
      addLog(`✗ Tranches: ${e.message}`);
      console.error(e);
      setStep(2, 'error');
      return false;
    }
  }

  async function setupLoan() {
    const { core, adminKeypair } = getPrograms();
    const p = getPdas();
    const admin = adminKeypair.publicKey;
    setStep(3, 'running');
    try {
      const existing = await core.account.loan.fetchNullable(p.loan);
      if (existing) {
        addLog('Loan already exists — skipping');
      } else {
        const maturityDays = parseInt(params.loanMaturityDays);
        const maturity = new BN(Math.floor(Date.now() / 1000) + maturityDays * 24 * 60 * 60);
        const principal = new BN(parseFloat(params.loanPrincipal) * 1_000_000);
        const apr = parseInt(params.loanApr) * 100;

        await core.methods
          .initializeLoan(0, principal, apr, maturity, admin)
          .accounts({ admin, config: p.config, vault: p.vault, loan: p.loan, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });
        addLog(`✓ Loan initialized (${params.loanPrincipal} USDC @ ${params.loanApr}% APR)`);
      }
      setStep(3, 'done');
      return true;
    } catch (e: any) {
      addLog(`✗ Loan: ${e.message}`);
      console.error(e);
      setStep(3, 'error');
      return false;
    }
  }

  async function setupAmmPools() {
    const { amm, adminKeypair } = getPrograms();
    const p = getPdas();
    const admin = adminKeypair.publicKey;
    setStep(4, 'running');
    try {
      const poolEntries = [
        { label: 'Prime', mint: p.mints.prime, pool: p.pools.prime },
        { label: 'Core',  mint: p.mints.core,  pool: p.pools.core  },
        { label: 'Alpha', mint: p.mints.alpha,  pool: p.pools.alpha },
      ];
      for (const entry of poolEntries) {
        const [trancheReserve] = getPoolTrancheReservePda(entry.mint, PRISM_AMM_PROGRAM_ID);
        const [quoteReserve]   = getPoolQuoteReservePda(entry.mint, PRISM_AMM_PROGRAM_ID);
        const [lpMint]         = getLpMintPda(entry.mint, PRISM_AMM_PROGRAM_ID);

        const existing = await amm.account.ammPool.fetchNullable(entry.pool);
        if (existing) {
          addLog(`${entry.label} AMM pool already exists — skipping`);
          continue;
        }
        await amm.methods
          .initializePool(30)
          .accounts({ admin, trancheMint: entry.mint, quoteMint: USDC_MINT, pool: entry.pool, systemProgram: SystemProgram.programId })
          .rpc({ commitment: 'confirmed' });

        await amm.methods
          .initializePoolReserves()
          .accounts({
            admin, pool: entry.pool, trancheMint: entry.mint, quoteMint: USDC_MINT,
            trancheReserve, quoteReserve, lpMint,
            tokenProgram: TOKEN_PROGRAM_ID, systemProgram: SystemProgram.programId,
          })
          .rpc({ commitment: 'confirmed' });
        addLog(`✓ ${entry.label} AMM pool initialized`);
      }
      setStep(4, 'done');
      return true;
    } catch (e: any) {
      addLog(`✗ AMM pools: ${e.message}`);
      console.error(e);
      setStep(4, 'error');
      return false;
    }
  }

  async function runFullSetup() {
    if (!wallet) { toast.error('Connect wallet first'); return; }
    setSetupRunning(true);
    setLog([]);
    setStepStatuses(SETUP_STEPS.map(() => 'idle'));

    try {
      if (!await setupGlobalConfig()) return;
      if (!await setupVault()) return;
      if (!await setupTranches()) return;
      if (!await setupLoan()) return;
      if (!await setupAmmPools()) return;

      addLog('');
      addLog('🎉 Protocol ready — users can now deposit via the Dashboard');
      toast.success('Protocol initialized!');
    } catch {
      toast.error('Setup failed — check the log');
    } finally {
      setSetupRunning(false);
    }
  }

  async function deposit(kind: TrancheKind, label: string, amountUsdc: string) {
    if (!wallet) { toast.error('Connect wallet first'); return; }
    try {
      const { core, adminKeypair } = getPrograms();
      const p = getPdas();
      const admin = adminKeypair.publicKey;
      const amount = BigInt(parseFloat(amountUsdc) * 1_000_000);

      const tranchePda = kind === TrancheKind.Prime ? p.tranches.prime : kind === TrancheKind.Core ? p.tranches.core : p.tranches.alpha;
      const trancheMint = kind === TrancheKind.Prime ? p.mints.prime : kind === TrancheKind.Core ? p.mints.core : p.mints.alpha;
      const adminUsdcAta = await getAssociatedTokenAddress(USDC_MINT, admin);
      const adminTrancheAta = await getAssociatedTokenAddress(trancheMint, admin);

      await core.methods
        .deposit(kind, new BN(amount.toString()))
        .accounts({
          user: admin,
          config: p.config,
          vault: p.vault,
          tranche: tranchePda,
          trancheMint,
          userUsdcAta: adminUsdcAta,
          vaultUsdcReserve: p.reserve,
          userTrancheAta: adminTrancheAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      addLog(`✓ Deposited ${amountUsdc} USDC into ${label}`);
      toast.success(`Deposited into ${label}`);
    } catch (e: any) {
      addLog(`✗ Deposit ${label}: ${e.message}`);
      toast.error(`Deposit failed: ${e.message}`);
    }
  }

  async function accrueYield() {
    if (!wallet) { toast.error('Connect wallet first'); return; }
    try {
      const { core, adminKeypair } = getPrograms();
      const p = getPdas();
      const admin = adminKeypair.publicKey;
      const adminUsdcAta = await getAssociatedTokenAddress(USDC_MINT, admin);
      const amount = new BN(parseFloat(params.yieldAmount) * 1_000_000);

      await core.methods
        .accrueYield(amount)
        .accounts({
          authority: admin,
          config: p.config,
          vault: p.vault,
          tranchePrime: p.tranches.prime,
          trancheCore: p.tranches.core,
          trancheAlpha: p.tranches.alpha,
          borrower: admin,
          borrowerUsdcAta: adminUsdcAta,
          vaultUsdcReserve: p.reserve,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc({ commitment: 'confirmed' });

      addLog(`✓ Accrued ${params.yieldAmount} USDC yield — waterfall distributed to tranches`);
      toast.success(`Yield accrued: ${params.yieldAmount} USDC via waterfall`);
    } catch (e: any) {
      addLog(`✗ Yield: ${e.message}`);
      toast.error(`Yield failed: ${e.message}`);
    }
  }

  async function disburseLoan() {
    if (!wallet) { toast.error('Connect wallet first'); return; }
    try {
      const { core, adminKeypair } = getPrograms();
      const p = getPdas(currentLoanId);
      const admin = adminKeypair.publicKey;
      
      const borrowerPubkey = new PublicKey(lastApprovedLoan!.borrowerPubkey);
      const borrowerUsdcAta = await getAssociatedTokenAddress(USDC_MINT, borrowerPubkey);
      
      const instructions = [];
      const ataInfo = await connection.getAccountInfo(borrowerUsdcAta);
      if (!ataInfo) {
        addLog('Borrower USDC account not found — adding create instruction');
        instructions.push(
          createAssociatedTokenAccountInstruction(
            admin, // Admin pays for creation
            borrowerUsdcAta,
            borrowerPubkey,
            USDC_MINT
          )
        );
      }

      // Check for IKA collateral
      const [ikaCollateralPda] = getIkaCollateralPda(p.loan);
      const ikaAcc = await core.account.ikaCollateral.fetchNullable(ikaCollateralPda);

      const sig = await (core.methods as any)
        .disburseLoan()
        .accounts({
          admin,
          config: p.config,
          vault: p.vault,
          loan: p.loan,
          vaultUsdcReserve: p.reserve,
          borrowerUsdcAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          ikaCollateral: ikaAcc ? ikaCollateralPda : null,
        })
        .preInstructions(instructions)
        .rpc({ commitment: 'confirmed' });
      addLog(`✓ Loan ${currentLoanId} disbursed. Tx: ${sig}`);
      toast.success('Loan disbursed');
    } catch (e: any) {
      addLog(`✗ Disburse: ${e.message}`);
      toast.error(`Disburse failed: ${e.message}`);
    }
  }

  async function repayLoan() {
    if (!wallet) { toast.error('Connect wallet first'); return; }
    try {
      const { core, adminKeypair } = getPrograms();
      const p = getPdas(currentLoanId);
      const admin = adminKeypair.publicKey;
      const amount = new BN(parseFloat(params.repayAmount) * 1_000_000);
      const borrowerUsdcAta = await getAssociatedTokenAddress(USDC_MINT, admin);
      await (core.methods as any)
        .repayLoan(amount)
        .accounts({
          borrower: admin,
          config: p.config,
          vault: p.vault,
          loan: p.loan,
          borrowerUsdcAta,
          vaultUsdcReserve: p.reserve,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });
      addLog(`✓ Repaid ${params.repayAmount} USDC for Loan ${currentLoanId}`);
      toast.success('Loan repaid');
    } catch (e: any) {
      addLog(`✗ Repay: ${e.message}`);
      toast.error(`Repay failed: ${e.message}`);
    }
  }

  // Originate a loan for an approved application.
  // Calls initialize_loan with the applicant's wallet as borrower, then marks the app approved.
  async function originateLoanForApplicant(
    appId: string,
    borrowerPubkeyStr: string,
    requestedUSDC: number,
    maturityDays: number,
    nextLoanId: number,
  ) {
    try {
      const { core, adminKeypair } = getPrograms();
      const p = getPdas();

      // Pre-flight: vault must exist before we can originate a loan
      const vaultAccount = await core.account.vault.fetchNullable(p.vault);
      if (!vaultAccount) {
        const msg = 'Vault not initialized — run Protocol Setup first (Global Config → Vault → Tranches → Loan → AMM Pools)';
        addLog(`✗ Originate: ${msg}`);
        toast.error(msg, { duration: 6000 });
        return;
      }

      const borrower = new PublicKey(borrowerPubkeyStr);
      const principal = new BN(requestedUSDC * 1_000_000);
      const apr = parseInt(params.loanApr) * 100;
      const maturity = new BN(Math.floor(Date.now() / 1000) + maturityDays * 24 * 60 * 60);
      const [loanPda] = getLoanPda(p.vault, nextLoanId, PRISM_CORE_PROGRAM_ID);
      console.log(`Originating loan ID ${nextLoanId} at PDA: ${loanPda.toBase58()}`);
      await core.methods
        .initializeLoan(nextLoanId, principal, apr, maturity, borrower)
        .accounts({ admin: adminKeypair.publicKey, config: p.config, vault: p.vault, loan: loanPda, systemProgram: SystemProgram.programId })
        .signers([adminKeypair])
        .rpc({ commitment: 'confirmed' });
      approve(appId, nextLoanId, apr);
      addLog(`✓ Loan originated for ${borrowerPubkeyStr.slice(0, 8)}… — $${requestedUSDC} USDC`);
      toast.success('Loan originated on-chain');
    } catch (e: any) {
      addLog(`✗ Originate: ${e.message}`);
      toast.error(`Originate failed: ${e.message}`);
    }
  }

  async function triggerDefault() {
    if (!wallet) { toast.error('Connect wallet first'); return; }
    try {
      const { core, adminKeypair } = getPrograms();
      const p = getPdas();
      const admin = adminKeypair.publicKey;

      const vaultAccount = await core.account.vault.fetch(p.vault);
      const seq: number = vaultAccount.creditEventSeq ?? 0;
      const [creditEvent] = getCreditEventPda(p.vault, seq, PRISM_CORE_PROGRAM_ID);

      const amount = new BN(parseFloat(params.lossAmount) * 1_000_000);
      const severity = parseInt(params.severity) * 100;

      await core.methods
        .triggerCreditEvent(0, amount, severity)
        .accounts({
          authority: admin,
          config: p.config,
          vault: p.vault,
          tranchePrime: p.tranches.prime,
          trancheCore: p.tranches.core,
          trancheAlpha: p.tranches.alpha,
          vaultUsdcReserve: p.reserve,
          lossBucket: p.lossBucket,
          creditEvent,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc({ commitment: 'confirmed' });

      addLog(`✓ Credit event triggered — ${params.lossAmount} USDC loss cascaded: Alpha → Core → Prime`);
      toast.success('Default triggered — loss cascade complete');
    } catch (e: any) {
      addLog(`✗ Default: ${e.message}`);
      toast.error(`Default failed: ${e.message}`);
    }
  }

  async function mintUsdc() {
    if (!wallet) { toast.error('Connect wallet first'); return; }
    try {
      const admin = wallet.publicKey;
      const amount = Math.round(parseFloat(params.faucetAmount) * 1_000_000);
      if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid USDC amount'); return; }
      const ata = await getAssociatedTokenAddress(USDC_MINT, admin);
      const ataInfo = await connection.getAccountInfo(ata);
      const tx = new Transaction();
      if (!ataInfo) {
        tx.add(createAssociatedTokenAccountInstruction(admin, ata, admin, USDC_MINT));
      }
      tx.add(createMintToInstruction(USDC_MINT, ata, admin, BigInt(amount)));
      tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
      tx.feePayer = admin;
      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, 'confirmed');
      addLog(`✓ Minted ${params.faucetAmount} USDC to ${admin.toBase58().slice(0, 8)}…`);
      toast.success(`Minted ${params.faucetAmount} devnet USDC to your wallet`);
    } catch (e: any) {
      addLog(`✗ Faucet: ${e.message}`);
      toast.error(`Mint failed: ${e.message} — wallet must be mint authority`);
    }
  }

  async function liquidateCollateral() {
    if (!wallet) { toast.error('Connect wallet first'); return; }
    try {
      const { core, adminKeypair } = getPrograms();
      const p = getPdas();
      const admin = adminKeypair.publicKey;
      const [ikaCollateralPda] = getIkaCollateralPda(p.loan);
      await core.methods
        .liquidateIkaCollateral()
        .accounts({
          admin,
          config: p.config,
          vault: p.vault,
          loan: p.loan,
          ikaCollateral: ikaCollateralPda,
        })
        .rpc({ commitment: 'confirmed' });
      addLog('✓ IKA collateral liquidated — IKA Network will seize BTC/ETH');
      toast.success('Collateral liquidated');
    } catch (e: any) {
      addLog(`✗ Liquidate: ${e.message}`);
      toast.error(`Liquidation failed: ${e.message}`);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-12">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Protocol Control Center</h1>
          <p className="font-mono text-[11px] text-white/30">
            Vault {VAULT_ID} · {PRISM_CORE_PROGRAM_ID.toBase58().slice(0, 8)}…
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[10px] ${
            isHealthy
              ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300'
              : 'border-rose-500/25 bg-rose-500/[0.08] text-rose-300'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
            {isHealthy ? 'Protocol Healthy' : 'Loss Event Active'}
          </div>
          <WalletMultiButton style={{}} />
        </div>
      </div>

      {/* ── QUICK STATS ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {([
          { label: 'Total Value Locked', value: `$${formatUsdc(tvl, 2)}`,          Icon: BarChart,  color: '#38596a' },
          { label: 'Vault Reserve',      value: `$${formatUsdc(reserveBal, 2)}`,   Icon: Database,   color: '#ad7b21' },
          { label: 'Active Exposure',    value: `$${formatUsdc(totalExposure, 2)}`, Icon: TrendingUp, color: '#6d5ca8' },
          { label: 'Loss Bucket',        value: `$${formatUsdc(lossBucketBal, 2)}`, Icon: Shield,     color: lossBucketBal > 0n ? '#9f442b' : '#2f7d4f' },
        ] as const).map(({ label, value, Icon, color }) => (
          <div key={label} className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707] px-4 py-3.5">
            <div className="absolute inset-y-0 left-0 w-[2px] rounded-l-xl" style={{ backgroundColor: color }} />
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/22">{label}</span>
              <Icon className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color, opacity: 0.5 }} />
            </div>
            <div className="font-mono text-xl leading-none text-white">
              {vaultState.isLoading ? <span className="text-white/20 animate-pulse text-sm">loading…</span> : value}
            </div>
          </div>
        ))}
      </div>

      {/* ── TRANCHE MONITOR ────────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
        <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-3">
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/28">Tranche Monitor</span>
          </div>
          <div className="flex items-center gap-2">
            {vaultState.isFetching && <span className="font-mono text-[9px] text-white/18 animate-pulse">refreshing…</span>}
            <span className="font-mono text-[9px] text-white/14">auto-refresh 5s</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.04]">
                {['Tranche', 'Total Assets', 'NAV / Share', 'AMM Liquidity', 'Yield Accrued', 'Cumul. Loss', 'Target APY'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left font-mono text-[9px] uppercase tracking-[0.16em] text-white/20">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {([
                { kind: TrancheKind.Prime, label: 'PRIME', color: '#38596a', apy: '5.0%' },
                { kind: TrancheKind.Core,  label: 'CORE',  color: '#ad7b21', apy: '8.0%' },
                { kind: TrancheKind.Alpha, label: 'ALPHA', color: '#9f442b', apy: '15.0%' },
              ] as const).map(({ kind, label, color, apy }) => {
                const t = vd?.tranches.find(tr => tr.kind === kind);
                const hasLoss = (t?.cumulativeLoss ?? 0n) > 0n;
                return (
                  <tr key={kind} className="transition-colors hover:bg-white/[0.015]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-[2px] rounded-full" style={{ backgroundColor: color }} />
                        <span className="font-mono text-[11px] font-semibold" style={{ color }}>{label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[12px] text-white/65">${formatUsdc(t?.totalAssets ?? 0n, 2)}</td>
                    <td className={`px-5 py-3 font-mono text-[12px] ${hasLoss ? 'text-[#e8a090]' : 'text-white/55'}`}>
                      {formatNavQ(t?.navPerShareQ ?? 0n)}
                    </td>
                    <td className="px-5 py-3 font-mono text-[12px] text-white/55">${formatUsdc(t?.ammQuoteBalance ?? 0n, 2)}</td>
                    <td className="px-5 py-3 font-mono text-[12px] text-emerald-400/65">${formatUsdc(t?.cumulativeYield ?? 0n, 2)}</td>
                    <td className={`px-5 py-3 font-mono text-[12px] ${hasLoss ? 'text-[#e8a090]' : 'text-white/18'}`}>
                      {hasLoss ? `$${formatUsdc(t?.cumulativeLoss ?? 0n, 2)}` : '—'}
                    </td>
                    <td className="px-5 py-3 font-mono text-[12px] font-medium" style={{ color }}>{apy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── WATERFALL FLOW ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/[0.06] bg-[#070707] px-5 py-4">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/28">Yield Waterfall · Loss Cascade</span>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <div className="shrink-0 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-center min-w-[80px]">
            <div className="font-mono text-[9px] uppercase tracking-wider text-white/22">Borrowers</div>
            <div className="mt-1 font-mono text-[11px] text-white/50">${formatUsdc(totalExposure, 0)}</div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/15" />
          <div className="shrink-0 rounded-lg border border-[#ad7b21]/25 bg-[#ad7b21]/[0.06] px-3 py-2.5 text-center min-w-[80px]">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#ad7b21]/60">Reserve</div>
            <div className="mt-1 font-mono text-[11px] text-[#c49a40]">${formatUsdc(reserveBal, 0)}</div>
          </div>
          <div className="shrink-0 flex flex-col gap-1.5 mx-2">
            {([
              { label: 'Prime 70%', color: '#38596a' },
              { label: 'Core  20%', color: '#ad7b21' },
              { label: 'Alpha 10%', color: '#9f442b' },
            ] as const).map(({ label, color }) => (
              <div key={label} className="flex items-center gap-1">
                <div className="h-px w-5 rounded" style={{ backgroundColor: `${color}80` }} />
                <ChevronRight className="h-2.5 w-2.5 shrink-0" style={{ color: `${color}60` }} />
                <span className="font-mono text-[9px] whitespace-nowrap" style={{ color: `${color}80` }}>{label}</span>
              </div>
            ))}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#9f442b]/25" />
          <div className="shrink-0 rounded-lg border border-[#9f442b]/20 bg-[#9f442b]/[0.06] px-3 py-2.5 text-center min-w-[80px]">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#9f442b]/60">Loss Bucket</div>
            <div className={`mt-1 font-mono text-[11px] ${lossBucketBal > 0n ? 'text-[#e8a090]' : 'text-white/20'}`}>
              ${formatUsdc(lossBucketBal, 0)}
            </div>
          </div>
        </div>
        <p className="mt-3 font-mono text-[9px] text-white/16 leading-relaxed">
          Yield flows: Prime (priority) → Core → Alpha &nbsp;·&nbsp; Losses cascade: Alpha (first) → Core → Prime → Loss Bucket
        </p>
      </section>

      {/* Step 1: Protocol Setup */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4 relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <h2 className="text-sm font-medium text-white/80">1 · Protocol Setup</h2>
          <div className="flex gap-2 p-1 rounded-lg bg-black/40 border border-white/5">
            <button
              onClick={() => setActiveMode('auto')}
              className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold rounded-md transition-all ${activeMode === 'auto' ? 'bg-purple-500/20 text-purple-300 shadow-sm' : 'text-white/30 hover:text-white/50'}`}
            >
              Automatic
            </button>
            <button
              onClick={() => setActiveMode('manual')}
              className={`px-3 py-1 text-[10px] uppercase tracking-wider font-semibold rounded-md transition-all ${activeMode === 'manual' ? 'bg-purple-500/20 text-purple-300 shadow-sm' : 'text-white/30 hover:text-white/50'}`}
            >
              Manual
            </button>
          </div>
        </div>

        {activeMode === 'auto' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/40">Run all initialization steps in sequence with default parameters.</p>
              <button
                onClick={runFullSetup}
                disabled={setupRunning || !wallet}
                className="rounded-lg border border-purple-400/30 bg-purple-500/15 px-4 py-1.5 text-sm text-purple-200 transition-colors hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {setupRunning ? 'Running…' : 'Run Full Setup'}
              </button>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {SETUP_STEPS.map((step, i) => (
                <div
                  key={step}
                  className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center"
                >
                  <span
                    className={
                      stepStatuses[i] === 'done' ? 'text-emerald-400' :
                      stepStatuses[i] === 'running' ? 'animate-pulse text-yellow-400' :
                      stepStatuses[i] === 'error' ? 'text-red-400' :
                      'text-white/20'
                    }
                  >
                    {stepStatuses[i] === 'done' ? '✓' :
                     stepStatuses[i] === 'error' ? '✗' :
                     stepStatuses[i] === 'running' ? '◉' : '○'}
                  </span>
                  <span className="text-[10px] text-white/50 leading-tight">{step}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Loan Params */}
              <div className="space-y-3 p-4 rounded-lg bg-black/20 border border-white/5">
                <h3 className="text-xs font-semibold text-white/60 uppercase tracking-tight">Loan Parameters</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-white/30 uppercase">Principal (USDC)</label>
                    <input
                      type="text"
                      value={params.loanPrincipal}
                      onChange={(e) => setParams(p => ({ ...p, loanPrincipal: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-white/30 uppercase">APR (%)</label>
                    <input
                      type="text"
                      value={params.loanApr}
                      onChange={(e) => setParams(p => ({ ...p, loanApr: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <label className="text-[10px] text-white/30 uppercase">Maturity (Days)</label>
                    <input
                      type="text"
                      value={params.loanMaturityDays}
                      onChange={(e) => setParams(p => ({ ...p, loanMaturityDays: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* Step Buttons */}
              <div className="grid grid-cols-1 gap-2">
                {[
                  { label: 'Init Global Config', fn: setupGlobalConfig, idx: 0 },
                  { label: 'Init Vault & Reserves', fn: setupVault, idx: 1 },
                  { label: 'Init Tranches', fn: setupTranches, idx: 2 },
                  { label: 'Init Loan (w/ custom params)', fn: setupLoan, idx: 3 },
                  { label: 'Init AMM Pools', fn: setupAmmPools, idx: 4 },
                ].map((step) => (
                  <button
                    key={step.label}
                    onClick={step.fn}
                    disabled={!wallet}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/5 bg-white/5 hover:bg-white/10 transition-colors text-xs text-white/80"
                  >
                    <span>{step.label}</span>
                    <span className={
                      stepStatuses[step.idx] === 'done' ? 'text-emerald-400' :
                      stepStatuses[step.idx] === 'running' ? 'animate-pulse text-yellow-400' :
                      stepStatuses[step.idx] === 'error' ? 'text-red-400' :
                      'text-white/20'
                    }>
                      {stepStatuses[step.idx] === 'done' ? '✓' :
                       stepStatuses[step.idx] === 'error' ? '✗' :
                       stepStatuses[step.idx] === 'running' ? '◉' : '→'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Seed Deposits */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-white/80">2 · Seed Deposits</h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Amount (USDC)"
              defaultValue="5000"
              id="depositAmount"
              className="w-24 bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white focus:outline-none"
            />
          </div>
        </div>
        <div className="flex gap-3">
          {[
            { kind: TrancheKind.Prime, label: 'Prime', apy: '5%', color: 'sky' },
            { kind: TrancheKind.Core, label: 'Core', apy: '8%', color: 'amber' },
            { kind: TrancheKind.Alpha, label: 'Alpha', apy: '15%', color: 'rose' },
          ].map((t) => (
            <button
              key={t.label}
              onClick={() => {
                const amount = (document.getElementById('depositAmount') as HTMLInputElement).value || '5000';
                deposit(t.kind, t.label, amount);
              }}
              disabled={!wallet}
              className={`flex-1 rounded-lg border border-${t.color}-400/30 bg-${t.color}-500/10 py-2 text-xs text-${t.color}-200 hover:bg-${t.color}-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-center`}
            >
              Deposit to {t.label}<br />
              <span className="text-[10px] text-white/40">{t.apy} APY</span>
            </button>
          ))}
        </div>

        {/* Dev Faucet — only works if wallet is USDC mint authority */}
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider whitespace-nowrap">Dev Faucet</span>
          <input
            type="text"
            value={params.faucetAmount}
            onChange={(e) => setParams(p => ({ ...p, faucetAmount: e.target.value }))}
            className="w-20 bg-black/30 border border-amber-500/20 rounded px-2 py-1 text-[10px] text-white focus:outline-none"
          />
          <span className="text-[10px] text-amber-400/50">USDC</span>
          <button
            onClick={mintUsdc}
            disabled={!wallet}
            className="rounded bg-amber-500/20 border border-amber-500/30 px-3 py-1 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/30 disabled:opacity-40 whitespace-nowrap"
          >
            Mint to Wallet
          </button>
          <span className="text-[10px] text-white/20 truncate">wallet must be mint authority</span>
        </div>
      </section>

      {/* Step 3: Simulate Events */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-6">
        <h2 className="text-sm font-medium text-white/80">3 · Simulate Events</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Yield Simulation */}
          <div className="space-y-3 p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Yield Accrual</h3>
              <span className="text-[10px] text-emerald-400/50 italic">Waterfall Distribution</span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-white/30 uppercase">Amount (USDC)</label>
                <span className="font-mono text-sm font-semibold text-emerald-300">
                  ${parseFloat(params.yieldAmount || '0').toLocaleString()}
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="10000"
                step="10"
                value={parseFloat(params.yieldAmount) || 100}
                onChange={(e) => setParams(p => ({ ...p, yieldAmount: e.target.value }))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-emerald-900/40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-400"
              />
              <div className="flex justify-between font-mono text-[9px] text-white/20">
                <span>$10</span><span>$2,500</span><span>$5,000</span><span>$10,000</span>
              </div>
              {/* Preview impact */}
              {tvl > 0n && (
                <div className="rounded border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2">
                  <div className="font-mono text-[9px] uppercase text-emerald-400/50 mb-1.5">Projected NAV Impact</div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { label: 'Prime', trancheKind: TrancheKind.Prime },
                      { label: 'Core',  trancheKind: TrancheKind.Core  },
                      { label: 'Alpha', trancheKind: TrancheKind.Alpha },
                    ] as const).map(({ label, trancheKind }) => {
                      const t = vd?.tranches.find(tr => tr.kind === trancheKind);
                      const share = tvl > 0n && t && t.totalAssets > 0n
                        ? Number(t.totalAssets * BigInt(Math.round(parseFloat(params.yieldAmount || '0') * 1_000_000)) / tvl) / 1_000_000
                        : 0;
                      return (
                        <div key={label} className="text-center">
                          <div className="font-mono text-[9px] text-white/25">{label}</div>
                          <div className="font-mono text-[11px] text-emerald-300">+${share.toFixed(2)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={params.yieldAmount}
                  onChange={(e) => setParams(p => ({ ...p, yieldAmount: e.target.value }))}
                  className="w-24 bg-black/20 border border-emerald-500/20 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500/50"
                />
                <button
                  onClick={accrueYield}
                  disabled={!wallet}
                  className="flex-1 px-4 py-1.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs font-semibold hover:bg-emerald-500/30 transition-all disabled:opacity-40"
                >
                  Apply Yield
                </button>
              </div>
            </div>
          </div>

          {/* Loan Lifecycle */}
          <div className="space-y-3 p-4 rounded-lg bg-blue-500/5 border border-blue-500/10 md:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                Loan Lifecycle {lastApprovedLoan && `· ID ${currentLoanId}`}
              </h3>
              <div className="flex items-center gap-4">
                {lastApprovedLoan && (
                  <span className="text-[9px] text-blue-400/70 font-mono">
                    Borrower: {lastApprovedLoan.borrowerPubkey.slice(0, 8)}… · ${lastApprovedLoan.requestedUSDC.toLocaleString()}
                  </span>
                )}
                <span className="text-[10px] text-blue-400/50 italic">Disburse → Repay</span>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-white/5 border border-white/10">
                  <span className="text-[9px] text-white/30 uppercase font-bold">Collateral:</span>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${
                    ikaStatus === 'Locked' ? 'text-emerald-400' : 
                    ikaStatus === 'Pending' ? 'text-yellow-400' : 'text-rose-400'
                  }`}>
                    {ikaStatus || 'Not Attached'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-end gap-3">
              <button
                onClick={disburseLoan}
                disabled={!wallet}
                className="w-full py-1.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-200 text-xs font-semibold hover:bg-blue-500/30 transition-all disabled:opacity-40 whitespace-nowrap"
              >
                Disburse Loan
              </button>
            </div>
            {ikaStatus === 'Locked' && (
              <button
                onClick={liquidateCollateral}
                disabled={!wallet}
                className="w-full py-1.5 rounded bg-orange-500/20 border border-orange-500/30 text-orange-200 text-xs font-semibold hover:bg-orange-500/30 transition-all disabled:opacity-40"
              >
                Liquidate IKA Collateral
              </button>
            )}
            <p className="text-[10px] text-white/25">Disburse sends vault reserve USDC to the borrower. Repay returns USDC back into the reserve. Liquidate seizes IKA collateral after a vault default.</p>
          </div>

          {/* Default Simulation */}
          <div className="space-y-3 p-4 rounded-lg bg-rose-500/5 border border-rose-500/10">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Credit Event</h3>
              <span className="text-[10px] text-rose-400/50 italic">Loss Cascade</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-white/30 uppercase">Loss (USDC)</label>
                <input
                  type="text"
                  value={params.lossAmount}
                  onChange={(e) => setParams(p => ({ ...p, lossAmount: e.target.value }))}
                  className="w-full bg-black/20 border border-rose-500/20 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-white/30 uppercase">Severity (%)</label>
                <input
                  type="text"
                  value={params.severity}
                  onChange={(e) => setParams(p => ({ ...p, severity: e.target.value }))}
                  className="w-full bg-black/20 border border-rose-500/20 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-rose-500/50"
                />
              </div>
            </div>
            <button
              onClick={triggerDefault}
              disabled={!wallet}
              className="w-full mt-1 py-2 rounded bg-rose-500/20 border border-rose-500/30 text-rose-200 text-xs font-semibold hover:bg-rose-500/30 transition-all disabled:opacity-40"
            >
              Trigger Default Event
            </button>
          </div>
        </div>
      </section>

      {/* ── TRANSACTION LOG (filterable) ───────────────────────────────── */}
      {log.length > 0 && (
        <section className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium text-white/50">Transaction Log</h2>
            <div className="flex items-center gap-2 flex-1 max-w-xs">
              <Filter className="h-3 w-3 shrink-0 text-white/20" />
              <input
                type="text"
                placeholder="Filter entries…"
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 font-mono text-[10px] text-white placeholder-white/20 focus:outline-none focus:border-white/20"
              />
            </div>
            <div className="flex items-center gap-2">
              {logFilter && (
                <span className="font-mono text-[9px] text-white/25">{filteredLog.length}/{log.length}</span>
              )}
              <button
                onClick={() => { setLog([]); setLogFilter(''); }}
                className="text-[10px] text-white/30 hover:text-white/60 underline decoration-white/10 underline-offset-2"
              >
                clear
              </button>
            </div>
          </div>
          <div className="max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs text-white/60">
            {filteredLog.length === 0 && logFilter ? (
              <div className="text-white/20 text-[10px] py-2">No entries match &ldquo;{logFilter}&rdquo;</div>
            ) : filteredLog.map((line, i) => (
              <div key={i} className={
                line.includes('✓') ? 'text-emerald-400/80' :
                line.includes('✗') ? 'text-red-400/80' : ''
              }>
                {line}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── PDA INSPECTOR ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-white/[0.06] bg-[#070707] overflow-hidden">
        <button
          type="button"
          onClick={() => setShowPdaInspector(v => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-white/[0.02]"
        >
          <div className="flex items-center gap-2">
            <Database className="h-3.5 w-3.5 text-white/25" strokeWidth={1.5} />
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/28">PDA Inspector</span>
          </div>
          <span className="font-mono text-[9px] text-white/20">{showPdaInspector ? '▲ collapse' : '▼ expand'}</span>
        </button>
        {showPdaInspector && (() => {
          const p = getPdas(currentLoanId);
          const rows: Array<{ label: string; address: string; note?: string }> = [
            { label: 'Global Config',    address: p.config.toBase58(),         note: 'USDC mint + oracle list' },
            { label: 'Vault',            address: p.vault.toBase58(),          note: `ID ${VAULT_ID}` },
            { label: 'USDC Reserve',     address: p.reserve.toBase58(),        note: `$${formatUsdc(reserveBal, 2)} balance` },
            { label: 'Loss Bucket',      address: p.lossBucket.toBase58(),     note: `$${formatUsdc(lossBucketBal, 2)} balance` },
            { label: 'Loan',             address: p.loan.toBase58(),           note: `ID ${currentLoanId}` },
            { label: 'Prime Tranche',    address: p.tranches.prime.toBase58(), note: `$${formatUsdc(vd?.tranches.find(t => t.kind === TrancheKind.Prime)?.totalAssets ?? 0n, 2)} TVL` },
            { label: 'Core Tranche',     address: p.tranches.core.toBase58(),  note: `$${formatUsdc(vd?.tranches.find(t => t.kind === TrancheKind.Core)?.totalAssets ?? 0n, 2)} TVL` },
            { label: 'Alpha Tranche',    address: p.tranches.alpha.toBase58(), note: `$${formatUsdc(vd?.tranches.find(t => t.kind === TrancheKind.Alpha)?.totalAssets ?? 0n, 2)} TVL` },
            { label: 'Prime Mint',       address: p.mints.prime.toBase58() },
            { label: 'Core Mint',        address: p.mints.core.toBase58() },
            { label: 'Alpha Mint',       address: p.mints.alpha.toBase58() },
            { label: 'Prime AMM Pool',   address: p.pools.prime.toBase58() },
            { label: 'Core AMM Pool',    address: p.pools.core.toBase58() },
            { label: 'Alpha AMM Pool',   address: p.pools.alpha.toBase58() },
          ];
          return (
            <div className="border-t border-white/[0.05] divide-y divide-white/[0.03]">
              {rows.map(({ label, address, note }) => (
                <div key={label} className="flex items-center justify-between gap-4 px-5 py-2.5 hover:bg-white/[0.015] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 font-mono text-[10px] text-white/35 w-32">{label}</span>
                    <span className="font-mono text-[10px] text-white/50 truncate">{address}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {note && <span className="font-mono text-[9px] text-white/22">{note}</span>}
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard.writeText(address); }}
                      className="rounded border border-white/[0.06] px-1.5 py-0.5 font-mono text-[9px] text-white/25 transition-colors hover:border-white/15 hover:text-white/50"
                    >
                      copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* Pending Loan Applications */}
      {applications.filter(a => a.status === 'pending').length > 0 && (
        <section className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-5 space-y-4">
          <h2 className="text-sm font-medium text-yellow-200/80">
            4 · Pending Loan Applications ({applications.filter(a => a.status === 'pending').length})
          </h2>
          <div className="space-y-3">
            {applications
              .filter(a => a.status === 'pending')
              .map((app, idx) => {
                // Use Unix timestamp (seconds) as loan ID — unique across sessions and redeploys,
                // fits in u32 until year 2106. Offset by idx so two pending apps get different IDs.
                const nextId = (Math.floor(Date.now() / 1000) + idx) >>> 0;
                return (
                  <div key={app.id} className="rounded-lg border border-yellow-500/10 bg-black/20 p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs space-y-0.5">
                        <p className="font-mono text-white/70">{app.borrowerPubkey.slice(0, 16)}…</p>
                        <p className="text-white/50">{app.purpose} · {app.maturityDays} days · ${app.requestedUSDC.toLocaleString()} USDC</p>
                        <p className="text-white/30 text-[10px]">{new Date(app.submittedAt).toLocaleString()}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => originateLoanForApplicant(app.id, app.borrowerPubkey, app.requestedUSDC, app.maturityDays, nextId)}
                          disabled={!wallet}
                          className="rounded-md bg-green-500/20 border border-green-500/30 px-2.5 py-1 text-[11px] font-medium text-green-300 hover:bg-green-500/30 disabled:opacity-40"
                        >
                          Approve & Originate
                        </button>
                        <button
                          onClick={() => reject(app.id)}
                          className="rounded-md bg-red-500/10 border border-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/20"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Create New Vault */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-4">
        <h2 className="text-sm font-medium text-white/80">New Vault / Pool</h2>

        {/* Existing vaults */}
        {registeredVaults && registeredVaults.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-white/40">Registered vaults</p>
            <div className="flex flex-wrap gap-2">
              {registeredVaults.map((v) => (
                <button
                  key={v.vault_id}
                  type="button"
                  onClick={() => setSelectedVaultId(v.vault_id)}
                  className={[
                    'flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors',
                    selectedVaultId === v.vault_id
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                      : 'border-white/10 bg-white/5 text-white/50 hover:text-white/80',
                  ].join(' ')}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${selectedVaultId === v.vault_id ? 'bg-emerald-400' : 'bg-white/20'}`} />
                  {v.name}
                  <span className="text-white/30">#{v.vault_id}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs text-white/40">Vault name</label>
            <input
              type="text"
              placeholder="e.g. Real Estate Pool"
              value={newVaultForm.name}
              onChange={(e) => setNewVaultForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 text-sm text-white placeholder-white/20 focus:border-white/25 focus:outline-none"
            />
          </div>

          {[
            { key: 'primeBps', label: 'Prime APR (bps)', placeholder: '500' },
            { key: 'coreBps', label: 'Core APR (bps)', placeholder: '800' },
            { key: 'alphaBps', label: 'Alpha APR (bps)', placeholder: '1500' },
            { key: 'loanPrincipal', label: 'Loan principal (USDC)', placeholder: '20000' },
            { key: 'maturityDays', label: 'Maturity (days)', placeholder: '365' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="mb-1 block text-xs text-white/40">{label}</label>
              <input
                type="number"
                min="0"
                placeholder={placeholder}
                value={newVaultForm[key as keyof typeof newVaultForm]}
                onChange={(e) => setNewVaultForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full rounded-md border border-white/10 bg-black/50 px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:border-white/25 focus:outline-none"
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleCreateVault}
          disabled={vaultCreateRunning || !wallet || !newVaultForm.name.trim()}
          className="rounded-lg border border-purple-400/30 bg-purple-500/15 px-5 py-2 text-sm text-purple-200 transition-colors hover:bg-purple-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {vaultCreateRunning ? 'Initializing…' : `Initialize Vault #${nextVaultId()}`}
        </button>
      </section>

      {/* Protocol actions — deposit, yield, defaults, Cloak, Encrypt FHE */}
      <ActionPanel />

      {/* Active Loans */}
      <LoanList />
    </div>
  );
}
