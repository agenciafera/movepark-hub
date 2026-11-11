import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { hasActiveFilters } from "@/lib/urlFilters.logic";
import { useOperatorLocations } from "@/features/locations/api";
import {
  ATTENDANCE_OPTIONS,
  PAYMENT_OPTIONS,
  MORE_FILTER_KEYS,
  addOnParam,
  countActiveFilters,
  attendanceParam,
  pcdParam,
  yesNoParam,
} from "@/features/bookings/bookingFilterOptions";
import { ExtraBookingFilters } from "@/features/bookings/ExtraBookingFilters";
import type { PaymentMethodFilter } from "@/features/bookings/bookingList.logic";
import { Input } from "@/components/ui/input";
import {
  BookingFiltersPanel,
  COMPACT_FIELD,
  FilterSelect,
} from "@/features/bookings/BookingFiltersPanel";
import { PageHeader } from "@/components/shared/PageHeader";
import { BookingTable } from "@/features/bookings/BookingTable";
import { BookingsPager } from "@/features/bookings/BookingsPager";
import { ExportBookingsButton } from "@/features/bookings/ExportBookingsButton";
import { BulkAttendanceBar } from "@/features/bookings/BulkAttendanceBar";
import { useWlBookingActions } from "@/features/wl-bookings/api";
import type { SourceFilter } from "@/features/bookings/unifiedBookingRow.logic";
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
  adicional: "all",
  campanha: "all",
  placa: "all",
  afiliado: "all",
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
      addOn: addOnParam(f.adicional),
      utmSource: f.campanha === "all" ? undefined : f.campanha,
      plateChanged: yesNoParam(f.placa),
      // Afiliado só existe no site: sem white-label o filtro nem aparece.
      affiliated: hasWl ? yesNoParam(f.afiliado) : undefined,
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
      f.adicional,
      f.campanha,
      f.placa,
      f.afiliado,
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
    f.adicional,
    f.campanha,
    f.placa,
    f.afiliado,
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

      <BookingFiltersPanel
        search={search}
        onSearch={(v) => set({ q: v })}
        searchPlaceholder={
          hasWl
            ? "Busque por código, pedido, nome ou placa"
            : "Busque por código, nome, e-mail ou telefone"
        }
        source={hasWl ? source : undefined}
        onSource={(v) => set({ origem: v })}
        primaryClassName={unidades.length > 1 ? "desktop:grid-cols-6" : "desktop:grid-cols-5"}
        primary={
          <>
            <fieldset className="col-span-2 flex min-w-0 flex-col gap-1">
              <legend className="mb-1 text-caption text-muted">Check-in entre</legend>
              <div className="flex items-center gap-2">
                <Input
                  id="from"
                  type="date"
                  aria-label="Check-in de"
                  value={from}
                  onChange={(e) => set({ de: e.target.value })}
                  className={`${COMPACT_FIELD} min-w-0 px-2`}
                />
                <span className="text-caption text-muted">e</span>
                <Input
                  id="to"
                  type="date"
                  aria-label="Check-in até"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => set({ ate: e.target.value })}
                  className={`${COMPACT_FIELD} min-w-0 px-2`}
                />
              </div>
            </fieldset>
            <FilterSelect
              id="booking-status"
              label="Status"
              value={status}
              options={statusOptions}
              onChange={(v) => set({ status: v })}
            />
            <FilterSelect
              id="booking-attendance"
              label="Comparecimento"
              value={f.comparecimento}
              options={ATTENDANCE_OPTIONS}
              onChange={(v) => set({ comparecimento: v })}
            />
            <FilterSelect
              id="booking-payment"
              label="Pagamento"
              value={f.pagamento}
              options={PAYMENT_OPTIONS}
              onChange={(v) => set({ pagamento: v })}
            />
            {unidades.length > 1 && (
              <FilterSelect
                id="booking-unit"
                label="Unidade"
                value={unidade}
                options={[
                  { value: "all", label: "Todas" },
                  ...unidades.map((l) => ({ value: l.id, label: l.name })),
                ]}
                onChange={(v) => set({ unidade: v })}
              />
            )}
          </>
        }
        more={
          <ExtraBookingFilters
            values={f}
            onChange={set}
            showAffiliate={hasWl}
            companyIds={scopedCompanyId ? [scopedCompanyId] : undefined}
          />
        }
        moreActive={countActiveFilters(
          f,
          hasWl ? MORE_FILTER_KEYS : MORE_FILTER_KEYS.filter((k) => k !== "afiliado"),
        )}
        canClear={temFiltro}
        onClear={clear}
      />

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
