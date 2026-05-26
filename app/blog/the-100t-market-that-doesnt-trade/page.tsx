import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FooterSection } from "@/components/landing/footer-section";
import { Navigation } from "@/components/landing/navigation";
import { WaitlistDialog } from "@/components/landing/waitlist-dialog";

const xArticleUrl = "https://x.com/prismstellar/status/2048830720278483222";

export const metadata: Metadata = {
  title: "The $100T Market That Doesn't Trade - PRISM Protocol",
  description:
    "Credit is a $100T+ market that finances businesses, powers economies, and moves the real world. PRISM makes credit risk programmable, transparent, and tradable.",
};

const marketProblems = [
  "Illiquid - every loan lives in its own isolated world.",
  "Opaque - risk is bundled and hidden.",
  "Static - pricing does not update in real time.",
  "Inaccessible - structured products are gated to institutions.",
];

const userChoices = [
  "Buy individual loans and take concentrated risk.",
  "Trust a fund that hides complexity behind abstraction.",
];

const loanFragmentation = [
  "Liquidity gets shredded across hundreds of tokens.",
  "Each position requires independent diligence.",
  "Markets stay shallow and inefficient.",
  "You do not get a market. You get fragments.",
];

const tranches = [
  {
    name: "Prime",
    token: "pPRIME",
    description:
      "The protected layer. Lowest risk, paid first, and last to absorb losses.",
  },
  {
    name: "Core",
    token: "pCORE",
    description:
      "The balanced layer. Balanced risk and yield. It only takes losses once Alpha is fully wiped.",
  },
  {
    name: "Alpha",
    token: "pALPHA",
    description:
      "The first-loss layer. Highest risk, highest upside, and first in line to absorb defaults.",
  },
];

const tokenClaims = [
  "Ownership in a specific tranche.",
  "Exposure to a defined risk level.",
  "A claim on real cash flows.",
];

const marketActions = [
  "Enter a position.",
  "Exit early.",
  "Rebalance risk.",
  "Respond to market conditions in real time.",
];

const liveMarkets = [
  "Price risk dynamically.",
  "React to defaults as they happen.",
  "Reflect sentiment continuously.",
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

export default function HundredTMarketArticlePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navigation />

      <article>
        <header className="relative overflow-hidden border-b border-white/10 bg-black pt-32">
          <div className="absolute inset-0">
            <Image
              src="/images/bridge.png"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-66 brightness-105 contrast-115 saturate-140"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/62 to-black/8" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-black/10 to-black/38" />
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
                Thesis
                <span className="h-px w-8 bg-white/20" />
                APR 2026
              </div>

              <h1 className="font-display text-5xl leading-[0.94] text-white md:text-7xl lg:text-[6.25rem]">
                The $100T market that doesn't trade.
              </h1>

              <p className="mt-7 max-w-3xl text-xl leading-8 text-white/65">
                Credit is a $100T+ market. It finances businesses, powers economies, and moves the real world. Yet it is still one of the most broken systems in finance - not because there is not enough capital, but because of how credit is structured.
              </p>

              <Link
                href={xArticleUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-8 inline-flex items-center gap-2 border border-white/15 bg-black/55 px-4 py-2 font-mono text-sm text-white backdrop-blur-sm transition-colors hover:border-[#eca8d6]/70 hover:text-[#eca8d6]"
              >
                Original X post
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-20">
          <div className="max-w-4xl">
            <ArticleSection eyebrow="Problem" title="Credit was designed for balance sheets, not markets.">
              <p>
                Today, credit markets are structurally hard to trade. Risk is bundled, liquidity is fragmented, and price discovery is weak.
              </p>
              <BulletList items={marketProblems} />
              <p>
                If you want exposure, your choices are narrow:
              </p>
              <BulletList items={userChoices} />
              <p>
                There is no transparent, liquid, market-driven way to interact with credit. Most importantly, there is no clean way to trade credit risk directly.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="PRISM" title="Build a market for risk itself.">
              <p>
                PRISM stands for Programmable Risk & Income Structured Markets. The core idea is simple: instead of building a separate market for every loan, PRISM builds markets for defined layers of risk.
              </p>
              <p>
                Most on-chain credit today looks like this: Loan A becomes Token A, Loan B becomes Token B, and Loan C becomes Token C. It sounds clean. In practice, it fails.
              </p>
              <BulletList items={loanFragmentation} />
              <p>
                PRISM takes a different path. A single vault can contain dozens or hundreds of borrowers, diversified across sectors and unified under one structure.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Tranches" title="Pool the credit. Separate the risk.">
              <p>
                Each pool is split into three deterministic financial layers, enforced on-chain. Yield flows top-down: Prime to Core to Alpha. Losses flow bottom-up: Alpha to Core to Prime.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-3">
                {tranches.map((tranche) => (
                  <div key={tranche.name} className="bg-black/80 p-5">
                    <div className="font-display text-3xl text-white">{tranche.name}</div>
                    <div className="mt-1 font-mono text-xs uppercase text-[#eca8d6]">
                      {tranche.token}
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/55">
                      {tranche.description}
                    </p>
                  </div>
                ))}
              </div>
              <p>
                No ambiguity. No hidden mechanics. Everything is transparent, predictable, and verifiable.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Tokens" title="Credit positions become liquid.">
              <p>
                Each tranche becomes a freely tradable token: pPRIME for safer yield, pCORE for balanced risk and return, and pALPHA for the highest upside with first-loss exposure.
              </p>
              <BulletList items={tokenClaims} />
              <p>
                For the first time, credit positions do not have to stay locked until maturity. Investors can:
              </p>
              <BulletList items={marketActions} />
              <p>
                Markets can:
              </p>
              <BulletList items={liveMarkets} />
              <p>
                Instead of holding a loan to maturity, you trade your exposure like any other asset. That creates a continuous, liquid market for credit risk.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Unlock" title="In PRISM, risk is the product.">
              <p>
                In traditional systems, risk is hidden inside products. In PRISM, risk is the product. You stop asking, "Which loan should I trust?" and start asking, "How much risk do I want to take?"
              </p>
              <p>
                CDOs and CLOs already use pooling, tranching, and waterfall distribution. But they are closed, opaque, and institution-only. PRISM brings that model on-chain and makes it open, transparent, composable, and liquid by default.
              </p>
              <p>
                When a loan defaults, the cascade is not theoretical. You watch it happen on Stellar in seconds: Alpha wiped, Core cut, Prime protected.
              </p>
              <p>
                Losses do not disappear. They move.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Conclusion" title="The beginning of programmable credit markets.">
              <p>
                Credit is too important to remain opaque, illiquid, and inaccessible. It should be understandable, priceable, and tradable.
              </p>
              <p>
                Today, credit markets are opaque and illiquid. PRISM is how they become programmable, transparent, and tradable.
              </p>
              <p>
                This is the beginning of programmable credit markets. And we are just getting started.
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
              <div className="mt-5 font-display text-5xl text-white">$100T+</div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Credit is massive, but the risk itself rarely trades with transparency, liquidity, or real-time pricing.
              </p>
              <div className="mt-8 grid gap-px border border-white/10 bg-white/10">
                {["Pool credit", "Separate risk", "Trade exposure"].map((item) => (
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
