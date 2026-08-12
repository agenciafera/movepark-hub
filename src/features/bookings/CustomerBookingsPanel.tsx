import * as React from "react";
import { Link } from "react-router-dom";
import {
  ArrowCounterClockwise,
  CalendarDot,
  CaretLeft,
  CaretRight,
  MapPin,
  Storefront,
  Tag,
  Ticket,
  Wallet,
} from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import { AccountCard } from "@/components/shared/AccountCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { BOOKING_STATUS_TONES, BOOKING_TONE_SURFACE } from "@/components/shared/statusBadge.logic";
import { useAuth } from "@/auth/context";
import { useAllMyBookings, type MyBookingListItem } from "@/features/bookings/customerApi";
import { bucketBooking, type MyBookingStatus } from "@/features/bookings/bookings.logic";
import { useLastCompletedBooking, useWallet } from "@/features/growth/api";
import {
  activeBooking,
  historyFilters,
  nightsOf,
  paginate,
  yearToDate,
} from "@/features/account/accountSummary.logic";
import { formatBRL, formatDayTime } from "@/lib/format";
import { parkingTitle } from "@/lib/parkingName";
import { cn } from "@/lib/utils";

/**
 * Cinco linhas por página. Com dez, o card do histórico ficava mais alto que a
 * coluna do resumo ao lado e a página voltava a pedir rolagem longa.
 */
const PER_PAGE = 5;

/**
 * "Minhas reservas" no desenho do handoff: a reserva em foco num card de destaque, o
 * histórico filtrável embaixo e, ao lado, o resumo do ano e o atalho pra repetir a
 * última estadia. Montado em dois lugares, `/bookings` e `/account/reservas`, e o
 * `detailBase` decide pra onde o clique leva, pra continuar no shell certo.
 */
export function CustomerBookingsPanel({ detailBase = "/bookings" }: { detailBase?: string }) {
  const { session } = useAuth();
  const profileId = session?.userId;
  const { data, isLoading, error } = useAllMyBookings(profileId);
  const wallet = useWallet(!!profileId);
  const last = useLastCompletedBooking(profileId);
  const [filter, setFilter] = React.useState<MyBookingStatus | "all">("all");
  const [page, setPage] = React.useState(1);

  const items = React.useMemo(() => data ?? [], [data]);
  const emFoco = React.useMemo(() => activeBooking(items), [items]);
  const filtros = React.useMemo(() => historyFilters(items), [items]);
  const resumo = React.useMemo(
    () => yearToDate(items, wallet.data?.transactions ?? []),
    [items, wallet.data],
  );
  /**
   * O detalhamento do ano só existe se tiver ao menos uma linha com valor. Zerado,
   * ele some inteiro: cada "R$ 0,00" na tela é a conta dizendo ao cliente que ele
   * não ganhou nada reservando aqui.
   */
  const temDetalhe =
    resumo.fromCounter > 0 ||
    resumo.fromCoupon > 0 ||
    resumo.fromPromo > 0 ||
    resumo.cashback > 0 ||
    !!resumo.topDestination;

  // Um filtro que sumiu (a última reserva daquele balde saiu) não pode deixar a lista
  // vazia pra sempre: volta pra "Todas".
  const filtroAtivo = filtros.some((f) => f.id === filter) ? filter : "all";
  const lista = React.useMemo(
    () => (filtroAtivo === "all" ? items : items.filter((b) => bucketBooking(b) === filtroAtivo)),
    [items, filtroAtivo],
  );
  const pagina = paginate(lista, page, PER_PAGE);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-44 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
        {(error as Error).message}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <AccountCard title="Minhas reservas" subtitle="Seus vouchers e seu histórico.">
        <EmptyState
          icon={<CalendarDot className="h-10 w-10" aria-hidden />}
          title="Você ainda não tem reservas."
          description="Comece buscando uma vaga."
          action={
            <Button asChild>
              <Link to="/search">Buscar vaga</Link>
            </Button>
          }
        />
      </AccountCard>
    );
  }

  return (
    <div className="space-y-5">
      {emFoco && <FocusCard booking={emFoco} detailBase={detailBase} />}

      <div className="grid grid-cols-1 gap-5 desktop:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AccountCard
          title="Histórico"
          action={
            filtros.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {filtros.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFilter(f.id);
                      setPage(1);
                    }}
                    aria-pressed={f.id === filtroAtivo}
                    className={cn(
                      "rounded-full px-3.5 py-2 text-caption-sm font-semibold transition-colors",
                      f.id === filtroAtivo
                        ? "bg-mp-primary text-white"
                        : "bg-surface-soft text-muted hover:bg-surface-strong",
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : undefined
          }
        >
          <ul className="space-y-1">
            {pagina.items.map((b) => (
              <HistoryRow key={b.id} booking={b} detailBase={detailBase} />
            ))}
          </ul>
          <Paginator page={pagina} onChange={setPage} />
        </AccountCard>

        <div className="space-y-5">
          <AccountCard title="Seu ano até agora">
            {/* Quem economizou vê a economia em destaque. Quem ainda não economizou
                veria "R$ 0,00 economizados", que é um placar de derrota logo na
                abertura do card, então aí o destaque continua sendo o gasto. */}
            <p className="text-display-md tabular-nums text-ink">
              {formatBRL(resumo.saved > 0 ? resumo.saved : resumo.spent)}
            </p>
            <p className="mt-1 text-body-sm text-muted">
              {resumo.saved > 0 ? "economizados em " : "em "}
              {resumo.stays} {resumo.stays === 1 ? "estadia" : "estadias"} · {resumo.nights}{" "}
              {resumo.nights === 1 ? "diária" : "diárias"}
            </p>
            {/* Linha zerada não informa nada, e um bloco cheio de "R$ 0,00" faz o
                cliente sentir que não ganha nada por reservar aqui. Sem nenhuma
                linha, o bloco inteiro sai junto com o traço que o separa. */}
            {temDetalhe && (
              <dl className="mt-4 space-y-3 border-t border-hairline pt-4">
                {/* Só aparece nas unidades que declararam tabela de balcão. Onde o
                  parceiro não declarou, a linha some em vez de estimar. */}
                {resumo.fromCounter > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-body-sm text-muted">
                      <Storefront className="h-4 w-4 shrink-0" aria-hidden />
                      Mais barato que no local
                    </dt>
                    <dd className="text-body-sm font-semibold tabular-nums text-ink">
                      {formatBRL(resumo.fromCounter)}
                    </dd>
                  </div>
                )}
                {resumo.fromCoupon > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-body-sm text-muted">
                      <Ticket className="h-4 w-4 shrink-0" aria-hidden />
                      Cupons
                    </dt>
                    <dd className="text-body-sm font-semibold tabular-nums text-ink">
                      {formatBRL(resumo.fromCoupon)}
                    </dd>
                  </div>
                )}
                {resumo.fromPromo > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-body-sm text-muted">
                      <Tag className="h-4 w-4 shrink-0" aria-hidden />
                      Promoções
                    </dt>
                    <dd className="text-body-sm font-semibold tabular-nums text-ink">
                      {formatBRL(resumo.fromPromo)}
                    </dd>
                  </div>
                )}
                {resumo.cashback > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-body-sm text-muted">
                      <Wallet className="h-4 w-4 shrink-0" aria-hidden />
                      Recebeu de volta
                    </dt>
                    <dd className="text-body-sm font-semibold tabular-nums text-ink">
                      {formatBRL(resumo.cashback)}
                    </dd>
                  </div>
                )}
                {/* O gasto não sai da tela quando a economia assume o destaque: some
                  com ele e o card passa a contar só metade do ano. */}
                {resumo.saved > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-body-sm text-muted">
                      <CalendarDot className="h-4 w-4 shrink-0" aria-hidden />
                      Você gastou
                    </dt>
                    <dd className="text-body-sm font-semibold tabular-nums text-ink">
                      {formatBRL(resumo.spent)}
                    </dd>
                  </div>
                )}
                {resumo.topDestination && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-body-sm text-muted">
                      <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                      Destino favorito
                    </dt>
                    <dd className="text-body-sm font-semibold text-ink">{resumo.topDestination}</dd>
                  </div>
                )}
              </dl>
            )}
          </AccountCard>

          {last.data && (
            <AccountCard title="Repetir reserva">
              <p className="text-title-md text-ink">
                {parkingTitle(last.data.companyName, last.data.locationName)}
              </p>
              {last.data.parkingTypeName && (
                <p className="mt-1 text-body-sm text-muted">{last.data.parkingTypeName}</p>
              )}
              {last.data.vehicleLabel && (
                <p className="mt-0.5 text-body-sm text-muted">{last.data.vehicleLabel}</p>
              )}
              {last.data.listingUrl && (
                <Button asChild variant="secondary" size="sm" className="mt-4 w-full">
                  <Link to={last.data.listingUrl}>
                    <ArrowCounterClockwise className="h-4 w-4" />
                    Repetir última reserva
                  </Link>
                </Button>
              )}
            </AccountCard>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A reserva em foco. O design põe três botões aqui (ver voucher, alterar datas,
 * trocar veículo), mas os três levariam ao mesmo lugar: as regras de quem pode
 * alterar o quê (tarifa, benefício, pago vs pendente) moram no detalhe da reserva, e
 * duplicar esse gate aqui criaria dois lugares pra divergir. Então ficam dois botões
 * honestos, e o detalhe continua dono das alterações.
 */
function FocusCard({ booking, detailBase }: { booking: MyBookingListItem; detailBase: string }) {
  const emUso = bucketBooking(booking) === "active";
  const noites = nightsOf(booking);

  return (
    <section className="bg-brand-mesh rounded-lg p-5 text-white desktop:p-7">
      <span className="text-caption text-white/60">
        {emUso ? "Reserva em uso" : "Próxima reserva"}
      </span>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h2 className="text-display-sm text-white">
            {parkingTitle(booking.location.company.name, booking.location.name)}
          </h2>
          {booking.location.address && (
            <p className="mt-1 text-body-sm text-white/75">{booking.location.address}</p>
          )}
          <p className="mt-0.5 text-body-sm text-white/75">
            {[booking.parking_type?.name, `${noites} ${noites === 1 ? "diária" : "diárias"}`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <dt className="text-caption text-white/55">Check-in</dt>
            <dd className="mt-0.5 whitespace-nowrap text-body-md font-semibold tabular-nums text-white">
              {formatDayTime(booking.check_in_at)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-white/55">Check-out</dt>
            <dd className="mt-0.5 whitespace-nowrap text-body-md font-semibold tabular-nums text-white">
              {formatDayTime(booking.check_out_at)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-white/55">Total pago</dt>
            <dd className="mt-0.5 whitespace-nowrap text-body-md font-semibold tabular-nums text-white">
              {formatBRL(booking.total_amount)}
            </dd>
          </div>
        </dl>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          to={`${detailBase}/${booking.code}`}
          className="inline-flex h-10 items-center rounded-full bg-white px-4 text-caption font-semibold text-mp-navy no-underline transition-colors hover:bg-white/90"
        >
          Ver voucher
        </Link>
        <Link
          to={`${detailBase}/${booking.code}`}
          className="inline-flex h-10 items-center rounded-full bg-white/15 px-4 text-caption font-semibold text-white no-underline transition-colors hover:bg-white/25"
        >
          Alterar reserva
        </Link>
      </div>
    </section>
  );
}

/** Linha do histórico: data em bloco tingida pelo status, local, valor e selo. */
function HistoryRow({ booking, detailBase }: { booking: MyBookingListItem; detailBase: string }) {
  const d = new Date(booking.check_in_at);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const noites = nightsOf(booking);
  // O bloco de data carrega a cor do status: numa lista longa, o selo sozinho no
  // canto direito não diferencia nada, e a página inteira lê como um bloco só.
  const tom = BOOKING_TONE_SURFACE[BOOKING_STATUS_TONES[booking.status]];

  return (
    <li>
      <Link
        to={`${detailBase}/${booking.code}`}
        className="flex flex-wrap items-center gap-4 rounded-md p-3 no-underline transition-colors hover:bg-surface-soft"
      >
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md",
            tom,
          )}
        >
          <span className="text-body-sm font-bold tabular-nums leading-none">{dia}</span>
          <span className="mt-0.5 text-caption-sm leading-none opacity-80">{mes}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-md font-medium text-ink">
            {parkingTitle(booking.location.company.name, booking.location.name)}
          </span>
          <span className="mt-0.5 block truncate text-caption-sm text-muted">
            {[`${noites} ${noites === 1 ? "diária" : "diárias"}`, booking.parking_type?.name]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-body-md font-semibold tabular-nums text-ink">
            {formatBRL(booking.total_amount)}
          </span>
          <StatusBadge status={booking.status} />
        </span>
      </Link>
    </li>
  );
}

/** Paginador do histórico. Some quando tudo cabe numa página só. */
function Paginator({
  page,
  onChange,
}: {
  page: { page: number; pages: number; total: number; from: number; to: number };
  onChange: (p: number) => void;
}) {
  if (page.pages <= 1) return null;

  return (
    <nav
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4"
      aria-label="Páginas do histórico"
    >
      <p className="text-caption-sm text-muted">
        {page.from} a {page.to} de {page.total} reservas
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page.page - 1)}
          disabled={page.page <= 1}
          aria-label="Página anterior"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-ink transition-colors hover:bg-surface-strong disabled:opacity-40 disabled:hover:bg-surface-soft"
        >
          <CaretLeft className="h-4 w-4" aria-hidden />
        </button>
        <span className="text-caption-sm tabular-nums text-muted">
          {page.page} de {page.pages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page.page + 1)}
          disabled={page.page >= page.pages}
          aria-label="Próxima página"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-soft text-ink transition-colors hover:bg-surface-strong disabled:opacity-40 disabled:hover:bg-surface-soft"
        >
          <CaretRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
