import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FooterSection } from "@/components/landing/footer-section";
import { Navigation } from "@/components/landing/navigation";
import { WaitlistDialog } from "@/components/landing/waitlist-dialog";

export const metadata: Metadata = {
  title: "Dune SIM: Real-Time Analytics for On-Chain Credit - PRISM Protocol",
  description:
    "On-chain transparency is only useful if someone can read it. Dune SIM gives PRISM real-time access to every protocol event — NAV, yield, defaults, AMM swaps — without building a custom indexer.",
};

const rpcLimitations = [
  "RPC nodes return current state — they do not store history.",
  "Reconstructing yield distributions from raw logs requires custom parsing.",
  "NAV curves need every deposit, withdrawal, and yield event in sequence.",
  "Building and maintaining a custom indexer takes months and drifts from protocol changes.",
  "Most teams end up with a half-built indexer that breaks silently on upgrades.",
];

const indexerCosts = [
  "A reliable Solana indexer is 3–6 months of dedicated engineering.",
  "It requires its own infrastructure: RPC nodes, a database, a parsing pipeline.",
  "It must be updated every time program instructions or account layouts change.",
  "When it falls behind, every dashboard reading from it silently lies.",
  "All of this is infrastructure that has nothing to do with credit logic.",
];

const prismEvents = [
  {
    event: "DepositEvent",
    emittedBy: "deposit",
    powersLabel: "TVL chart",
    powersDetail: "Running total of capital locked per tranche in real time.",
  },
  {
    event: "WithdrawEvent",
    emittedBy: "withdraw",
    powersLabel: "Outflow chart",
    powersDetail: "LP exit activity — shows market sentiment shifts before price does.",
  },
  {
    event: "YieldDistributed",
    emittedBy: "accrue_yield",
    powersLabel: "Yield counter",
    powersDetail: "Per-tranche cumulative yield, updated each epoch.",
  },
  {
    event: "LossApplied",
    emittedBy: "trigger_credit_event",
    powersLabel: "NAV cascade",
    powersDetail: "Loss magnitude and tranche impact — the most critical event for investors.",
  },
  {
    event: "CreditEventCreated",
    emittedBy: "trigger_credit_event",
    powersLabel: "Credit event log",
    powersDetail: "Full audit trail of every default, partial loss, and forced liquidation.",
  },
  {
    event: "SwapExecuted",
    emittedBy: "amm::swap",
    powersLabel: "AMM price chart",
    powersDetail: "Real-time tranche token pricing — the market's view of risk at any moment.",
  },
];

const dashboardPanels = [
  {
    panel: "Event Ticker",
    source: "Dune SIM",
    description:
      "A live stream of every protocol event in chronological order. Deposits, yield epochs, credit events, AMM swaps — all pulled from the /beta/svm/transactions endpoint and labeled by instruction type.",
  },
  {
    panel: "Account Balances",
    source: "Dune SIM",
    description:
      "SPL token balances for protocol-controlled accounts queried via /v1/solana/balances. Shows live USDC holdings across vault reserve and tranche accounts without building a custom RPC crawler.",
  },
  {
    panel: "NAV Chart",
    source: "On-chain RPC",
    description:
      "Net Asset Value per tranche derived from on-chain account state. Read directly from the Anchor program accounts via RPC — not Dune — since NAV is a computed field, not an emitted event.",
  },
  {
    panel: "TVL & AMM Prices",
    source: "On-chain RPC",
    description:
      "Total Value Locked and pPRIME / pCORE / pALPHA token prices read from program accounts via RPC. Updated every 5 seconds by the useVaultState polling hook.",
  },
];

const withoutDune = [
  "Dashboard reads from RPC — current state only, no history.",
  "NAV chart requires a custom indexer built and maintained by the team.",
  "Credit event log has to be reconstructed from raw transaction logs.",
  "Any indexer gap means the dashboard displays stale or missing data.",
  "Transparency is the promise; the data layer breaks before the user sees it.",
];

const withDune = [
  "Single API key gives access to protocol transaction history and account balances.",
  "Event ticker and balance panel update in real time — no custom infrastructure.",
  "Credit event log is complete and auditable from day one via /beta/svm/transactions.",
  "SPL token balances queryable instantly via /v1/solana/balances — no RPC crawling.",
  "Two endpoints, zero indexer maintenance: Dune SIM stays in sync with the chain.",
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

export default function DuneSimArticlePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navigation />

      <article>
        <header className="relative overflow-hidden border-b border-white/10 bg-black pt-32">
          <div className="absolute inset-0">
            <Image
              src="/images/audit.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-50 brightness-110 contrast-115 saturate-110"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/72 to-black/18" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-black/15 to-black/42" />
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
                Analytics
                <span className="h-px w-8 bg-white/20" />
                MAY 2026
              </div>

              <h1 className="font-display text-5xl leading-[0.94] text-white md:text-7xl lg:text-[6.25rem]">
                On-chain data
                <br />
                needs a reader.
              </h1>

              <p className="mt-7 max-w-3xl text-xl leading-8 text-white/65">
                Programmable credit only delivers on its transparency promise if the data is actually readable. Dune SIM gives PRISM a real-time event stream — NAV, yield, defaults, AMM swaps — with one API call and no custom indexer to build or maintain.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-20">
          <div className="max-w-4xl">
            <ArticleSection eyebrow="The problem" title="Public data is not the same as readable data.">
              <p>
                PRISM runs on a public blockchain. Every deposit, every yield epoch, every credit event, every AMM swap is permanently recorded on Solana. In theory, this means complete transparency — any investor can verify the protocol's accounting at any time.
              </p>
              <p>
                In practice, raw on-chain data is nearly unusable without an indexing layer. An RPC node tells you the current state of an account. It does not tell you how that state changed over time, in what sequence, and in response to which events.
              </p>
              <BulletList items={rpcLimitations} />
              <p>
                Without an indexer, PRISM's NAV chart is flat. The credit event log is empty. The TVL tracker shows only the current balance. The promise of on-chain transparency collapses into a wall of account state that no human can read.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The indexer trap" title="Building your own is a trap.">
              <p>
                The instinct when you need historical data is to build an indexer. Most teams do. Most teams regret it.
              </p>
              <BulletList items={indexerCosts} />
              <p>
                For a credit protocol, the indexer problem is especially bad. PRISM emits six distinct event types. Each one has its own account layout, its own sequence guarantees, and its own downstream consumers — the NAV chart, the credit event log, the TVL tracker, the AMM price feed. A custom indexer has to handle all of them correctly, in order, without gaps, across restarts and RPC failures.
              </p>
              <p>
                That is three to six months of work that produces zero credit logic. It is infrastructure overhead that compounds every time a program instruction changes.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Dune SIM" title="Real-time Solana state with one API key.">
              <p>
                Dune SIM is a real-time developer platform that provides low-latency APIs to query Solana state — PDAs, account balances, and event streams — without building a custom indexer. It subscribes to the chain, parses events as they land, and makes them queryable over HTTP.
              </p>
              <p>
                For PRISM, the integration is one route handler. A single API key. The entire analytics layer — NAV, TVL, yield, credit events, AMM pricing — runs on top of what Dune SIM returns.
              </p>
              <div className="mt-7 border border-white/10 bg-black/80 p-5">
                <div className="mb-3 font-mono text-xs uppercase text-white/35">
                  Integration surface
                </div>
                <div className="grid gap-px border border-white/10 bg-white/10">
                  {[
                    ["Base URL", "https://api.sim.dune.com"],
                    ["Auth", "X-Sim-Api-Key header"],
                    ["Env var", "DUNE_SIM_API_KEY"],
                    ["Tx endpoint", "/beta/svm/transactions/{address}"],
                    ["Balance endpoint", "/beta/svm/balances/{address}"],
                    ["Latency", "sub-second"],
                    ["Infrastructure", "zero — Dune manages it"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-start gap-5 bg-black/80 px-4 py-3">
                      <span className="w-28 shrink-0 font-mono text-xs uppercase text-white/35">{label}</span>
                      <span className="font-mono text-xs text-white/70">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p>
                The protocol emits events via Anchor's <span className="font-mono text-sm text-white/80">emit!</span> macro. Dune SIM subscribes to those events by name. Everything that happens on PRISM flows into the Dune event stream automatically — no webhook configuration, no parsing logic, no database schema to maintain.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The events" title="Six events. A complete picture of the protocol.">
              <p>
                PRISM's program emits six event types that together describe everything happening in the credit lifecycle — capital in, yield distributed, losses applied, and market pricing in real time. Dune SIM indexes all six.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                {prismEvents.map((item) => (
                  <div key={item.event} className="bg-black/80 p-5">
                    <div className="mb-1 font-mono text-xs text-[#eca8d6]/70">{item.emittedBy}</div>
                    <div className="font-display text-xl leading-tight text-white">{item.event}</div>
                    <div className="mt-1 font-mono text-xs uppercase text-white/35">{item.powersLabel}</div>
                    <p className="mt-3 text-sm leading-6 text-white/50">
                      {item.powersDetail}
                    </p>
                  </div>
                ))}
              </div>
              <p>
                Each event is structured, typed, and emitted at the exact moment the instruction succeeds. There is no polling, no delayed consistency. When a credit event fires on Solana, the <span className="font-mono text-sm text-white/80">LossApplied</span> event lands in the Dune stream in the same block.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The dashboard" title="What investors actually see.">
              <p>
                Dune SIM powers four distinct panels in the PRISM protocol dashboard. Each one consumes a subset of the event stream and renders it into something an LP or credit analyst can act on.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10">
                {dashboardPanels.map((item) => (
                  <div key={item.panel} className="flex gap-6 bg-black/80 p-5">
                    <div className="w-36 shrink-0">
                      <div className="font-display text-lg leading-tight text-white">{item.panel}</div>
                      <div className={`mt-1 font-mono text-[10px] uppercase tracking-wider ${item.source === "Dune SIM" ? "text-[#eca8d6]/60" : "text-white/25"}`}>
                        {item.source}
                      </div>
                    </div>
                    <p className="text-sm leading-6 text-white/55">{item.description}</p>
                  </div>
                ))}
              </div>
              <p>
                The credit event log is the most consequential. It is the permanent, auditable record of every default, partial loss, and forced liquidation — the exact data that credit investors need to evaluate a protocol's track record. Without Dune SIM, reconstructing that log from raw RPC data would require parsing hundreds of transaction records manually.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="What changes" title="Transparency that actually works.">
              <p>
                The difference between PRISM with and without Dune SIM is the difference between a protocol that claims to be transparent and one that proves it.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-white/35">
                    Without Dune SIM
                  </div>
                  <ul className="space-y-3">
                    {withoutDune.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-white/20" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-[#eca8d6]/70">
                    With Dune SIM
                  </div>
                  <ul className="space-y-3">
                    {withDune.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-[#eca8d6]/50" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </ArticleSection>

            <ArticleSection eyebrow="Why it matters" title="Transparency is the product.">
              <p>
                The fundamental promise of on-chain credit is that no one has to trust a black box. Yield distributions are verifiable. Loss allocation is deterministic. Credit events are auditable. None of that matters if the data is not readable.
              </p>
              <p>
                In traditional credit markets, transparency is a legal obligation enforced by regulators — filed quarterly, audited annually, and often months out of date. In PRISM, transparency is an architectural property enforced by the protocol — updated in every block, readable by anyone, and never more than a few seconds behind the chain.
              </p>
              <p>
                Dune SIM is the bridge between that architectural property and a dashboard that investors can actually use. It is the difference between "the data is there if you know how to read raw Solana account state" and "here is the NAV chart, here is the credit event log, here is the AMM price feed — real time, no intermediary."
              </p>
              <p>
                On-chain credit without the analytics layer is a promise. With Dune SIM, it is a product.
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
              <div className="mt-5 font-display text-5xl text-white">6</div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                events PRISM emits — deposits, withdrawals, yield, losses, credit events, swaps — all indexed by Dune SIM in real time.
              </p>
              <div className="mt-8 grid gap-px border border-white/10 bg-white/10">
                {["Emit events", "Dune indexes", "Dashboard reads"].map((item) => (
                  <div key={item} className="bg-black/80 px-4 py-3 font-mono text-xs uppercase text-white/55">
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-white/10 pt-6">
                <div className="font-mono text-xs uppercase text-white/35">Key facts</div>
                <div className="mt-4 space-y-3">
                  {[
                    ["Latency", "sub-second"],
                    ["Events", "6 types"],
                    ["Infra", "zero custom"],
                    ["Integration", "1 API key"],
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
