import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-14 w-full rounded-sm border border-hairline bg-canvas px-3 text-body-md text-ink placeholder:text-muted focus:border-2 focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-soft disabled:opacity-60",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
