import { BellRinging, Broadcast, DeviceMobile, DownloadSimple, Van, WhatsappLogo } from "@phosphor-icons/react";
import type { ComponentType } from "react";
import type { IconProps } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { whatsappHref } from "@/features/guarantee/whatsapp";
import { buildVanVCard, vanVCardFilename } from "./vcard";

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
  ctaTitle: "Salve o contato da van agora",
  ctaBody: "No dia da viagem você já chega com o número na agenda, sem procurar esta página.",
  ctaSave: "Salvar o contato da van",
  ctaWhatsapp: "Abrir no WhatsApp",
  /** Mensagem que abre a conversa. Curta: quem manda isso está com mala na mão. */
  whatsappMessage: "Oi! Cheguei no estacionamento e preciso da van.",
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
 * Chamada para salvar o contato da van na agenda.
 *
 * O download do `.vcf` é montado no clique (Blob), e não num `href` fixo: `data:` URI com
 * `download` é justamente o que o Safari do iPhone trata mal, e iPhone no aeroporto é o caso
 * principal. O link do WhatsApp continua sendo âncora comum, então quem está sem JS (ou lendo o
 * HTML do build) ainda tem um caminho.
 */
function VanContactCta({
  whatsapp,
  companyName,
  locationName,
}: {
  whatsapp: string;
  companyName: string;
  locationName: string;
}) {
  const href = whatsappHref(whatsapp, GO2PARK_COPY.whatsappMessage);

  function salvarContato() {
    const vcard = buildVanVCard({ companyName, locationName, phone: whatsapp });
    const url = URL.createObjectURL(new Blob([vcard], { type: "text/vcard;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = vanVCardFilename({ companyName, locationName });
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Solta o Blob no próximo tick: revogar na mesma linha cancela o download no Safari.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <div data-testid="go2park-cta" className="space-y-3 rounded-xl bg-white/5 p-4">
      <div className="space-y-1">
        <p className="text-body-sm font-semibold text-white">{GO2PARK_COPY.ctaTitle}</p>
        <p className="text-caption text-white/70">{GO2PARK_COPY.ctaBody}</p>
      </div>
      <div className="flex flex-col gap-2 tablet:flex-row">
        <button
          type="button"
          onClick={salvarContato}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2.5 text-body-sm font-semibold text-mp-navy transition-transform hover:scale-[1.02] motion-reduce:transform-none"
        >
          <DownloadSimple className="h-4 w-4" aria-hidden />
          {GO2PARK_COPY.ctaSave}
        </button>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-4 py-2.5 text-body-sm font-medium text-white hover:bg-white/10"
          >
            <WhatsappLogo className="h-4 w-4" aria-hidden />
            {GO2PARK_COPY.ctaWhatsapp}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Bloco da página da unidade, dentro de "Como chegar" (é ali que o cliente decide como sai do
 * carro e chega ao terminal). Painel escuro pelo mesmo motivo do card: a página é branca, e o
 * diferencial precisa parar o olho no meio dela.
 *
 * O CTA de contato só existe com número preenchido. Cada unidade tem o seu, configurado no painel
 * da Go2Park e copiado para `location.go2park_whatsapp`; sem ele o bloco explica o serviço e para
 * por aí, porque mandar o cliente para o número errado no momento do desembarque é pior do que
 * não oferecer botão nenhum.
 */
export function Go2ParkLiveBlock({
  className,
  whatsapp,
  companyName,
  locationName,
}: {
  className?: string;
  whatsapp?: string | null;
  companyName?: string | null;
  locationName?: string | null;
}) {
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

        {whatsapp && companyName && (
          <VanContactCta
            whatsapp={whatsapp}
            companyName={companyName}
            locationName={locationName ?? companyName}
          />
        )}
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
