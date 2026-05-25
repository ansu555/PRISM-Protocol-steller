"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Copy, ExternalLink, LogOut, Wallet } from "lucide-react";

import { useStellarWallet } from "@/components/providers/stellar-wallet-provider";

function shortAddress(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function ConnectWalletButton() {
  const { address, connected, connect, disconnect, pending } = useStellarWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!connected || !address) {
    return (
      <button
        type="button"
        onClick={() => {
          void connect();
        }}
        disabled={pending}
        aria-label="Connect wallet"
        className="group flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-pink-500/70 bg-pink-500/50 text-sm font-semibold text-pink-200 shadow-[0_10px_32px_rgba(236,72,153,0.25)] transition-all duration-300 hover:w-[172px] hover:px-5 disabled:opacity-50"
      >
        <Wallet className="h-5 w-5 shrink-0" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 group-hover:ml-2 group-hover:max-w-[100px]">
          {pending ? "Connecting…" : "Connect Wallet"}
        </span>
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Wallet menu"
        className={[
          "group flex h-14 items-center justify-center overflow-hidden rounded-full border border-pink-500/70 bg-pink-500/50 text-sm font-semibold text-pink-200 shadow-[0_10px_32px_rgba(236,72,153,0.25)] transition-all duration-300",
          open ? "w-[172px] px-5" : "w-14 hover:w-[172px] hover:px-5",
        ].join(" ")}
      >
        <Wallet className="h-5 w-5 shrink-0" />
        <span
          className={[
            "overflow-hidden whitespace-nowrap font-mono text-xs transition-all duration-300",
            open
              ? "ml-2 max-w-[80px]"
              : "ml-0 max-w-0 group-hover:ml-2 group-hover:max-w-[80px]",
          ].join(" ")}
        >
          {shortAddress(address)}
        </span>
        <ChevronDown
          className={[
            "h-3.5 w-3.5 shrink-0 transition-all duration-300",
            open
              ? "ml-1.5 max-w-[14px] rotate-180"
              : "ml-0 max-w-0 group-hover:ml-1.5 group-hover:max-w-[14px]",
          ].join(" ")}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-md border border-white/10 bg-black/95 shadow-2xl backdrop-blur">
          <div className="border-b border-white/10 px-3 py-2 text-[11px] text-white/50">
            Connected to Stellar testnet
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(address);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy address
          </button>
          <a
            href={`https://stellar.expert/explorer/testnet/account/${address}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View on Explorer
          </a>
          <button
            type="button"
            onClick={() => {
              void disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 border-t border-white/10 px-3 py-2.5 text-left text-sm text-pink-300 transition-colors hover:bg-pink-500/10"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
