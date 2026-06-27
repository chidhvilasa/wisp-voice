import * as React from "react";
import { cn } from "@/lib/utils";
import { useVoiceStore } from "@/store/voiceStore";

export function ConnectionStatus() {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  const connectionState = useVoiceStore((state) => state.connectionState);
  const peers = useVoiceStore((state) => state.peers);
  const roomCode = useVoiceStore((state) => state.roomCode);
  const lastError = useVoiceStore((state) => state.lastError);

  React.useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  let dotColor = "bg-text-tertiary";
  let label = "Not connected";
  let pulsing = false;

  if (connectionState === "idle" && roomCode) {
    label = "In room, waiting...";
  } else if (connectionState === "connecting") {
    dotColor = "bg-warning";
    label = "Connecting...";
    pulsing = true;
  } else if (connectionState === "reconnecting") {
    dotColor = "bg-warning";
    label = "Reconnecting...";
    pulsing = true;
  } else if (connectionState === "error") {
    dotColor = "bg-muted-red";
    label = lastError ?? "Connection error";
  } else if (connectionState === "connected") {
    dotColor = "bg-speaking";
    label =
      peers.size === 0
        ? "In room, waiting..."
        : `Connected · ${peers.size} peer${peers.size === 1 ? "" : "s"}`;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-surface2 hover:bg-surface3 px-3 py-1.5 text-xs font-medium transition-colors"
      >
        <span className="relative flex h-2 w-2 items-center justify-center">
          {pulsing && (
            <span className={cn("absolute h-2 w-2 rounded-full animate-connection-pulse", dotColor)} />
          )}
          <span className={cn("relative h-2 w-2 rounded-full", dotColor)} />
        </span>
        <span>{label}</span>
      </button>

      {open && (
        <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 w-64 rounded-xl bg-surface2 border border-border p-3 shadow-2xl animate-fade-scale-in z-50">
          <div className="text-[11px] uppercase tracking-wider text-text-tertiary mb-2">
            Peer latency
          </div>
          {peers.size === 0 ? (
            <div className="text-xs text-text-tertiary">No peers connected</div>
          ) : (
            <ul className="space-y-1.5">
              {Array.from(peers.values()).map((p) => {
                const ms = p.latencyMs ?? 0;
                const color =
                  ms < 80 ? "text-speaking" : ms <= 200 ? "text-warning" : "text-muted-red";
                return (
                  <li key={p.id} className="flex items-center justify-between text-xs">
                    <span className="truncate">{p.name}</span>
                    <span className={cn("font-mono", color)}>{ms} ms</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
