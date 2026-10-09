import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { useBookingsPage, type BookingPageFilters } from "@/features/bookings/api";
import { BookingsPager } from "@/features/bookings/BookingsPager";
import { SOURCE_OPTIONS, type SourceFilter } from "@/features/bookings/unifiedBookingRow.logic";
import { CHANNEL_LABEL, type ChannelFilter, type PaymentMethodFilter } from "@/features/bookings/bookingList.logic";
import { formatBRL } from "@/lib/format";
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
  ...(Object.keys(CHANNEL_LABEL) as ChannelFilter[]).map((k) => ({ value: k, label: CHANNEL_LABEL[k] })),
];

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
  // A command palette manda o código da reserva em `?q=` (ver operator/bookings).
  const [searchParams] = useSearchParams();
  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = React.useState<BookingStatus | "all">("all");
  const [payment, setPayment] = React.useState<PaymentMethodFilter | "all">("all");
  const [channel, setChannel] = React.useState<ChannelFilter | "all">("all");
  const [source, setSource] = React.useState<SourceFilter>("all");
  const [page, setPage] = React.useState(0);
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
      from: term ? undefined : range.from.toISOString(),
      to: term ? undefined : range.to.toISOString(),
      dateField: "created_at",
      page,
      pageSize: PAGE_SIZE,
    }),
    [source, status, term, payment, channel, scopedLocationIds, range, page],
  );

  const filtroKey = [source, status, term, payment, channel, range.from.toISOString(), range.to.toISOString()].join("|");
  React.useEffect(() => setPage(0), [filtroKey]);

  const { data, isLoading } = useBookingsPage(filters);
  const hub = data?.summary.hub;
  const wl = data?.summary.wl;
  const temFiltro = !!term || status !== "all" || payment !== "all" || channel !== "all" || source !== "all";

  function limpar() {
    setSearch("");
    setStatus("all");
    setPayment("all");
    setChannel("all");
    setSource("all");
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
        actions={<ManagerFilterBar showCompare={false} />}
      />

      <Card>
        <CardContent className="grid gap-4 p-6 tablet:grid-cols-2 desktop:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] desktop:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="search">Busca</Label>
            <Input
              id="search"
              type="search"
              placeholder="Código, nome, e-mail ou telefone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="booking-payment">Pagamento</Label>
            <Select value={payment} onValueChange={(v) => setPayment(v as PaymentMethodFilter | "all")}>
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
            <Select value={channel} onValueChange={(v) => setChannel(v as ChannelFilter | "all")}>
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
                  ? [hub.paid ? `${hub.pix} no PIX, ${hub.card} no cartão` : null, wl.paid ? `${wl.paid} no white-label` : null]
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
              hint={hub.awaiting ? `e ${hub.awaiting} aguardando pagamento` : "expiradas ou recusadas"}
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
        emptyDescription={temFiltro ? "Nenhuma reserva bate com esses filtros. Limpe os filtros ou mude o período." : undefined}
        onRowClick={(b) => navigate(`/manager/bookings/${b.code}`)}
        onWlRowClick={(w) => navigate(`/manager/bookings/site/${w.id}`)}
      />

      <BookingsPager page={page} pageSize={PAGE_SIZE} total={data?.total ?? 0} onPage={setPage} />
    </div>
  );
}
