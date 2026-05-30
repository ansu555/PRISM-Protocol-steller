"use client";

import { useState } from "react";
import { useStellarWallet } from "@/components/providers/stellar-wallet-context";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const FRIENDBOT_URL = "https://friendbot.stellar.org";

export function TestnetFaucetButton() {
  const { address } = useStellarWallet();
  const [requesting, setRequesting] = useState(false);

  if (!address) {
    return null;
  }

  const handleFaucet = async () => {
    setRequesting(true);

    try {
      const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`);

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { detail?: string };
        throw new Error(body.detail ?? "Friendbot request failed");
      }

      toast.success("10,000 testnet XLM sent to your wallet");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Faucet request failed");
    } finally {
      setRequesting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleFaucet}
      disabled={requesting}
      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/12 bg-black px-3.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)] transition-colors hover:border-white/25 hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-60 md:h-9 md:px-4"
      title="Request testnet XLM via Friendbot"
    >
      {requesting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {requesting ? "Sending" : "Testnet Faucet"}
    </button>
  );
}
