import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistance } from "@/lib/format";
import { useLocationTerminals, type TerminalDistance } from "./api";

/** Apresentação pura — facilita o teste. Renderiza nada quando não há terminais. */
export function TerminalDistancesView({ terminals }: { terminals: TerminalDistance[] }) {
  if (terminals.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-title-sm text-ink">Distância aos terminais</h3>
      <ul className="flex flex-wrap gap-2">
        {terminals.map((t) => (
          <li
            key={t.point_name}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-body-sm",
              t.is_nearest ? "border-mp-primary/40 bg-mp-pale text-ink" : "border-hairline text-muted",
            )}
          >
            <MapPin className={cn("h-3.5 w-3.5", t.is_nearest ? "text-mp-primary" : "text-muted-soft")} />
            <span className="font-medium text-ink">{t.point_name}</span>
            <span>· {formatDistance(t.distance_km)}</span>
            {t.is_nearest && (
              <span className="ml-0.5 rounded-sm bg-mp-primary/10 px-1.5 text-caption font-bold text-mp-primary">
                mais perto
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-caption text-muted">
        Distância em linha reta. Não representa o tempo de traslado, que pode variar.
      </p>
    </div>
  );
}

/** Container: lê a proximidade por terminal da unidade (PRD-09 · DAT-05). */
export function TerminalDistances({ locationId }: { locationId: string }) {
  const { data } = useLocationTerminals(locationId);
  return <TerminalDistancesView terminals={data ?? []} />;
}
