"use client";

import { useEffect, useState, useRef } from "react";
import { Shield, Lock, Eye, FileCheck } from "lucide-react";

const securityFeatures = [
  {
    icon: Shield,
    title: "PDA authorities",
    description: "Vaults, reserves, mints, and pools are controlled by program-derived authorities.",
    image: "/images/isolated.jpg",
  },
  {
    icon: Lock,
    title: "Reserve invariant",
    description: "USDC reserves reconcile against tranche NAV and loss accounting.",
    image: "/images/encrypted.jpg",
  },
  {
    icon: Eye,
    title: "Observable events",
    description: "Deposits, yield accruals, swaps, and credit events are visible on-chain.",
    image: "/images/audit.jpg",
  },
  {
    icon: FileCheck,
    title: "Controlled triggers",
    description: "Defaults are admin-or-oracle gated for the demo and never silently applied.",
    image: "/images/permissions.jpg",
  },
];

const certifications = ["Anchor", "SPL", "Q64.64", "PDA"];

export function SecuritySection() {
  const [isVisible, setIsVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
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
      setActiveFeature((prev) => (prev + 1) % securityFeatures.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section id="security" ref={sectionRef} className="relative min-h-[100svh] overflow-hidden pb-12 pt-24 lg:pt-24">
      {/* Background accent removed */}
      
      <div className="max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="mb-8 lg:mb-10">
          <span className={`inline-flex items-center gap-4 text-sm font-mono text-muted-foreground mb-5 transition-all duration-700 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}>
            <span className="w-12 h-px bg-foreground/20" />
            Security
          </span>
          
          {/* Title — full width */}
          <h2 className={`mb-6 font-display text-5xl leading-[0.92] tracking-tight transition-all duration-1000 sm:text-6xl md:text-7xl lg:text-[104px] lg:leading-[0.9] ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            Trustless,
            <br />
            <span className="text-muted-foreground">not opaque.</span>
          </h2>
          
          {/* Description — below title */}
          <div className={`transition-all duration-1000 delay-100 ${
            isVisible ? "opacity-100" : "opacity-0"
          }`}>
            <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              PRISM keeps credit accounting explicit: authority boundaries, checked math, reserve reconciliation, and auditable credit events.
            </p>
          </div>
        </div>

        {/* Main content */}
        <div className="grid lg:grid-cols-12 gap-4 lg:gap-5">
          {/* Large visual card */}
          <div className={`lg:col-span-7 relative min-h-[300px] overflow-hidden border border-foreground/10 p-5 transition-all duration-700 sm:p-6 lg:min-h-[320px] lg:p-8 ${
            isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}>
            {/* Dynamic feature image with cross-fade — desktop only */}
            <div className="absolute inset-0 pointer-events-none items-center justify-end hidden lg:flex">
              {securityFeatures.map((feature, index) => (
                <img
                  key={feature.image}
                  src={feature.image}
                  alt={feature.title}
                  className="absolute h-3/4 w-3/4 object-contain object-right transition-opacity duration-500"
                  style={{ opacity: activeFeature === index ? 0.85 : 0 }}
                />
              ))}
            </div>
            
            <div className="relative z-10">
              <span className="font-mono text-sm text-muted-foreground">Accounting guardrail</span>
              <div className="mt-5">
                <span className="font-display text-5xl sm:text-6xl lg:text-7xl">0</span>
                <span className="block text-muted-foreground mt-2">manual balance adjustments</span>
              </div>
            </div>
            
            {/* Certification badges */}
            <div className="absolute bottom-6 left-6 right-6 flex flex-wrap gap-2">
              {certifications.map((cert, index) => (
                <span
                  key={cert}
                  className={`px-3 py-1 border border-foreground/10 text-xs font-mono text-muted-foreground transition-all duration-500 ${
                    isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                  }`}
                  style={{ transitionDelay: `${index * 100 + 300}ms` }}
                >
                  {cert}
                </span>
              ))}
            </div>
          </div>

          {/* Feature cards stack */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {securityFeatures.map((feature, index) => (
              <div
                key={feature.title}
                className={`p-4 lg:p-5 border transition-all duration-500 cursor-default ${
                  activeFeature === index 
                    ? "border-foreground/30 bg-foreground/[0.04]" 
                    : "border-foreground/10"
                } ${isVisible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
                style={{ transitionDelay: `${index * 80}ms` }}
                onClick={() => setActiveFeature(index)}
                onMouseEnter={() => setActiveFeature(index)}
              >
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 w-9 h-9 flex items-center justify-center border transition-colors ${
                    activeFeature === index 
                      ? "border-foreground bg-foreground text-background" 
                      : "border-foreground/20"
                  }`}>
                    <feature.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-medium mb-1">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
