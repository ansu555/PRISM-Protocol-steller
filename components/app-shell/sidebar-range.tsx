"use client";

import { useState } from "react";

type SidebarRangeProps = {
  min: number;
  max: number;
  defaultValue: number;
  leftLabel: string;
  rightLabel: string;
  ariaLabel: string;
  format?: (value: number) => string;
};

export function SidebarRange({
  min,
  max,
  defaultValue,
  leftLabel,
  rightLabel,
  ariaLabel,
  format,
}: SidebarRangeProps) {
  const [value, setValue] = useState(defaultValue);
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex h-5 items-center">
        <div className="relative h-px w-full bg-white/15">
          <div
            className="absolute left-0 top-0 h-px bg-white"
            style={{ width: `${pct}%` }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label={ariaLabel}
          className="absolute inset-0 m-0 h-5 w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-black bg-white shadow"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[10px] leading-[14px] text-white/45">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      {format ? (
        <div className="mt-1 font-mono text-xs leading-4 text-white/45">
          Max: <span>{format(value)}</span>
        </div>
      ) : null}
    </div>
  );
}
