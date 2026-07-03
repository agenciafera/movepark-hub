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

export function ResultBadges({
  badges,
  className,
}: {
  badges: SearchBadge[];
  className?: string;
}) {
  if (badges.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {badges.map((badge) => {
        const Icon = ICON[badge.kind];
        return (
          <span
            key={badge.kind}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold",
              ACCENT[badge.kind]
                ? "bg-mp-primary text-white"
                : "bg-ink text-canvas",
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
