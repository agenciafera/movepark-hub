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
  const grouped = new Map<string, ListingDetail["amenities"]>();
  for (const a of amenities) {
    const arr = grouped.get(a.category) ?? [];
    arr.push(a);
    grouped.set(a.category, arr);
  }

  return (
    <div className="space-y-5">
      {Array.from(grouped.entries()).map(([cat, items]) => (
        <div key={cat}>
          <div className="mb-3 text-caption font-semibold uppercase tracking-wide text-muted-steel">
            {categoryLabel[cat] ?? cat}
          </div>
          <ul className="grid grid-cols-2 gap-2.5">
            {items.map((a) => {
              const Icon = getIcon(a.icon);
              return (
                <li
                  key={a.code}
                  className="flex items-center gap-2.5 rounded-lg border border-hairline bg-surface-soft px-3.5 py-3 text-body-sm text-ink transition-colors hover:border-mp-indigo/40 hover:bg-mp-pale/20"
                >
                  <Icon className="h-4 w-4 shrink-0 text-mp-indigo" />
                  <span>{a.name}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
