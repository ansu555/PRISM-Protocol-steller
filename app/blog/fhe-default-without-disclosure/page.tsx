import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { FooterSection } from "@/components/landing/footer-section";
import { Navigation } from "@/components/landing/navigation";
import { WaitlistDialog } from "@/components/landing/waitlist-dialog";

export const metadata: Metadata = {
  title: "The Default You Can Prove Without Seeing - PRISM Protocol",
  description:
    "Encrypt's FHE oracle lets PRISM prove a loan is in default without revealing a single byte of borrower financial data. This is how credit stays private on a public ledger.",
};

const transparencyProblems = [
  "Loan balances and repayment history are permanently indexed.",
  "Borrowers competing in the same market expose their cash flow to rivals.",
  "No institutional credit desk will borrow on a chain that makes their liabilities public.",
  "Admin-triggered defaults require trusting a human, not a proof.",
];

const fheProperties = [
  "Computes on ciphertext — the oracle never sees plaintext values.",
  "The result is a provable boolean, not a data disclosure.",
  "Any tampering with the sealed data produces a commitment mismatch.",
  "The proof is deterministic — the same sealed data always yields the same result.",
];

const attestationLayout = [
  { offset: "0 – 7", length: "8 bytes", field: "b\"enc_atts\"", note: "Fixed prefix" },
  { offset: "8 – 39", length: "32 bytes", field: "loan pubkey", note: "Which loan is attested" },
  { offset: "40 – 71", length: "32 bytes", field: "score_commitment", note: "sha256 of sealed credit data" },
  { offset: "72", length: "1 byte", field: "result: 0x01", note: "Default proven = true" },
];

const withoutFhe = [
  "Default requires admin to post loan balance and repayment amount on-chain.",
  "Every credit event permanently exposes borrower financial data.",
  "Institutional borrowers refuse the model — too much disclosure risk.",
  "The trust problem shifts from collateral to the oracle operator.",
];

const withFhe = [
  "Default is proven by a cryptographic circuit, not a data post.",
  "The on-chain record is a commitment hash — no raw financial data.",
  "The loss cascade fires from a proof, not an admin transaction.",
  "Institutions can borrow without their credit profile becoming public.",
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

export default function FheDefaultArticlePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <Navigation />

      <article>
        <header className="relative overflow-hidden border-b border-white/10 bg-black pt-32">
          <div className="absolute inset-0">
            <Image
              src="/images/encrypted.jpg"
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover object-center opacity-50 brightness-110 contrast-120 saturate-110"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black via-black/72 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-black/15 to-black/40" />
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
                The default you can
                <br />
                prove without seeing.
              </h1>

              <p className="mt-7 max-w-3xl text-xl leading-8 text-white/65">
                Encrypt's FHE oracle computes loan default conditions on sealed borrower data — no plaintext ever leaves the borrower's control. The on-chain result is a cryptographic proof, not a financial disclosure.
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-[1400px] gap-10 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-12 lg:py-20">
          <div className="max-w-4xl">
            <ArticleSection eyebrow="The problem" title="A public ledger is a terrible place for credit data.">
              <p>
                PRISM runs on Solana — a public blockchain where every instruction, every account state change, and every payment is permanently recorded and indexed. That is the source of its transparency and composability. It is also the source of a real problem for institutional credit.
              </p>
              <p>
                Credit is fundamentally about information asymmetry. A borrower's repayment history, outstanding balances, and default behavior are exactly the data their competitors, counterparties, and rivals would pay to see. Posting that data on-chain to trigger a default is not an acceptable tradeoff for any serious institutional borrower.
              </p>
              <BulletList items={transparencyProblems} />
              <p>
                Without a solution to this, PRISM's credit market is limited to borrowers with no privacy requirements. That is a small market. The real institutional credit market requires something better.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Encrypt + FHE" title="Compute on the ciphertext. Never touch the plaintext.">
              <p>
                Fully Homomorphic Encryption (FHE) is a class of cryptographic scheme that allows arbitrary computation on encrypted data. The operator running the computation never decrypts the input — they work entirely on ciphertext — yet the output is a cryptographically correct answer to the query.
              </p>
              <p>
                Encrypt implements a REFHE variant optimized for range proofs and boolean conditions. For PRISM's default use case, the relevant circuit is simple: does <span className="font-mono text-sm text-white/80">total_repaid &lt; principal</span>? That single boolean, proven over sealed inputs, is all the on-chain program needs to trigger the loss cascade.
              </p>
              <BulletList items={fheProperties} />
              <p>
                The oracle is a prover, not a data relay. It receives the sealed credit data, runs the FHE circuit, and outputs a signed boolean. The borrower's raw repayment numbers never appear anywhere in the transaction.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="The flow" title="From sealed data to on-chain cascade.">
              <p>
                PRISM's Encrypt integration has two phases separated in time: commitment at underwriting, and verification at default.
              </p>
              <p>
                When a loan is underwritten, the <span className="font-mono text-sm text-white/80">attach_encrypt_score</span> instruction creates an <span className="font-mono text-sm text-white/80">EncryptLoanHealth</span> PDA on-chain. This PDA stores the <span className="font-mono text-sm text-white/80">score_commitment</span> — a sha256 hash of the borrower's Encrypt-sealed credit data. The sealed data itself lives with the Encrypt oracle. Only the commitment goes on-chain. That commitment is the anchor.
              </p>
              <p>
                When default is suspected, the Encrypt oracle loads the sealed data, runs <span className="font-mono text-sm text-white/80">total_repaid &lt; principal</span> homomorphically, and signs a 73-byte attestation message. The signature and message are submitted to Solana in a two-instruction transaction.
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
                The first instruction in the transaction is the native Ed25519 precompile — Solana validates the oracle signature at the runtime level, with no program logic involved. The second instruction, <span className="font-mono text-sm text-white/80">verify_encrypt_default</span>, reads the precompile's result through the instructions sysvar, validates the commitment matches the one registered at underwriting, checks the result byte is <span className="font-mono text-sm text-white/80">0x01</span>, and fires the loss cascade.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Commitment binding" title="The sha256 anchor.">
              <p>
                The <span className="font-mono text-sm text-white/80">score_commitment</span> stored at underwriting time is the binding mechanism that prevents oracle substitution attacks.
              </p>
              <p>
                Suppose an adversary wanted to trigger a false default on a healthy loan. They would need to produce a valid Ed25519 signature from the Encrypt oracle over a message whose commitment field matches the one stored in <span className="font-mono text-sm text-white/80">EncryptLoanHealth</span>. That requires either controlling the oracle private key or finding a preimage to the sha256 commitment — both computationally infeasible.
              </p>
              <p>
                The same binding works in reverse: the oracle cannot attest a default based on different credit data. Any substitution produces a different sha256 hash, which fails the commitment check in <span className="font-mono text-sm text-white/80">verify_encrypt_default</span> with a hard rejection.
              </p>
              <p>
                The commitment ties the FHE computation to exactly the data that was sealed at underwriting. The oracle has no latitude to run the circuit over different inputs and still get a passing result.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="What changes" title="A default that institutions can accept.">
              <div className="mt-7 grid gap-px border border-white/10 bg-white/10 md:grid-cols-2">
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-white/35">
                    Without FHE
                  </div>
                  <ul className="space-y-3">
                    {withoutFhe.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-white/20" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-black/80 p-5">
                  <div className="mb-4 font-mono text-xs uppercase text-[#eca8d6]/70">
                    With FHE
                  </div>
                  <ul className="space-y-3">
                    {withFhe.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-6 text-white/55">
                        <span className="mt-2.5 h-px w-5 shrink-0 bg-[#eca8d6]/50" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p>
                The loss cascade is identical either way. Alpha absorbs first, then Core, then Prime. The waterfall does not change. What changes is how the cascade is authorized: not by an admin posting sensitive data, but by a proof that a condition is true.
              </p>
            </ArticleSection>

            <ArticleSection eyebrow="Why it matters" title="Privacy is what makes trustless credit possible.">
              <p>
                The combination of Encrypt and IKA solves the two hardest problems in on-chain institutional credit at the same time. IKA handles the collateral problem — BTC and ETH locked without a custodian. Encrypt handles the disclosure problem — defaults proven without exposing financial data.
              </p>
              <p>
                Together they enable a credit market that works the way institutional credit actually works: where collateral is cryptographically secured, where default events are provably triggered, and where borrower financial profiles are not permanently indexed on a public ledger for their competitors to read.
              </p>
              <p>
                FHE is not a privacy feature that PRISM added to check a box. It is the mechanism that makes the default path acceptable to the borrowers PRISM is built for. Without it, the credit market is limited to actors with no privacy requirements — a small and uninteresting market. With it, the market is every institution that needs credit on-chain and could not take the disclosure risk before.
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
                bytes in the Encrypt attestation — the entire proof that a loan is in default, with zero raw financial data on-chain.
              </p>
              <div className="mt-8 grid gap-px border border-white/10 bg-white/10">
                {["Seal data", "Prove condition", "Cascade on-chain"].map((item) => (
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
                    ["Circuit", "total_repaid < principal"],
                    ["Result", "1-bit boolean proof"],
                    ["Commitment", "sha256, 32 bytes"],
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
