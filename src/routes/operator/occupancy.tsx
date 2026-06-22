import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { useOperatorLocations } from "@/features/locations/api";
import {
  useLocationOccupancy,
  useSetDateBlocked,
  useWlExternalOccupancy,
} from "@/features/availability/api";
import { buildOccupancyMatrix, withExternal } from "@/features/availability/occupancy.logic";
import {
  OccupancyCalendar,
  OccupancyLegend,
  type CalendarDay,
} from "@/features/availability/OccupancyCalendar";
import { useAuth } from "@/auth/context";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function OperatorOccupancy() {
  const { impersonatedCompanyId, effectiveCompanyIds } = useAuth();
  const companyId = effectiveCompanyIds[0];
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

  // Pull ao vivo do WL (vagas vendidas por fora) — best-effort.
  const { data: wl } = useWlExternalOccupancy(
    companyId,
    locationId || undefined,
    from,
    to <= from ? undefined : to,
  );
  const wlByLpt = wl?.byLpt ?? {};

  const setBlocked = useSetDateBlocked();
  async function toggleBlock(lptId: string, date: string, blocked: boolean) {
    try {
      await setBlocked.mutateAsync({ locationParkingTypeId: lptId, date, blocked: !blocked });
      toast.success(blocked ? "Data liberada" : "Data bloqueada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar a data");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ocupação"
        description="Vagas reservadas por data em cada tipo de vaga. Clique numa data para bloquear/liberar reservas (reforma, evento, lotação por fora)."
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

      {wl?.ready && (
        <p className="-mt-2 text-caption text-muted">
          Os números somam as reservas do hub + as vagas vendidas no white-label (ao vivo). Passe o
          mouse para ver mais detalhes.
        </p>
      )}

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
        <div className="flex flex-col gap-6">
          {matrix.rows.map((row) => {
            const data: Record<string, CalendarDay> = {};
            for (const d of matrix.dates) {
              const cell = row.cells[d];
              if (!cell) continue;
              const ext = wlByLpt[row.lptId]?.[d] ?? 0;
              const eff = withExternal(cell.booked, ext, cell.capacity);
              data[d] = {
                count: eff.count,
                capacity: cell.capacity,
                pct: eff.pct,
                booked: cell.booked,
                external: ext,
                blocked: cell.blocked,
              };
            }
            return (
              <Card key={row.lptId}>
                <CardContent className="flex flex-col gap-4 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-body font-medium text-ink">{row.name}</h3>
                    <OccupancyLegend />
                  </div>
                  <OccupancyCalendar
                    from={from}
                    to={to <= from ? from : to}
                    data={data}
                    onToggle={(date, blocked) => toggleBlock(row.lptId, date, blocked)}
                    disabled={setBlocked.isPending}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
