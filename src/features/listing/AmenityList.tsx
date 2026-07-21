import * as Icons from "lucide-react";
import { AccessibilityIcon } from "@/components/shared/AccessibilityIcon";
import type { ListingDetail } from "./api";

/**
 * Ícones que o projeto desenha por conta própria, sobrepondo o lucide. A chave é o
 * mesmo nome que o banco guarda em `amenity.icon`, então o override vive aqui e a
 * linha do banco continua valendo (o `pcd` segue com "Accessibility").
 */
const OVERRIDES: Record<string, React.ComponentType<{ className?: string }>> = {
  Accessibility: AccessibilityIcon,
};

function getIcon(name: string | null): React.ComponentType<{ className?: string }> {
  if (!name) return Icons.Sparkles;
  if (OVERRIDES[name]) return OVERRIDES[name];
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
    <ul data-testid="listing-amenities" className="grid grid-cols-2 gap-x-6 gap-y-4">
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
