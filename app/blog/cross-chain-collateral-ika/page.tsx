import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FooterSection } from "@/components/landing/footer-section";
import { Navigation } from "@/components/landing/navigation";
import { WaitlistDialog } from "@/components/landing/waitlist-dialog";

export const metadata: Metadata = {
  title: "Cross-Chain Collateral Was the Missing Piece - PRISM Protocol",
  description:
    "For PRISM to enable real credit markets, borrowers needed a way to lock non-native collateral without trusting a single intermediary. IKA Network's threshold MPC wallets are how we solved it.",
};

const collateralProblems = [
  "Custodial bridges require trusting a single operator.",
  "Over $2B in bridge exploits since 2021.",
  "Wrapped assets are liabilities of whoever controls the mint.",
  "No existing path for trustless BTC or ETH collateral on Stellar.",
];

const ikaProperties = [
  "The key is never held by any single node or party.",
  "A threshold consensus is required to produce any signature.",
  "No one — not even IKA — can move funds unilaterally.",
  "Built on Sui with cryptographic guarantees, not policy promises.",
];

const dwalletFlow = [
  {
    step: "01",
    title: "Distributed Key Generation",
    body: "The borrower runs DKG on IKA via the Sui SDK. The output is a dwalletId — a cryptographic reference to a multi-party key held across the IKA node network.",
  },
  {
    step: "02",
    title: "Collateral Transfer",
    body: "The borrower transfers BTC or ETH to the address derived from the dWallet key. No bridge. No custodian. The assets live on their native chains.",
  },
  {
    step: "03",
    title: "Oracle Attestation",
    body: "IKA's oracle network reads the on-chain collateral balance and produces an 81-byte attestation message, signed by the oracle set using Ed25519.",
  },
  {
    step: "04",
    title: "On-Chain Verification",
    body: "PRISM submits a two-instruction transaction: the Ed25519 precompile verifies the oracle signature, then verify_ika_collateral reads the result via the instructions sysvar.",
  },
];

const withoutIka = [
  "PRISM limited to borrowers with existing Stellar assets.",
  "Collateral options restricted to SPL tokens.",
  "Real-world credit remains out of reach for BTC and ETH holders.",
  "The $1T+ in native BTC and ETH stays locked out of on-chain credit.",
];

const withIka = [
  "BTC and ETH holders access structured credit without selling.",
  "Collateral verification is fully on-chain — no off-chain trust.",
  "The addressable market expands to every major crypto holder.",
  "Default risk is secured by threshold-cryptographic collateral, not promises.",
];

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-5 space-y-3">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-base leading-7 text-white/62">
          <span className="mt-3 h-px w-6 shrink-0 bg-[#eca8d6]/70" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ArticleSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-white/10 py-12 lg:py-14">
      <div className="mb-5 flex items-center gap-4 font-mono text-xs uppercase text-white/35">
        <span className="h-px w-10 bg-white/20" />
        {eyebrow}
      </div>
      <h2 className="max-w-3xl font-display text-4xl leading-none text-white md:text-5xl">
        {title}
      </h2>
      <div className="mt-6 space-y-5 text-lg leading-8 text-white/62">
        {children}
      </div>
    </section>
  );
}

export default function CrossChainCollateralArticlePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navigation />

      <article>
        <header className="relative overflow-hidden border-b border-white/10 bg-black pt-32">
          <div className="absolute inset-0">
            <Image
              src="/images/permissions.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-55 brightness-105 contrast-115 saturate-120"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-black/18" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-black/12 to-black/42" />
          </div>

          <div className="absolute inset-0 opacity-20">
            <div className="h-full w-full bg-[linear-gradient(to_right,rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[size:120px_120px]" />
          </div>

          <div className="relative z-10 mx-auto max-w-[1400px] px-6 pb-16 lg:px-12 lg:pb-20">
            <Link
              href="/blog"
              className="mb-12 inline-flex items-center gap-2 font-mono text-sm text-white/55 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to blog
            </Link>

            <div className="max-w-5xl">
              <div className="mb-6 flex items-center gap-4 font-mono text-sm uppercase text-white/50">
                <span className="h-px w-12 bg-white/25" />
                Infrastructure
                <span className="h-px w-8 bg-white/20" />
                MAY 2026
              </div>

              <h1 className="font-display text-5xl leading-[0.94] text-white md:text-7xl lg:text-[6.25rem]">
                Cross-chain collateral
                <br />
                was the missing piece.
              </h1>

              <p className="mt-7 max-w-3xl text-xl leading-8 text-white/65">
                For PRISM to enable real credit markets, borrowers needed a trustless way to lock non-native collateral — BTC, ETH — without routing through a custodian. IKA Network's threshold MPC dWallets are how we solved it.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-20">
          <div className="max-w-4xl">
            <ArticleSection eyebrow="The gap" title="Real credit needs real collateral.">
              <p>
                PRISM is built for real-world credit — businesses, invoice financiers, capital allocators who do not hold their wealth in USDC. They hold it in BTC. In ETH. In assets that predate Stellar entirely.
              </p>
              <p>
                To underwrite credit against those assets, you need a way to lock them. Every path that existed before IKA ran through a centralized intermediary.
              </p>
              <BulletList items={collateralProblems} />
              <p>
                Custodial bridges do not solve the collateral problem. They move it — from an asset risk to a counterparty risk. A borrower who wraps BTC through a custodied bridge has not secured their collateral. They have loaned it.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="IKA Network" title="A wallet that no single party controls.">
              <p>
                IKA Network is a threshold Multi-Party Computation (MPC) network built on Sui. It enables a new primitive: dWallets. A dWallet is a cross-chain wallet whose private key is never assembled in one place.
              </p>
              <p>
                Instead of a single keyholder, the key is split across a decentralized node network using cryptographic secret sharing. Signing requires a threshold of nodes to cooperate — each contributes a key fragment, and the final signature emerges from their collective computation.
              </p>
              <BulletList items={ikaProperties} />
              <p>
                This is not a multi-sig. Multi-sig requires multiple keys that each exist independently. Threshold MPC means the key itself never exists as a whole — it is only ever expressed as a collective output. The cryptographic guarantees are stronger, the attack surface is smaller.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The flow" title="From BTC on-chain to credit on Stellar.">
              <p>
                PRISM's collateral onboarding flow is four steps. Each step is cryptographically verifiable. No step requires trusting a human.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                {dwalletFlow.map((item) => (
                  <div key={item.step} className="bg-black/80 p-5">
                    <div className="mb-3 font-mono text-xs uppercase text-[#eca8d6]/70">
                      {item.step}
                    </div>
                    <h3 className="font-display text-2xl leading-none text-white">
                      {item.title}
                    </h3>
                    <p className="mt-4 text-sm leading-6 text-white/55">
                      {item.body}
                    </p>
                  </div>
                ))}
              </div>
              <p>
                The result: the Stellar contract has verified — without any off-chain trust assumption — that a borrower controls a specific quantity of BTC or ETH on its native chain. That verification is the basis for credit.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="On-chain verification" title="The 81-byte attestation.">
              <p>
                IKA's oracle network produces an attestation when a dWallet's collateral balance crosses a threshold. This attestation encodes the dWallet ID, asset type, amount, and timestamp into a fixed 81-byte message, signed by the oracle set using Ed25519.
              </p>
              <p>
                Stellar's Soroban runtime includes native Ed25519 verification via <span className="font-mono text-sm text-white/80">env.crypto().ed25519_verify</span>. PRISM's <span className="font-mono text-sm text-white/80">verify_ika_collateral</span> contract function receives the attestation and oracle signature, verifies cryptographically, and registers the collateral on-chain.
              </p>
              <p>
                The message layout in <span className="font-mono text-sm text-white/80">ika.ts</span> is byte-identical to what the Rust program expects. Any mismatch fails the instruction. There is no oracle trust assumption beyond IKA's network itself — the cryptographic proof does the work.
              </p>
              <div className="mt-7 border border-white/10 bg-black/80 p-5">
                <div className="mb-3 font-mono text-xs uppercase text-white/35">
                  Transaction structure
                </div>
                <div className="grid gap-px border border-white/10 bg-white/10">
                  {[
                    ["ix[0]", "Ed25519 precompile", "Verify oracle signature"],
                    ["ix[1]", "verify_ika_collateral", "Read result via instructions sysvar"],
                  ].map(([index, name, desc]) => (
                    <div key={index} className="flex items-start gap-5 bg-black/80 px-4 py-3">
                      <span className="font-mono text-xs text-[#eca8d6]/70 shrink-0">{index}</span>
                      <span className="font-mono text-xs text-white/70">{name}</span>
                      <span className="ml-auto font-mono text-xs text-white/35">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            </ArticleSection>

            <ArticleSection eyebrow="Implications" title="What changes when collateral is trustless.">
              <p>
                The difference between PRISM with and without IKA is the difference between a niche protocol and a general-purpose credit market.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-white/35">
                    Without IKA
                  </div>
                  <ul className="space-y-3">
                    {withoutIka.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-white/20" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-[#eca8d6]/70">
                    With IKA
                  </div>
                  <ul className="space-y-3">
                    {withIka.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-[#eca8d6]/50" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p>
                The addressable market for PRISM is not constrained to Stellar-native capital. It is every holder of BTC and ETH who has ever needed credit and found no trustless path to access it.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Foundation" title="Encryption is infrastructure, not a feature.">
              <p>
                Threshold MPC is easy to describe as a security feature. But for PRISM, it is closer to what TCP/IP is for the internet: an infrastructure layer without which the application layer cannot exist.
              </p>
              <p>
                PRISM's credit market requires verifiable collateral. Verifiable collateral requires a way to lock assets without trusting any single party. Trusting any single party reintroduces counterparty risk — which is precisely what on-chain credit was supposed to eliminate.
              </p>
              <p>
                IKA's dWallets close that loop. The chain of trust from collateral to credit to loan disbursement is now end-to-end cryptographic. Not policy-based. Not custodian-based. Provable.
              </p>
              <p>
                That is what makes PRISM's credit market genuinely different — and why IKA was never optional. It was the prerequisite.
              </p>
              <WaitlistDialog>
                <button
                  type="button"
                  className="mt-8 inline-flex items-center gap-2 border border-white/15 bg-white px-5 py-3 font-mono text-sm text-black transition-colors hover:bg-[#eca8d6]"
                >
                  Join the waitlist
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </WaitlistDialog>
            </ArticleSection>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-28 border border-white/10 bg-white/[0.025] p-6">
              <div className="font-mono text-xs uppercase text-white/35">Article thesis</div>
              <div className="mt-5 font-display text-5xl text-white">81</div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                bytes in the IKA attestation — the entire proof that BTC or ETH collateral is locked, verified on-chain with no custodian.
              </p>
              <div className="mt-8 grid gap-px border border-white/10 bg-white/10">
                {["Lock BTC/ETH", "Attest on IKA", "Verify on Stellar"].map((item) => (
                  <div key={item} className="bg-black/80 px-4 py-3 font-mono text-xs uppercase text-white/55">
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-white/10 pt-6">
                <div className="font-mono text-xs uppercase text-white/35">Key facts</div>
                <div className="mt-4 space-y-3">
                  {[
                    ["Attestation", "81 bytes, Ed25519"],
                    ["Network", "IKA on Sui"],
                    ["Verification", "On-chain precompile"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="font-mono text-xs uppercase text-white/35">{label}</span>
                      <span className="font-mono text-xs text-white/60">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </article>

      <FooterSection />
    </main>
  );
}
