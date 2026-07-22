import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-14 w-full rounded-sm border border-hairline bg-canvas px-4 text-body-md text-ink placeholder:text-muted focus:border-2 focus:border-ink focus:outline-none disabled:cursor-not-allowed disabled:bg-surface-soft disabled:opacity-60",
        // Estado de erro: ativa só com aria-invalid, então é aditivo e não muda
        // nenhum input que não marque o atributo.
        "aria-[invalid=true]:border-2 aria-[invalid=true]:border-error aria-[invalid=true]:focus:border-error",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
