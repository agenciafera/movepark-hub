import { WhatsappMark } from "@/components/shared/SocialMarks";
import { WHATSAPP_SUPORTE } from "@/lib/suporte";

/**
 * Bolinha de WhatsApp do consumer.
 *
 * Ocupa o canto que era do assistente do site (`ChatWidget`), que saiu de cena
 * enquanto a equipe atende no WhatsApp. É um link, não um botão: abre a conversa
 * no app instalado ou no WhatsApp Web, e o visitante já chega com a mensagem
 * escrita, então a equipe sabe de onde veio o contato.
 *
 * O número mora só em `@/lib/suporte`, junto com o da página de contato e o do
 * rodapé dos e-mails. Não copie o número para cá.
 *
 * A altura no mobile (5rem) desvia da `ListingStickyBar`, a barra fixa de preço
 * da página da unidade. No tablet para cima a barra some e a bolinha desce.
 *
 * O glifo é a marca do WhatsApp (`WhatsappMark`), e não o `WhatsappLogo` do
 * Phosphor: aqui o desenho precisa ser reconhecido como o app, e não como a
 * interpretação do icon set. Mesma regra que já vale para as redes sociais.
 *
 * O verde também é o da marca, e não um token do design system, de propósito: é
 * o que faz a bolinha ser lida como "WhatsApp" antes de qualquer leitura de
 * rótulo. Fora daqui, cor de fora da paleta continua proibida.
 */

/** Mensagem que abre a conversa. Diz de onde a pessoa veio, que é o que a equipe precisa saber. */
const MENSAGEM = "Oi! Vim pelo site e preciso de ajuda.";

export function WhatsappBubble() {
  return (
    <a
      href={`${WHATSAPP_SUPORTE.href}?text=${encodeURIComponent(MENSAGEM)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a Movepark no WhatsApp"
      className={[
        "fixed bottom-[calc(5rem+var(--safe-bottom))] right-4 z-50 tablet:bottom-6 tablet:right-6",
        "flex h-14 w-14 items-center justify-center rounded-full",
        // O anel branco descola a bolinha de foto escura, que é o fundo dela na
        // hero da home e na galeria da unidade.
        "bg-[#25D366] text-white ring-4 ring-white/70 shadow-lg",
        "transition duration-200 hover:bg-[#1DA851] hover:shadow-xl hover:scale-105 active:scale-95",
        "motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
        // O foco por teclado precisa aparecer sobre o verde, então o anel é escuro.
        "outline-none focus-visible:ring-4 focus-visible:ring-mp-navy",
      ].join(" ")}
    >
      <WhatsappMark className="h-8 w-8" />
    </a>
  );
}
