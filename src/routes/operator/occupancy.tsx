import * as React from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOperatorLocations } from "@/features/locations/api";
import { useLocationOccupancy } from "@/features/availability/api";
import { buildOccupancyMatrix, occupancyTone } from "@/features/availability/occupancy.logic";
import { useAuth } from "@/auth/context";
import { cn } from "@/lib/utils";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

const toneClass: Record<"low" | "mid" | "high" | "full", string> = {
  low: "bg-surface-soft text-muted",
  mid: "bg-mp-pale text-mp-indigo",
  high: "bg-badge-pending-bg text-badge-pending-fg",
  full: "bg-badge-cancelled-bg text-badge-cancelled-fg font-bold",
};

export default function OperatorOccupancy() {
  const { impersonatedCompanyId } = useAuth();
  const { data: locations, isLoading: loadingLocs } = useOperatorLocations(impersonatedCompanyId);

  const [locationId, setLocationId] = React.useState<string>("");
  const today = React.useMemo(() => new Date(), []);
  const [from, setFrom] = React.useState<string>(() => isoDate(today));
  const [to, setTo] = React.useState<string>(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 13);
    return isoDate(d);
  });

  // seleciona a primeira unidade automaticamente
  React.useEffect(() => {
    if (!locationId && locations && locations.length > 0) {
      setLocationId(locations[0].id);
    }
  }, [locations, locationId]);

  const { data: rows, isLoading, error } = useLocationOccupancy(
    locationId || undefined,
    from,
    to <= from ? undefined : to,
  );
  const matrix = React.useMemo(() => buildOccupancyMatrix(rows ?? []), [rows]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ocupação"
        description="Vagas reservadas por data em cada tipo de vaga. Reservas pendentes seguram a vaga até pagar ou expirar."
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loc">Unidade</Label>
            <select
              id="loc"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={loadingLocs || (locations ?? []).length === 0}
              className="h-10 min-w-56 rounded-sm border border-hairline bg-canvas px-3 text-body-sm"
            >
              {(locations ?? []).map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">De</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-10 w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">Até</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="h-10 w-40"
            />
          </div>
        </CardContent>
      </Card>

      {loadingLocs || isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          Erro ao carregar ocupação:{" "}
          {error instanceof Error ? error.message : "desconhecido"}
        </div>
      ) : matrix.rows.length === 0 ? (
        <EmptyState
          title="Sem dados de ocupação"
          description="Escolha uma unidade e um período com vagas ativas."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full border-collapse text-caption">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-canvas px-3 py-2 text-left text-body-sm text-muted">
                    Tipo de vaga
                  </th>
                  {matrix.dates.map((d) => (
                    <th key={d} className="px-2 py-2 text-center font-medium text-muted tabular-nums">
                      {shortDate(d)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.lptId} className="border-t border-hairline">
                    <td className="sticky left-0 z-10 bg-canvas px-3 py-2 text-body-sm text-ink">
                      {row.name}
                    </td>
                    {matrix.dates.map((d) => {
                      const cell = row.cells[d];
                      if (!cell) {
                        return <td key={d} className="px-2 py-2" />;
                      }
                      return (
                        <td key={d} className="px-1.5 py-1.5">
                          <div
                            className={cn(
                              "rounded-sm px-1 py-1 text-center tabular-nums",
                              toneClass[occupancyTone(cell.pct)],
                            )}
                            title={`${cell.booked}/${cell.capacity} (${Math.round(cell.pct * 100)}%)`}
                          >
                            {cell.booked}/{cell.capacity}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
