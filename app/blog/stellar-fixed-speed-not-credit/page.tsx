import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FooterSection } from "@/components/landing/footer-section";
import { Navigation } from "@/components/landing/navigation";
import { WaitlistDialog } from "@/components/landing/waitlist-dialog";

export const metadata: Metadata = {
  title: "Stellar Fixed Speed. It Didn't Fix Credit. - PRISM Protocol",
  description:
    "Stellar made execution fast and cheap, but real credit markets still need structure, transparency, and liquid risk pricing.",
};

const currentStellarActivity = [
  "Spot trading.",
  "Memecoins.",
  "Perps.",
  "Yield loops.",
];

const missingCreditActivity = [
  "Lending into real usage.",
  "Pricing long-term risk.",
  "Allocating capital based on creditworthiness.",
];

const brokenParts = [
  {
    title: "No native way to price credit risk",
    body:
      "On Stellar today, lending is usually overcollateralized or fully trust-based. You either lock inefficient collateral or trust someone off-chain.",
  },
  {
    title: "Fragmented liquidity",
    body:
      "If every loan becomes its own token, every loan becomes its own market. Liquidity splits before real depth can form.",
  },
  {
    title: "Opaque risk",
    body:
      "Users cannot reason about credit if they cannot see who absorbs losses or how defaults propagate through the system.",
  },
  {
    title: "No real market reaction",
    body:
      "When something goes wrong, risk should reprice. Without a liquid surface for credit risk, prices cannot react in real time.",
  },
];

const triedModels = [
  "Per-loan tokenization - intuitive, but it kills liquidity.",
  "Overcollateralized lending - safer, but capital inefficient.",
  "Black-box funds - scalable, but opaque.",
];

const prismLayers = [
  {
    name: "Prime",
    color: "border-[#67e8f9]/40 text-[#67e8f9]",
    body: "Loss-protected exposure. Paid first in the yield waterfall and absorbs losses last.",
  },
  {
    name: "Core",
    color: "border-[#fbbf24]/40 text-[#fbbf24]",
    body: "Intermediate risk exposure. Paid second and absorbs remaining losses after Alpha.",
  },
  {
    name: "Alpha",
    color: "border-[#eca8d6]/40 text-[#eca8d6]",
    body: "15% target-yield exposure. Paid last and acts as first-loss capital.",
  },
];

const marketCanDo = [
  "Price credit risk continuously.",
  "React to defaults as they happen.",
  "Provide liquidity for defined risk exposure.",
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

export default function StellarFixedSpeedArticlePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navigation />

      <article>
        <header className="relative overflow-hidden border-b border-white/10 bg-black pt-32">
          <div className="absolute inset-0">
            <Image
              src="/images/isolated.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-58 brightness-105 contrast-115 saturate-130"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/68 to-black/18" />
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
                Market design
                <span className="h-px w-8 bg-white/20" />
                APR 2026
              </div>

              <h1 className="font-display text-5xl leading-[0.94] text-white md:text-7xl lg:text-[6.25rem]">
                Stellar fixed speed.
                <br />
                It didn't fix credit.
              </h1>

              <p className="mt-7 max-w-3xl text-xl leading-8 text-white/65">
                Stellar made execution fast, cheap, and increasingly usable. Trades settle quickly. Fees are negligible. UX keeps getting better. But one category is still missing: real credit markets.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-20">
          <div className="max-w-4xl">
            <ArticleSection eyebrow="Context" title="Stellar has activity. Credit is still absent.">
              <p>
                Most activity on Stellar today is short-term, reflexive, and built around capital recycling.
              </p>
              <BulletList items={currentStellarActivity} />
              <p>
                Very little of it looks like capital being allocated against durable credit risk.
              </p>
              <BulletList items={missingCreditActivity} />
              <p>
                The problem is not demand. The problem is structure.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Breakage" title="What is broken?">
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                {brokenParts.map((part) => (
                  <div key={part.title} className="bg-black/80 p-5">
                    <h3 className="font-display text-2xl leading-none text-white">
                      {part.title}
                    </h3>
                    <p className="mt-4 text-sm leading-6 text-white/55">
                      {part.body}
                    </p>
                  </div>
                ))}
              </div>
              <p>
                In other words: there is no system where risk is visible, structured, and priced by markets.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Dead ends" title="What has already been tried?">
              <p>
                Crypto credit has experimented with several models, but each one misses the same primitive: a market for risk itself.
              </p>
              <BulletList items={triedModels} />
              <p>
                Stellar has fast execution, deep liquidity, and active users. What it lacks is a way to turn credit into a tradable asset.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="PRISM" title="Tokenize risk, not individual loans.">
              <p>
                PRISM introduces programmable credit markets where risk is explicit, structured, and tradeable.
              </p>
              <p>
                Instead of turning every loan into a separate token, PRISM pools credit, splits the pool into risk layers, and turns each layer into a token.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-3">
                {prismLayers.map((layer) => (
                  <div key={layer.name} className="bg-black/80 p-5">
                    <div className={`inline-flex border px-3 py-1 font-mono text-xs uppercase ${layer.color}`}>
                      {layer.name}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/55">
                      {layer.body}
                    </p>
                  </div>
                ))}
              </div>
              <p>
                These are not just labels. They are enforced on-chain through a deterministic waterfall for yield and a deterministic cascade for losses.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Market surface" title="Users should pick risk, not borrowers.">
              <p>
                Once risk layers are tradeable, the user experience changes. Users do not need to pick individual borrowers. They pick the risk level they want to hold.
              </p>
              <p>
                Markets can then:
              </p>
              <BulletList items={marketCanDo} />
              <p>
                Instead of holding loans to maturity, positions become dynamic, risk becomes adjustable, and capital becomes more efficient.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Shift" title="Markets scale with abstraction.">
              <p>
                The old model is to tokenize loans. PRISM's model is to tokenize risk.
              </p>
              <p>
                That one shift changes everything, because markets do not scale with assets. They scale with abstraction.
              </p>
              <p>
                Stellar does not need more tokens. It needs better primitives. Credit is one of the largest markets in the world, and it still has not been rebuilt on-chain properly.
              </p>
              <p>
                PRISM is our attempt to fix that by making credit structured, transparent, and finally liquid.
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
              <div className="mt-5 font-display text-5xl text-white">Risk</div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Stellar solved execution speed. PRISM adds the missing market structure for credit risk.
              </p>
              <div className="mt-8 grid gap-px border border-white/10 bg-white/10">
                {["Pool credit", "Tokenize risk", "Let markets price it"].map((item) => (
                  <div key={item} className="bg-black/80 px-4 py-3 font-mono text-xs uppercase text-white/55">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </article>

      <FooterSection />
    </main>
  );
}
