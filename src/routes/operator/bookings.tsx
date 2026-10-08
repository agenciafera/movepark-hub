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
import { useBookings, type BookingFilters } from "@/features/bookings/api";
import { useScopedLocationIds } from "@/auth/useScopedLocationIds";
import { useAuth } from "@/auth/context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWlBookingsCount } from "@/features/wl-bookings/api";
import { WlBookingsPanel } from "@/features/wl-bookings/WlBookingsPanel";
import { partnerSeesBooking } from "@/features/bookings/bookingMoney.logic";
import type { BookingStatus } from "@/types/domain";

// O estacionamento só vê reserva que virou venda (08/10/2026, `partnerSeesBooking`): pendente e
// expirada não entram no filtro porque não aparecem para ele.
const statusOptions: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Em uso" },
  { value: "completed", label: "Concluída" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelada" },
];
const PARTNER_STATUSES: BookingStatus[] = ["confirmed", "checked_in", "completed", "no_show", "cancelled"];

export default function OperatorBookings() {
  // A command palette manda o código da reserva em `?q=`. Semear o estado a
  // partir dele é o que faz o resultado da busca abrir já filtrado, já que o
  // painel não tem rota de detalhe de reserva.
  const [searchParams] = useSearchParams();
  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = React.useState<BookingStatus | "all">("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const navigate = useNavigate();
  const { ids: scopedLocationIds } = useScopedLocationIds();

  const filters: BookingFilters = React.useMemo(
    () => ({
      status: status === "all" ? PARTNER_STATUSES : [status],
      search: search || undefined,
      locationIds: scopedLocationIds,
      // filtra por data de check-in (inclui o dia inteiro do "até")
      from: from ? `${from}T00:00:00` : undefined,
      to: to ? `${to}T23:59:59` : undefined,
    }),
    [status, search, scopedLocationIds, from, to],
  );

  const { data: all, isLoading } = useBookings(filters);
  const data = React.useMemo(() => all?.filter(partnerSeesBooking), [all]);

  // Reservas do site white-label (reservas-wl-no-hub.md § 9): a aba só aparece para quem tem o
  // escopo e quando já há reserva importada. Sem site, ou com a importação desligada, a tela fica
  // exatamente como era. O gate real é do servidor (operator_wl_bookings).
  const { impersonatedCompanyId, effectiveCompanyIds, hasScope } = useAuth();
  const scopeCompanyId = impersonatedCompanyId ?? effectiveCompanyIds[0];
  const canSeeSite = hasScope("wl-bookings:read", scopeCompanyId);
  const siteCount = useWlBookingsCount(impersonatedCompanyId ?? undefined, canSeeSite);
  const showSiteTab = canSeeSite && (siteCount.data ?? 0) > 0;

  const hubBookings = (
    <>
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
        valueMode="parking"
        onRowClick={(b) => navigate(`/operator/bookings/${b.code}`)}
      />
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reservas" description="Gestão das reservas da sua empresa." />

      {showSiteTab ? (
        <Tabs defaultValue="hub">
          <TabsList>
            <TabsTrigger value="hub">Pela Movepark</TabsTrigger>
            <TabsTrigger value="site">Pelo seu site</TabsTrigger>
          </TabsList>
          <TabsContent value="hub" className="flex flex-col gap-6 pt-4">
            {hubBookings}
          </TabsContent>
          <TabsContent value="site" className="pt-4">
            <WlBookingsPanel companyId={impersonatedCompanyId ?? undefined} />
          </TabsContent>
        </Tabs>
      ) : (
        hubBookings
      )}
    </div>
  );
}
