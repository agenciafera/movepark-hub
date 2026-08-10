import * as React from "react";
import { Alarm, Warning } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type Props = {
  expiresAt: string | null;
  onExpire?: () => void;
};

/** Minutos restantes a partir dos quais a barra troca de tom. */
const URGENTE_EM_MIN = 5;

function diffSeconds(target: Date): number {
  return Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000));
}

function mmss(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Contador do hold da reserva.
 *
 * A barra é forte de propósito: o prazo é real (passou, o cron cancela a reserva e
 * a vaga volta pra fila), e no desenho anterior ele era uma tarja clara com texto
 * de 14px que o cliente atravessava sem ver. Aqui o número é o elemento maior da
 * faixa, como num contador de oferta de e-commerce.
 *
 * Nos últimos minutos o gradiente esquenta e o rótulo muda. A pressão sobe porque
 * o risco subiu, não pra apressar a compra: quando não há prazo (`expiresAt` nulo,
 * reserva já paga) a barra não existe.
 */
export function Countdown({ expiresAt, onExpire }: Props) {
  const target = React.useMemo(() => (expiresAt ? new Date(expiresAt) : null), [expiresAt]);
  const [secs, setSecs] = React.useState(() => (target ? diffSeconds(target) : 0));

  React.useEffect(() => {
    if (!target) return;
    const id = setInterval(() => {
      const next = diffSeconds(target);
      setSecs(next);
      if (next === 0) {
        clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onExpire]);

  if (!target) return null;

  const expired = secs === 0;
  const urgente = !expired && secs < URGENTE_EM_MIN * 60;

  /**
   * O que o leitor de tela ouve. O número não entra aqui: `role="timer"` nasce com
   * `aria-live="off"`, e antes um `aria-live="polite"` no rótulo inteiro fazia o
   * leitor anunciar a contagem a cada segundo. Só os dois marcos são falados.
   */
  const aviso = expired
    ? "Sua reserva expirou."
    : urgente
      ? `Menos de ${URGENTE_EM_MIN} minutos para concluir a reserva.`
      : "";

  if (expired) {
    return (
      <div
        role="timer"
        className="sticky top-16 z-30 flex items-center justify-center gap-2 border-b border-hairline bg-badge-cancelled-bg px-4 py-3 text-body-sm text-error desktop:px-8"
      >
        <Warning className="h-4 w-4 shrink-0" aria-hidden />
        <span>Sua reserva expirou</span>
        <span className="sr-only" aria-live="polite">
          {aviso}
        </span>
      </div>
    );
  }

  return (
    <div
      role="timer"
      className={cn(
        "sticky top-16 z-30 py-2.5 text-white",
        // Violeta pro vermelho da marca. Nos últimos minutos, só vermelho.
        urgente
          ? "bg-gradient-to-r from-mp-red to-mp-red-deep"
          : "bg-gradient-to-r from-mp-primary to-mp-red",
      )}
    >
      {/* O fundo sangra a tela inteira, mas o conteúdo segue o container da
          página: sem isso o rótulo e o número grudam nas bordas do monitor,
          longe da régua de passos logo abaixo. */}
      <div className="mx-auto flex w-full max-w-[1080px] items-center gap-3 px-4 desktop:px-8">
        <Alarm
          className={cn("h-6 w-6 shrink-0", urgente && "animate-pulse motion-reduce:animate-none")}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase leading-tight tracking-[0.4px]">
            {urgente ? "Últimos minutos" : "Vaga reservada"}
          </p>
          <p className="text-caption-sm leading-tight text-white/85">Termina em</p>
        </div>

        <span className="shrink-0 text-display-md tabular-nums">{mmss(secs)}</span>

        <span className="sr-only" aria-live="polite">
          {aviso}
        </span>
      </div>
    </div>
  );
}
