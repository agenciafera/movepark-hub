import * as React from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { SignIn, SignOut } from "@phosphor-icons/react";
import { Panel } from "@/components/shared/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { BOOKING_STATUS_LABELS } from "@/components/shared/StatusBadge";
import { bookingCustomerName } from "@/features/bookings/bookings.logic";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/format";
import type { BookingWithRelations } from "@/types/domain";
import { useDayAgenda, todayIsoDate } from "./api";
import {
  agendaFocusHour,
  agendaItems,
  agendaStrip,
  groupAgendaByHour,
  type AgendaItem,
  type AgendaKind,
} from "./operatorInsights.logic";

type Filtro = "all" | AgendaKind;

/**
 * Agenda do dia do painel do parceiro (redesenho de 11/11/2026). O que mudou e por quê:
 * - só reserva que vai acontecer no pátio (sem pendente, expirada nem cancelada);
 * - chegada e saída são eventos separados, cada um no seu horário (a saída aparecia no horário
 *   da chegada, com o rótulo errado);
 * - só as horas que têm evento: a grade de hora em hora, vazia, era o scroll comprido;
 * - hoje, a lista abre rolada na próxima hora, que é o que o balcão quer ver;
 * - filtro de chegadas e saídas nos próprios contadores, e cada linha abre a reserva.
 */
export function DayAgendaPanel({ locationIds }: { locationIds?: string[] }) {
  const [date, setDate] = React.useState(todayIsoDate);
  const [filtro, setFiltro] = React.useState<Filtro>("all");
  const agenda = useDayAgenda(date, locationIds);

  const items = React.useMemo(() => agendaItems(agenda.data ?? [], date), [agenda.data, date]);
  const arrivals = items.filter((i) => i.kind === "arrival").length;
  const departures = items.length - arrivals;
  const shown = filtro === "all" ? items : items.filter((i) => i.kind === filtro);
  const groups = groupAgendaByHour(shown);
  const strip = agendaStrip(date);

  // Rola até a próxima hora ao abrir o dia (uma vez por dia escolhido, não a cada atualização de
  // minuto, para não arrancar a lista da mão de quem está rolando).
  const listRef = React.useRef<HTMLDivElement>(null);
  const rolouPara = React.useRef<string | null>(null);
  const hoursKey = groups.map((g) => g.hour).join(",");
  React.useEffect(() => {
    if (agenda.isLoading || rolouPara.current === `${date}|${filtro}`) return;
    rolouPara.current = `${date}|${filtro}`;
    const box = listRef.current;
    if (!box) return;
    const focus = agendaFocusHour(hoursKey ? hoursKey.split(",").map(Number) : [], date);
    const el = focus === null ? null : box.querySelector<HTMLElement>(`[data-hour="${focus}"]`);
    box.scrollTop = el ? el.offsetTop - box.offsetTop : 0;
  }, [agenda.isLoading, date, filtro, hoursKey]);

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-title-md text-ink">Agenda do dia</div>
          <p className="mt-1.5 text-body-sm capitalize text-muted">
            {format(new Date(`${date}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Mostrar">
          <FiltroChip active={filtro === "all"} onClick={() => setFiltro("all")}>
            Tudo
          </FiltroChip>
          <FiltroChip active={filtro === "arrival"} onClick={() => setFiltro("arrival")}>
            {arrivals} {arrivals === 1 ? "chegada" : "chegadas"}
          </FiltroChip>
          <FiltroChip active={filtro === "departure"} onClick={() => setFiltro("departure")}>
            {departures} {departures === 1 ? "saída" : "saídas"}
          </FiltroChip>
        </div>
      </div>

      <div className="mt-5 flex gap-1.5">
        {strip.map((iso) => {
          const day = new Date(`${iso}T12:00:00`);
          const active = iso === date;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setDate(iso)}
              aria-pressed={active}
              className={cn(
                "min-w-0 flex-1 rounded-md py-2.5 transition-colors",
                active
                  ? "bg-mp-primary text-white"
                  : "bg-surface-soft text-ink hover:bg-surface-strong",
              )}
            >
              <span className="block text-caption-sm font-medium opacity-70">
                {format(day, "EEEEEE", { locale: ptBR })}
              </span>
              <span className="mt-0.5 block text-body-sm font-bold tabular-nums">
                {format(day, "dd")}
              </span>
            </button>
          );
        })}
      </div>

      <div
        ref={listRef}
        className="relative mt-4 max-h-[360px] overflow-y-auto"
        data-testid="agenda-lista"
      >
        {agenda.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            title={
              filtro === "arrival"
                ? "Nenhuma chegada nesse dia"
                : filtro === "departure"
                  ? "Nenhuma saída nesse dia"
                  : "Nenhuma reserva nesse dia"
            }
            description="Escolha outro dia acima."
          />
        ) : (
          <ol>
            {groups.map((g) => (
              <li key={g.hour} data-hour={g.hour}>
                <div className="sticky top-0 z-10 flex items-center gap-2 bg-canvas py-1.5 text-caption-sm font-bold text-muted-soft">
                  <span className="tabular-nums">{String(g.hour).padStart(2, "0")}:00</span>
                  <span className="h-px flex-1 bg-hairline" aria-hidden />
                </div>
                <ul className="flex flex-col gap-1.5 pb-2">
                  {g.items.map((it) => (
                    <AgendaRow key={it.key} item={it} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      {items.length > 0 && (
        <div className="mt-3 border-t border-hairline pt-3 text-right">
          <Link
            to={`/operator/bookings?de=${date}&ate=${date}`}
            className="text-body-sm font-medium text-mp-indigo hover:underline"
          >
            Ver chegadas do dia na lista
          </Link>
        </div>
      )}
    </Panel>
  );
}

function FiltroChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "whitespace-nowrap rounded-full px-3 py-1.5 text-caption font-bold tabular-nums transition-colors",
        active ? "bg-mp-pale text-mp-indigo" : "bg-surface-soft text-muted hover:bg-surface-strong",
      )}
    >
      {children}
    </button>
  );
}

function AgendaRow({ item }: { item: AgendaItem<BookingWithRelations> }) {
  const b = item.booking;
  const chegada = item.kind === "arrival";
  const Icon = chegada ? SignIn : SignOut;
  const placa = b.vehicle?.license_plate;
  return (
    <li>
      <Link
        to={`/operator/bookings/${b.code}`}
        className="flex items-center gap-3 rounded-md bg-canvas px-3 py-2.5 ring-1 ring-inset ring-hairline transition-colors hover:bg-surface-soft"
      >
        <span className="w-11 shrink-0 text-body-sm font-bold tabular-nums text-ink">
          {formatTime(item.at)}
        </span>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            chegada ? "bg-mp-pale text-mp-indigo" : "bg-surface-soft text-muted",
          )}
          title={chegada ? "Chegada" : "Saída"}
        >
          <Icon size={16} aria-hidden />
          <span className="sr-only">{chegada ? "Chegada" : "Saída"}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium text-ink">
            {bookingCustomerName(b) ?? "Sem nome"}
          </span>
          <span className="block truncate text-caption text-muted">
            <span className="font-mono">{b.code}</span>
            {placa && <span className="font-mono"> · {placa}</span>}
            {b.location?.name && ` · ${b.location.name}`}
          </span>
        </span>
        <span className="hidden shrink-0 rounded-full bg-surface-soft px-2.5 py-1 text-caption-sm font-bold text-muted tablet:inline">
          {BOOKING_STATUS_LABELS[b.status] ?? b.status}
        </span>
      </Link>
    </li>
  );
}
