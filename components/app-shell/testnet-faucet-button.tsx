"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const SOLANA_FAUCET_URL = "https://faucet.solana.com";

export function TestnetFaucetButton() {
  const { connected, publicKey } = useWallet();
  const [requesting, setRequesting] = useState(false);

  if (!connected || !publicKey) {
    return null;
  }

  const handleAirdrop = async () => {
    setRequesting(true);

    try {
      const response = await fetch("/api/testnet-faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey }),
      });
      const result = (await response.json()) as {
        amount?: number;
        error?: string;
        faucetUrl?: string;
      };

      if (!response.ok || !result.amount) {
        if (result.faucetUrl) {
          toast.error("Devnet faucet limit reached", {
            description: "Use the official Solana faucet for another test SOL source.",
            action: {
              label: "Open faucet",
              onClick: () => window.open(result.faucetUrl ?? SOLANA_FAUCET_URL, "_blank", "noopener,noreferrer"),
            },
          });
          return;
        }

        throw new Error(result.error ?? "Devnet faucet refused the request.");
      }

      toast.success(`${result.amount} testnet SOL sent to your wallet`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Faucet request failed");
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
      title="Request testnet SOL"
    >
      {requesting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {requesting ? "Sending" : "Testnet Faucet"}
    </button>
  );
}
