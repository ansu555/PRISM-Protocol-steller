"use client";

import { useEffect, useState, useRef } from "react";

export function IntegrationsSection() {
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
    <section id="integrations" ref={sectionRef} className="relative min-h-[760px] overflow-hidden sm:min-h-screen">

      {/* Header — centré verticalement sur l'image */}
      <div className="relative z-10 px-6 pt-24 text-center sm:px-8 lg:pt-24">
        <span className={`inline-flex items-center gap-4 text-sm font-mono text-muted-foreground mb-5 transition-all duration-700 justify-center ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          <span className="w-12 h-px bg-foreground/20" />
          Ecosystem
          <span className="w-12 h-px bg-foreground/20" />
        </span>

        <h2 className={`font-display text-5xl leading-[0.92] tracking-tight transition-all duration-1000 sm:text-6xl md:text-7xl lg:text-[112px] lg:leading-[0.9] ${
          isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
        }`}>
          Connect
          <br />
          <span className="text-muted-foreground">the credit stack.</span>
        </h2>

        <p className={`mx-auto mt-5 max-w-lg text-base leading-relaxed text-muted-foreground transition-all duration-1000 delay-100 sm:text-lg ${
          isVisible ? "opacity-100" : "opacity-0"
        }`}>
          Oracle triggers, analytics surfaces, privacy layers, and market makers can plug into PRISM without changing the vault accounting core.
        </p>
      </div>

      {/* Full-width image */}
      <div className={`absolute bottom-0 left-1/2 w-[155vw] -translate-x-1/2 transition-all duration-1000 delay-200 sm:w-screen ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}>
        <img
          src="/images/connection-hands.png"
          alt=""
          aria-hidden="true"
          className="block h-auto w-full max-w-none"
        />
      </div>

    </section>
  );
}
