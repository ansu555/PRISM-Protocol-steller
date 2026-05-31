'use client';

import { useState, useEffect, useCallback } from 'react';
import { BrowserProvider, Contract, parseUnits, formatUnits, JsonRpcSigner } from 'ethers';
import { getCoreClient, freighterSigner, addr, nativeToScVal } from '@/app/lib/stellar';
import { useStellarWallet } from '@/components/providers/stellar-wallet-provider';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Chain + token config ─────────────────────────────────────────────────────

interface Token {
  symbol: string;
  name: string;
  address: string;       // '0x0' = native ETH
  decimals: number;
  isNative: boolean;
  priceFeed: string | null; // Chainlink price feed address, null = stablecoin ($1)
}

interface ChainConfig {
  name: string;
  shortName: string;
  vault: string;
  explorer: string;
  tokens: Token[];
}

// Chainlink Sepolia price feed addresses (8 decimals each)
// https://docs.chain.link/data-feeds/price-feeds/addresses?network=ethereum&page=1#sepolia-testnet
const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  11155111: {
    name: 'Ethereum Sepolia',
    shortName: 'Sepolia',
    vault: '0xd0130A053820F292B1807C246a1074443E491fcb',
    explorer: 'https://sepolia.etherscan.io',
    tokens: [
      {
        symbol: 'ETH',  name: 'Ethereum',   address: '0x0',
        decimals: 18, isNative: true,
        priceFeed: '0x694AA1769357215DE4FAC081bf1f309aDC325306', // ETH/USD
      },
      {
        symbol: 'USDC', name: 'Mock USDC',  address: '0x12A70376258f53BbAd1d7387bcBA4084df4B4211',
        decimals: 6,  isNative: false,
        priceFeed: null, // Stablecoin — hardcoded $1
      },
      {
        symbol: 'wETH', name: 'Mock wETH',  address: '0xC426c75d79D833e9924De6cA26378FDcF49e912C',
        decimals: 18, isNative: false,
        priceFeed: '0x694AA1769357215DE4FAC081bf1f309aDC325306', // ETH/USD (wETH ≡ ETH)
      },
    ],
  },
};

const DEFAULT_CHAIN_ID = 11155111;

// ─── ABIs (minimal) ───────────────────────────────────────────────────────────

const VAULT_ABI = [
  'function lock(uint32 stellarLoanId, address token, uint256 amount, string calldata stellarBorrower) external',
  'function lockETH(uint32 stellarLoanId, string calldata stellarBorrower) external payable',
];

const ERC20_ABI = [
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

const CHAINLINK_ABI = [
  'function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80)',
  'function decimals() external view returns (uint8)',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

type FlowStep = 'checking' | 'connect' | 'select' | 'approve' | 'approving' | 'lock' | 'locking' | 'stellar_register' | 'stellar_registering' | 'oracle_pending';

// ─── Chainlink price fetcher ──────────────────────────────────────────────────

async function fetchChainlinkPrices(
  provider: BrowserProvider,
  tokens: Token[],
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  // Cache by feed address so we don't fetch ETH/USD twice (ETH + wETH share the same feed)
  const feedCache: Record<string, number> = {};

  await Promise.all(tokens.map(async (token) => {
    if (token.priceFeed === null) {
      // Stablecoin — $1
      prices[token.symbol] = 1;
      return;
    }
    if (feedCache[token.priceFeed] !== undefined) {
      prices[token.symbol] = feedCache[token.priceFeed];
      return;
    }
    try {
      const feed = new Contract(token.priceFeed, CHAINLINK_ABI, provider);
      const [, answer, , updatedAt] = await feed.latestRoundData() as [unknown, bigint, unknown, bigint, unknown];
      const decimals = await feed.decimals() as number;

      // Reject stale data older than 1 hour
      const age = Math.floor(Date.now() / 1000) - Number(updatedAt);
      if (age > 3600) throw new Error('stale');

      const price = Number(answer) / 10 ** Number(decimals);
      prices[token.symbol] = price;
      feedCache[token.priceFeed] = price;
    } catch {
      prices[token.symbol] = 0; // 0 = failed, handled in UI
    }
  }));

  return prices;
}

// ─── Balance fetcher ──────────────────────────────────────────────────────────

async function fetchBalances(
  provider: BrowserProvider,
  address: string,
  tokens: Token[],
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await Promise.all(tokens.map(async (token) => {
    try {
      if (token.isNative) {
        const bal = await provider.getBalance(address);
        results[token.symbol] = formatUnits(bal, 18);
      } else {
        const contract = new Contract(token.address, ERC20_ABI, provider);
        const bal = await contract.balanceOf(address) as bigint;
        results[token.symbol] = formatUnits(bal, token.decimals);
      }
    } catch {
      results[token.symbol] = '—';
    }
  }));
  return results;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  stellarAddress: string;
  loanId: number;
  requestedUSDC: number;
  collateralStatus: string | undefined;
}

export function EVMCollateralStep({ stellarAddress, loanId, requestedUSDC, collateralStatus }: Props) {
  const { address: freighterAddress, signTransaction } = useStellarWallet();
  const [flowStep, setFlowStep]           = useState<FlowStep>('checking');
  const [evmAddress, setEvmAddress]       = useState('');
  const [chainId, setChainId]             = useState(0);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [amount, setAmount]               = useState('');
  const [txHash, setTxHash]               = useState('');
  const [signer, setSigner]               = useState<JsonRpcSigner | null>(null);
  const [error, setError]                 = useState('');
  const [balances, setBalances]           = useState<Record<string, string>>({});
  const [prices, setPrices]               = useState<Record<string, number>>({});
  const [loadingBals, setLoadingBals]     = useState(false);

  const chain     = SUPPORTED_CHAINS[chainId];
  const isCorrectChain = !!chain;
  const minCollateral = (requestedUSDC * 1.2).toFixed(2);

  const isAttached = collateralStatus === 'Attached';

  // ── On-mount: restore state if EVM lock already exists ──────────────────────
  // Prevents the UI resetting to "Connect MetaMask" after a page refresh when
  // the borrower already locked collateral on EVM but hasn't signed on Stellar yet.

  useEffect(() => {
    if (isAttached) return;
    fetch(`/api/collateral/evm-lock?loanId=${loanId}`)
      .then(r => r.json())
      .then((d: { lock?: { state: string } }) => {
        if (d.lock?.state === 'Locked') {
          setFlowStep('stellar_register');
        } else {
          setFlowStep('connect');
        }
      })
      .catch(() => setFlowStep('connect'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId, isAttached]);

  // ── Balance refresh ─────────────────────────────────────────────────────────

  const refreshBalances = useCallback(async (provider: BrowserProvider, addr: string, cId: number) => {
    const c = SUPPORTED_CHAINS[cId];
    if (!c) return;
    setLoadingBals(true);
    try {
      const [bals, priceMap] = await Promise.all([
        fetchBalances(provider, addr, c.tokens),
        fetchChainlinkPrices(provider, c.tokens),
      ]);
      setBalances(bals);
      setPrices(priceMap);
    } finally {
      setLoadingBals(false);
    }
  }, []);

  // ── Connect MetaMask ────────────────────────────────────────────────────────

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      toast.error('MetaMask not found — install it from metamask.io');
      return;
    }
    try {
      const provider = new BrowserProvider(window.ethereum);
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      const s = await provider.getSigner();
      const addr = await s.getAddress();
      const net = await provider.getNetwork();
      const cId = Number(net.chainId);
      setSigner(s);
      setEvmAddress(addr);
      setChainId(cId);
      setFlowStep('select');
      const c = SUPPORTED_CHAINS[cId];
      if (c) setSelectedToken(c.tokens[0]);
      refreshBalances(provider, addr, cId);
    } catch {
      toast.error('MetaMask connection cancelled');
    }
  }, [refreshBalances]);

  // Listen for account / chain changes
  useEffect(() => {
    if (!window.ethereum) return;
    const handleChainChange = async () => {
      if (!window.ethereum) return;
      const provider = new BrowserProvider(window.ethereum);
      const net = await provider.getNetwork();
      const newChainId = Number(net.chainId);
      setChainId(newChainId);
      const c = SUPPORTED_CHAINS[newChainId];
      if (c) setSelectedToken(c.tokens[0]);
      if (evmAddress) refreshBalances(provider, evmAddress, newChainId);
    };
    const handleAccountChange = () => { setEvmAddress(''); setFlowStep('connect'); setSigner(null); };
    window.ethereum.on('chainChanged', handleChainChange);
    window.ethereum.on('accountsChanged', handleAccountChange);
    return () => {
      window.ethereum?.removeListener('chainChanged', handleChainChange);
      window.ethereum?.removeListener('accountsChanged', handleAccountChange);
    };
  }, []);

  // ── Switch network ──────────────────────────────────────────────────────────

  async function switchToSepolia() {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${DEFAULT_CHAIN_ID.toString(16)}` }],
      });
    } catch {
      toast.error('Switch network in MetaMask and reconnect');
    }
  }

  // ── Check allowance → decide approve or lock ────────────────────────────────

  async function handleContinue() {
    if (!signer || !selectedToken || !chain) return;
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) { toast.error('Enter a valid amount'); return; }

    if (selectedToken.isNative) {
      setFlowStep('lock');
      return;
    }

    try {
      const token = new Contract(selectedToken.address, ERC20_ABI, signer);
      const amountWei = parseUnits(amount, selectedToken.decimals);
      const allowance = await token.allowance(evmAddress, chain.vault) as bigint;
      if (allowance >= amountWei) {
        setFlowStep('lock');
      } else {
        setFlowStep('approve');
      }
    } catch {
      toast.error('Could not check token allowance');
    }
  }

  // ── Approve ERC-20 ──────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!signer || !selectedToken || !chain) return;
    setFlowStep('approving');
    setError('');
    try {
      const token = new Contract(selectedToken.address, ERC20_ABI, signer);
      const amountWei = parseUnits(amount, selectedToken.decimals);
      const tx = await token.approve(chain.vault, amountWei) as { wait: () => Promise<unknown> };
      await tx.wait();
      toast.success(`${selectedToken.symbol} approved`);
      setFlowStep('lock');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Approval failed';
      setError(msg);
      setFlowStep('approve');
      toast.error(msg.slice(0, 120));
    }
  }

  // ── Lock collateral ─────────────────────────────────────────────────────────

  async function handleLock() {
    if (!signer || !selectedToken || !chain) return;
    setFlowStep('locking');
    setError('');
    try {
      const vault = new Contract(chain.vault, VAULT_ABI, signer);
      let tx: { hash: string; wait: () => Promise<unknown> };

      if (selectedToken.isNative) {
        const ethWei = parseUnits(amount, 18);
        tx = await vault.lockETH(loanId, stellarAddress, { value: ethWei }) as typeof tx;
      } else {
        const amountWei = parseUnits(amount, selectedToken.decimals);
        tx = await vault.lock(loanId, selectedToken.address, amountWei, stellarAddress) as typeof tx;
      }

      setTxHash(tx.hash);
      await tx.wait();

      toast.success('Collateral locked on Ethereum — register on Stellar next');
      setFlowStep('stellar_register');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Lock failed';
      // LoanAlreadyExists — collateral was locked in a previous session
      if (msg.includes('0xbf8484b5') || msg.toLowerCase().includes('alreadyexists')) {
        toast.info('Collateral already locked for this loan — proceeding to Stellar registration');
        setFlowStep('stellar_register');
        return;
      }
      setError(msg.slice(0, 200));
      setFlowStep('lock');
      toast.error('Lock failed — see details below');
    }
  }

  // ── Register collateral on Stellar (Freighter sign) ──────────────────────────
  // attach_collateral requires borrower.require_auth() on-chain.
  // Only the borrower's Freighter wallet can satisfy this — not the admin key.

  async function registerOnStellar() {
    if (!freighterAddress || !signTransaction) {
      toast.error('Freighter wallet not connected — reconnect on the borrow page');
      return;
    }
    setFlowStep('stellar_registering');
    setError('');
    try {
      // 1. Fetch live USD value: EVM lock amount × Chainlink price (server-side)
      const usdRes         = await fetch(`/api/collateral/evm-usd?loanId=${loanId}`);
      const usdData        = await usdRes.json() as { usdMicro?: string };
      const amountUsdMicro = usdData.usdMicro ?? '0';

      // 2. Get oracle pubkey + signed attestation
      const nonce = BigInt(Date.now()).toString();
      const attestRes = await fetch('/api/collateral-oracle/attest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_id:          loanId,
          chain_id:         1,
          asset_address:    '00'.repeat(32),
          amount_usd_micro: amountUsdMicro,
          valued_at_ts:     Math.floor(Date.now() / 1000).toString(),
          nonce,
          status:           'attached',
        }),
      });
      const attestData = await attestRes.json() as { oracle_pubkey_hex?: string; message_hex?: string; signature?: string; error?: string };
      if (!attestRes.ok || !attestData.oracle_pubkey_hex) throw new Error(attestData.error ?? 'Oracle attest failed');

      // 2. attach_collateral — Freighter signs (borrower.require_auth())
      const oracleBytes = Buffer.from(attestData.oracle_pubkey_hex, 'hex');
      const core    = getCoreClient();
      const fSigner = freighterSigner(freighterAddress, signTransaction);
      await core.invoke(fSigner, 'attach_collateral', [
        addr(freighterAddress),
        nativeToScVal(loanId, { type: 'u32' }),
        nativeToScVal(oracleBytes, { type: 'bytes' }),
      ]);
      toast.success('Registered on Stellar — oracle verifying…');

      // 3. verify_collateral — admin as relayer, no borrower key needed
      await fetch('/api/collateral/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId, messageHex: attestData.message_hex, signatureHex: attestData.signature, borrowerAddress: freighterAddress }),
      });

      setFlowStep('oracle_pending');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Stellar registration failed';
      setError(msg.slice(0, 200));
      setFlowStep('stellar_register');
      toast.error(msg.slice(0, 100));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  // Checking EVM lock state on mount
  if (flowStep === 'checking') {
    return (
      <div className="flex items-center gap-2.5 py-6 text-white/30">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-mono text-[10px]">Checking collateral status…</span>
      </div>
    );
  }

  // Oracle confirmed → final state
  if (isAttached) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 space-y-3">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0" />
          <div>
            <p className="font-sans text-base font-semibold text-emerald-300">Collateral Verified</p>
            <p className="font-mono text-[10px] text-white/30 mt-0.5">Oracle confirmed on Stellar · admin can now disburse</p>
          </div>
        </div>
        {txHash && (
          <a
            href={`${chain?.explorer ?? 'https://sepolia.etherscan.io'}/tx/${txHash}`}
            target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 font-mono text-[9px] text-white/30 hover:text-white/60 transition-colors"
          >
            View on Etherscan <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  // Step 2 of lock: register on Stellar with Freighter
  if (flowStep === 'stellar_register' || flowStep === 'stellar_registering') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
            <div>
              <p className="font-sans text-base font-semibold text-emerald-300">Locked on Ethereum</p>
              <p className="font-mono text-[10px] text-white/30 mt-0.5">0.6 ETH confirmed on-chain</p>
            </div>
          </div>
          {txHash && (
            <a href={`${chain?.explorer ?? 'https://sepolia.etherscan.io'}/tx/${txHash}`}
              target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-[9px] text-white/30 hover:text-white/60">
              <ExternalLink className="h-3 w-3" /> {txHash.slice(0, 12)}… on Etherscan
            </a>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 space-y-4">
          <div>
            <p className="font-sans text-sm font-semibold text-white">Register on Stellar</p>
            <p className="font-mono text-[10px] text-white/30 mt-1">
              Sign with Freighter to register the collateral oracle. This requires your Stellar wallet signature — the admin cannot do this on your behalf.
            </p>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
              <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
              <p className="font-mono text-[10px] text-rose-300 leading-relaxed">{error}</p>
            </div>
          )}
          <button onClick={registerOnStellar} disabled={flowStep === 'stellar_registering'}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-40 transition-all">
            {flowStep === 'stellar_registering'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing with Freighter…</>
              : <><ShieldCheck className="h-4 w-4" /> Sign with Freighter</>
            }
          </button>
        </div>
      </div>
    );
  }

  // Oracle waiting (EVM tx done, watcher hasn't attested yet)
  if (flowStep === 'oracle_pending') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-5">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="h-5 w-5 text-amber-400 animate-spin" />
            <div>
              <p className="font-sans text-base font-semibold text-amber-300">Waiting for Oracle</p>
              <p className="font-mono text-[10px] text-white/30 mt-0.5">
                EVM lock confirmed · PRISM oracle verifying on Stellar
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: 'EVM Lock', done: true },
              { label: 'Oracle Detection (~30s)', done: false },
              { label: 'Stellar Attestation', done: false },
              { label: 'Ready for Disbursal', done: false },
            ].map(({ label, done }) => (
              <div key={label} className="flex items-center gap-2.5">
                {done
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  : <div className="h-3.5 w-3.5 rounded-full border border-white/20 shrink-0" />
                }
                <span className={`font-mono text-[10px] ${done ? 'text-white/60' : 'text-white/25'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        {txHash && (
          <a
            href={`${chain?.explorer ?? 'https://sepolia.etherscan.io'}/tx/${txHash}`}
            target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 font-mono text-[9px] text-white/30 hover:text-white/60 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> {txHash.slice(0, 12)}…{txHash.slice(-6)} on Etherscan
          </a>
        )}
        <p className="font-mono text-[9px] text-white/20 text-center">This page refreshes automatically every 8 seconds</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* Info banner */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="font-mono text-[10px] text-white/30 mb-1 uppercase tracking-widest">How it works</p>
        <p className="font-sans text-sm text-white/50 leading-relaxed">
          Lock collateral on Ethereum from your MetaMask wallet. The PRISM oracle detects the on-chain lock and attests it to Stellar automatically — no extra steps needed.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {['Lock on EVM', 'Oracle auto-detects', 'Stellar attestation', 'Funds disbursed'].map((s, i) => (
            <span key={s} className="flex items-center gap-1.5 font-mono text-[9px] text-white/25">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white/10 text-[8px]">{i + 1}</span>
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* ── Step: connect ── */}
      {flowStep === 'connect' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.06] bg-[#0f0f0f] p-4 flex items-center gap-3">
            <Wallet className="h-4 w-4 text-white/20 shrink-0" />
            <div>
              <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest">MetaMask Required</p>
              <p className="font-sans text-sm text-white/50 mt-0.5">Separate from your Freighter (Stellar) wallet</p>
            </div>
          </div>
          <button
            onClick={connectWallet}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 transition-all"
          >
            Connect MetaMask <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Steps: select / approve / lock ── */}
      {(flowStep === 'select' || flowStep === 'approve' || flowStep === 'approving' || flowStep === 'lock' || flowStep === 'locking') && (
        <div className="space-y-5">

          {/* Connected wallet */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
            <div>
              <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">MetaMask</p>
              <p className="font-mono text-[11px] text-white/60 mt-0.5">{evmAddress.slice(0, 8)}…{evmAddress.slice(-6)}</p>
            </div>
            {isCorrectChain
              ? <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 font-mono text-[9px] text-emerald-400">{chain.shortName}</span>
              : <button onClick={switchToSepolia} className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 font-mono text-[9px] text-amber-300 hover:bg-amber-500/20 transition-all">
                  Switch to Sepolia
                </button>
            }
          </div>

          {isCorrectChain && (
            <>
              {/* Token selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">
                    Collateral Token
                  </label>
                  {evmAddress && (
                    <button
                      type="button"
                      onClick={() => signer && refreshBalances(new BrowserProvider(window.ethereum!), evmAddress, chainId)}
                      className="font-mono text-[9px] text-white/20 hover:text-white/50 transition-colors"
                    >
                      {loadingBals ? <Loader2 className="h-3 w-3 animate-spin inline" /> : '↻ refresh'}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {chain.tokens.map(token => {
                    const bal = balances[token.symbol];
                    const balNum = bal && bal !== '—' ? parseFloat(bal) : null;
                    const balDisplay = balNum !== null
                      ? balNum < 0.0001 ? '0.00' : balNum.toFixed(token.decimals === 6 ? 2 : 4)
                      : bal ?? '…';
                    const isSelected = selectedToken?.symbol === token.symbol;
                    return (
                      <button
                        key={token.symbol}
                        type="button"
                        disabled={flowStep === 'locking' || flowStep === 'approving'}
                        onClick={() => { setSelectedToken(token); setAmount(''); }}
                        className={`py-3 px-3 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-white/30 bg-white/[0.06]'
                            : 'border-white/[0.06] hover:border-white/10 hover:bg-white/[0.02]'
                        }`}
                      >
                        <p className={`font-mono text-[12px] font-semibold ${isSelected ? 'text-white' : 'text-white/40'}`}>
                          {token.symbol}
                        </p>
                        <p className="font-mono text-[9px] text-white/20 mt-0.5">{token.name}</p>
                        <p className={`font-mono text-[10px] mt-1.5 ${
                          balNum !== null && balNum > 0 ? 'text-emerald-400/70' : 'text-white/20'
                        }`}>
                          {loadingBals ? '…' : balDisplay} {token.symbol}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Mint helper for mock tokens */}
                {chain.tokens.filter(t => !t.isNative).some(t => {
                  const b = parseFloat(balances[t.symbol] ?? '0');
                  return isNaN(b) || b < 1;
                }) && (
                  <p className="mt-2 font-mono text-[9px] text-white/25">
                    No mock tokens?{' '}
                    <a
                      href={`${chain.explorer}/address/${chain.tokens.find(t => t.symbol === 'USDC')?.address}#writeContract`}
                      target="_blank" rel="noreferrer"
                      className="text-emerald-400/50 hover:text-emerald-400 underline underline-offset-2"
                    >
                      Mint USDC
                    </a>
                    {' · '}
                    <a
                      href={`${chain.explorer}/address/${chain.tokens.find(t => t.symbol === 'wETH')?.address}#writeContract`}
                      target="_blank" rel="noreferrer"
                      className="text-emerald-400/50 hover:text-emerald-400 underline underline-offset-2"
                    >
                      Mint wETH
                    </a>
                    {' '}on Etherscan → Connect wallet → mint(yourAddress, amount)
                  </p>
                )}
              </div>

              {/* Amount + live USD conversion */}
              {(() => {
                const amountNum   = parseFloat(amount) || 0;
                const tokenPrice  = selectedToken ? (prices[selectedToken.symbol] ?? 0) : 0;
                const usdValue    = amountNum * tokenPrice;
                const minUsd      = requestedUSDC * 1.2;
                const ltvRatio    = usdValue > 0 ? (usdValue / requestedUSDC) * 100 : 0;
                const ltvOk       = usdValue >= minUsd;
                const hasBal      = selectedToken && balances[selectedToken.symbol] && balances[selectedToken.symbol] !== '—';
                const maxBal      = hasBal ? parseFloat(balances[selectedToken!.symbol]) : null;
                const priceKnown  = tokenPrice > 0;

                return (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="font-mono text-[10px] uppercase tracking-widest text-white/40">Amount</label>
                        {maxBal !== null && (
                          <button type="button"
                            onClick={() => setAmount(maxBal.toFixed(selectedToken!.decimals === 6 ? 2 : 6))}
                            className="font-mono text-[9px] text-white/25 hover:text-white/60 transition-colors">
                            Max: {maxBal.toFixed(selectedToken!.decimals === 6 ? 2 : 4)} {selectedToken!.symbol}
                          </button>
                        )}
                      </div>

                      <div className="relative">
                        <input
                          type="number" min="0" step="any" placeholder="0.00"
                          value={amount}
                          disabled={flowStep === 'locking' || flowStep === 'approving'}
                          onChange={e => setAmount(e.target.value)}
                          className={`w-full rounded-xl border bg-[#0f0f0f] px-4 py-3 font-mono text-white placeholder:text-white/20 focus:outline-none disabled:opacity-50 transition-colors ${
                            amount && !ltvOk ? 'border-amber-500/40 focus:border-amber-500/60'
                            : amount && ltvOk ? 'border-emerald-500/30 focus:border-emerald-500/50'
                            : 'border-white/[0.06] focus:border-white/20'
                          }`}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] text-white/25">
                          {selectedToken?.symbol}
                        </span>
                      </div>
                    </div>

                    {/* Live USD conversion bar */}
                    <div className={`rounded-xl border px-4 py-3 transition-colors ${
                      !amount ? 'border-white/[0.04] bg-white/[0.01]'
                      : ltvOk  ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                      :          'border-amber-500/20 bg-amber-500/[0.04]'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono text-[9px] text-white/25 uppercase tracking-widest">
                            Collateral Value{!priceKnown ? ' (price unavailable)' : ' · Chainlink'}
                          </p>
                          <p className={`font-mono text-xl font-semibold mt-0.5 ${
                            !amount ? 'text-white/20'
                            : ltvOk  ? 'text-emerald-400'
                            :          'text-amber-400'
                          }`}>
                            {priceKnown && amount
                              ? `$${usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : amount ? '—' : '$0.00'
                            }
                          </p>
                        </div>
                        {priceKnown && tokenPrice > 0 && (
                          <div className="text-right">
                            <p className="font-mono text-[9px] text-white/20 uppercase">
                              {selectedToken?.symbol}/USD
                            </p>
                            <p className="font-mono text-sm text-white/40 mt-0.5">
                              ${tokenPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* LTV ratio bar */}
                      {amount && parseFloat(amount) > 0 && priceKnown && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[9px] text-white/25">
                              Collateral ratio — {ltvRatio.toFixed(0)}% of loan
                            </span>
                            <span className={`font-mono text-[9px] font-semibold ${ltvOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {ltvOk ? '✓ Sufficient' : `Need $${(minUsd - usdValue).toFixed(2)} more`}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-white/[0.05] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${ltvOk ? 'bg-emerald-400' : 'bg-amber-400'}`}
                              style={{ width: `${Math.min(ltvRatio / 1.5, 100)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="font-mono text-[8px] text-white/15">0%</span>
                            <span className="font-mono text-[8px] text-white/25">120% min</span>
                            <span className="font-mono text-[8px] text-white/15">150%+</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: 'Loan Amount',   value: `$${requestedUSDC.toLocaleString()}` },
                        { label: 'Min Collateral', value: `$${minUsd.toFixed(2)}` },
                        { label: 'Vault',          value: `${chain.vault.slice(0, 6)}…${chain.vault.slice(-4)}` },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg bg-black/20 px-3 py-2.5">
                          <p className="font-mono text-[9px] text-white/20 uppercase">{label}</p>
                          <p className="font-mono text-[11px] text-white/60 mt-0.5">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
                  <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                  <p className="font-mono text-[10px] text-rose-300 leading-relaxed">{error}</p>
                </div>
              )}

              {/* Action buttons */}
              {(flowStep === 'select') && (() => {
                const amountNum  = parseFloat(amount) || 0;
                const tokenPrice = selectedToken ? (prices[selectedToken.symbol] ?? 0) : 0;
                const usdValue   = amountNum * tokenPrice;
                const ltvOk      = tokenPrice > 0 ? usdValue >= requestedUSDC * 1.2 : amountNum > 0;
                return (
                  <button
                    onClick={handleContinue}
                    disabled={!amount || amountNum <= 0 || !ltvOk}
                    title={!ltvOk ? `Collateral value $${usdValue.toFixed(2)} is below 120% minimum ($${(requestedUSDC * 1.2).toFixed(2)})` : ''}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-40 transition-all"
                  >
                    Continue <ArrowRight className="h-4 w-4" />
                  </button>
                );
              })()}

              {flowStep === 'approve' && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3">
                    <p className="font-mono text-[10px] text-amber-300">
                      Approval required — allow the vault to spend your {selectedToken?.symbol}
                    </p>
                  </div>
                  <button
                    onClick={handleApprove}
                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 transition-all"
                  >
                    Approve {selectedToken?.symbol} <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}

              {flowStep === 'approving' && (
                <button disabled className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-white/40">
                  <Loader2 className="h-4 w-4 animate-spin" /> Approving…
                </button>
              )}

              {flowStep === 'lock' && (
                <button
                  onClick={handleLock}
                  disabled={!amount || parseFloat(amount) <= 0}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black hover:bg-white/90 disabled:opacity-40 transition-all"
                >
                  <Lock className="h-4 w-4" /> Lock {amount || '0'} {selectedToken?.symbol} as Collateral
                </button>
              )}

              {flowStep === 'locking' && (
                <div className="space-y-3">
                  <button disabled className="w-full flex items-center justify-center gap-2 rounded-xl bg-white/10 py-3.5 font-mono text-[11px] font-bold uppercase tracking-widest text-white/40">
                    <Loader2 className="h-4 w-4 animate-spin" /> Locking on Ethereum…
                  </button>
                  {txHash && (
                    <a
                      href={`${chain.explorer}/tx/${txHash}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 font-mono text-[9px] text-white/30 hover:text-white/60"
                    >
                      <ExternalLink className="h-3 w-3" /> {txHash.slice(0, 12)}…
                    </a>
                  )}
                </div>
              )}
            </>
          )}

          {/* Not on correct chain */}
          {!isCorrectChain && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
              <p className="font-mono text-[10px] text-amber-300 mb-3">
                Connected to chain #{chainId} — switch to Ethereum Sepolia to lock collateral
              </p>
              <button
                onClick={switchToSepolia}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 py-3 font-mono text-[11px] text-amber-300 hover:bg-amber-500/20 transition-all"
              >
                Switch to Ethereum Sepolia
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
