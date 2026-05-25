"use client";

// Testnet XLM faucet — opens Stellar Lab's Friendbot in a new tab.
// The Solana version POSTed to an in-house API route; on Stellar the
// official testnet faucet is browser-only, so we just deep-link.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useStellarWallet } from "@/components/providers/stellar-wallet-provider";

const FRIENDBOT_URL = "https://friendbot.stellar.org";

export function TestnetFaucetButton() {
  const { connected, address } = useStellarWallet();
  const [requesting, setRequesting] = useState(false);

  if (!connected || !address) {
    return null;
  }

  const handleAirdrop = async () => {
    setRequesting(true);
    try {
      const res = await fetch(`${FRIENDBOT_URL}/?addr=${address}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Friendbot rejected: ${text}`);
      }
      toast.success(`Friendbot funded ${address.slice(0, 4)}…${address.slice(-4)} with testnet XLM`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Faucet request failed";
      toast.error(msg, {
        description: "If this keeps failing, the account may already be funded — check stellar.expert.",
      });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleAirdrop}
      disabled={requesting}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-black px-3.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-colors hover:border-white/25 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60 md:h-9 md:px-4"
      title="Request testnet XLM"
    >
      {requesting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {requesting ? "Funding" : "Testnet Faucet"}
    </button>
  );
}
