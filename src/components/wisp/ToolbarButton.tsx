import * as React from "react";
import { cn } from "@/lib/utils";

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tooltip?: string;
  active?: boolean;
  danger?: boolean;
}

export const ToolbarButton = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  ({ className, tooltip, active, danger, children, ...rest }, ref) => {
    return (
      <div className="relative group">
        <button
          ref={ref}
          {...rest}
          className={cn(
            "grid place-items-center h-11 w-11 rounded-full transition-all duration-150 active:scale-95",
            danger
              ? "bg-muted-red/15 text-muted-red hover:bg-muted-red hover:text-white"
              : active
                ? "bg-accent text-primary-foreground"
                : "bg-surface2 text-text-secondary hover:bg-surface3 hover:text-text-primary",
            className,
          )}
        >
          {children}
        </button>
        {tooltip && (
          <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-surface3 px-2 py-1 text-[11px] text-text-primary opacity-0 transition-opacity group-hover:opacity-100">
            {tooltip}
          </span>
        )}
      </div>
    );
  },
);
ToolbarButton.displayName = "ToolbarButton";
