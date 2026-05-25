import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  body: string;
};

export function EmptyState({ icon, title, body }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
        {icon}
      </div>
      <h3 className="mb-2 text-lg font-semibold leading-7 tracking-tight">{title}</h3>
      <p className="max-w-sm text-sm leading-5 text-white/50">{body}</p>
    </div>
  );
}
