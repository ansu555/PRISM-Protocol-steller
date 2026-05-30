import type { ReactNode } from "react";
import { AppNavbar } from "@/components/app-shell/app-navbar";
import { AppProviders } from "@/components/providers/app-providers";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <div className="relative flex h-screen w-full bg-black text-white overflow-hidden p-3 sm:p-4 md:p-6 lg:p-8">
        {/* Subtle grid lines background overlay */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-[0.06]">
          {[...Array(8)].map((_, i) => (
            <div
              key={`h-${i}`}
              className="absolute h-px bg-white/10"
              style={{
                top: `${12.5 * (i + 1)}%`,
                left: 0,
                right: 0,
              }}
            />
          ))}
          {[...Array(12)].map((_, i) => (
            <div
              key={`v-${i}`}
              className="absolute w-px bg-white/10"
              style={{
                left: `${8.33 * (i + 1)}%`,
                top: 0,
                bottom: 0,
              }}
            />
          ))}
        </div>

        {/* Main Full-Screen Layout Canvas */}
        <div className="relative flex flex-1 flex-col min-w-0 h-full z-10">
          {/* Top Navbar */}
          <AppNavbar />

          {/* Main Page Area */}
          <main className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
