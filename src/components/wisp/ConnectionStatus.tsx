import * as React from "react";
import { cn } from "@/lib/utils";
import type { Peer } from "./types";

interface Props {
  peers: Peer[];
  connected?: boolean;
}

export function ConnectionStatus({ peers, connected = true }: Props) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-surface2 hover:bg-surface3 px-3 py-1.5 text-xs font-medium transition-colors"
      >
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            connected ? "bg-speaking animate-dot-pulse" : "bg-muted-red",
          )}
        />
        <span>{connected ? "Connected" : "Disconnected"}</span>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 w-64 rounded-xl bg-surface2 border border-border p-3 shadow-2xl animate-fade-scale-in z-50">
          <div className="text-[11px] uppercase tracking-wider text-text-tertiary mb-2">
            Peer latency
          </div>
          <ul className="space-y-1.5">
            {peers.filter((p) => !p.isSelf).map((p) => {
              const ms = p.latencyMs ?? 50;
              const color =
                ms < 80 ? "text-speaking" : ms < 200 ? "text-warning" : "text-muted-red";
              return (
                <li key={p.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{p.name}</span>
                  <span className={cn("font-mono", color)}>{ms} ms</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
