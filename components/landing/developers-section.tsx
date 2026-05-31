"use client";

import { useState, useEffect, useRef } from "react";
const features = [
  { 
    title: "Stellar settlement",
    description: "Fast finality for tranche minting, NAV updates, AMM swaps, and withdrawals."
  },
  { 
    title: "Cross-chain collateral", 
    description: "Ika extends the borrower model toward BTC, RWAs, and MPC-secured assets."
  },
  { 
    title: "Private flows", 
    description: "Encrypt and Cloak add confidential scoring, strategy data, and shielded exits."
  },
  { 
    title: "Verified events", 
    description: "Switchboard and Dune SIM make credit events observable, indexable, and demo-ready."
  },
];

export function DevelopersSection() {
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section id="developers" ref={sectionRef} className="relative flex min-h-[100svh] items-center overflow-hidden py-24 lg:py-24">

      {/* Image — absolute, bottom-right, behind all content */}
      <div
        className={`pointer-events-none absolute bottom-0 right-0 hidden h-[85%] w-[55%] transition-all duration-1000 delay-300 lg:block ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <img
          src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Upscaled%20Image%20%2813%29-OQ2DiR3ElVsUg8kTvTL1kC5A3Q6maM.png"
          alt=""
          aria-hidden="true"
          className="w-full h-full object-cover object-left-top"
        />
        {/* Fade left edge */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
        {/* Fade top edge */}
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-transparent" />
      </div>

      {/* All text content sits on top */}
      <div className="relative z-10 w-full max-w-[1600px] mx-auto px-6 lg:px-12">
        {/* Header — Full width */}
        <div
          className={`mb-8 transition-all duration-700 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-6">
            <span className="w-8 h-px bg-foreground/30" />
            Infrastructure stack
          </span>
          <h2 className="max-w-[1180px] font-display text-5xl leading-[0.92] tracking-tight sm:text-6xl md:text-7xl lg:text-[104px] lg:leading-[0.9]">
            Built on trusted
            <br />
            <span className="text-muted-foreground">infrastructure.</span>
          </h2>
        </div>


        {/* Description + Features — left half only */}
        <div
          className={`max-w-full transition-all duration-700 delay-100 lg:max-w-[50%] ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          <p className="mb-10 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg lg:mb-12 lg:text-xl">
            Powered by Stellar and partner protocols that secure collateral, privacy, analytics,
            payments, and verified credit events.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className={`transition-all duration-500 ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: `${index * 50 + 200}ms` }}
              >
                <h3 className="font-medium mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
