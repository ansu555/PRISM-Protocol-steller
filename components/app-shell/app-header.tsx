"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ConnectWalletButton } from "./connect-wallet-button";
import { TestnetFaucetButton } from "./testnet-faucet-button";

const NAV_LINKS = [
  { label: "Overview", href: "/dashboard" },
  { label: "Earn", href: "/earn" },
  { label: "Protect", href: "/protect" },
  { label: "Trade", href: "/trade" },
  { label: "Borrow", href: "/borrow" },
  { label: "Terminal", href: "/terminal" },
  { label: "Docs", href: "https://docs.prismprotocol.dev/" },
] as const;

export function AppHeader() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const isFloatingHeader = isScrolled || mobileMenuOpen;

  useEffect(() => {
    const handleScroll = () => {
      const appScroller = document.querySelector<HTMLElement>("[data-app-scroll]");
      const scrollTop =
        appScroller?.scrollTop ??
        window.scrollY ??
        document.documentElement.scrollTop ??
        document.body.scrollTop ??
        0;

      setIsScrolled(scrollTop > 20);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, true);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [pathname]);

  return (
    <header
      className={[
        "fixed z-50 transition-all duration-500",
        isFloatingHeader ? "left-4 right-4 top-4" : "left-0 right-0 top-0",
      ].join(" ")}
    >
      <nav
        aria-label="Primary"
        className={[
          "mx-auto transition-all duration-500",
          isFloatingHeader
            ? "max-w-[1200px] rounded-2xl border border-foreground/10 bg-background/80 shadow-lg backdrop-blur-xl"
            : "max-w-[1400px] bg-transparent",
        ].join(" ")}
      >
        <div
          className={[
            "flex items-center justify-between gap-4 px-6 transition-all duration-500 lg:px-8",
            isFloatingHeader ? "h-14" : "h-20",
          ].join(" ")}
        >
          <Link
            href="/dashboard"
            aria-label="PRISM Protocol home"
            className="group flex min-w-0 items-center gap-3"
          >
            <span
              className={[
                "relative shrink-0 overflow-hidden transition-all duration-500",
                isFloatingHeader ? "h-8 w-8" : "h-11 w-11",
              ].join(" ")}
            >
              <Image
                src="/logos/prism.png"
                alt="PRISM logo"
                width={240}
                height={160}
                priority
                className={[
                  "absolute left-1/2 top-[54%] max-w-none -translate-x-1/2 -translate-y-1/2 object-contain transition-all duration-500",
                  isFloatingHeader ? "h-28 w-[10.5rem]" : "h-36 w-[13.5rem]",
                ].join(" ")}
              />
            </span>
            <span
              className={[
                "font-display tracking-tight transition-all duration-500",
                isFloatingHeader ? "text-xl text-foreground" : "text-2xl text-white",
              ].join(" ")}
            >
              PRISM
            </span>
            <span
              className={[
                "hidden font-mono transition-all duration-500 sm:inline",
                isFloatingHeader ? "mt-0.5 text-[10px] text-muted-foreground" : "mt-1 text-xs text-white/60",
              ].join(" ")}
            >
              PROTOCOL
            </span>
          </Link>

          <div className="hidden items-center gap-6 md:flex lg:gap-8">
            {NAV_LINKS.map((link) => {
              const external = link.href.startsWith("http");
              const hrefPath = link.href.split("#")[0];
              const active =
                !external &&
                (pathname === hrefPath || (hrefPath !== "/dashboard" && pathname.startsWith(`${hrefPath}/`)));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer" : undefined}
                  className={[
                    "group relative text-sm transition-colors duration-300",
                    isFloatingHeader ? "text-foreground/70 hover:text-foreground" : "text-white/70 hover:text-white",
                  ].join(" ")}
                >
                  {link.label}
                  <span
                    className={[
                      "absolute -bottom-1 left-0 h-px transition-all duration-300",
                      isFloatingHeader ? "bg-foreground" : "bg-white",
                      active ? "w-full" : "w-0 group-hover:w-full",
                    ].join(" ")}
                  />
                </Link>
              );
            })}
          </div>

          <div className="hidden items-center gap-3 md:flex">

            <ConnectWalletButton />
          </div>

          <div className="flex items-center gap-2 md:hidden">

            <ConnectWalletButton />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((value) => !value)}
              aria-label="Toggle menu"
              className={[
                "flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-black/30 backdrop-blur transition-colors duration-500 hover:bg-white/10",
                isFloatingHeader ? "text-foreground" : "text-white",
              ].join(" ")}
            >
              <span className="relative h-4 w-5" aria-hidden="true">
                <span
                  className={[
                    "absolute left-0 top-0 h-px w-5 bg-current transition-transform",
                    mobileMenuOpen ? "translate-y-2 rotate-45" : "",
                  ].join(" ")}
                />
                <span
                  className={[
                    "absolute left-0 top-2 h-px w-5 bg-current transition-opacity",
                    mobileMenuOpen ? "opacity-0" : "opacity-100",
                  ].join(" ")}
                />
                <span
                  className={[
                    "absolute left-0 top-4 h-px w-5 bg-current transition-transform",
                    mobileMenuOpen ? "-translate-y-2 -rotate-45" : "",
                  ].join(" ")}
                />
              </span>
            </button>
          </div>
        </div>

        <div
          className={[
            "mx-6 overflow-hidden rounded-2xl border border-white/10 bg-background/90 shadow-2xl backdrop-blur-xl transition-all duration-500 md:hidden",
            mobileMenuOpen ? "max-h-96 opacity-100" : "max-h-0 border-transparent opacity-0",
          ].join(" ")}
        >
          <div className="grid gap-1 p-2">
            {NAV_LINKS.map((link) => {
              const external = link.href.startsWith("http");
              const hrefPath = link.href.split("#")[0];
              const active =
                !external &&
                (pathname === hrefPath || (hrefPath !== "/dashboard" && pathname.startsWith(`${hrefPath}/`)));
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={[
                    "rounded-md px-3 py-3 text-sm transition-colors",
                    active ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </header>
  );
}
