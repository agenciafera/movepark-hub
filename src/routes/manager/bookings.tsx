import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { useManagerFilters } from "@/features/manager-filters/context";
import { ManagerFilterBar } from "@/features/manager-filters/ManagerFilterBar";
import { periodLabel } from "@/features/manager-filters/managerFilters.logic";
import { BookingTable } from "@/features/bookings/BookingTable";
import { GuaranteeClaimsCard } from "@/features/guarantee/GuaranteeClaimsCard";
import {
  useBookingsPage,
  useBookingsSummary,
  withoutPage,
  type BookingPageFilters,
} from "@/features/bookings/api";
import { BookingsPager } from "@/features/bookings/BookingsPager";
import { ExportBookingsButton } from "@/features/bookings/ExportBookingsButton";
import { SOURCE_OPTIONS, type SourceFilter } from "@/features/bookings/unifiedBookingRow.logic";
import {
  CHANNEL_LABEL,
  type ChannelFilter,
  type PaymentMethodFilter,
} from "@/features/bookings/bookingList.logic";
import { formatBRL } from "@/lib/format";
import { useUrlFilters } from "@/lib/useUrlFilters";
import { hasActiveFilters } from "@/lib/urlFilters.logic";
import { useCompanies } from "@/features/companies/api";
import type { BookingStatus } from "@/types/domain";

const statusOptions: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "checked_in", label: "Em uso" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
  { value: "expired", label: "Expirada" },
  { value: "no_show", label: "Não compareceu" },
];

const paymentOptions: { value: PaymentMethodFilter | "all"; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pix", label: "PIX" },
  { value: "card", label: "Cartão de crédito" },
  { value: "none", label: "Sem pagamento" },
];

const channelOptions: { value: ChannelFilter | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  ...(Object.keys(CHANNEL_LABEL) as ChannelFilter[]).map((k) => ({
    value: k,
    label: CHANNEL_LABEL[k],
  })),
];

/** Filtros da lista no endereço, com o valor padrão de cada um (padrão não vai para a URL). */
const FILTROS = {
  q: "",
  status: "all",
  pagamento: "all",
  canal: "all",
  origem: "all",
  estacionamento: "all",
  pagina: "1",
};

/** Página da lista. O servidor pagina e devolve o total e o resumo do recorte inteiro. */
const PAGE_SIZE = 50;

function Numero({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-title-md tabular-nums text-ink">{value}</div>
      {hint && <div className="text-caption text-muted">{hint}</div>}
    </div>
  );
}

export default function ManagerBookings() {
  // Filtros no endereço (13/10/2026): sobrevivem ao F5 e viajam no link. A command palette manda
  // o código da reserva em `?q=`, a mesma chave da busca.
  const { filters: f, set, clear } = useUrlFilters(FILTROS, "pagina");
  const search = f.q;
  const status = f.status as BookingStatus | "all";
  const payment = f.pagamento as PaymentMethodFilter | "all";
  const channel = f.canal as ChannelFilter | "all";
  const source = f.origem as SourceFilter;
  const companyId = f.estacionamento;
  // Na URL a página conta a partir de 1, como quem lê; na consulta, a partir de 0.
  const page = Math.max(0, (Number(f.pagina) || 1) - 1);
  const companies = useCompanies();
  const navigate = useNavigate();
  const { period, range, scopedLocationIds } = useManagerFilters();

  // Buscar atravessa o período: quem digita um código ou o nome do cliente quer AQUELA
  // reserva, não a reserva se ela por acaso cair no recorte da tela.
  // O recorte é pela data da COMPRA, não do check-in: todos os presets olham para trás, e a
  // reserva feita hoje para a semana que vem sumia da lista até o dia de chegar (16/09/2026).
  const term = search.trim();
  // Forma de pagamento e canal são dados só do Hub: com eles ligados o servidor tira o site.
  const filters: BookingPageFilters = React.useMemo(
    () => ({
      source,
      status: status === "all" ? undefined : [status],
      search: term || undefined,
      paymentMethod: payment === "all" ? undefined : payment,
      channel: channel === "all" ? undefined : channel,
      locationIds: scopedLocationIds,
      companyIds: companyId === "all" ? undefined : [companyId],
      from: term ? undefined : range.from.toISOString(),
      to: term ? undefined : range.to.toISOString(),
      dateField: "created_at",
      page,
      pageSize: PAGE_SIZE,
    }),
    [source, status, term, payment, channel, companyId, scopedLocationIds, range, page],
  );

  const { data, isLoading } = useBookingsPage(filters);
  // Resumo à parte, sem a página na chave: trocar de página não refaz a conta.
  const resumoQ = useBookingsSummary(withoutPage(filters));
  const hub = resumoQ.data?.hub;
  const wl = resumoQ.data?.wl;
  const temFiltro = hasActiveFilters(f, FILTROS, ["pagina"]);

  function limpar() {
    clear();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reservas"
        description={
          term
            ? "Busca sem recorte de período."
            : `Reservas feitas em ${periodLabel(period, range).toLowerCase()}.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ManagerFilterBar showCompare={false} />
            <ExportBookingsButton
              filters={filters}
              options={{ showSource: true, showCompany: true, valueMode: "total" }}
              filePrefix="reservas-rede"
            />
          </div>
        }
      />

      <Card>
        <CardContent className="grid gap-4 p-6 tablet:grid-cols-2 desktop:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto] desktop:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="search">Busca</Label>
            <Input
              id="search"
              type="search"
              placeholder="Código, nome, e-mail ou telefone"
              value={search}
              onChange={(e) => set({ q: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="booking-company">Estacionamento</Label>
            <Select value={companyId} onValueChange={(v) => set({ estacionamento: v })}>
              <SelectTrigger id="booking-company">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(companies.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="booking-payment">Pagamento</Label>
            <Select value={payment} onValueChange={(v) => set({ pagamento: v })}>
              <SelectTrigger id="booking-payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="booking-channel">Canal</Label>
            <Select value={channel} onValueChange={(v) => set({ canal: v })}>
              <SelectTrigger id="booking-channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channelOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
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
          <Button variant="secondary" onClick={limpar} disabled={!temFiltro}>
            Limpar filtros
          </Button>
        </CardContent>
      </Card>

      {/* Total com a quebra por origem (D4): o site white-label só aparece quando tem reserva no recorte. */}
      {!isLoading && hub && wl && hub.total + wl.total > 0 && (
        <Card data-testid="resumo-reservas">
          <CardContent className="grid grid-cols-2 gap-6 p-6 tablet:grid-cols-4">
            <Numero
              label="Reservas"
              value={hub.total + wl.total}
              hint={wl.total ? `${hub.total} no Hub, ${wl.total} no white-label` : undefined}
            />
            <Numero
              label="Pagas"
              value={hub.paid + wl.paid}
              hint={
                hub.paid || wl.paid
                  ? [
                      hub.paid ? `${hub.pix} no PIX, ${hub.card} no cartão` : null,
                      wl.paid ? `${wl.paid} no white-label` : null,
                    ]
                      .filter(Boolean)
                      .join("; ")
                  : undefined
              }
            />
            <Numero
              label="Valor pago"
              value={formatBRL(Number(hub.paid_amount) + Number(wl.paid_amount))}
              hint={
                wl.total
                  ? `${formatBRL(Number(hub.paid_amount))} no Hub, ${formatBRL(Number(wl.paid_amount))} no white-label`
                  : "sem as devolvidas"
              }
            />
            <Numero
              label="Não pagaram no Hub"
              value={hub.lost}
              hint={
                hub.awaiting ? `e ${hub.awaiting} aguardando pagamento` : "expiradas ou recusadas"
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Cliente chegou e não tinha vaga (garantia). Some sem acionamento aberto. */}
      <GuaranteeClaimsCard />

      <BookingTable
        rows={data?.rows}
        isLoading={isLoading}
        showSource
        emptyDescription={
          temFiltro
            ? "Nenhuma reserva bate com esses filtros. Limpe os filtros ou mude o período."
            : undefined
        }
        onRowClick={(b) => navigate(`/manager/bookings/${b.code}`)}
        onWlRowClick={(w) => navigate(`/manager/bookings/site/${w.id}`)}
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
