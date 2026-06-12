import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUARANTEE_SHORT } from "./copy";

/** Selo "Vaga garantida" (pill). Exibir onde a vaga é reservável. */
export function GuaranteeBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full bg-badge-confirmed-bg px-3 text-caption font-medium text-badge-confirmed-fg",
        className,
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      {GUARANTEE_SHORT}
    </span>
  );
}
