import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { Mic, MicOff } from "lucide-react";
import type { Peer } from "./types";

interface CompactProps {
  peers: Peer[];
  className?: string;
}

export function OverlayCompact({ peers, className }: CompactProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full bg-black/55 backdrop-blur-xl border border-white/10 px-3 py-2",
        className,
      )}
    >
      {peers.map((p) => (
        <div key={p.id} className="relative">
          <div
            className={cn(
              "rounded-full",
              p.speaking && "ring-2 ring-speaking animate-speaking-pulse",
            )}
          >
            <Avatar id={p.id} name={p.name} size={28} />
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full text-white",
              p.muted ? "bg-muted-red" : "bg-speaking",
            )}
          >
            {p.muted && <MicOff size={8} />}
          </span>
        </div>
      ))}
    </div>
  );
}

export function OverlayFull({ peers, className }: CompactProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-black/55 backdrop-blur-xl border border-white/10 p-3 min-w-[220px] space-y-2",
        className,
      )}
    >
      {peers.map((p) => (
        <div key={p.id} className="flex items-center gap-2">
          <div
            className={cn(
              "rounded-full",
              p.speaking && "ring-2 ring-speaking animate-speaking-pulse",
            )}
          >
            <Avatar id={p.id} name={p.name} size={28} />
          </div>
          <span className="flex-1 text-xs text-white font-medium truncate">{p.name}</span>
          {p.muted ? (
            <MicOff size={12} className="text-muted-red" />
          ) : (
            <Mic size={12} className={p.speaking ? "text-speaking" : "text-white/60"} />
          )}
        </div>
      ))}
    </div>
  );
}
