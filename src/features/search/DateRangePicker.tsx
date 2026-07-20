import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  TIME_SLOTS,
  dayAriaLabel,
  disabledDays,
  fmtTime,
  isTimeSlotPast,
  mergeRange,
  nextRange,
  pickerPhase,
  previewRange,
  setTime,
} from "./DateRangePicker.logic";

type Props = {
  from: Date | null;
  to: Date | null;
  onChange: (from: Date | null, to: Date | null) => void;
  triggerClassName?: string;
};

const startOfToday = () => new Date(new Date().toDateString());

/**
 * A faixa do período cobre também as células da entrada e da saída, arredondada no
 * lado de fora, pra leitura ser de um bloco contínuo com as pontas dentro dele. O
 * círculo da ponta é desenhado **por dentro** da célula (no `DayContent`), acima da
 * faixa.
 *
 * A faixa é um `::before` em `z-0` e o círculo sobe pra `z-10`. Uma tentativa
 * anterior usou `-z-10` no `::before`, e aí a faixa era pintada atrás do fundo
 * branco do popover: sumia justamente nas pontas.
 *
 * Cada utilitária aparece escrita por extenso: o JIT do Tailwind varre o fonte em
 * busca do nome completo. Juntar strings prontas como aqui é seguro; o que quebraria
 * é montar o nome por pedaço (`before:bg-${tom}`), que ele não consegue ler.
 */
const BAND = "relative !bg-transparent before:absolute before:inset-0 before:z-0 before:content-['']";
/** Faixa do intervalo confirmado (azul da marca). */
const BAND_START_PALE = `${BAND} before:rounded-l-full before:bg-mp-pale`;
const BAND_END_PALE = `${BAND} before:rounded-r-full before:bg-mp-pale`;
/** Faixa da prévia sob o cursor (cinza neutro). */
const BAND_START_SOFT = `${BAND} before:rounded-l-full before:bg-surface-soft`;
const BAND_END_SOFT = `${BAND} before:rounded-r-full before:bg-surface-soft`;
/** Célula da ponta sem faixa (entrada sozinha): só o círculo, sem fundo no botão. */
const CAP_ONLY = "relative !bg-transparent";
/** O círculo em si, desenhado dentro da célula e acima da faixa. */
const CIRCLE = "relative z-10 flex h-10 w-10 items-center justify-center rounded-full";

/**
 * Seletor de datas em intervalo (range) da busca. Mantém os dois campos (Check-in / Check-out)
 * mas com UM calendário `mode="range"`: após escolher o check-in, o próximo clique já é o
 * check-out (comportamento nativo do react-day-picker), com o intervalo destacado. Os horários
 * de cada ponta são editáveis abaixo do calendário.
 */
export function DateRangePicker({ from, to, onChange, triggerClassName }: Props) {
  const [open, setOpen] = React.useState(false);
  const [hovered, setHovered] = React.useState<Date | null>(null);
  const range: DateRange | undefined = from ? { from, to: to ?? undefined } : undefined;
  const phase = pickerPhase(from, to);
  const preview = previewRange(from, to, hovered);
  const previewing = preview.end !== null;

  /**
   * A seleção é nossa, não do react-day-picker: `onDayClick` em vez de `onSelect`.
   * O padrão da lib reinterpretava o clique em silêncio (clicar na própria entrada
   * apagava as duas pontas; clicar antes dela trocava entrada e saída de lugar).
   * Agora a regra é uma só, e o que seria inválido nem fica clicável.
   */
  function handleDayClick(day: Date, mods: { disabled?: boolean }) {
    if (mods.disabled) return;
    setHovered(null);
    const merged = mergeRange({ from, to }, nextRange({ from, to }, day));
    onChange(merged.from, merged.to);
  }

  const cellBase =
    "flex h-full w-full flex-col items-start justify-center gap-0.5 rounded-full px-6 text-left transition-colors hover:bg-surface-soft";
  const value = (d: Date | null) =>
    d ? format(d, "dd MMM · HH:mm", { locale: ptBR }) : "Adicionar data";

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // O mouse sai do calendário sem passar por onDayMouseLeave quando o popover
        // fecha; sem isto a prévia reaparece congelada na próxima abertura.
        if (!next) setHovered(null);
        setOpen(next);
      }}
    >
      <PopoverAnchor asChild>
        {/* h-full (tablet+) pra o bloco preencher a altura do pill e os campos ficarem
            verticalmente centralizados, alinhados com "Onde" e "Veículo". */}
        <div className="flex w-full flex-col tablet:h-full tablet:flex-row">
          {/* Divisória no wrapper (linha reta, full-height) — não no botão, senão o
              rounded-full curva a borda e cria um "entalhe" entre os dois campos. */}
          <div className="min-w-0 flex-1 border-b border-hairline tablet:border-b-0 tablet:border-r">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(cellBase, triggerClassName)}
            >
              <span className="text-caption font-medium text-ink">Check-in</span>
              <span className="line-clamp-1 text-body-sm text-muted">{value(from)}</span>
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className={cn(cellBase, triggerClassName)}
            >
              <span className="text-caption font-medium text-ink">Check-out</span>
              {/* Com a entrada escolhida e a saída em aberto, o campo diz o próximo
                  passo em vez de repetir o placeholder neutro dos dois lados. */}
              <span
                className={cn(
                  "line-clamp-1 text-body-sm",
                  phase === "checkout" && !to ? "font-medium text-ink" : "text-muted",
                )}
              >
                {phase === "checkout" && !to ? "Escolha a saída" : value(to)}
              </span>
            </button>
          </div>
        </div>
      </PopoverAnchor>

      {/* Sempre abre pra baixo (não flipa pra cima): side=bottom + avoidCollisions=false. */}
      <PopoverContent align="start" side="bottom" avoidCollisions={false} className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          onDayClick={handleDayClick}
          disabled={disabledDays(from, to)}
          defaultMonth={from ?? startOfToday()}
          onDayMouseEnter={(day, mods) => setHovered(mods.disabled ? null : day)}
          onDayMouseLeave={() => setHovered(null)}
          // Prévia do intervalo sob o cursor. Fica mais clara que o intervalo confirmado
          // (miolo tracejado, ponta só contornada) pra não passar por escolha já feita.
          modifiers={{
            ...(preview.middle ? { preview_middle: preview.middle } : {}),
            ...(preview.end ? { preview_end: preview.end } : {}),
          }}
          // Cinza neutro na prévia, azul da marca só no intervalo confirmado: o olho
          // separa "seria isto" de "é isto" sem precisar de legenda. A ponta sob o
          // cursor fica só contornada, porque ainda não é escolha.
          modifiersClassNames={{
            preview_middle: "!rounded-none !bg-surface-soft !text-ink",
            preview_end: cn(BAND_END_SOFT, "!text-ink"),
          }}
          // A faixa engloba as pontas; o círculo vem por dentro, no DayContent. Sem
          // saída o react-day-picker marca o mesmo dia como início E fim, por isso as
          // duas classes andam juntas.
          classNames={{
            day_range_start: to
              ? BAND_START_PALE
              : previewing
                ? BAND_START_SOFT
                : CAP_ONLY,
            day_range_end: to ? BAND_END_PALE : previewing ? BAND_START_SOFT : CAP_ONLY,
          }}
          components={{
            // `labels.labelDay` existe nos defaults do react-day-picker 8.10 mas não é
            // usado no render, então o rótulo vai por aqui: número visível pro olho,
            // frase completa pro leitor de tela. O círculo da ponta também mora aqui,
            // pra ficar acima da faixa em vez de disputar com ela.
            DayContent: ({ date, activeModifiers }) => {
              const mods = activeModifiers as {
                range_start?: boolean;
                range_end?: boolean;
                preview_end?: boolean;
              };
              const escolhida = mods.range_start || mods.range_end;
              return (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      CIRCLE,
                      escolhida && "bg-mp-primary font-medium text-white",
                      // Sob o cursor a ponta é só contorno: ainda não é escolha.
                      !escolhida &&
                        mods.preview_end &&
                        "bg-canvas text-ink ring-1 ring-inset ring-mp-primary",
                    )}
                  >
                    {date.getDate()}
                  </span>
                  <span className="sr-only">{dayAriaLabel(date, activeModifiers, phase)}</span>
                </>
              );
            },
          }}
        />
        <div className="flex items-end gap-3 border-t border-hairline p-4">
          <div className="flex-1">
            <Label className="mb-2 block">Check-in</Label>
            <Select
              value={fmtTime(from, "08:00")}
              onValueChange={(t) => from && onChange(setTime(from, t), to)}
              disabled={!from}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t} disabled={!!from && isTimeSlotPast(from, t)}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label className="mb-2 block">Check-out</Label>
            <Select
              value={fmtTime(to, "18:00")}
              onValueChange={(t) => to && onChange(from, setTime(to, t))}
              disabled={!to}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIME_SLOTS.map((t) => (
                  <SelectItem key={t} value={t} disabled={!!to && isTimeSlotPast(to, t)}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {/* "Limpar datas" é a saída explícita do estado. Antes o jeito de zerar era
            clicar de novo na entrada, que apagava tudo por acidente e sem avisar. */}
        <div className="flex items-center justify-between border-t border-hairline p-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null, null)}
            disabled={!from && !to}
          >
            Limpar datas
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)} disabled={!from || !to}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
