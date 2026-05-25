"use client";

import { useEffect, useRef, useState } from "react";

const features = [
  {
    number: "01",
    title: "Tranche Vaults",
    description: "Deposit USDC into Prime, Core, or Alpha tranches. Each tranche has its own risk profile, target yield, and place in the loss waterfall.",
    stats: { value: "3", label: "risk tranches per vault" },
  },
  {
    number: "02",
    title: "Yield Waterfall",
    description: "Borrower coupons distribute through tranches in priority order. Prime targets 5%, Core targets 8%, and Alpha targets 15% for first-loss upside.",
    stats: { value: "5% / 8% / 15%", label: "tranche target yields" },
  },
  {
    number: "03",
    title: "Default Cascade",
    description: "When a credit event hits, losses absorb in reverse priority. Alpha wipes first. Core takes the next hit. Prime holders are protected — exactly as the contract promised.",
    stats: { value: "100%", label: "loss absorption proven on-chain" },
  },
  {
    number: "04",
    title: "Live Secondary Market",
    description: "Tranche tokens (pPRIME, pCORE, pALPHA) trade on a constant-product AMM. Markets price credit risk in real time.",
    stats: { value: "0", label: "intermediaries" },
  },
];

// Floating dot particles visualization
function ParticleVisualization() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    canvas.addEventListener("mousemove", handleMouseMove);

    // Generate stable particle positions
    const COUNT = 70;
    const particles = Array.from({ length: COUNT }, (_, i) => {
      const seed = i * 1.618;
      return {
        bx: ((seed * 127.1) % 1),
        by: ((seed * 311.7) % 1),
        phase: seed * Math.PI * 2,
        speed: 0.4 + (seed % 0.4),
        radius: 1.2 + (seed % 2.2),
      };
    });

    let time = 0;
    const render = () => {
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      particles.forEach((p) => {
        const flowX = Math.sin(time * p.speed * 0.4 + p.phase) * 38;
        const flowY = Math.cos(time * p.speed * 0.3 + p.phase * 0.7) * 24;

        const bx = p.bx * w;
        const by = p.by * h;
        const dx = p.bx - mx;
        const dy = p.by - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const influence = Math.max(0, 1 - dist * 2.8);

        const x = bx + flowX + influence * Math.cos(time + p.phase) * 36;
        const y = by + flowY + influence * Math.sin(time + p.phase) * 36;

        const pulse = Math.sin(time * p.speed + p.phase) * 0.5 + 0.5;
        const alpha = 0.08 + pulse * 0.18 + influence * 0.3;

        ctx.beginPath();
        ctx.arc(x, y, p.radius + pulse * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
      });

      time += 0.016;
      frameRef.current = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-auto"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

export function FeaturesSection({ id = "features" }: { id?: string }) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const sectionRef = useRef<HTMLDivElement>(null);

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
    <section
      id={id}
      ref={sectionRef}
      className="relative flex min-h-[100svh] items-center overflow-hidden py-24 lg:h-screen lg:py-0 lg:pt-20"
    >
      <div className="w-full max-w-[1400px] mx-auto px-6 lg:px-12">
        {/* Header - Full width with diagonal layout */}
        <div className="relative mb-8 lg:mb-10">
          <div className="grid lg:grid-cols-12 gap-6 items-end">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-4">
                <span className="w-12 h-px bg-foreground/30" />
                Tranches
              </span>
              <h2
                className={`text-5xl font-display tracking-tight leading-[0.92] transition-all duration-1000 sm:text-6xl lg:text-[104px] lg:leading-[0.9] ${
                  isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
                }`}
              >
                Programmable
                <br />
                <span className="text-muted-foreground">risk.</span>
              </h2>
            </div>
            <div className="lg:col-span-5 lg:pb-4">
              <p className={`text-lg text-muted-foreground leading-relaxed transition-all duration-1000 delay-200 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}>
                Three risk tranches per vault. A pull-pattern yield waterfall. A reverse-priority loss cascade. All composable, all on-chain.
              </p>
            </div>
          </div>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid lg:grid-cols-12 gap-4 lg:gap-6">
          {/* Large feature card */}
          <div 
            className={`lg:col-span-12 relative bg-black border border-foreground/10 min-h-[330px] lg:min-h-[360px] overflow-hidden group transition-all duration-700 flex ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
            }`}
            onMouseEnter={() => setActiveFeature(0)}
            >
            {/* Left: text content */}
            <div className="relative flex-1 bg-black p-5 sm:p-6 lg:p-8">
              <ParticleVisualization />
              <div className="relative z-10">
                <span className="font-mono text-sm text-muted-foreground">{features[0].number}</span>
                <h3 className="mt-3 mb-4 font-display text-3xl transition-transform duration-500 group-hover:translate-x-2 lg:text-4xl">
                  {features[0].title}
                </h3>
                <p className="mb-5 max-w-md text-base leading-relaxed text-muted-foreground lg:text-lg">
                  {features[0].description}
                </p>
                <div>
                  <span className="font-display text-4xl lg:text-5xl">{features[0].stats.value}</span>
                  <span className="block text-sm text-muted-foreground font-mono mt-2">{features[0].stats.label}</span>
                </div>
              </div>
            </div>

            {/* Right: mirrored image, full height */}
            <div className="hidden lg:block relative w-[42%] shrink-0 overflow-hidden">
              <img
                src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Upscaled%20Image%20%2812%29-ng3RrNnsPMJ5CrtOjcPTmhHg01W11q.png"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover object-center"
                style={{ transform: "scaleX(-1)" }}
              />
              {/* Fade left edge into black */}
              <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
