import Image from "next/image";

const PARTNERS = [
  { name: "Stellar", logo: "/logos/stellar-logo.png", domain: "stellar.org" },
  { name: "Soroban", logo: "/logos/soroban.png", domain: "stellar.org" },
  { name: "Reflector", logo: "/logos/reflector.png", domain: "reflector.network" },
  { name: "Soroswap", logo: "/logos/soroswap.png", domain: "soroswap.finance" },
  { name: "MoneyGram", logo: "/logos/moneygram-logo.png", domain: "stellar.org" },
  { name: "Freighter", logo: "/logos/freighter-logo.png", domain: "freighter.app" },
  { name: "Circle", logo: "/logos/circle-logo.png", domain: "circle.com" },
  { name: "USDC", logo: "/logos/usdc-logo.png", domain: "circle.com" },
];

export function TrustedInfrastructure() {
  return (
    <section className="relative overflow-hidden border-y border-white/10 bg-black py-16">
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="mb-12 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-white/40">
            Trusted Infrastructure
          </p>
          <h2 className="mt-3 font-sans text-2xl font-medium text-white sm:text-3xl">
            Powered by industry leaders
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/5 sm:grid-cols-3 lg:grid-cols-4">
          {PARTNERS.map((partner) => (
            <div
              key={partner.name}
              className="group flex items-center justify-center gap-3 bg-black px-6 py-8 transition-colors hover:bg-white/5"
            >
              <Image
                src={partner.logo}
                alt={partner.name}
                width={28}
                height={28}
                className="h-7 w-7 object-contain opacity-70 grayscale transition group-hover:opacity-100 group-hover:grayscale-0"
              />
              <span className="font-mono text-sm text-white/70">{partner.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
