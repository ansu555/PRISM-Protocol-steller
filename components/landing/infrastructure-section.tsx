"use client";

import { useEffect, useState, useRef } from "react";

const regions = [
  { name: "Tranche Vaults", nodes: 3, status: "operational" },
  { name: "AMM Pools", nodes: 3, status: "operational" },
  { name: "Loss Bucket", nodes: 1, status: "operational" },
  { name: "Credit Events", nodes: 3, status: "operational" },
];

export function InfrastructureSection({ id = "infra" }: { id?: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeRegion, setActiveRegion] = useState(0);
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

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveRegion((prev) => (prev + 1) % regions.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id={id} ref={sectionRef} className="relative flex min-h-[100svh] items-center overflow-hidden py-24 lg:h-screen lg:py-0 lg:pt-20">
        {/* Background accent — retiré, remplacé par l'image sphère */}
      
      <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-8 lg:mb-10">
          <span className={`inline-flex items-center gap-4 text-sm font-mono text-muted-foreground mb-4 transition-all duration-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}>
            <span className="w-12 h-px bg-foreground/20" />
            On-chain architecture
          </span>
          
          <div className="grid lg:grid-cols-[auto_1fr] gap-6 lg:gap-10 items-stretch">
            {/* Image globe — colonne gauche, pleine hauteur */}
            <div className={`hidden w-36 shrink-0 transition-all duration-1000 sm:block lg:w-52 xl:w-60 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/world-3i68QNWJwmO7W19ztZWbevAwJQHzYL.png"
                alt="Global network sphere"
                className="w-full h-full object-contain object-center"
              />
            </div>

            {/* Titre + description empilés */}
            <div className="flex flex-col justify-center">
              <h2 className={`font-display text-5xl leading-[0.92] tracking-tight transition-all duration-1000 sm:text-6xl lg:text-[104px] lg:leading-[0.9] ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
              }`}>
                On-chain by
                <br />
                <span className="text-muted-foreground">default.</span>
              </h2>

              <p className={`mt-5 text-lg text-muted-foreground leading-relaxed max-w-lg transition-all duration-1000 delay-100 ${
                isVisible ? "opacity-100" : "opacity-0"
              }`}>
                Two Anchor programs on Solana. Vault logic in <span className="font-mono">prism_core</span>. Market layer in <span className="font-mono">prism_amm</span>. No backend, no off-chain trust.
              </p>
            </div>
          </div>
        </div>

        {/* Main content grid */}
        <div className="grid lg:grid-cols-3 gap-4 lg:gap-5">
          {/* Large stat card */}
          <div className={`lg:col-span-2 relative overflow-hidden border border-foreground/10 bg-foreground/[0.02] p-5 transition-all duration-700 sm:p-6 lg:p-8 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            {/* Animated dots background with connecting lines */}
            <div className="absolute inset-0 opacity-70">
              {/* SVG for connecting lines */}
              <svg
                className="absolute inset-0 w-full h-full"
                style={{ pointerEvents: "none" }}
              >
                <defs>
                  <style>{`
                    @keyframes drawLine {
                      0%   { stroke-dashoffset: 1000; opacity: 0; }
                      15%  { opacity: 1; }
                      70%  { opacity: 0.7; }
                      100% { stroke-dashoffset: 0; opacity: 0; }
                    }
                    .connecting-line {
                      stroke: #eca8d6;
                      stroke-width: 1.2;
                      fill: none;
                      stroke-dasharray: 1000;
                      animation: drawLine 3s ease-in-out infinite;
                    }
                  `}</style>
                </defs>
                {[...Array(19)].map((_, i) => {
                  const x1 = 10 + (i % 5) * 20;
                  const y1 = 10 + Math.floor(i / 5) * 25;
                  const x2 = 10 + ((i + 1) % 5) * 20;
                  const y2 = 10 + Math.floor((i + 1) / 5) * 25;
                  return (
                    <line
                      key={`line-${i}`}
                      x1={`${x1}%`}
                      y1={`${y1}%`}
                      x2={`${x2}%`}
                      y2={`${y2}%`}
                      className="connecting-line"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  );
                })}
              </svg>

              {/* Dots */}
              {[...Array(20)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-[#eca8d6]"
                  style={{
                    left: `${10 + (i % 5) * 20}%`,
                    top: `${10 + Math.floor(i / 5) * 25}%`,
                    animation: `pulse 2s ease-in-out ${i * 0.1}s infinite`,
                  }}
                />
              ))}
            </div>
            
            <div className="relative z-10">
              <div className="flex items-baseline gap-2 mb-3">
                <span className="font-display text-6xl leading-none sm:text-7xl lg:text-[8rem]">2</span>
                <span className="text-xl text-muted-foreground sm:text-2xl">programs</span>
              </div>
              <p className="text-muted-foreground max-w-md">
                Credit risk engine and market layer separated for blast-radius isolation. AMM bug ≠ vault failure.
              </p>
            </div>
          </div>

          {/* Stacked stat cards */}
          <div className="flex flex-col gap-4 lg:gap-5">
            <div className={`border border-foreground/10 bg-foreground/[0.02] p-5 transition-all duration-700 delay-100 sm:p-6 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
              <span className="text-4xl lg:text-5xl font-display">100%</span>
              <span className="block text-sm text-muted-foreground mt-2">On-chain transparency</span>
            </div>

            <div className={`border border-foreground/10 bg-foreground/[0.02] p-5 transition-all duration-700 delay-200 sm:p-6 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
            }`}>
              <span className="text-4xl lg:text-5xl font-display">&lt;400ms</span>
              <span className="block text-sm text-muted-foreground mt-2">Swap latency</span>
            </div>
          </div>
        </div>

        {/* Region list */}
        <div className={`mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4 transition-all duration-1000 delay-300 ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          {regions.map((region, index) => (
            <div
              key={region.name}
              className={`p-4 lg:p-5 border transition-all duration-300 cursor-default ${
                activeRegion === index 
                  ? "border-foreground/30 bg-foreground/[0.04]" 
                  : "border-foreground/10"
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full transition-colors ${
                  activeRegion === index ? "bg-[#eca8d6]" : "bg-foreground/20"
                }`} />
                <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
                  {region.status}
                </span>
              </div>
              <span className="font-medium block mb-1">{region.name}</span>
              <span className="text-sm text-muted-foreground">{region.nodes} {region.nodes === 1 ? "PDA" : "PDAs"}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
