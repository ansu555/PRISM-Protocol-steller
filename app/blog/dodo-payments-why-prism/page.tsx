import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FooterSection } from "@/components/landing/footer-section";
import { Navigation } from "@/components/landing/navigation";
import { WaitlistDialog } from "@/components/landing/waitlist-dialog";

export const metadata: Metadata = {
  title: "Dodo Payments: Why Broken Credit Rails Made PRISM Necessary - PRISM Protocol",
  description:
    "The world's payment and credit rails were built for a world without programmable money. They are slow, opaque, and structurally incapable of pricing risk. PRISM exists because they cannot be patched — only replaced.",
};

const legacyProblems = [
  "Settlement takes 2–3 days on rails that are 50 years old.",
  "Credit risk is hidden inside products, not priced in real time.",
  "Fees are opaque — intermediaries clip every hop.",
  "Access is gated — institutions get the market, individuals get the scraps.",
  "Cross-border credit is slow, expensive, and counterparty-heavy.",
];

const creditGaps = [
  "A business in Lagos cannot access structured credit without a local bank intermediary.",
  "A BTC holder cannot borrow against their collateral without selling or wrapping.",
  "An LP in a credit fund cannot exit early — there is no secondary market.",
  "A default cascades silently, with no transparent loss allocation.",
];

const paymentRailAges = [
  {
    rail: "SWIFT",
    launched: "1973",
    problem: "Settlement takes 1–5 days. Opaque correspondent banking fees.",
  },
  {
    rail: "ACH",
    launched: "1972",
    problem: "Batch processing. 2–3 day clearing. No programmability.",
  },
  {
    rail: "Credit Cards",
    launched: "1958",
    problem: "2–3% merchant fee. Chargebacks. No composability.",
  },
  {
    rail: "Syndicated Loans",
    launched: "1970s",
    problem: "Manual origination. Illiquid. No transparent risk pricing.",
  },
];

const prismSolves = [
  "Credit pools settle on Solana in 400 ms, not T+2.",
  "Risk is priced continuously by a live AMM, not quarterly by a credit desk.",
  "Every tranche position is a freely tradable token — exit whenever the market is open.",
  "Default events fire from cryptographic proofs, not admin discretion.",
  "BTC and ETH holders access credit without bridges or custodians.",
];

const whyNow = [
  {
    step: "01",
    title: "Programmable Money Exists",
    body: "Solana runs at 400 ms finality and sub-cent fees. The execution layer that legacy rails could never achieve is now a commodity. The bottleneck is no longer speed — it is the credit primitive.",
  },
  {
    step: "02",
    title: "Trustless Collateral Is Solved",
    body: "IKA Network's threshold MPC dWallets let BTC and ETH sit as collateral on their native chains, verified on-chain with no custodian. The $1T+ in non-Solana assets can now back credit without a trusted bridge.",
  },
  {
    step: "03",
    title: "Private Defaults Are Provable",
    body: "Encrypt's FHE oracle proves a loan is in default without disclosing a single byte of financial data. Institutions can participate without making their liabilities permanently public.",
  },
  {
    step: "04",
    title: "Structured Risk Is Composable",
    body: "PRISM's three tranche tokens — pPRIME, pCORE, pALPHA — are standard SPL tokens. Any protocol can build on top. Credit risk is finally a primitive, not a walled garden.",
  },
];

const withoutPrism = [
  "Credit risk stays bundled, opaque, and inaccessible.",
  "Borrowers pay 3–5% more for capital than the risk warrants.",
  "LPs accept illiquidity because there is no secondary market.",
  "Defaults happen in the dark — loss allocation is whatever the admin decides.",
  "Global capital cannot price global credit without an intermediary.",
];

const withPrism = [
  "Risk is explicit, layered, and priced by a live market.",
  "Borrowers pay rates that reflect actual default probability.",
  "LPs trade tranche exposure like any other asset — continuous liquidity.",
  "Default cascades are deterministic, on-chain, and auditable.",
  "Any capital, on any chain, can interact with structured credit.",
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

export default function DodoPaymentsArticlePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navigation />

      <article>
        <header className="relative overflow-hidden border-b border-white/10 bg-black pt-32">
          <div className="absolute inset-0">
            <Image
              src="/images/connection-hands.png"
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
                Payments
                <span className="h-px w-8 bg-white/20" />
                MAY 2026
              </div>

              <h1 className="font-display text-5xl leading-[0.94] text-white md:text-7xl lg:text-[6.25rem]">
                Dodo payments.
                <br />
                Why PRISM had to exist.
              </h1>

              <p className="mt-7 max-w-3xl text-xl leading-8 text-white/65">
                The world's payment and credit rails were built before programmable money existed. They are slow, opaque, and structurally incapable of pricing risk. PRISM exists because these systems cannot be patched — only replaced.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-20">
          <div className="max-w-4xl">
            <ArticleSection eyebrow="The dodo" title="Legacy rails were built for a different world.">
              <p>
                The dodo bird was not slow because it was lazy. It was slow because it evolved in an environment with no predators — an environment that no longer exists. When the world changed, it could not adapt fast enough. The result was extinction.
              </p>
              <p>
                Payment and credit rails are the dodo of financial infrastructure. SWIFT was built in 1973. ACH in 1972. The syndicated loan market in the 1970s. These systems were designed for paper-based, correspondent-banking, batch-processing environments. The world they were built for no longer exists. But they are still running.
              </p>
              <BulletList items={legacyProblems} />
              <p>
                The problem is not that these rails are old. The problem is that they were architecturally incapable of doing what programmable money can do. You cannot patch 50-year-old infrastructure into something that settles in milliseconds, prices risk continuously, and composes with any other protocol on the internet.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The rails" title="How old is old?">
              <p>
                Let the ages speak for themselves. These are the systems that still move the majority of global credit and payments.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                {paymentRailAges.map((item) => (
                  <div key={item.rail} className="bg-black/80 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="font-display text-2xl text-white">{item.rail}</div>
                      <div className="font-mono text-xs text-[#eca8d6]/70 pt-1">{item.launched}</div>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-white/55">
                      {item.problem}
                    </p>
                  </div>
                ))}
              </div>
              <p>
                Every one of these systems predates the internet as the public knew it. They were designed by people who had never imagined a transaction settling in 400 milliseconds for less than a cent. They are not slow because no one tried to speed them up. They are slow because their architecture does not allow for speed.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Credit gaps" title="Who the old system leaves behind.">
              <p>
                The problems with legacy rails are not abstract. They produce concrete exclusions — people and businesses that the current credit infrastructure simply cannot serve, regardless of their creditworthiness.
              </p>
              <BulletList items={creditGaps} />
              <p>
                These are not edge cases. They are the majority of global credit demand. The addressable market for credit is not Wall Street institutions who already have access to structured products. It is every business and individual who has assets, cash flows, and credit need — but no path to a transparent, liquid, and fairly priced market.
              </p>
              <p>
                Legacy rails were not designed to serve them. They were designed to serve the institutions that built them.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Why PRISM" title="Four things that had to be true first.">
              <p>
                PRISM is not a payment app layered on top of old rails. It is a new credit primitive — built for programmable money from first principles. But it could only exist once four conditions were simultaneously true.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                {whyNow.map((item) => (
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
                None of these conditions was true five years ago. Solana was not mature enough. Threshold MPC for BTC and ETH did not exist at the protocol level. FHE was too slow for production use. And structured credit had not been attempted on-chain in a composable way.
              </p>
              <p>
                All four are true now. That is why PRISM exists in 2026 and not in 2021.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The protocol" title="What PRISM actually does differently.">
              <p>
                PRISM does not make existing payment rails faster. It replaces the credit layer entirely with a model that is native to programmable money.
              </p>
              <BulletList items={prismSolves} />
              <p>
                The difference is not incremental. A loan that settles in 400 milliseconds instead of T+2 is not just faster — it enables entirely new market behaviors. Risk that is priced continuously instead of quarterly enables entirely new capital structures. Collateral that is verified on-chain without a custodian enables entirely new borrowers.
              </p>
              <p>
                Speed, transparency, and composability are not features that PRISM adds on top of a credit system. They are the credit system.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The gap" title="What changes when credit rails are programmable.">
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-white/35">
                    Legacy rails
                  </div>
                  <ul className="space-y-3">
                    {withoutPrism.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-white/20" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-[#eca8d6]/70">
                    PRISM
                  </div>
                  <ul className="space-y-3">
                    {withPrism.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-[#eca8d6]/50" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p>
                The choice between these two worlds is not a product preference. It is a structural difference in how capital allocates, how risk is priced, and who gets access to credit markets at all.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Conclusion" title="The dodo does not know it is extinct.">
              <p>
                SWIFT still clears billions of dollars a day. ACH still processes payroll for millions of workers. Syndicated loan desks still originate credit for the largest companies in the world. These systems are not going to disappear overnight.
              </p>
              <p>
                But the dodo did not disappear overnight either. The predator arrived, and the environment changed, and it simply could not adapt. The moment programmable money made trustless, transparent, millisecond-settling credit markets possible, the clock started.
              </p>
              <p>
                PRISM is not betting that legacy rails will fail. It is betting that given the choice between opaque, slow, gated credit and transparent, liquid, composable credit — capital will move. It always does.
              </p>
              <p>
                The dodo payments era is ending. This is what comes next.
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
              <div className="mt-5 font-display text-5xl text-white">50+</div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                years old — the average age of the rails that still move the majority of global credit and payments.
              </p>
              <div className="mt-8 grid gap-px border border-white/10 bg-white/10">
                {["Old rails", "New primitive", "Live markets"].map((item) => (
                  <div key={item} className="bg-black/80 px-4 py-3 font-mono text-xs uppercase text-white/55">
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-white/10 pt-6">
                <div className="font-mono text-xs uppercase text-white/35">Key facts</div>
                <div className="mt-4 space-y-3">
                  {[
                    ["SWIFT", "since 1973"],
                    ["ACH", "since 1972"],
                    ["Settlement", "T+2 → 400 ms"],
                    ["Risk pricing", "quarterly → live"],
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
