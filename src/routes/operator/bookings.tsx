import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { hasActiveFilters } from "@/lib/urlFilters.logic";
import { useOperatorLocations } from "@/features/locations/api";
import {
  ATTENDANCE_OPTIONS,
  PAYMENT_OPTIONS,
  PCD_OPTIONS,
  attendanceParam,
  pcdParam,
} from "@/features/bookings/bookingFilterOptions";
import type { PaymentMethodFilter } from "@/features/bookings/bookingList.logic";
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
import { ExportBookingsButton } from "@/features/bookings/ExportBookingsButton";
import { BulkAttendanceBar } from "@/features/bookings/BulkAttendanceBar";
import { useWlBookingActions } from "@/features/wl-bookings/api";
import { SOURCE_OPTIONS, type SourceFilter } from "@/features/bookings/unifiedBookingRow.logic";
import { useBookingsPage, type BookingPageFilters } from "@/features/bookings/api";
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

/** Filtros da lista no endereço, com o valor padrão de cada um (padrão não vai para a URL). */
const FILTROS = {
  q: "",
  status: "all",
  origem: "all",
  de: "",
  ate: "",
  unidade: "all",
  pagamento: "all",
  comparecimento: "all",
  pcd: "all",
  pagina: "1",
};

/**
 * Reservas do estacionamento: uma lista só, com as do Hub e, para quem tem white-label, as do
 * site, cada uma com a sua etiqueta (reservas-unificadas-hub-wl.md § 3). Quem não tem white-label
 * vê a tela como sempre foi: sem etiqueta, sem filtro de origem.
 */
export default function OperatorBookings() {
  // Filtros no endereço (13/10/2026): sobrevivem ao F5 e viajam no link. A command palette manda
  // o código da reserva em `?q=`, a mesma chave da busca.
  const { filters: f, set, clear } = useUrlFilters(FILTROS, "pagina");
  const search = f.q;
  const status = f.status as BookingStatus | "all";
  const source = f.origem as SourceFilter;
  const from = f.de;
  const to = f.ate;
  const unidade = f.unidade;
  // Na URL a página conta a partir de 1, como quem lê; na consulta, a partir de 0.
  const page = Math.max(0, (Number(f.pagina) || 1) - 1);
  const temFiltro = hasActiveFilters(f, FILTROS, ["pagina"]);
  const navigate = useNavigate();
  const { hasWl } = useHasWl();
  const { scopedCompanyId, effectiveCompanyIds, hasScope } = useAuth();
  const companyId = effectiveCompanyIds[0];
  // Ação em massa (fase 6): quem pode marcar chegada no Hub (bookings:checkin ou :write). No site,
  // vale o que o servidor diz para quem está logado (chave de ações + permissão).
  const canCheckin =
    hasScope("bookings:checkin", companyId) || hasScope("bookings:write", companyId);
  const wlPerms = useWlBookingActions(hasWl ? companyId : undefined);
  const wlAttendance = !!wlPerms.data?.enabled && !!wlPerms.data?.attendance;
  // Filtro de unidade só quando a empresa tem mais de uma (com uma, não há o que escolher).
  const locations = useOperatorLocations(effectiveCompanyIds);
  const unidades = locations.data ?? [];
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const filters: BookingPageFilters = React.useMemo(
    () => ({
      status: status === "all" ? undefined : [status],
      search: search || undefined,
      locationIds: unidade !== "all" ? [unidade] : undefined,
      // Admin impersonando, ou operador com mais de uma empresa: recorta pela empresa em escopo.
      // Pela empresa e não pelas unidades dela, porque a reserva do site sem vaga não tem unidade.
      companyIds: scopedCompanyId ? [scopedCompanyId] : undefined,
      source: hasWl ? source : "hub",
      partnerView: true,
      paymentMethod: f.pagamento === "all" ? undefined : (f.pagamento as PaymentMethodFilter),
      attendance: attendanceParam(f.comparecimento),
      pcd: pcdParam(f.pcd),
      // filtra por data de check-in (inclui o dia inteiro do "até")
      dateField: "check_in_at",
      from: from ? `${from}T00:00:00` : undefined,
      to: to ? `${to}T23:59:59` : undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [
      status,
      search,
      unidade,
      f.pagamento,
      f.comparecimento,
      f.pcd,
      scopedCompanyId,
      hasWl,
      source,
      from,
      to,
      page,
    ],
  );

  // Filtro novo volta para a primeira página (feito em `set`, ver useUrlFilters).
  const filtroKey = [
    status,
    search,
    source,
    from,
    to,
    unidade,
    f.pagamento,
    f.comparecimento,
    f.pcd,
    scopedCompanyId,
  ].join("|");
  // A seleção é da página que está na tela: muda o recorte ou a página, ela zera.
  React.useEffect(() => setSelected(new Set()), [filtroKey, page]);

  const { data, isLoading } = useBookingsPage(filters);
  const selecionadas = (data?.rows ?? []).filter((r) => selected.has(`${r.source}:${r.id}`));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reservas"
        description="Gestão das reservas da sua empresa."
        actions={
          <ExportBookingsButton
            filters={filters}
            options={{ showSource: hasWl, showCompany: false, valueMode: "parking" }}
            filePrefix="reservas"
          />
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-6 tablet:flex-row tablet:flex-wrap tablet:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="search">Busca</Label>
            <Input
              id="search"
              placeholder={
                hasWl ? "Código, pedido, nome ou placa" : "Código, nome, e-mail ou telefone"
              }
              value={search}
              onChange={(e) => set({ q: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="from">Check-in de</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => set({ de: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="to">até</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => set({ ate: e.target.value })}
              className="w-40"
            />
          </div>
          <div className="flex w-full flex-col gap-1.5 tablet:w-48">
            <Label htmlFor="booking-status">Status</Label>
            <Select value={status} onValueChange={(v) => set({ status: v })}>
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
            <div className="flex w-full flex-col gap-1.5 tablet:w-40">
              <Label htmlFor="booking-source">Origem</Label>
              <Select value={source} onValueChange={(v) => set({ origem: v })}>
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
          <div className="flex w-full flex-col gap-1.5 tablet:w-44">
            <Label htmlFor="booking-payment">Pagamento</Label>
            <Select value={f.pagamento} onValueChange={(v) => set({ pagamento: v })}>
              <SelectTrigger id="booking-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-full flex-col gap-1.5 tablet:w-44">
            <Label htmlFor="booking-attendance">Comparecimento</Label>
            <Select value={f.comparecimento} onValueChange={(v) => set({ comparecimento: v })}>
              <SelectTrigger id="booking-attendance">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-full flex-col gap-1.5 tablet:w-44">
            <Label htmlFor="booking-pcd">PCD</Label>
            <Select value={f.pcd} onValueChange={(v) => set({ pcd: v })}>
              <SelectTrigger id="booking-pcd">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PCD_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {unidades.length > 1 && (
            <div className="flex w-full flex-col gap-1.5 tablet:w-48">
              <Label htmlFor="booking-unit">Unidade</Label>
              <Select value={unidade} onValueChange={(v) => set({ unidade: v })}>
                <SelectTrigger id="booking-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {unidades.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button variant="secondary" onClick={clear} disabled={!temFiltro}>
            Limpar filtros
          </Button>
        </CardContent>
      </Card>

      {selecionadas.length > 0 && (
        <BulkAttendanceBar
          rows={selecionadas}
          wlAttendance={wlAttendance}
          onDone={() => setSelected(new Set())}
        />
      )}

      <BookingTable
        rows={data?.rows}
        isLoading={isLoading}
        showCompany={false}
        showSource={hasWl}
        valueMode="parking"
        onRowClick={(b) => navigate(`/operator/bookings/${b.code}`)}
        onWlRowClick={(w) => navigate(`/operator/bookings/site/${w.id}`)}
        selected={canCheckin ? selected : undefined}
        onSelectedChange={canCheckin ? setSelected : undefined}
      />

      <BookingsPager
        page={page}
        pageSize={PAGE_SIZE}
        total={data?.total ?? 0}
        onPage={(p) => set({ pagina: String(p + 1) })}
      />
    </div>
  );
}
