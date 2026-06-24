import * as React from "react";
import { Radio } from "lucide-react";
import { cn } from "@/lib/utils";

interface PTTButtonProps {
  onChange?: (active: boolean) => void;
}

export function PTTButton({ onChange }: PTTButtonProps) {
  const [held, setHeld] = React.useState(false);
  const set = React.useCallback(
    (v: boolean) => {
      setHeld(v);
      onChange?.(v);
    },
    [onChange],
  );

  React.useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.getModifierState("CapsLock")) set(true);
      else set(false);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", down);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", down);
    };
  }, [set]);

  return (
    <div className="relative group">
      <button
        onPointerDown={() => set(true)}
        onPointerUp={() => set(false)}
        onPointerLeave={() => set(false)}
        className={cn(
          "relative grid place-items-center h-11 w-11 rounded-full transition-all duration-150",
          held
            ? "bg-accent text-primary-foreground animate-ptt-ripple"
            : "bg-surface2 text-text-secondary hover:bg-surface3 hover:text-text-primary",
        )}
      >
        <Radio size={18} />
      </button>
      <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface3 px-2 py-1 text-[11px] opacity-0 transition-opacity group-hover:opacity-100">
        Push to talk
      </span>
    </div>
  );
}
