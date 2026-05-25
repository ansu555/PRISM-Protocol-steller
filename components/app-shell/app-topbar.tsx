"use client";

import { useState } from "react";
import {
  ChevronDown,
  Cpu,
  Grid3x3,
  Image as ImageIcon,
  List,
  MessageSquare,
  Music,
  Search,
  Sliders,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";

const TABS: Array<{ label: string; icon: LucideIcon; count: number }> = [
  { label: "All", icon: Sparkles, count: 0 },
  { label: "Prime", icon: MessageSquare, count: 0 },
  { label: "Core", icon: ImageIcon, count: 0 },
  { label: "Alpha", icon: Music, count: 0 },
  { label: "Pools", icon: Video, count: 0 },
  { label: "Events", icon: Cpu, count: 0 },
];

const SORT_OPTIONS = ["Newest", "NAV ↑", "NAV ↓", "APY ↑", "TVL"] as const;

export function AppTopbar() {
  const [activeTab, setActiveTab] = useState("All");
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]>("Newest");
  const [sortOpen, setSortOpen] = useState(false);
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div className="relative flex-shrink-0 border-b border-white/10 px-4 py-3 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Open filters"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-sm text-white/85 transition-colors hover:bg-white/10 sm:w-auto sm:px-3 sm:py-2 lg:hidden"
        >
          <Sliders className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
        </button>



        <div className="relative">
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-transparent px-3 text-sm text-white/60 transition-colors hover:bg-white/10"
          >
            <span className="hidden sm:inline">{sort}</span>
            <ChevronDown
              className={[
                "h-3.5 w-3.5 text-white/50 transition-transform",
                sortOpen ? "rotate-180" : "",
              ].join(" ")}
            />
          </button>
          {sortOpen ? (
            <div className="absolute right-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-md border border-white/10 bg-black/95 shadow-2xl backdrop-blur">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setSort(option);
                    setSortOpen(false);
                  }}
                  className={[
                    "block w-full px-3.5 py-2.5 text-left text-sm transition-colors hover:bg-white/10 hover:text-white",
                    option === sort ? "bg-white/10 text-white" : "text-white/60",
                  ].join(" ")}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="hidden items-center overflow-hidden rounded-md border border-white/10 sm:flex">
          <button
            type="button"
            aria-label="Grid view"
            onClick={() => setView("grid")}
            className={[
              "p-2 transition-colors",
              view === "grid"
                ? "bg-white text-black"
                : "text-white/60 hover:text-white",
            ].join(" ")}
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="List view"
            onClick={() => setView("list")}
            className={[
              "p-2 transition-colors",
              view === "list"
                ? "bg-white text-black"
                : "text-white/60 hover:text-white",
            ].join(" ")}
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => {
          const active = tab.label === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => setActiveTab(tab.label)}
              className={[
                "inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-white text-black"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
              ].join(" ")}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
              <span
                className={[
                  "rounded-full px-1 py-0.5 text-[10px] leading-none",
                  active ? "bg-black/20 text-white" : "bg-white/10 text-white/70",
                ].join(" ")}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
        <div className="ml-auto hidden flex-shrink-0 whitespace-nowrap pl-4 text-xs text-white/50 sm:block">
          0 vaults
        </div>
      </div>
    </div>
  );
}
