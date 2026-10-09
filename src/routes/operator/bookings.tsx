import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { BookingsPager } from "@/features/bookings/BookingsPager";
import { SOURCE_OPTIONS, type SourceFilter } from "@/features/bookings/unifiedBookingRow.logic";
import { useBookingsPage, type BookingPageFilters } from "@/features/bookings/api";
import { useScopedLocationIds } from "@/auth/useScopedLocationIds";
import { useHasWl } from "@/features/companies/useHasWl";
import { useAuth } from "@/auth/context";
import type { BookingStatus } from "@/types/domain";

// O estacionamento só vê reserva que virou venda (08/10/2026, `partnerSeesBooking`; no servidor,
// `p_partner_view`): pendente e expirada não entram no filtro porque não aparecem para ele.
const statusOptions: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Em uso" },
  { value: "completed", label: "Concluída" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelada" },
];

const PAGE_SIZE = 50;

/**
 * Reservas do estacionamento: uma lista só, com as do Hub e, para quem tem white-label, as do
 * site, cada uma com a sua etiqueta (reservas-unificadas-hub-wl.md § 3). Quem não tem white-label
 * vê a tela como sempre foi: sem etiqueta, sem filtro de origem.
 */
export default function OperatorBookings() {
  // A command palette manda o código da reserva em `?q=`. Semear o estado a
  // partir dele é o que faz o resultado da busca abrir já filtrado, já que o
  // painel não tem rota de detalhe de reserva.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = React.useState<BookingStatus | "all">("all");
  const [source, setSource] = React.useState<SourceFilter>("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [page, setPage] = React.useState(0);
  const navigate = useNavigate();
  const { ids: scopedLocationIds } = useScopedLocationIds();
  const { hasWl } = useHasWl();
  const { impersonatedCompanyId } = useAuth();

  const filters: BookingPageFilters = React.useMemo(
    () => ({
      status: status === "all" ? undefined : [status],
      search: search || undefined,
      locationIds: scopedLocationIds,
      // Admin impersonando: recorta pela empresa também (a reserva do site sem vaga não tem unidade).
      companyIds: impersonatedCompanyId ? [impersonatedCompanyId] : undefined,
      source: hasWl ? source : "hub",
      partnerView: true,
      // filtra por data de check-in (inclui o dia inteiro do "até")
      dateField: "check_in_at",
      from: from ? `${from}T00:00:00` : undefined,
      to: to ? `${to}T23:59:59` : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [status, search, scopedLocationIds, impersonatedCompanyId, hasWl, source, from, to, page],
  );

  // Filtro novo volta para a primeira página.
  const filtroKey = [status, search, source, from, to, impersonatedCompanyId].join("|");
  React.useEffect(() => setPage(0), [filtroKey]);

  const { data, isLoading } = useBookingsPage(filters);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reservas" description="Gestão das reservas da sua empresa." />

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 tablet:flex-row tablet:flex-wrap tablet:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="search">Busca</Label>
            <Input
              id="search"
              placeholder={hasWl ? "Código, pedido, nome ou placa" : "Código, nome, e-mail ou telefone"}
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
          <div className="flex w-full tablet:w-48 flex-col gap-1.5">
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
          {hasWl && (
            <div className="flex w-full tablet:w-40 flex-col gap-1.5">
              <Label htmlFor="booking-source">Origem</Label>
              <Select value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
                <SelectTrigger id="booking-source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <BookingTable
        rows={data?.rows}
        isLoading={isLoading}
        showCompany={false}
        showSource={hasWl}
        valueMode="parking"
        onRowClick={(b) => navigate(`/operator/bookings/${b.code}`)}
        onWlRowClick={(w) => navigate(`/operator/bookings/site/${w.id}`)}
      />

      <BookingsPager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
    </div>
  );
}
