import * as React from "react";
import { cn } from "@/lib/utils";

interface RebindPillProps {
  value: string;
  onChange: (combo: string) => void;
}

export function RebindPill({ value, onChange }: RebindPillProps) {
  const [capturing, setCapturing] = React.useState(false);

  React.useEffect(() => {
    if (!capturing) return;
    function down(e: KeyboardEvent) {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");
      if (e.metaKey) parts.push("Cmd");
      const k = e.key;
      if (!["Control", "Alt", "Shift", "Meta"].includes(k)) {
        parts.push(k.length === 1 ? k.toUpperCase() : k);
        onChange(parts.join(" + "));
        setCapturing(false);
      }
    }
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [capturing, onChange]);

  return (
    <button
      onClick={() => setCapturing(true)}
      className={cn(
        "min-w-[120px] px-3 py-1.5 rounded-md text-xs font-mono bg-surface2 border border-border hover:border-border-hover transition-colors",
        capturing && "border-accent text-accent animate-dot-pulse",
      )}
    >
      {capturing ? "Press any key..." : value}
    </button>
  );
}
