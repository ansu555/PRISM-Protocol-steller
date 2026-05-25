import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { AppProviders } from "@/components/providers/app-providers";

export default function AppShellLayout({ children }: { children: ReactNode }) {
  return (
    <AppProviders>
      <div className="relative flex h-screen w-full bg-black text-white overflow-hidden">
        {/* Full-viewport background decorators — behind everything */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            background:
              "radial-gradient(circle at 12% 10%, rgba(236,72,153,0.15) 0%, transparent 35%), radial-gradient(circle at 88% 12%, rgba(168,85,247,0.15) 0%, transparent 35%), radial-gradient(circle at 50% 90%, rgba(139,92,246,0.08) 0%, transparent 40%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Left Sidebar */}
        <AppSidebar />

        {/* Main Content Area */}
        <div className="relative flex flex-1 flex-col pl-[72px] min-w-0 h-screen">
          {/* Page Content Scroller */}
          <main className="relative z-10 flex-1 min-h-0 flex flex-col overflow-hidden">
            {children}
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
