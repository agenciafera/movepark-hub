import * as Icons from "lucide-react";
import type { ListingDetail } from "./api";

const categoryLabel: Record<string, string> = {
  security: "Segurança",
  service: "Serviço",
  access: "Acesso",
  extras: "Extras",
};

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
  // Mantém ordem do servidor (já sort_order), agrupa preservando categorias na ordem em que aparecem
  const grouped = new Map<string, ListingDetail["amenities"]>();
  for (const a of amenities) {
    const arr = grouped.get(a.category) ?? [];
    arr.push(a);
    grouped.set(a.category, arr);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([cat, items]) => (
        <div key={cat}>
          <div className="mb-3 text-caption text-muted">
            {categoryLabel[cat] ?? cat}
          </div>
          <ul className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
            {items.map((a) => {
              const Icon = getIcon(a.icon);
              return (
                <li key={a.code} className="flex items-center gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-mp-indigo" />
                  <span className="text-body-md text-ink">{a.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
