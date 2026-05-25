'use client';

import { useState } from 'react';
import { Copy, Database, Eye, Filter, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { useVaultState } from '@/hooks/useVaultState';
import { useAdminVault } from '@/components/admin/AdminVaultContext';
import { formatUsdc, formatNavQ } from '@/app/lib/format';
import { PRISM_CORE_PROGRAM_ID, PRISM_AMM_PROGRAM_ID, TrancheKind, USDC_MINT } from '@/app/lib/constants';
import {
  getConfigPda,
  getVaultPda,
  getTranchePda,
  getTrancheMintPda,
  getVaultReservePda,
  getLossBucketPda,
  getLoanPda,
  getPoolPda,
  getPoolTrancheReservePda,
  getPoolQuoteReservePda,
  getLpMintPda,
} from '@/app/lib/pda';

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`Copied ${label}`);
}

function PdaRow({
  label,
  pubkey,
  balance,
  note,
}: {
  label: string;
  pubkey: import('@solana/web3.js').PublicKey;
  balance?: string;
  note?: string;
}) {
  const addr = pubkey.toBase58();
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.015] px-4 py-2.5 hover:bg-white/[0.03] transition-colors">
      <div className="w-40 shrink-0">
        <div className="font-mono text-[10px] text-white/60">{label}</div>
        {note && <div className="font-mono text-[9px] text-white/22">{note}</div>}
      </div>
      <div className="flex-1 font-mono text-[10px] text-white/35 truncate">{addr}</div>
      {balance !== undefined && (
        <div className="shrink-0 font-mono text-[10px] text-emerald-400/70 w-24 text-right">
          {balance}
        </div>
      )}
      <button
        onClick={() => copyToClipboard(addr, label)}
        className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-white/20 transition-colors hover:text-white/60"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function ObservabilityPage() {
  const { vaultId, log, clearLog } = useAdminVault();
  const [logFilter, setLogFilter] = useState('');
  const [pdaOpen, setPdaOpen] = useState(true);
  const vaultState = useVaultState(vaultId);
  const vd = vaultState.data;

  // Derive all PDAs
  const [config] = getConfigPda(PRISM_CORE_PROGRAM_ID);
  const [vault] = getVaultPda(vaultId, PRISM_CORE_PROGRAM_ID);
  const [trancheP] = getTranchePda(vault, TrancheKind.Prime, PRISM_CORE_PROGRAM_ID);
  const [trancheC] = getTranchePda(vault, TrancheKind.Core, PRISM_CORE_PROGRAM_ID);
  const [trancheA] = getTranchePda(vault, TrancheKind.Alpha, PRISM_CORE_PROGRAM_ID);
  const [mintP] = getTrancheMintPda(vault, TrancheKind.Prime, PRISM_CORE_PROGRAM_ID);
  const [mintC] = getTrancheMintPda(vault, TrancheKind.Core, PRISM_CORE_PROGRAM_ID);
  const [mintA] = getTrancheMintPda(vault, TrancheKind.Alpha, PRISM_CORE_PROGRAM_ID);
  const [reserve] = getVaultReservePda(vault, PRISM_CORE_PROGRAM_ID);
  const [lossBucket] = getLossBucketPda(vault, PRISM_CORE_PROGRAM_ID);
  const [loan] = getLoanPda(vault, 0, PRISM_CORE_PROGRAM_ID);
  const [poolP] = getPoolPda(mintP, PRISM_AMM_PROGRAM_ID);
  const [poolC] = getPoolPda(mintC, PRISM_AMM_PROGRAM_ID);
  const [poolA] = getPoolPda(mintA, PRISM_AMM_PROGRAM_ID);
  const [poolPTrRes] = getPoolTrancheReservePda(mintP, PRISM_AMM_PROGRAM_ID);
  const [poolCTrRes] = getPoolTrancheReservePda(mintC, PRISM_AMM_PROGRAM_ID);
  const [poolATrRes] = getPoolTrancheReservePda(mintA, PRISM_AMM_PROGRAM_ID);
  const [poolPQRes] = getPoolQuoteReservePda(mintP, PRISM_AMM_PROGRAM_ID);
  const [poolCQRes] = getPoolQuoteReservePda(mintC, PRISM_AMM_PROGRAM_ID);
  const [poolAQRes] = getPoolQuoteReservePda(mintA, PRISM_AMM_PROGRAM_ID);
  const [lpMintP] = getLpMintPda(mintP, PRISM_AMM_PROGRAM_ID);
  const [lpMintC] = getLpMintPda(mintC, PRISM_AMM_PROGRAM_ID);
  const [lpMintA] = getLpMintPda(mintA, PRISM_AMM_PROGRAM_ID);

  const reserveBal = vd?.reserveBalance;
  const lossBal = vd?.lossBucketBalance;
  const getTranche = (k: TrancheKind) => vd?.tranches.find((t) => t.kind === k);
  const tP = getTranche(TrancheKind.Prime);
  const tC = getTranche(TrancheKind.Core);
  const tA = getTranche(TrancheKind.Alpha);

  const filteredLog = logFilter
    ? log.filter((l) => l.toLowerCase().includes(logFilter.toLowerCase()))
    : log;

  type PdaEntry = { label: string; pubkey: import('@solana/web3.js').PublicKey; balance?: string; note?: string };
  type PdaGroup = { title: string; rows: PdaEntry[] };

  const PDA_GROUPS: PdaGroup[] = [
    {
      title: 'Core Protocol',
      rows: [
        { label: 'Global Config',  pubkey: config,  note: 'prism-core' },
        { label: 'Vault #' + vaultId, pubkey: vault, note: 'credit pool' },
        { label: 'Vault Reserve',  pubkey: reserve, balance: reserveBal !== undefined ? `$${formatUsdc(reserveBal, 2)}` : undefined, note: 'USDC token acct' },
        { label: 'Loss Bucket',    pubkey: lossBucket, balance: lossBal !== undefined ? `$${formatUsdc(lossBal, 2)}` : undefined, note: 'USDC token acct' },
        { label: 'Loan #0',        pubkey: loan, note: 'current loan' },
      ],
    },
    {
      title: 'Tranches',
      rows: [
        { label: 'Prime Tranche',  pubkey: trancheP, balance: tP ? `$${formatUsdc(tP.totalAssets, 0)} · NAV ${formatNavQ(tP.navPerShareQ)}` : undefined },
        { label: 'Prime Mint',     pubkey: mintP, note: 'LP token mint' },
        { label: 'Core Tranche',   pubkey: trancheC, balance: tC ? `$${formatUsdc(tC.totalAssets, 0)} · NAV ${formatNavQ(tC.navPerShareQ)}` : undefined },
        { label: 'Core Mint',      pubkey: mintC, note: 'LP token mint' },
        { label: 'Alpha Tranche',  pubkey: trancheA, balance: tA ? `$${formatUsdc(tA.totalAssets, 0)} · NAV ${formatNavQ(tA.navPerShareQ)}` : undefined },
        { label: 'Alpha Mint',     pubkey: mintA, note: 'LP token mint' },
      ],
    },
    {
      title: 'AMM Pools — Prime',
      rows: [
        { label: 'Prime Pool',         pubkey: poolP },
        { label: 'Prime LP Mint',      pubkey: lpMintP },
        { label: 'Prime Tranche Res.', pubkey: poolPTrRes, balance: tP ? `${formatUsdc(tP.ammTrancheBalance, 0)} tPRIME` : undefined },
        { label: 'Prime Quote Res.',   pubkey: poolPQRes, balance: tP ? `$${formatUsdc(tP.ammQuoteBalance, 0)}` : undefined },
      ],
    },
    {
      title: 'AMM Pools — Core',
      rows: [
        { label: 'Core Pool',         pubkey: poolC },
        { label: 'Core LP Mint',      pubkey: lpMintC },
        { label: 'Core Tranche Res.', pubkey: poolCTrRes, balance: tC ? `${formatUsdc(tC.ammTrancheBalance, 0)} tCORE` : undefined },
        { label: 'Core Quote Res.',   pubkey: poolCQRes, balance: tC ? `$${formatUsdc(tC.ammQuoteBalance, 0)}` : undefined },
      ],
    },
    {
      title: 'AMM Pools — Alpha',
      rows: [
        { label: 'Alpha Pool',         pubkey: poolA },
        { label: 'Alpha LP Mint',      pubkey: lpMintA },
        { label: 'Alpha Tranche Res.', pubkey: poolATrRes, balance: tA ? `${formatUsdc(tA.ammTrancheBalance, 0)} tALPHA` : undefined },
        { label: 'Alpha Quote Res.',   pubkey: poolAQRes, balance: tA ? `$${formatUsdc(tA.ammQuoteBalance, 0)}` : undefined },
      ],
    },
    {
      title: 'External',
      rows: [
        { label: 'USDC Mint',          pubkey: USDC_MINT, note: 'Circle devnet USDC' },
        { label: 'Prism Core Program', pubkey: PRISM_CORE_PROGRAM_ID },
        { label: 'Prism AMM Program',  pubkey: PRISM_AMM_PROGRAM_ID },
      ],
    },
  ];

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-[15px] font-semibold text-white">Observability</h1>
        <p className="mt-0.5 font-mono text-[10px] text-white/30">
          PDA Inspector · Event Log · On-chain Metrics · Vault #{vaultId}
        </p>
      </div>

      {/* PDA Inspector */}
      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
        <button
          onClick={() => setPdaOpen((o) => !o)}
          className="flex w-full items-center justify-between border-b border-white/[0.05] px-5 py-3.5 text-left"
        >
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-white/25" strokeWidth={1.5} />
            <span className="text-[12px] font-medium text-white/70">PDA Inspector</span>
            <span className="font-mono text-[9px] text-white/28">— {PDA_GROUPS.reduce((s, g) => s + g.rows.length, 0)} accounts</span>
          </div>
          <Eye className={`h-3.5 w-3.5 text-white/25 transition-transform ${pdaOpen ? '' : 'opacity-40'}`} strokeWidth={1.5} />
        </button>
        {pdaOpen && (
          <div className="p-4 space-y-5">
            {PDA_GROUPS.map(({ title, rows }) => (
              <div key={title}>
                <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-white/22 px-1">{title}</div>
                <div className="space-y-1">
                  {rows.map(({ label, pubkey, balance, note }) => (
                    <PdaRow key={label} label={label} pubkey={pubkey} balance={balance} note={note} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Event log */}
      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
        <div className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3.5">
          <Eye className="h-4 w-4 text-white/25" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-white/70">Protocol Event Log</span>
          <span className="font-mono text-[9px] text-white/28">
            {filteredLog.length}/{log.length} entries
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/25" />
              <input
                type="text"
                placeholder="Filter…"
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="h-7 w-44 rounded-md border border-white/[0.08] bg-white/[0.04] pl-7 pr-3 font-mono text-[10px] text-white placeholder-white/20 focus:border-white/20 focus:outline-none"
              />
            </div>
            <button
              onClick={clearLog}
              disabled={log.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] text-white/20 transition-colors hover:text-rose-400 disabled:opacity-30"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto p-4">
          {filteredLog.length === 0 ? (
            <p className="text-center font-mono text-[11px] text-white/18 py-8">
              {log.length === 0 ? 'No events yet — perform actions to populate the log.' : 'No entries match filter.'}
            </p>
          ) : (
            <div className="space-y-0.5">
              {filteredLog.map((entry, i) => (
                <div
                  key={i}
                  className={`font-mono text-[10px] leading-relaxed ${
                    entry.includes('✓') ? 'text-emerald-400/70' :
                    entry.includes('✗') ? 'text-rose-400/70' :
                    'text-white/30'
                  }`}
                >
                  {entry}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* On-chain metrics */}
      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#070707]">
        <div className="flex items-center gap-2 border-b border-white/[0.05] px-5 py-3.5">
          <Eye className="h-4 w-4 text-white/25" strokeWidth={1.5} />
          <span className="text-[12px] font-medium text-white/70">On-chain Metrics</span>
        </div>
        <div className="grid grid-cols-2 divide-x divide-white/[0.04] xl:grid-cols-4">
          {[
            { label: 'Config Initialized', value: vd?.config ? 'Yes' : 'No', ok: !!vd?.config },
            { label: 'Vault State', value: vd?.vault ? Object.keys(vd.vault.state ?? {})[0] ?? 'active' : '—', ok: !!vd?.vault },
            { label: 'Loan State', value: vd?.loan ? Object.keys(vd.loan.state ?? {})[0] ?? 'active' : 'None', ok: !!vd?.loan },
            { label: 'Reserve / TVL', value: vd ? `${((Number(vd.reserveBalance) / Math.max(1, Number((vd.tranches ?? []).reduce((s, t) => s + t.totalAssets, 0n)))) * 100).toFixed(1)}%` : '—', ok: true },
          ].map(({ label, value, ok }) => (
            <div key={label} className="px-5 py-4">
              <div className="font-mono text-[9px] uppercase tracking-widest text-white/22 mb-1.5">{label}</div>
              <div className={`font-mono text-[14px] font-semibold ${ok ? 'text-white/70' : 'text-rose-400'}`}>{value}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
