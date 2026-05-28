import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-mp-primary !text-white hover:bg-mp-primary-active disabled:bg-mp-primary-disabled",
        secondary:
          "bg-canvas text-ink border border-ink hover:bg-surface-soft",
        ghost: "bg-transparent text-ink hover:underline underline-offset-4",
        danger: "bg-error !text-white hover:opacity-90",
        pill: "bg-mp-primary !text-white rounded-full px-4 h-9 text-button-sm hover:bg-mp-primary-active",
        outline:
          "border border-hairline bg-canvas text-ink hover:bg-surface-soft",
      },
      size: {
        default: "h-12 px-6 text-button-md",
        sm: "h-9 px-4 text-button-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
