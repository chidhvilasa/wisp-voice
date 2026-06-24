import { cn } from "@/lib/utils";

interface SignalBarsProps {
  level?: 1 | 2 | 3;
  className?: string;
}

export function SignalBars({ level = 3, className }: SignalBarsProps) {
  const color =
    level === 3 ? "bg-speaking" : level === 2 ? "bg-warning" : "bg-muted-red";
  return (
    <div className={cn("inline-flex items-end gap-[2px]", className)}>
      {[6, 9, 12].map((h, i) => (
        <span
          key={h}
          className={cn(
            "w-[3px] rounded-[1px]",
            i < level ? color : "bg-text-tertiary/30",
          )}
          style={{ height: h }}
        />
      ))}
    </div>
  );
}
