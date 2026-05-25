'use client';

import { ChevronDown, ScrollText, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useSimulationLog } from '@/hooks/useSimulationLog';

export function SimulationConsole() {
  const { entries, clear } = useSimulationLog();
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-lg border border-white/10 bg-black/55" aria-label="Simulation console">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-2 text-sm font-semibold text-white"
        >
          <ScrollText className="h-4 w-4 text-white/55" />
          Simulation Console
          <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] text-white/55">
            {entries.length}
          </span>
          <ChevronDown className={['h-4 w-4 transition-transform', open ? 'rotate-180' : ''].join(' ')} />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          className="h-8 gap-2 text-white/55 hover:bg-white/10 hover:text-white"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear
        </Button>
      </div>

      {open ? (
        <div className="max-h-80 overflow-y-auto p-4 [scrollbar-width:thin]">
          {entries.length === 0 ? (
            <div className="py-10 text-center text-sm text-white/40">No transactions logged yet.</div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <article key={entry.id} className="rounded-md border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-xs text-white/45">
                      [{new Date(entry.timestamp).toLocaleTimeString()}] {entry.role}
                    </div>
                    <div
                      className={[
                        'rounded-md px-2 py-0.5 font-mono text-[10px] uppercase',
                        entry.status === 'success'
                          ? 'bg-emerald-400/10 text-emerald-200'
                          : entry.status === 'error'
                            ? 'bg-red-400/10 text-red-200'
                            : 'bg-white/10 text-white/60',
                      ].join(' ')}
                    >
                      {entry.status}
                    </div>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">{entry.action}</div>
                  {entry.signature ? (
                    <div className="mt-1 break-all font-mono text-[11px] text-white/35">
                      tx {entry.signature}
                    </div>
                  ) : null}
                  {entry.message ? <p className="mt-2 text-xs text-white/55">{entry.message}</p> : null}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-left font-mono text-[11px]">
                      <thead className="text-white/35">
                        <tr>
                          <th className="py-1 pr-3">Account</th>
                          <th className="py-1 pr-3">Before</th>
                          <th className="py-1 pr-3">After</th>
                          <th className="py-1">Delta</th>
                        </tr>
                      </thead>
                      <tbody className="text-white/70">
                        {Object.entries(entry.deltas).map(([label, row]) => (
                          <tr key={label} className="border-t border-white/5">
                            <td className="py-1.5 pr-3 text-white/85">{label}</td>
                            <td className="py-1.5 pr-3">{row.before}</td>
                            <td className="py-1.5 pr-3">{row.after}</td>
                            <td className="py-1.5">{row.delta}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 font-mono text-[11px] text-white/40">{entry.navSnapshot}</div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
