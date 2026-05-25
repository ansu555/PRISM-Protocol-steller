"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

type FilterSectionProps = {
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  children?: ReactNode;
};

export function FilterSection({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
}: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-white/10 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between py-3 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-white/60 transition-colors group-hover:text-white">
          <Icon className="h-3.5 w-3.5" />
          {title}
        </span>
        <ChevronDown
          className={[
            "h-3.5 w-3.5 text-white/35 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>
      {open ? <div className="pb-4">{children}</div> : null}
    </div>
  );
}
