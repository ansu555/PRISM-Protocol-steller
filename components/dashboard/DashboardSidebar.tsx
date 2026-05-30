'use client';

interface DashboardSidebarProps {
  exposure: Array<{ label: string; value: number; color: string }>;
  insights: Array<{ text: string; type: 'info' | 'warning' | 'alert' }>;
}

export function DashboardSidebar({}: DashboardSidebarProps) {
  return (
    <aside className="space-y-6">
      {/* Version details footer */}
      <div className="px-4 py-1 text-center">
        <p className="font-mono text-[8px] uppercase tracking-widest text-white/10 leading-relaxed font-semibold">
          PRISM INTEL SYSTEM V4.1.2<br />
          ENCRYPTED SESSION ACTIVE<br />
          LAST ENGINE SYNC: {new Date().toLocaleTimeString()}
        </p>
      </div>
    </aside>
  );
}
