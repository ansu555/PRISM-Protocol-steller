"use client";

import { useEffect, useRef } from "react";

const SNAP_SELECTORS = [
  "#top",
  "[data-horizontal-scroll]",
  "#integrations",
  "#security",
  "#developers",
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function easeOutQuart(value: number) {
  return 1 - Math.pow(1 - value, 4);
}

export function PageSnapScroll() {
  const frameRef = useRef(0);
  const isSnappingRef = useRef(false);
  const boundaryExitDeltaRef = useRef(0);
  const boundaryExitResetTimerRef = useRef(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    if (!mediaQuery.matches) return;

    const getStops = () => {
      const stops = SNAP_SELECTORS.map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        return element?.offsetTop ?? null;
      })
        .filter((top): top is number => top !== null);

      const horizontalRail = document.querySelector<HTMLElement>("[data-horizontal-scroll]");
      if (horizontalRail) {
        stops.push(horizontalRail.offsetTop + horizontalRail.offsetHeight - window.innerHeight);
      }

      return stops
        .sort((a, b) => a - b)
        .filter((stop, index, sortedStops) => index === 0 || Math.abs(stop - sortedStops[index - 1]) > 2);
    };

    const registerBoundaryExitIntent = (event: WheelEvent) => {
      window.clearTimeout(boundaryExitResetTimerRef.current);

      const threshold = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 720 : 10;
      boundaryExitDeltaRef.current += Math.abs(event.deltaY);

      boundaryExitResetTimerRef.current = window.setTimeout(() => {
        boundaryExitDeltaRef.current = 0;
      }, 560);

      return boundaryExitDeltaRef.current >= threshold;
    };

    const animateScrollTo = (targetTop: number, onComplete?: () => void) => {
      cancelAnimationFrame(frameRef.current);

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
          frameRef.current = requestAnimationFrame(tick);
          return;
        }

        window.scrollTo({ top: targetTop, behavior: "instant" });
        window.setTimeout(() => {
          isSnappingRef.current = false;
          onComplete?.();
        }, 120);
      };

      frameRef.current = requestAnimationFrame(tick);
    };

    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 2) return;

      const horizontalRail = document.querySelector<HTMLElement>("[data-horizontal-scroll]");
      let railEnd: number | null = null;
      if (horizontalRail) {
        const railTop = horizontalRail.offsetTop;
        railEnd = railTop + horizontalRail.offsetHeight - window.innerHeight;
        const isInsideRail = window.scrollY >= railTop - 2 && window.scrollY <= railEnd + 2;
        if (isInsideRail) return;
      }

      const stops = getStops();
      if (stops.length < 2) return;

      const currentTop = window.scrollY;
      const direction = Math.sign(event.deltaY);
      const targetIndex =
        direction > 0
          ? stops.findIndex((stop) => stop > currentTop + 8)
          : (() => {
              for (let index = stops.length - 1; index >= 0; index -= 1) {
                if (stops[index] < currentTop - 8) return index;
              }
              return -1;
            })();

      if (targetIndex === -1) return;

      const targetTop = stops[targetIndex];

      if (targetTop === undefined || Math.abs(targetTop - currentTop) < 2) return;

      const isEnteringHorizontalFromBelow =
        direction < 0 && railEnd !== null && Math.abs(targetTop - railEnd) < 2 && currentTop > railEnd + 8;

      if (isEnteringHorizontalFromBelow && !registerBoundaryExitIntent(event)) {
        event.preventDefault();
        return;
      }

      boundaryExitDeltaRef.current = 0;

      event.preventDefault();

      if (isSnappingRef.current) return;

      animateScrollTo(
        targetTop,
        isEnteringHorizontalFromBelow
          ? () => window.dispatchEvent(new CustomEvent("horizontal-last-panel-entry-lock"))
          : undefined
      );
    };

    window.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.clearTimeout(boundaryExitResetTimerRef.current);
      window.removeEventListener("wheel", handleWheel);
    };
  }, []);

  return null;
}
