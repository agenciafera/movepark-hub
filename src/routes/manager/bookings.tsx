import * as React from "react";
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
import { BookingModal } from "@/features/bookings/BookingModal";
import { useBookings, type BookingFilters } from "@/features/bookings/api";
import type { BookingStatus, BookingWithRelations } from "@/types/domain";

const statusOptions: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Em uso" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
];

export default function ManagerBookings() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<BookingStatus | "all">("all");
  const [selected, setSelected] = React.useState<BookingWithRelations | null>(null);

  const filters: BookingFilters = React.useMemo(
    () => ({
      status: status === "all" ? undefined : [status],
      search: search || undefined,
    }),
    [status, search],
  );

  const { data, isLoading } = useBookings(filters);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reservas" description="Todas as reservas da plataforma." />

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
          <div className="flex w-full tablet:w-60 flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus | "all")}>
              <SelectTrigger>
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
        onRowClick={(b) => setSelected(b)}
      />

      <BookingModal
        booking={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  );
}
