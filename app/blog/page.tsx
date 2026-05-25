import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Activity, Layers3, Radio, ShieldCheck, Lock, EyeOff, Zap, Shield, BarChart2 } from "lucide-react";
import { FooterSection } from "@/components/landing/footer-section";
import { Navigation } from "@/components/landing/navigation";
import { DOCS_URL } from "@/lib/site-links";

const docsBase = DOCS_URL.endsWith("/") ? DOCS_URL : `${DOCS_URL}/`;

const featuredPosts = [
  {
    category: "Thesis",
    date: "APR 2026",
    title: "The $100T market that doesn't trade.",
    excerpt:
      "Credit is a $100T+ market that finances businesses, powers economies, and moves the real world. PRISM makes credit risk programmable, transparent, and tradable.",
    href: "/blog/the-100t-market-that-doesnt-trade",
    image: "/images/bridge.png",
    metric: "$100T+",
    metricLabel: "credit market",
  },
  {
    category: "Market design",
    date: "APR 2026",
    title: "Solana fixed speed. It didn't fix credit.",
    excerpt:
      "Solana made execution fast and cheap. PRISM adds the missing credit primitive: explicit risk, structured markets, and liquid exposure.",
    href: "/blog/solana-fixed-speed-not-credit",
    image: "/images/isolated.jpg",
    metric: "3",
    metricLabel: "risk layers",
  },
  {
    category: "Infrastructure",
    date: "MAY 2026",
    title: "Cross-chain collateral was the missing piece.",
    excerpt:
      "IKA Network's threshold MPC dWallets let borrowers lock BTC and ETH without trusting a single intermediary. This is the foundation PRISM couldn't exist without.",
    href: "/blog/cross-chain-collateral-ika",
    image: "/images/permissions.jpg",
    metric: "81",
    metricLabel: "byte attestation",
  },
  {
    category: "Privacy",
    date: "MAY 2026",
    title: "The default you can prove without seeing.",
    excerpt:
      "Encrypt's FHE oracle proves a loan is in default without revealing a single byte of borrower financial data. The loss cascade fires from a cryptographic proof, not a data disclosure.",
    href: "/blog/fhe-default-without-disclosure",
    image: "/images/encrypted.jpg",
    metric: "73",
    metricLabel: "byte proof",
  },
  {
    category: "Payments",
    date: "MAY 2026",
    title: "Dodo payments. Why PRISM had to exist.",
    excerpt:
      "The world's payment and credit rails were built before programmable money existed. They are slow, opaque, and structurally incapable of pricing risk. PRISM exists because they cannot be patched — only replaced.",
    href: "/blog/dodo-payments-why-prism",
    image: "/images/connection-hands.png",
    metric: "50+",
    metricLabel: "years old",
  },
  {
    category: "Privacy",
    date: "MAY 2026",
    title: "Yield payouts can't be public.",
    excerpt:
      "Every coupon payment on a public ledger is permanently indexed. PRISM uses Cloak's shielded batch disbursement so LP payouts stay confidential while remaining fully auditable via viewing keys.",
    href: "/blog/cloak-private-yield-payouts",
    image: "/images/shield.png",
    metric: "73",
    metricLabel: "byte attestation",
  },
  {
    category: "Analytics",
    date: "MAY 2026",
    title: "On-chain data needs a reader.",
    excerpt:
      "Programmable credit only delivers on its transparency promise if the data is actually readable. Dune SIM powers PRISM's entire analytics layer — NAV, TVL, yield, defaults — with one API call.",
    href: "/blog/dune-sim-real-time-credit-analytics",
    image: "/images/audit.jpg",
    metric: "6",
    metricLabel: "indexed events",
  },
];

const fieldNotes = [
  {
    icon: Layers3,
    category: "Design note",
    date: "APR 2026",
    title: "A pull-pattern waterfall for Prime, Core, and Alpha.",
    excerpt:
      "How yield accrues into a vault and gets claimed by tranche holders without hidden off-chain accounting.",
    href: `${docsBase}core-protocol-layer`,
  },
  {
    icon: ShieldCheck,
    category: "Security",
    date: "APR 2026",
    title: "Defaults should be observable, gated, and replayable.",
    excerpt:
      "Credit events are protocol state changes, so PRISM treats them like auditable operations with explicit authority boundaries.",
    href: `${docsBase}security-controls`,
  },
  {
    icon: Activity,
    category: "Market design",
    date: "APR 2026",
    title: "What a tranche AMM actually prices.",
    excerpt:
      "Tranche swaps expose the market's appetite for Prime protection, Core yield, Alpha upside, and post-event repricing.",
    href: `${docsBase}risk-market-layer`,
  },
  {
    icon: Lock,
    category: "Infrastructure",
    date: "MAY 2026",
    title: "IKA + encryption: why PRISM needed threshold MPC.",
    excerpt:
      "Borrowers can now lock BTC and ETH as collateral without any custodian. Here is the cryptographic path from dWallet to on-chain credit.",
    href: "/blog/cross-chain-collateral-ika",
  },
  {
    icon: EyeOff,
    category: "Privacy",
    date: "MAY 2026",
    title: "FHE defaults: proving a condition without seeing the data.",
    excerpt:
      "Encrypt's homomorphic circuit runs total_repaid < principal on sealed borrower data and signs the result. No raw financial figures ever touch the chain.",
    href: "/blog/fhe-default-without-disclosure",
  },
  {
    icon: Zap,
    category: "Payments",
    date: "MAY 2026",
    title: "Dodo payments: why 50-year-old rails made PRISM necessary.",
    excerpt:
      "SWIFT, ACH, and syndicated loan desks were built for a world without programmable money. Here is why they cannot be patched — and what PRISM replaces them with.",
    href: "/blog/dodo-payments-why-prism",
  },
  {
    icon: Shield,
    category: "Privacy",
    date: "MAY 2026",
    title: "Cloak: shielded LP payouts with viewing key audits.",
    excerpt:
      "Cloak's batch disbursement primitive maps directly onto PRISM's tranche waterfall. Individual payout amounts stay hidden — only the LP with the viewing key can decrypt their yield.",
    href: "/blog/cloak-private-yield-payouts",
  },
  {
    icon: BarChart2,
    category: "Analytics",
    date: "MAY 2026",
    title: "Dune SIM: six events, one API key, zero custom indexer.",
    excerpt:
      "PRISM emits six event types covering every moment in the credit lifecycle. Dune SIM indexes them all in real time — powering the NAV chart, credit event log, TVL tracker, and AMM price feed.",
    href: "/blog/dune-sim-real-time-credit-analytics",
  },
];

export const metadata: Metadata = {
  title: "Protocol Intelligence",
  description:
    "Research notes, architecture essays, and protocol updates from the team building programmable credit risk on Solana.",
};

function ArticleCard({
  post,
  index,
  className,
}: {
  post: (typeof featuredPosts)[number];
  index: number;
  className?: string;
}) {
  return (
    <article className={`group relative min-h-[480px] overflow-hidden border-b border-foreground/10 bg-background px-6 py-8 pb-24 transition-colors hover:bg-foreground/[0.025] md:px-10 lg:h-[46svh] lg:min-h-[340px] lg:border-r lg:px-10 lg:py-8 lg:pb-24 xl:px-12 xl:py-10 xl:pb-24${className ? ` ${className}` : ""}`}>
      <div className="absolute inset-y-0 right-0 hidden w-[52%] opacity-35 transition-opacity duration-500 group-hover:opacity-55 lg:block">
        <Image
          src={post.image}
          alt=""
          fill
          sizes="50vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-background/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between gap-8">
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs uppercase text-muted-foreground lg:mb-4">
            <span className="text-foreground/25">0{index + 1}</span>
            <span>{post.category}</span>
            <span className="h-px w-8 bg-foreground/20" />
            <span>{post.date}</span>
          </div>

          <h2 className="max-w-[720px] font-display text-4xl leading-[0.98] text-foreground md:text-5xl lg:text-[3.4rem] xl:text-6xl">
            {post.title}
          </h2>

          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground md:text-lg lg:mt-4 lg:text-base">
            {post.excerpt}
          </p>

        </div>

      </div>

      <Link
        href={post.href}
        className="absolute bottom-6 left-6 z-20 inline-flex items-center gap-2 border border-foreground/15 bg-black/60 px-4 py-2 font-mono text-sm text-foreground backdrop-blur-sm transition-colors hover:border-[#eca8d6]/70 hover:text-[#eca8d6] md:left-10 lg:bottom-8 lg:left-10 xl:left-12"
      >
        Read
        <ArrowUpRight className="h-4 w-4" />
      </Link>

      <div className="pointer-events-none absolute bottom-6 right-6 z-20 hidden text-right sm:block md:right-10 lg:bottom-8 lg:right-10 xl:right-12">
        <div className="font-display text-4xl leading-none text-foreground/80 xl:text-5xl">
          {post.metric}
        </div>
        <div className="mt-2 font-mono text-xs uppercase text-muted-foreground">
          {post.metricLabel}
        </div>
      </div>
    </article>
  );
}

function FieldNoteCard({ note }: { note: (typeof fieldNotes)[number] }) {
  return (
    <article className="group relative min-h-[320px] border border-foreground/10 bg-foreground/[0.02] p-6 pb-20 transition-colors hover:border-foreground/25 hover:bg-foreground/[0.045] lg:p-7 lg:pb-20">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div className="flex h-11 w-11 items-center justify-center border border-foreground/15 bg-black text-foreground transition-colors group-hover:border-[#eca8d6]/70 group-hover:text-[#eca8d6]">
          <note.icon className="h-5 w-5" />
        </div>
        <div className="text-right font-mono text-[11px] uppercase text-muted-foreground">
          <div>{note.category}</div>
          <div className="mt-1">{note.date}</div>
        </div>
      </div>

      <h3 className="font-display text-3xl leading-none text-foreground md:text-4xl">
        {note.title}
      </h3>
      <p className="mt-5 text-sm leading-6 text-muted-foreground">
        {note.excerpt}
      </p>

      <Link
        href={note.href}
        className="absolute bottom-6 left-6 inline-flex items-center gap-2 font-mono text-sm text-foreground transition-colors hover:text-[#67e8f9] lg:bottom-7 lg:left-7"
      >
        Read
        <ArrowUpRight className="h-4 w-4" />
      </Link>
    </article>
  );
}

export default function BlogPage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navigation />

      <section className="relative flex min-h-[72svh] items-end overflow-hidden border-b border-foreground/10 bg-black pt-28 lg:min-h-[54svh]">
        <div className="absolute inset-0">
          <Image
            src="/images/encrypted.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-60 brightness-105 contrast-110 saturate-125"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/88 via-black/55 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-background/85 via-black/5 to-black/35" />
        </div>

        <div className="absolute inset-0 opacity-25">
          <div className="h-full w-full bg-[linear-gradient(to_right,rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[size:120px_120px]" />
        </div>

        <div className="relative z-10 mx-auto w-full max-w-[1400px] px-6 pb-10 pt-24 md:pb-12 lg:px-12 lg:pb-8">
          <div className="max-w-[980px]">
            <div className="mb-5 flex items-center gap-4 font-mono text-sm uppercase text-white/55 lg:mb-4">
              <span className="h-px w-12 bg-white/25" />
              Signal
            </div>

            <h1 className="font-display text-5xl leading-[0.94] text-white md:text-7xl lg:text-[5.75rem] xl:text-[6.75rem]">
              What breaks.
              <br />
              What reprices next.
            </h1>

            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/60 md:text-xl lg:mt-4">
              Research notes, architecture essays, and protocol updates from the team building programmable credit risk on Solana.
            </p>
          </div>

          <div className="mt-8 grid max-w-3xl grid-cols-3 gap-px border border-white/10 bg-white/10 lg:mt-6">
            {[
              ["Prime", "protected capital"],
              ["Core", "balanced yield"],
              ["Alpha", "first-loss risk"],
            ].map(([label, value]) => (
              <div key={label} className="bg-black/65 p-3 backdrop-blur-sm lg:p-4">
                <div className="font-display text-2xl text-white lg:text-3xl">{label}</div>
                <div className="mt-1 font-mono text-xs uppercase text-white/45">
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 right-6 hidden items-center gap-3 font-mono text-xs uppercase text-white/40 lg:flex">
          <Radio className="h-4 w-4 text-[#eca8d6]" />
          APR 2026 issue
        </div>
      </section>

      <section aria-label="Featured articles" className="bg-background">
        <div className="grid lg:grid-cols-2">
          {featuredPosts.map((post, index) => (
            <ArticleCard
              key={post.title}
              post={post}
              index={index}
              className={
                index === featuredPosts.length - 1 && featuredPosts.length % 2 !== 0
                  ? "lg:col-span-2"
                  : undefined
              }
            />
          ))}
        </div>
      </section>

      <section className="border-b border-foreground/10 px-6 py-16 md:px-10 lg:px-12 lg:py-24">
        <div className="mx-auto max-w-[1400px]">
          <div className="mb-10 grid gap-6 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-7">
              <div className="mb-5 flex items-center gap-4 font-mono text-sm uppercase text-muted-foreground">
                <span className="h-px w-12 bg-foreground/20" />
                Field notes
              </div>
              <h2 className="font-display text-5xl leading-none md:text-7xl">
                The protocol log.
              </h2>
            </div>
            <p className="max-w-xl text-base leading-7 text-muted-foreground lg:col-span-5">
              Shorter updates on accounting, authority design, integrations, and the market mechanics behind PRISM.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {fieldNotes.map((note) => (
              <FieldNoteCard key={note.title} note={note} />
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-foreground/10 bg-black px-6 py-16 md:px-10 lg:px-12 lg:py-20">
        <div className="absolute inset-y-0 right-0 hidden w-1/2 lg:block">
          <Image
            src="/images/audit.jpg"
            alt=""
            fill
            sizes="50vw"
            className="object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-black/20" />
        </div>

        <div className="relative z-10 mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <div className="mb-5 font-mono text-sm uppercase text-white/40">
              Dispatch cadence
            </div>
            <h2 className="font-display text-5xl leading-none text-white md:text-7xl">
              Build notes as the credit stack comes online.
            </h2>
          </div>
          <div className="lg:col-span-5">
            <p className="max-w-lg text-base leading-7 text-white/55">
              Follow the docs for the canonical protocol spec, then come back here for the messy, useful edge cases: loss simulations, tranche pricing, oracle gates, and integration decisions.
            </p>
            <Link
              href={DOCS_URL}
              className="mt-8 inline-flex items-center gap-2 border border-white/20 px-5 py-3 font-mono text-sm text-white transition-colors hover:border-white/50 hover:bg-white hover:text-black"
            >
              View docs
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <FooterSection />
    </main>
  );
}
