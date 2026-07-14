import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Calculator } from "lucide-react";
import { format, differenceInMinutes, addDays } from "date-fns";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/format";
import { findCurveInversions, usePricingCurve, type CurveRow } from "./pricing-curve";

async function callSimulate(
  company: string,
  location: string,
  parkingType: string,
  days: number,
): Promise<Omit<CurveRow, "days">> {
  const { data, error } = await supabase.rpc("simulate_price", {
    p_company: company,
    p_location: location,
    p_parking_type: parkingType,
    p_days: days,
  });
  if (error) return { price: null, oldPrice: null, error: error.message };
  const r = data as { price?: number; old_price?: number | null; error?: string } | null;
  return {
    price: r?.price ?? null,
    oldPrice: r?.old_price ?? null,
    error: r?.error ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug: string;
  locationSlug: string;
  parkingTypeCode: string;
  title: string;
};

function isoLocal(d: Date) {
  // datetime-local precisa de "YYYY-MM-DDTHH:mm"
  return format(d, "yyyy-MM-dd'T'HH:mm");
}

export function PricingSimulationDialog({
  open,
  onOpenChange,
  companySlug,
  locationSlug,
  parkingTypeCode,
  title,
}: Props) {
  const bucketSim = usePricingCurve(companySlug, locationSlug, parkingTypeCode, open);

  const data = bucketSim.data;
  const isLoading = bucketSim.isLoading;

  const flips = new Set(findCurveInversions(data ?? []).map((i) => i.days));

  // ---------- Aba "Por datas" ----------
  const now = React.useMemo(() => new Date(), []);
  const [checkIn, setCheckIn] = React.useState(() => isoLocal(now));
  const [checkOut, setCheckOut] = React.useState(() => isoLocal(addDays(now, 3)));

  const dateSim = useMutation({
    mutationFn: async (days: number) =>
      callSimulate(companySlug, locationSlug, parkingTypeCode, days),
  });

  const checkInDate = React.useMemo(() => (checkIn ? new Date(checkIn) : null), [checkIn]);
  const checkOutDate = React.useMemo(
    () => (checkOut ? new Date(checkOut) : null),
    [checkOut],
  );
  const totalMinutes =
    checkInDate && checkOutDate ? differenceInMinutes(checkOutDate, checkInDate) : 0;
  // Política de fração padrão `any_extra`: qualquer minuto extra conta como +1 dia
  const computedDays =
    totalMinutes > 0 ? Math.ceil(totalMinutes / (60 * 24)) : 0;
  const hours = Math.floor(totalMinutes / 60);
  const minutesRest = totalMinutes - hours * 60;
  const dateResult = dateSim.data;

  function runDateSim() {
    if (computedDays > 0) dateSim.mutate(computedDays);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Simulação de preços · {title}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="buckets">
          <TabsList>
            <TabsTrigger value="buckets">Tabela por dias</TabsTrigger>
            <TabsTrigger value="dates">Por datas</TabsTrigger>
          </TabsList>

          <TabsContent value="buckets">
            <p className="mb-3 text-caption text-muted">
              ⚠️ marca inversão de faixa (mais dias = mais barato).
            </p>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-hairline">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">Dias</TableHead>
                      <TableHead className="text-right">Preço total</TableHead>
                      <TableHead className="text-right">Preço/dia</TableHead>
                      <TableHead className="text-right">Balcão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.map((r) => {
                      const flip = flips.has(r.days);
                      const perDay =
                        r.price !== null && r.days > 0 ? Number(r.price) / r.days : null;
                      return (
                        <TableRow key={r.days}>
                          <TableCell className="text-right tabular-nums font-medium">
                            {r.days}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.error ? (
                              <span className="text-error">{r.error}</span>
                            ) : r.price !== null ? (
                              <span className="inline-flex items-center gap-1.5">
                                {flip && (
                                  <AlertTriangle
                                    className="h-3.5 w-3.5 text-warning"
                                    aria-label="Inversão de faixa"
                                  />
                                )}
                                {formatBRL(Number(r.price))}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted">
                            {perDay !== null ? formatBRL(perDay) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted">
                            {r.oldPrice !== null && r.oldPrice !== r.price
                              ? formatBRL(Number(r.oldPrice))
                              : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="dates">
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ci">Check-in</Label>
                  <Input
                    id="ci"
                    type="datetime-local"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="co">Check-out</Label>
                  <Input
                    id="co"
                    type="datetime-local"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 rounded-md border border-hairline bg-surface-soft p-4">
                <div className="space-y-0.5">
                  <div className="text-caption text-muted">Duração</div>
                  <div className="text-body-md text-ink tabular-nums">
                    {totalMinutes > 0
                      ? `${hours}h ${minutesRest.toString().padStart(2, "0")}m`
                      : "—"}
                  </div>
                </div>
                <div className="space-y-0.5">
                  <div className="text-caption text-muted">Dias cobrados</div>
                  <div className="text-display-sm text-ink tabular-nums">
                    {computedDays || "—"}
                  </div>
                </div>
                <div className="flex-1" />
                <Button
                  onClick={runDateSim}
                  disabled={computedDays <= 0 || dateSim.isPending}
                >
                  <Calculator className="h-4 w-4" />
                  {dateSim.isPending ? "Calculando…" : "Calcular preço"}
                </Button>
              </div>

              {dateResult && (
                <div className="rounded-md border border-hairline bg-canvas p-4 shadow-tier">
                  {dateResult.error ? (
                    <div className="text-body-sm text-error">{dateResult.error}</div>
                  ) : dateResult.price !== null ? (
                    <div className="flex items-baseline gap-3">
                      {dateResult.oldPrice !== null &&
                        dateResult.oldPrice !== dateResult.price && (
                          <span className="text-body-sm text-muted line-through tabular-nums">
                            {formatBRL(Number(dateResult.oldPrice))}
                          </span>
                        )}
                      <span className="text-display-md text-mp-primary tabular-nums">
                        {formatBRL(Number(dateResult.price))}
                      </span>
                      <span className="text-body-sm text-muted">
                        ({computedDays} {computedDays === 1 ? "dia" : "dias"})
                      </span>
                    </div>
                  ) : null}
                </div>
              )}

              <p className="text-caption text-muted">
                Qualquer minuto extra conta como um dia inteiro. O cálculo da reserva real
                pode seguir uma regra de arredondamento diferente conforme a configuração
                desta vaga.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
