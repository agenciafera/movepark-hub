import { DownloadSimple, WhatsappLogo } from "@phosphor-icons/react";
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
 * **É crédito de parceiro, e o tamanho segue isso.** Até 19/08/2026 a sinalização eram duas peças
 * grandes: um bloco navy inteiro na página (título, três micro-benefícios) e uma pílula navy de
 * duas linhas no card. Ocupavam espaço de oferta para dizer quem opera a van, e nem levavam ao
 * site da Go2Park. Agora são três peças de uma linha: a pílula sobre a foto (promessa), o crédito
 * na meta do card e o crédito da página (atribuição), com a marca sempre clicável.
 *
 * A marca não aparece na pílula de propósito: sobre a foto ela competiria com o nome do
 * estacionamento, que é o que o cliente está procurando. A atribuição vive no texto.
 */

/** Site da Go2Park. A marca é sempre clicável: é crédito de parceiro, não enfeite. */
export const GO2PARK_URL = "https://go2park.com.br/";
/** Nome do produto. Uma palavra, `G` e `P` maiúsculos (a marca escreve GO2PARK; aqui segue o
 *  padrão de exibição do Hub, que já usa "Go2Park" no cross-sell do onboarding). */
export const GO2PARK_NAME = "Go2Park";

export const GO2PARK_COPY = {
  badge: "Transfer ao vivo",
  /** Crédito na meta do card. A marca é o link. */
  cardCredit: "Transfer por",
  /** Primeira linha do crédito da página. A marca é o link. */
  pageCredit: "Transfer ao vivo, operado pela",
  /** Segunda linha: consolida os três micro-benefícios que o bloco navy listava. */
  pageCreditBody: "Você acompanha a van no mapa pelo celular, sem baixar app.",
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
 * Link da marca. Dentro do card ele mora num `<Link>` que cobre o cartão inteiro, então o clique
 * precisa parar aqui: sem o `stopPropagation` o toque no nome da Go2Park navegaria para a unidade
 * em vez de abrir o site do parceiro.
 */
function Go2ParkLink({ className }: { className?: string }) {
  return (
    <a
      href={GO2PARK_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className}
    >
      {GO2PARK_NAME}
    </a>
  );
}

/**
 * Pílula sobre a foto do card: a promessa em uma linha.
 *
 * Entra no mesmo canto dos selos comparativos ("Mais barato"/"Mais perto") e divide a fila com
 * eles, porque é a mesma natureza de informação: o que separa esta unidade das vizinhas.
 *
 * `pointer-events-none` porque o card inteiro já é um link, e uma pílula estática no meio dele só
 * criaria um buraco no alvo de toque.
 */
export function Go2ParkLivePill({ className }: { className?: string }) {
  return (
    <span
      data-testid="go2park-pill"
      className={cn(
        "pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-mp-navy/[0.86] px-2.5 py-1 text-[11.5px] font-bold tracking-[0.2px] text-white backdrop-blur-sm",
        className,
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mp-teal" aria-hidden />
      {GO2PARK_COPY.badge}
    </span>
  );
}

/**
 * Crédito na meta do card, logo abaixo da nota. Uma linha, tom de metadado, sem competir com o
 * preço nem com o nome da unidade. O sublinhado só aparece no hover, quando a intenção de clicar
 * já existe.
 */
export function Go2ParkCardCredit({ className }: { className?: string }) {
  return (
    <p data-testid="go2park-card-credit" className={cn("text-body-sm text-muted", className)}>
      {GO2PARK_COPY.cardCredit}{" "}
      <Go2ParkLink className="no-underline transition-colors duration-150 hover:text-mp-indigo hover:underline" />
    </p>
  );
}

/**
 * Crédito da página da unidade, dentro de "Como chegar".
 *
 * Duas hairlines e nada mais: sem fundo, sem raio, sem card. O bloco navy que morava aqui parava o
 * olho como se fosse oferta, e o que ele diz é quem opera a van. A régua horizontal separa sem
 * disputar.
 *
 * O ponto verde é o único uso desta cor no sistema, e é o que carrega o "ao vivo" sem animação: o
 * DS não usa motion decorativo, e o verde já comunica sozinho.
 */
export function Go2ParkPageCredit({ className }: { className?: string }) {
  return (
    <div
      data-testid="go2park-credit"
      className={cn("flex items-start gap-3 border-y border-hairline py-3.5", className)}
    >
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#2FBF71]" aria-hidden />
      <div>
        <p className="text-[14.5px] font-bold text-ink">
          {GO2PARK_COPY.pageCredit}{" "}
          <a
            href={GO2PARK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-mp-indigo underline underline-offset-2 transition-colors hover:text-error"
          >
            {GO2PARK_NAME}
          </a>
        </p>
        <p className="max-w-[52ch] text-[13.5px] leading-relaxed text-muted">
          {GO2PARK_COPY.pageCreditBody}
        </p>
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
  className,
  whatsapp,
  companyName,
  locationName,
}: {
  className?: string;
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
    <div data-testid="go2park-cta" className={cn("space-y-3", className)}>
      <div className="space-y-1">
        <p className="text-body-sm font-semibold text-ink">{GO2PARK_COPY.ctaTitle}</p>
        <p className="text-caption text-muted">{GO2PARK_COPY.ctaBody}</p>
      </div>
      <div className="flex flex-col gap-2 tablet:flex-row">
        <button
          type="button"
          onClick={salvarContato}
          className="inline-flex items-center justify-center gap-2 rounded-sm border border-hairline bg-surface-strong px-4 py-2.5 text-body-sm font-semibold text-ink transition-colors hover:brightness-95"
        >
          <DownloadSimple className="h-4 w-4" aria-hidden />
          {GO2PARK_COPY.ctaSave}
        </button>
        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-sm border border-hairline px-4 py-2.5 text-body-sm font-medium text-ink no-underline transition-colors hover:bg-surface-soft"
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
 * Contato da van, na página da unidade.
 *
 * Sobreviveu à saída do bloco navy de propósito. Ele não estava na entrega de design porque hoje
 * **nenhuma** das três unidades tem `go2park_whatsapp` preenchido, então o botão nunca chegou a
 * aparecer numa tela: quem desenhou não tinha como saber que existia. O número é campo do Manager
 * (`LocationPlatformDialog`), e no dia em que alguém preencher, isto volta a valer sozinho.
 *
 * Fora do navy e sem título próprio, para não reconstruir o bloco que acabou de sair: é uma ação
 * discreta logo abaixo do crédito, e só existe com número.
 */
export function Go2ParkVanContact({
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
  if (!whatsapp || !companyName) return null;
  return (
    <VanContactCta
      className={className}
      whatsapp={whatsapp}
      companyName={companyName}
      locationName={locationName ?? companyName}
    />
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
