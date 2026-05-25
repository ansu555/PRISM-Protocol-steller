"use client";

import { useEffect, useRef, useState } from "react";
import { FeaturesSection } from "@/components/landing/features-section";
import { HowItWorksSection } from "@/components/landing/how-it-works-section";
import { InfrastructureSection } from "@/components/landing/infrastructure-section";
import { MetricsSection } from "@/components/landing/metrics-section";

const panels = [
  { id: "features", component: <FeaturesSection id={undefined} /> },
  { id: "how-it-works", component: <HowItWorksSection id={undefined} /> },
  { id: "infra", component: <InfrastructureSection id={undefined} /> },
  { id: "metrics", component: <MetricsSection id={undefined} /> },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeOutQuart(value: number) {
  return 1 - Math.pow(1 - value, 4);
}

export function HorizontalScrollSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef(0);
  const snapFrameRef = useRef(0);
  const isSnappingRef = useRef(false);
  const canExitLastPanelRef = useRef(true);
  const canLeaveLastPanelUpRef = useRef(true);
  const lastPanelExitDeltaRef = useRef(0);
  const lastPanelUpDeltaRef = useRef(0);
  const edgeReleaseTimerRef = useRef(0);
  const upEdgeReleaseTimerRef = useRef(0);
  const exitIntentResetTimerRef = useRef(0);
  const upIntentResetTimerRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [isHorizontalEnabled, setIsHorizontalEnabled] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncMode = () => setIsHorizontalEnabled(mediaQuery.matches);

    syncMode();
    mediaQuery.addEventListener("change", syncMode);

    return () => mediaQuery.removeEventListener("change", syncMode);
  }, []);

  useEffect(() => {
    if (!isHorizontalEnabled) {
      setProgress(0);
      return;
    }

    const updateProgress = () => {
      if (!sectionRef.current) return;

      const section = sectionRef.current;
      const travel = section.offsetHeight - window.innerHeight;
      const nextProgress =
        travel > 0 ? clamp(-section.getBoundingClientRect().top / travel, 0, 1) : 0;

      setProgress(nextProgress);
    };

    const armLastPanelExitAfterWheelPause = () => {
      window.clearTimeout(edgeReleaseTimerRef.current);
      edgeReleaseTimerRef.current = window.setTimeout(() => {
        canExitLastPanelRef.current = true;
        lastPanelExitDeltaRef.current = 0;
      }, 1600);
    };

    const registerLastPanelExitIntent = (event: WheelEvent) => {
      window.clearTimeout(exitIntentResetTimerRef.current);

      const threshold = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 720 : 10;
      lastPanelExitDeltaRef.current += Math.abs(event.deltaY);

      exitIntentResetTimerRef.current = window.setTimeout(() => {
        lastPanelExitDeltaRef.current = 0;
      }, 560);

      return lastPanelExitDeltaRef.current >= threshold;
    };

    const armLastPanelUpAfterWheelPause = () => {
      window.clearTimeout(upEdgeReleaseTimerRef.current);
      upEdgeReleaseTimerRef.current = window.setTimeout(() => {
        canLeaveLastPanelUpRef.current = true;
        lastPanelUpDeltaRef.current = 0;
      }, 1600);
    };

    const registerLastPanelUpIntent = (event: WheelEvent) => {
      window.clearTimeout(upIntentResetTimerRef.current);

      const threshold = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 720 : 10;
      lastPanelUpDeltaRef.current += Math.abs(event.deltaY);

      upIntentResetTimerRef.current = window.setTimeout(() => {
        lastPanelUpDeltaRef.current = 0;
      }, 560);

      return lastPanelUpDeltaRef.current >= threshold;
    };

    const animateScrollTo = (targetTop: number) => {
      cancelAnimationFrame(snapFrameRef.current);

      const startTop = window.scrollY;
      const distance = targetTop - startTop;
      const startTime = performance.now();
      const duration = 820;

      isSnappingRef.current = true;

      const tick = (now: number) => {
        const elapsed = now - startTime;
        const progress = clamp(elapsed / duration, 0, 1);
        const eased = easeOutQuart(progress);

        window.scrollTo({ top: startTop + distance * eased, behavior: "instant" });

        if (progress < 1) {
          snapFrameRef.current = requestAnimationFrame(tick);
          return;
        }

        window.scrollTo({ top: targetTop, behavior: "instant" });
        window.setTimeout(() => {
          isSnappingRef.current = false;
          const section = sectionRef.current;
          if (!section) return;

          const lastPanelTop = section.offsetTop + (panels.length - 1) * window.innerHeight;
          if (Math.abs(targetTop - lastPanelTop) < 2) {
            canExitLastPanelRef.current = false;
            armLastPanelExitAfterWheelPause();
            return;
          }

          canExitLastPanelRef.current = true;
        }, 120);
      };

      snapFrameRef.current = requestAnimationFrame(tick);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!sectionRef.current || Math.abs(event.deltaY) < 2) return;

      const section = sectionRef.current;
      const sectionTop = section.offsetTop;
      const viewportHeight = window.innerHeight;
      const maxPanelIndex = panels.length - 1;
      const sectionEndTop = sectionTop + maxPanelIndex * viewportHeight;
      const currentTop = window.scrollY;
      const isInsideHorizontalRail =
        currentTop >= sectionTop - 2 && currentTop <= sectionEndTop + 2;

      if (!isInsideHorizontalRail) return;

      const rawIndex = (currentTop - sectionTop) / viewportHeight;
      const direction = Math.sign(event.deltaY);
      const targetIndex =
        direction > 0 ? Math.floor(rawIndex + 0.001) + 1 : Math.ceil(rawIndex - 0.001) - 1;

      event.preventDefault();

      if (isSnappingRef.current) return;

      const isLeavingLastPanelUp =
        direction < 0 && rawIndex > maxPanelIndex - 0.05 && targetIndex === maxPanelIndex - 1;

      if (isLeavingLastPanelUp) {
        if (!canLeaveLastPanelUpRef.current) {
          armLastPanelUpAfterWheelPause();
          return;
        }

        if (!registerLastPanelUpIntent(event)) return;

        lastPanelUpDeltaRef.current = 0;
        animateScrollTo(sectionTop + targetIndex * viewportHeight);
        return;
      }

      if (targetIndex < 0) {
        animateScrollTo(Math.max(0, sectionTop - viewportHeight));
        return;
      }

      if (targetIndex > maxPanelIndex) {
        if (!canExitLastPanelRef.current) {
          armLastPanelExitAfterWheelPause();
          return;
        }

        if (!registerLastPanelExitIntent(event)) return;

        lastPanelExitDeltaRef.current = 0;
        animateScrollTo(sectionTop + panels.length * viewportHeight);
        return;
      }

      animateScrollTo(sectionTop + targetIndex * viewportHeight);
    };

    const requestUpdate = () => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(updateProgress);
    };

    const handleLastPanelEntryLock = () => {
      canLeaveLastPanelUpRef.current = false;
      armLastPanelUpAfterWheelPause();
    };

    updateProgress();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("horizontal-last-panel-entry-lock", handleLastPanelEntryLock);

    return () => {
      cancelAnimationFrame(frameRef.current);
      cancelAnimationFrame(snapFrameRef.current);
      window.clearTimeout(edgeReleaseTimerRef.current);
      window.clearTimeout(upEdgeReleaseTimerRef.current);
      window.clearTimeout(exitIntentResetTimerRef.current);
      window.clearTimeout(upIntentResetTimerRef.current);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("horizontal-last-panel-entry-lock", handleLastPanelEntryLock);
    };
  }, [isHorizontalEnabled]);

  if (!isHorizontalEnabled) {
    return (
      <section ref={sectionRef} className="relative bg-background">
        {panels.map((panel) => (
          <div key={panel.id} id={panel.id} className="relative">
            {panel.component}
          </div>
        ))}
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      className="relative bg-background"
      style={{ height: `${panels.length * 100}vh` }}
      data-horizontal-scroll
    >
      {panels.map((panel, index) => (
        <div
          key={panel.id}
          id={panel.id}
          className="absolute"
          style={{ top: `${index * 100}vh` }}
          aria-hidden="true"
        />
      ))}
      <div className="sticky top-0 h-screen overflow-hidden">
        <div
          className="flex h-full will-change-transform"
          style={{
            width: `${panels.length * 100}vw`,
            transform: `translate3d(${-progress * (panels.length - 1) * 100}vw, 0, 0)`,
          }}
        >
          {panels.map((panel) => (
            <div key={panel.id} className="h-screen w-screen shrink-0 overflow-hidden">
              {panel.component}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
