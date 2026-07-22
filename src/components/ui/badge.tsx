import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

// Altura e tipografia vêm do DESIGN.md §5 (pill 22px, texto `badge` 11px/700).
// O `font-medium` que morava aqui saiu: o token `badge` já traz peso 700, e a
// classe extra só mascarava o fato de que o tamanho nunca chegava ao DOM.
const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 h-[22px] text-badge", {
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
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
