import { cn } from "@/lib/utils";
import { avatarColor, initials } from "./utils";

interface AvatarProps {
  id: string;
  name: string;
  size?: 28 | 32 | 36 | 48 | 68 | 72 | 80 | 120;
  className?: string;
}

export function Avatar({ id, name, size = 36, className }: AvatarProps) {
  const fontSize = size >= 120 ? 40 : size >= 80 ? 30 : size >= 68 ? 26 : size >= 48 ? 18 : size >= 36 ? 14 : 12;
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold text-black/85 select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        background: avatarColor(id),
        fontSize,
      }}
    >
      {initials(name)}
    </div>
  );
}
