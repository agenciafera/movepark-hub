import { BellRinging, Broadcast, DeviceMobile, Van } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Go2Park: transfer com rastreio ao vivo.
 *
 * A Go2Park é o produto irmão da Movepark que rastreia a van de transfer em tempo real. Onde a
 * unidade tem o contrato (`location.go2park_enabled`), o passageiro acompanha a van no mapa pelo
 * celular, sem baixar app. Hoje são três unidades, e nenhum vizinho de aeroporto oferece o
 * mesmo, então este é O diferencial comparativo delas na vitrine.
 *
 * **É fato da unidade, não promessa de transação (ADR-009).** A van tem rastreio independentemente
 * de onde a reserva fecha, e as três unidades com contrato hoje são justamente `checkout_mode =
 * 'external'`: passar isto por `getLocationCapabilities` apagaria o bloco de quem o tem. Por isso
 * o componente não consulta capacidade, do mesmo jeito que endereço, foto e shuttle não consultam.
 *
 * Dois formatos, uma voz: a faixa do card (`Go2ParkLiveBadge`) e o bloco da página da unidade
 * (`Go2ParkLiveBlock`).
 */
type Icon = ComponentType<IconProps>;

/** Nome do produto. Uma palavra, `G` e `P` maiúsculos (a marca escreve GO2PARK; aqui segue o
 *  padrão de exibição do Hub, que já usa "Go2Park" no cross-sell do onboarding). */
export const GO2PARK_NAME = "Go2Park";

export const GO2PARK_COPY = {
  badge: "Transfer ao vivo",
  badgeSub: "Acompanhe a van pelo celular",
  blockTitle: "Acompanhe a van ao vivo",
  blockBody:
    "O transfer daqui roda com a Go2Park. Você vê a van andando no mapa pelo celular e sabe quanto falta para ela chegar. Sem baixar app e sem criar conta.",
  points: [
    { icon: Van as Icon, text: "A van no mapa, em tempo real" },
    { icon: BellRinging as Icon, text: "Aviso quando ela está chegando" },
    { icon: DeviceMobile as Icon, text: "Abre no navegador, sem instalar nada" },
  ],
} as const;

/**
 * Ponto pulsante de "ao vivo". `motion-reduce` desliga a animação (o ponto continua lá, então o
 * sinal não depende do movimento).
 */
function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex h-2 w-2 shrink-0", className)} aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mp-teal opacity-75 motion-reduce:hidden" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-mp-teal" />
    </span>
  );
}

/**
 * Faixa do card de estacionamento (busca, home e página de destino). Fundo navy no meio de um
 * card branco: destaca sem brigar com os selos violeta de "Mais barato"/"Mais perto", que moram
 * sobre a imagem. Duas linhas porque em 375px a frase inteira não cabe em uma.
 */
export function Go2ParkLiveBadge({ className }: { className?: string }) {
  return (
    <div
      data-testid="go2park-badge"
      className={cn(
        "flex items-center gap-2.5 rounded-xl bg-mp-navy px-3 py-2 text-white",
        className,
      )}
    >
      <LiveDot />
      <div className="min-w-0 leading-tight">
        <p className="text-[12px] font-semibold">
          {GO2PARK_COPY.badge}
          <span className="ml-1.5 font-normal text-white/60">{GO2PARK_NAME}</span>
        </p>
        <p className="truncate text-[11px] text-white/70">{GO2PARK_COPY.badgeSub}</p>
      </div>
    </div>
  );
}

/**
 * Bloco da página da unidade, dentro de "Como chegar" (é ali que o cliente decide como sai do
 * carro e chega ao terminal). Painel escuro pelo mesmo motivo do card: a página é branca, e o
 * diferencial precisa parar o olho no meio dela.
 */
export function Go2ParkLiveBlock({ className }: { className?: string }) {
  return (
    <section
      data-testid="go2park-block"
      aria-labelledby="go2park-title"
      className={cn("overflow-hidden rounded-2xl bg-mp-navy text-white", className)}
    >
      <div className="space-y-4 p-5 tablet:p-6">
        <div className="flex items-center gap-2">
          <LiveDot />
          <span className="text-caption font-semibold text-mp-teal">ao vivo</span>
          <span className="text-caption text-white/40">·</span>
          <span className="inline-flex items-center gap-1 text-caption font-medium text-white/70">
            <Broadcast className="h-3.5 w-3.5" aria-hidden />
            {GO2PARK_NAME}
          </span>
        </div>

        <div className="space-y-2">
          <h3 id="go2park-title" className="text-display-sm text-white">
            {GO2PARK_COPY.blockTitle}
          </h3>
          <p className="max-w-[52ch] text-body-md text-white/75">{GO2PARK_COPY.blockBody}</p>
        </div>

        <ul className="grid gap-3 tablet:grid-cols-3">
          {GO2PARK_COPY.points.map((p) => (
            <li key={p.text} className="flex items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
                <p.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-body-sm text-white/85">{p.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Chip enxuto pra linha de metadados da unidade, ao lado do tempo de transfer. */
export function Go2ParkLiveChip({ className }: { className?: string }) {
  return (
    <span
      data-testid="go2park-chip"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-mp-navy px-2.5 py-1 text-caption font-medium text-white",
        className,
      )}
    >
      <LiveDot />
      {GO2PARK_COPY.badge}
    </span>
  );
}
