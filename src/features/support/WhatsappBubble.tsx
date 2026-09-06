import { WhatsappMark } from "@/components/shared/SocialMarks";
import { WHATSAPP_SUPORTE } from "@/lib/suporte";

/**
 * Bolinha de WhatsApp do consumer, com a Mia.
 *
 * Ocupa o canto que era do assistente do site (`ChatWidget`), que saiu de cena
 * enquanto a equipe atende no WhatsApp. É um link, não um botão: abre a conversa
 * no app instalado ou no WhatsApp Web, e o visitante já chega com a mensagem
 * escrita, então a equipe sabe de onde veio o contato.
 *
 * O número mora só em `@/lib/suporte`, junto com o da página de contato e o do
 * rodapé dos e-mails. Não copie o número para cá.
 *
 * A distância do rodapé soma `--sticky-bar-space` (ver `index.css`), a altura
 * que a `ListingStickyBar` publica em runtime enquanto está montada: a bolinha
 * sobe pra não cobrir a barra de preço da página da unidade e desce sozinha
 * quando a barra some, sem depender de saber em qual página está.
 *
 * O glifo é a marca do WhatsApp (`WhatsappMark`), e não o `WhatsappLogo` do
 * Phosphor: aqui o desenho precisa ser reconhecido como o app, e não como a
 * interpretação do icon set. Mesma regra que já vale para as redes sociais. Ele
 * fica visível em toda largura, inclusive no celular, justamente porque é ele
 * que diz para onde o clique leva.
 *
 * A pílula é violeta, e não mais o verde do WhatsApp. O verde estava aqui para
 * fazer a bolinha ser lida como o app antes de qualquer rótulo, e esse trabalho
 * passou para duas coisas mais fortes: a marca do WhatsApp segue à mostra, e o
 * mascote chega dentro de um balão verde. Com a pílula verde o balão do mascote
 * sumia dentro dela, que é o que fazia perder o desenho. Fora daqui, cor de fora
 * da paleta continua proibida.
 *
 * O anel branco continua: ele é o que descola a peça de foto escura, que é o
 * fundo dela na hero da home e na galeria da unidade.
 */

/** Mensagem que abre a conversa. Diz de onde a pessoa veio e o que ela quer, que é o que a equipe precisa saber. */
const MENSAGEM = "Oi! Vim pelo site e quero reservar uma vaga.";

/**
 * A promessa fica em texto, e não queimada no PNG do mascote.
 *
 * Texto dentro de imagem não é lido por leitor de tela, não é indexado e obriga
 * um render novo a cada ajuste de copy. A arte carrega só a sensação de
 * velocidade, e a frase vive no DOM.
 */
const PROMESSA = "Reserva rápida em menos de 1min";

export function WhatsappBubble() {
  return (
    <a
      href={`${WHATSAPP_SUPORTE.href}?text=${encodeURIComponent(MENSAGEM)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${PROMESSA}. Falar com a Movepark no WhatsApp`}
      className={[
        "fixed right-4 z-50 tablet:right-6",
        "bottom-[calc(1rem+var(--sticky-bar-space)+var(--safe-bottom))] tablet:bottom-[calc(1.5rem+var(--sticky-bar-space)+var(--safe-bottom))]",
        "flex h-14 items-center gap-1.5 rounded-full pl-1 pr-2.5 tablet:h-auto tablet:gap-3 tablet:py-3 tablet:pl-3 tablet:pr-5",
        "bg-mp-primary text-white shadow-lg ring-4 ring-white/70",
        // O que flutua é `transform`, nunca `bottom`. Animar `bottom` aqui topou
        // com um bug de motor de renderização (ele depende de `--sticky-bar-space`,
        // um calc com var(), e a transição travava numa posição intermediária
        // errada em vez de assentar no valor final). `transform` não tem esse
        // problema e ainda resolve na GPU, sem relayout.
        "animate-mia-flutuar motion-reduce:animate-none",
        // Sem `duration-*` aqui. Esta versão do Tailwind emite DUAS regras para
        // `duration-200`, e a segunda é `animation-duration: 200ms`: ela vem depois
        // de `.animate-mia-flutuar` na folha e sequestra a duração da animação, que
        // caía de 3,4s para 0,2s e virava um tremor. Travado em teste.
        "transition-colors hover:bg-mp-primary-active",
        // O foco por teclado precisa aparecer sobre o violeta, então o anel é escuro.
        "outline-none focus-visible:ring-4 focus-visible:ring-mp-navy",
      ].join(" ")}
    >
      {/* O que vende altura é a sombra reagindo, não o sobe e desce sozinho: ela
          encolhe e clareia na subida. Sem isso o olho lê "deslizando". */}
      <span
        aria-hidden
        className="animate-mia-sombra pointer-events-none absolute -bottom-2.5 left-1/2 h-2.5 w-[70%] -translate-x-1/2 rounded-[50%] bg-mp-navy/30 blur-[6px] motion-reduce:animate-none"
      />
      {/* Decorativa de propósito: o nome acessível do link já traz a frase inteira,
          e descrever o mascote de novo faria o leitor de tela repetir. A defasagem
          negativa faz ele chegar depois da pílula, o que tira o ar de peça única
          mexendo em bloco. */}
      <img
        src="/images/mia-whatsapp.webp"
        alt=""
        width={640}
        height={644}
        className="animate-mia-mascote -mb-1.5 -mt-5 w-[52px] motion-reduce:animate-none tablet:-mb-4 tablet:-mt-[34px] tablet:w-[72px]"
      />
      <span className="hidden whitespace-nowrap tablet:flex tablet:flex-col">
        <span className="text-button-sm font-bold">Reserva rápida</span>
        <span className="text-caption-sm text-white/85">em menos de 1min</span>
      </span>
      <WhatsappMark className="h-6 w-6 tablet:h-5 tablet:w-5" />
    </a>
  );
}
