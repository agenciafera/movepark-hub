import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3 h-6 text-caption font-medium",
  {
    variants: {
      tone: {
        confirmed: "bg-badge-confirmed-bg text-badge-confirmed-fg",
        active: "bg-badge-active-bg text-badge-active-fg",
        pending: "bg-badge-pending-bg text-badge-pending-fg",
        completed: "bg-badge-completed-bg text-badge-completed-fg",
        cancelled: "bg-badge-cancelled-bg text-badge-cancelled-fg",
        neutral: "bg-surface-soft text-muted",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
