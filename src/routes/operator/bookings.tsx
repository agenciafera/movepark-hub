import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookingTable } from "@/features/bookings/BookingTable";
import { BookingDrawer } from "@/features/bookings/BookingDrawer";
import { useBookings, type BookingFilters } from "@/features/bookings/api";
import { useScopedLocationIds } from "@/auth/useScopedLocationIds";
import type { BookingStatus, BookingWithRelations } from "@/types/domain";

const statusOptions: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Em uso" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
];

export default function OperatorBookings() {
  // A command palette manda o código da reserva em `?q=`. Semear o estado a
  // partir dele é o que faz o resultado da busca abrir já filtrado, já que o
  // painel não tem rota de detalhe de reserva.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = React.useState<BookingStatus | "all">("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [selected, setSelected] = React.useState<BookingWithRelations | null>(null);
  const { ids: scopedLocationIds } = useScopedLocationIds();

  const filters: BookingFilters = React.useMemo(
    () => ({
      status: status === "all" ? undefined : [status],
      search: search || undefined,
      locationIds: scopedLocationIds,
      // filtra por data de check-in (inclui o dia inteiro do "até")
      from: from ? `${from}T00:00:00` : undefined,
      to: to ? `${to}T23:59:59` : undefined,
    }),
    [status, search, scopedLocationIds, from, to],
  );

  const { data, isLoading } = useBookings(filters);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reservas" description="Gestão das reservas da sua empresa." />

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 tablet:flex-row tablet:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="search">Busca</Label>
            <Input
              id="search"
              placeholder="Código da reserva"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">Check-in de</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">até</Label>
            <Input id="to" type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex w-full tablet:w-60 flex-col gap-1.5">
            <Label htmlFor="booking-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus | "all")}>
              <SelectTrigger id="booking-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <BookingTable
        bookings={data}
        isLoading={isLoading}
        showCompany={false}
        onRowClick={(b) => setSelected(b)}
      />

      <BookingDrawer
        booking={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
