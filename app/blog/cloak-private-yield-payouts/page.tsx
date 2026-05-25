import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FooterSection } from "@/components/landing/footer-section";
import { Navigation } from "@/components/landing/navigation";
import { WaitlistDialog } from "@/components/landing/waitlist-dialog";

export const metadata: Metadata = {
  title: "Cloak: Private Yield Payouts for Institutional LPs - PRISM Protocol",
  description:
    "Every coupon payment on a public ledger is permanently indexed for competitors to read. PRISM uses Cloak's shielded batch disbursement so LP payouts stay confidential while remaining auditable via viewing keys.",
};

const publicLedgerProblems = [
  "Every yield payment is permanently indexed and readable by anyone.",
  "Competitors can infer a fund's position size from payout amounts.",
  "Counterparties can deduce LP exposure in specific tranches.",
  "Institutional credit desks face regulatory constraints on public financial disclosures.",
  "No institutional LP will reveal their payout structure to the entire internet.",
];

const waterfallWithoutPrivacy = [
  "Prime LPs receive 2.1% annualized — publicly readable.",
  "Core LPs receive 5.4% — amount and identity permanently on-chain.",
  "Alpha LPs receive 11.2% — risk appetite exposed to all observers.",
  "Yield epoch timestamps reveal when each investor is active.",
];

const cloakProperties = [
  "Shielded batch disbursements fan one transaction out to many recipients.",
  "Individual payout amounts are hidden from all outside observers.",
  "Each LP receives a viewing key — the only path to their own amount.",
  "The batch receipt is committed on-chain: public confirmation, private amounts.",
  "Live on Solana mainnet — not a prototype, not a promise.",
];

const attestationLayout = [
  { offset: "0 – 7", length: "8 bytes", field: 'b"clk_atts"', note: "Fixed prefix" },
  { offset: "8 – 39", length: "32 bytes", field: "vault_key: [u8; 32]", note: "PRISM vault pubkey" },
  { offset: "40 – 71", length: "32 bytes", field: "batch_id: [u8; 32]", note: "sha256(Cloak batch receipt)" },
  { offset: "72", length: "1 byte", field: "result: 0x01", note: "Batch shielded and confirmed" },
];

const integrationFlow = [
  {
    step: "01",
    title: "Accrue Yield On-Chain",
    body: "The standard PRISM waterfall runs on Solana. Yield flows top-down: Prime to Core to Alpha. At this point, amounts exist in on-chain account state — still public.",
  },
  {
    step: "02",
    title: "Shield via Cloak SDK",
    body: "The frontend calls Cloak's batch disbursement API. Cloak fans the yield amounts out to each LP address in a shielded transaction. Individual amounts are hidden from the ledger.",
  },
  {
    step: "03",
    title: "Oracle Attestation",
    body: "Cloak's oracle returns a 73-byte signed attestation: vault key, sha256 batch ID, and a confirmation byte. Each LP also receives a per-tranche viewing key.",
  },
  {
    step: "04",
    title: "On-Chain Record",
    body: "PRISM submits a two-instruction transaction: the Ed25519 precompile verifies the Cloak oracle signature, then record_cloak_payout creates a CloakPayoutRecord PDA with status = Shielded.",
  },
];

const withoutCloak = [
  "Every LP payout amount is permanently public on Solana.",
  "Competitors read tranche allocation and infer LP strategy.",
  "Institutional credit desks refuse to participate — disclosure risk is unacceptable.",
  "The yield market is limited to actors with no privacy requirements.",
];

const withCloak = [
  "Payout amounts are hidden from all outside observers.",
  "Each LP audits their own amount via a viewing key — no one else can.",
  "The on-chain record is a commitment hash — public confirmation, zero amount disclosure.",
  "Institutional LPs can participate without exposing their credit book.",
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

export default function CloakPrivateYieldArticlePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navigation />

      <article>
        <header className="relative overflow-hidden border-b border-white/10 bg-black pt-32">
          <div className="absolute inset-0">
            <Image
              src="/images/shield.png"
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
                Privacy
                <span className="h-px w-8 bg-white/20" />
                MAY 2026
              </div>

              <h1 className="font-display text-5xl leading-[0.94] text-white md:text-7xl lg:text-[6.25rem]">
                Yield payouts
                <br />
                can&apos;t be public.
              </h1>

              <p className="mt-7 max-w-3xl text-xl leading-8 text-white/65">
                Every coupon payment on a public ledger is permanently indexed — readable by competitors, counterparties, and anyone with an RPC node. PRISM uses Cloak's shielded batch disbursement so LP payouts stay confidential while remaining fully auditable via viewing keys.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-20">
          <div className="max-w-4xl">
            <ArticleSection eyebrow="The problem" title="A public ledger is a terrible place for payouts.">
              <p>
                Solana is a public blockchain. Every instruction, every account mutation, every token transfer is permanently recorded and indexed within seconds. That permanence is a feature — it is the source of PRISM's transparency and auditability.
              </p>
              <p>
                It is also a problem for institutional LPs. Credit fund managers do not publish their yield. They do not disclose how much capital they have deployed in which risk layer. They do not want their competitors to know their payout schedule, their tranche allocation, or their return profile.
              </p>
              <BulletList items={publicLedgerProblems} />
              <p>
                Without a solution to this, PRISM's LP market is limited to participants who have no privacy requirements. That is a small and uninteresting subset of the institutional credit world.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The exposure" title="What a tranche waterfall looks like on a public ledger.">
              <p>
                After <span className="font-mono text-sm text-white/80">accrue_yield</span> distributes yield across Prime, Core, and Alpha tranches, every LP's claim is on-chain. Anyone can read it.
              </p>
              <BulletList items={waterfallWithoutPrivacy} />
              <p>
                In traditional finance, yield distributions happen inside prime brokerage systems — invisible to outside observers. In on-chain credit without Cloak, the equivalent data is permanently public on an indexed ledger. The disclosure risk alone is enough for institutional credit desks to decline participation.
              </p>
              <p>
                This is the gap that Cloak closes.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Cloak" title="Shielded batch disbursements for every LP.">
              <p>
                Cloak is a privacy protocol on Solana that provides shielded batch disbursement — a primitive that fans one transaction out to many recipients with hidden individual amounts. Each recipient gets a viewing key that lets them verify and decrypt their own payout. No one else can.
              </p>
              <p>
                Cloak's batch disbursement primitive is structurally identical to a tranche waterfall payout. One vault, many recipients, individual amounts that should stay private. The fit is not approximate — it is exact.
              </p>
              <BulletList items={cloakProperties} />
              <p>
                The batch receipt is committed on-chain. The world knows that a disbursement happened, when it happened, and that the Cloak oracle attested to its validity. What the world cannot read is how much each LP received. That detail lives only in each LP's viewing key.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The flow" title="From accrue_yield to shielded payout.">
              <p>
                PRISM's Cloak integration mirrors the Encrypt FHE pattern exactly — the shielding happens via the Cloak SDK, and the on-chain program records a signed attestation of the batch disbursement result.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                {integrationFlow.map((item) => (
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
                The result: Solana has a verifiable record that yield was shielded and confirmed by the Cloak oracle. The LP has a viewing key that decrypts their exact payout amount. Everyone else sees a commitment hash and a confirmation bit.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="On-chain verification" title="The 73-byte attestation.">
              <p>
                Cloak's oracle produces a 73-byte signed attestation after a batch disbursement completes — the same length as PRISM's Encrypt attestation, by design. The message encodes the vault key, a sha256 commitment of the Cloak batch receipt, and a single confirmation byte.
              </p>
              <div className="mt-7 border border-white/10 bg-black/80 p-5">
                <div className="mb-4 font-mono text-xs uppercase text-white/35">
                  73-byte attestation layout
                </div>
                <div className="grid gap-px border border-white/10 bg-white/10">
                  {attestationLayout.map((row) => (
                    <div key={row.offset} className="flex items-start gap-4 bg-black/80 px-4 py-3">
                      <span className="w-14 shrink-0 font-mono text-xs text-[#eca8d6]/60">{row.offset}</span>
                      <span className="w-16 shrink-0 font-mono text-xs text-white/40">{row.length}</span>
                      <span className="font-mono text-xs text-white/75">{row.field}</span>
                      <span className="ml-auto font-mono text-xs text-white/30">{row.note}</span>
                    </div>
                  ))}
                </div>
              </div>
              <p>
                The transaction structure mirrors Encrypt exactly: <span className="font-mono text-sm text-white/80">ix[0]</span> is Solana's native Ed25519 precompile, which validates the Cloak oracle signature at the runtime level. <span className="font-mono text-sm text-white/80">ix[1]</span> is <span className="font-mono text-sm text-white/80">record_cloak_payout</span>, which reads the precompile result through the instructions sysvar, checks the batch ID commitment, and creates a <span className="font-mono text-sm text-white/80">CloakPayoutRecord</span> PDA with status <span className="font-mono text-sm text-white/80">Shielded</span>.
              </p>
              <div className="mt-7 border border-white/10 bg-black/80 p-5">
                <div className="mb-3 font-mono text-xs uppercase text-white/35">
                  Transaction structure
                </div>
                <div className="grid gap-px border border-white/10 bg-white/10">
                  {[
                    ["ix[0]", "Ed25519 precompile", "Verify Cloak oracle signature"],
                    ["ix[1]", "record_cloak_payout", "Read result via instructions sysvar"],
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

            <ArticleSection eyebrow="Cloak vs Encrypt" title="Same plumbing. Different jobs.">
              <p>
                Both Cloak and Encrypt use the same Ed25519-via-sysvar pattern. Both produce 73-byte attestations. Both verify signatures through the native precompile. But they answer completely different questions.
              </p>
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-[#eca8d6]/70">
                    Encrypt
                  </div>
                  <p className="text-sm leading-6 text-white/55">
                    Answers <span className="font-mono text-xs text-white/75">"is this loan in default?"</span> — attests a boolean FHE comparison on sealed credit data. The borrower's repayment numbers never appear on-chain.
                  </p>
                </div>
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-[#eca8d6]/70">
                    Cloak
                  </div>
                  <p className="text-sm leading-6 text-white/55">
                    Answers <span className="font-mono text-xs text-white/75">"were LP payouts executed confidentially?"</span> — attests a batch shielded disbursement to multiple recipients, hiding individual amounts behind viewing keys.
                  </p>
                </div>
              </div>
              <p>
                Together they close the two disclosure problems in on-chain institutional credit: Encrypt protects borrower data at the default event, Cloak protects LP data at the yield event. Neither is optional for an institutional credit market.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="What changes" title="A yield market institutions can actually join.">
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-white/35">
                    Without Cloak
                  </div>
                  <ul className="space-y-3">
                    {withoutCloak.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-white/20" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-[#eca8d6]/70">
                    With Cloak
                  </div>
                  <ul className="space-y-3">
                    {withCloak.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-[#eca8d6]/50" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p>
                The waterfall logic is unchanged. Prime still gets paid first. Alpha still absorbs losses first. What changes is who can see the amounts flowing through that waterfall — and the answer, with Cloak, is: only the LP whose funds they are.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Why it matters" title="Privacy is what makes institutional yield possible.">
              <p>
                PRISM's credit market is designed for institutions — capital allocators who measure positions in tens of millions, who have compliance teams, who operate in markets where revealing your book is a competitive and regulatory liability.
              </p>
              <p>
                A public tranche payout is not just inconvenient for these participants. It is disqualifying. No credit fund manager will accept a structure where their yield schedule, their tranche allocation, and their return profile are permanently indexed on a public ledger for their LPs, competitors, and regulators to read without consent.
              </p>
              <p>
                Cloak does not add privacy as a feature on top of PRISM. It removes the single largest barrier to institutional LP participation. The waterfall already worked. The math was already correct. The tranches were already liquid. What was missing was the ability to move money through that waterfall without every amount becoming permanently public.
              </p>
              <p>
                That is what Cloak provides. And that is why it was never optional.
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
              <div className="mt-5 font-display text-5xl text-white">73</div>
              <p className="mt-3 text-sm leading-6 text-white/55">
                bytes in the Cloak attestation — the entire proof that LP payouts were shielded, with zero individual amounts on-chain.
              </p>
              <div className="mt-8 grid gap-px border border-white/10 bg-white/10">
                {["Accrue yield", "Shield via Cloak", "Audit via key"].map((item) => (
                  <div key={item} className="bg-black/80 px-4 py-3 font-mono text-xs uppercase text-white/55">
                    {item}
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-white/10 pt-6">
                <div className="font-mono text-xs uppercase text-white/35">Key facts</div>
                <div className="mt-4 space-y-3">
                  {[
                    ["Attestation", "73 bytes, Ed25519"],
                    ["Prefix", 'b"clk_atts"'],
                    ["Amounts", "hidden from ledger"],
                    ["Audit path", "per-LP viewing key"],
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
