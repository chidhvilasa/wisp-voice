import * as React from "react";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";
import { SignalBars } from "./SignalBars";
import { Mic, MicOff, HeadphoneOff } from "lucide-react";
import type { Peer } from "./types";

interface PeerCardProps {
  peer: Peer;
  volume?: number;
  onVolumeChange?: (v: number) => void;
  avatarSize?: 28 | 32 | 36 | 48 | 68 | 72 | 80 | 120;
  className?: string;
}

export function PeerCard({ peer, volume = 100, onVolumeChange, avatarSize = 68, className }: PeerCardProps) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "relative rounded-xl bg-surface border p-4 flex flex-col items-center gap-3 transition-colors",
        peer.isSelf ? "border-accent/60" : "border-border hover:border-border-hover",
        className,
      )}
    >
      <div className="relative">
        <div
          className={cn(
            "absolute inset-0 rounded-full transition-all",
            peer.speaking && "ring-2 ring-speaking shadow-[0_0_20px_-2px_var(--speaking)] animate-speaking-pulse",
          )}
        />
        <Avatar id={peer.id} name={peer.name} size={avatarSize} />
        {peer.muted && (
          <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-muted-red text-white border-2 border-surface">
            <MicOff size={12} />
          </span>
        )}
        {peer.deafened && (
          <span className="absolute -top-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-muted-red text-white border-2 border-surface">
            <HeadphoneOff size={12} />
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium truncate max-w-[140px]">{peer.name}</span>
        {peer.isSelf && (
          <span className="text-[10px] uppercase tracking-wider text-accent font-semibold">(You)</span>
        )}
      </div>

      <div className="flex items-center gap-2 text-text-tertiary">
        <SignalBars level={peer.signal ?? 3} />
        {!peer.muted && <Mic size={12} className="text-text-secondary" />}
      </div>

      {!peer.isSelf && (
        <div
          className={cn(
            "absolute left-3 right-3 bottom-3 transition-opacity",
            hovered ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <input
            type="range"
            min={0}
            max={150}
            value={volume}
            onChange={(e) => onVolumeChange?.(Number(e.target.value))}
            className="w-full h-1 accent-[var(--accent)] cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}
