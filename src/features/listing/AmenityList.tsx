import * as Icons from "lucide-react";
import type { ListingDetail } from "./api";

function getIcon(name: string | null): React.ComponentType<{ className?: string }> {
  if (!name) return Icons.Sparkles;
  // deno-lint-ignore no-explicit-any
  const Component = (Icons as any)[name];
  return Component ?? Icons.Sparkles;
}

export function AmenityList({ amenities }: { amenities: ListingDetail["amenities"] }) {
  if (!amenities.length) {
    return (
      <p className="text-body-sm text-muted">
        Comodidades ainda não cadastradas pelo estacionamento.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-4">
      {amenities.map((a) => {
        const Icon = getIcon(a.icon);
        return (
          <li key={a.code} className="flex items-center gap-3">
            <Icon className="h-5 w-5 shrink-0 text-ink" />
            <span className="text-body-md text-ink">{a.name}</span>
          </li>
        );
      })}
    </ul>
  );
}
