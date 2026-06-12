import { Tag, MapPin, BusFront, Umbrella, ConciergeBell, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SearchBadge, SearchBadgeKind } from "./searchBadges";

const ICON: Record<SearchBadgeKind, LucideIcon> = {
  cheapest: Tag,
  closest: MapPin,
  shuttle: BusFront,
  covered: Umbrella,
  valet: ConciergeBell,
};

/** Comparativos ganham destaque sólido; atributos ficam em pill clara. */
const ACCENT: Record<SearchBadgeKind, boolean> = {
  cheapest: true,
  closest: true,
  shuttle: false,
  covered: false,
  valet: false,
};

/**
 * Badges comparativos sobrepostos ao card (PRD-13). Overlay no canto inferior
 * esquerdo da foto — não colide com o pill de esgotado (topo) nem com o heart.
 */
export function ResultBadges({
  badges,
  className,
}: {
  badges: SearchBadge[];
  className?: string;
}) {
  if (badges.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {badges.map((badge) => {
        const Icon = ICON[badge.kind];
        return (
          <span
            key={badge.kind}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold shadow-tier",
              ACCENT[badge.kind]
                ? "bg-mp-red text-white"
                : "bg-canvas/95 text-ink backdrop-blur",
            )}
          >
            <Icon className="h-3 w-3 shrink-0" aria-hidden />
            {badge.label}
          </span>
        );
      })}
    </div>
  );
}
