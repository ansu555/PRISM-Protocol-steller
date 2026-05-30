import Image from "next/image";

type Partner = {
  name: string;
  image: string;
  width: number;
  height: number;
  className?: string;
  muted?: boolean;
};

const partners: Partner[] = [
  {
    name: "Solana",
    image: "/logos/solana-logo.png",
    width: 30,
    height: 30,
  },
  {
    name: "Ika",
    image: "/logos/ika-logo.png",
    width: 30,
    height: 30,
  },
  {
    name: "Encrypt",
    image: "/logos/encrypt-logo.png",
    width: 30,
    height: 30,
  },
  {
    name: "Cloak",
    image: "/logos/cloak-logo.png",
    width: 86,
    height: 26,
    className: "w-[74px]",
  },
  {
    name: "Dune SIM",
    image: "/logos/sim-logo.png",
    width: 30,
    height: 30,
  },
  {
    name: "Dodo Payments",
    image: "/logos/dodo-logo.png",
    width: 92,
    height: 24,
    className: "w-[82px]",
  },
  {
    name: "Switchboard",
    image: "/logos/switchboard-logo.svg",
    width: 30,
    height: 30,
  },
];

function PartnerLogo({ partner }: { partner: Partner }) {
  return (
    <Image
      src={partner.image}
      alt={`${partner.name} logo`}
      width={partner.width}
      height={partner.height}
      className={`h-6 object-contain ${partner.className ?? "w-6"}`}
    />
  );
}

export function TrustedInfrastructure() {
  return (
    <section className="w-full overflow-hidden bg-[#111111] px-6 py-20 sm:px-10 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <div className="space-y-5">
          <h2 className="max-w-4xl text-4xl font-semibold tracking-normal text-white sm:text-5xl lg:text-6xl">
            Built on trusted infrastructure.
          </h2>
          <p className="max-w-3xl text-lg font-medium text-zinc-400 sm:text-xl">
            Powered by Solana and the partner rails that extend PRISM across collateral, privacy,
            analytics, payments, and verified credit events.
          </p>
        </div>

        <div className="mt-16 flex min-w-max items-center gap-12 lg:gap-16">
          {partners.map((partner) => (
            <div
              key={partner.name}
              className={`flex items-center gap-3 text-lg font-bold ${
                partner.muted ? "text-zinc-700" : "text-zinc-400"
              }`}
            >
              <PartnerLogo partner={partner} />
              <span>{partner.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TrustedInfrastructure;
