import { Ghost } from "lucide-react";

export function WispLogo({ withWordmark = true, size = 24 }: { withWordmark?: boolean; size?: number }) {
  return (
    <div className="inline-flex items-center gap-2">
      <div
        className="grid place-items-center rounded-md bg-accent/15 text-accent"
        style={{ width: size + 8, height: size + 8 }}
      >
        <Ghost size={size} strokeWidth={2.2} />
      </div>
      {withWordmark && (
        <span className="text-[17px] font-semibold tracking-tight">Wisp</span>
      )}
    </div>
  );
}
