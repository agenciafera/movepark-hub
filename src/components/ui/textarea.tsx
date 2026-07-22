import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[96px] w-full rounded-sm border border-hairline bg-canvas px-3 py-2 text-body-md text-ink placeholder:text-muted focus:border-2 focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-soft disabled:opacity-60",
        // Estado de erro: ativa só com aria-invalid (aditivo, ver input.tsx).
        "aria-[invalid=true]:border-2 aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
