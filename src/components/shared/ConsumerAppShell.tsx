import { Outlet } from "react-router-dom";
import { ConsumerTopbar } from "./ConsumerTopbar";
import { ConsumerFooter } from "./ConsumerFooter";
import { ChatWidget } from "@/features/assistant/ChatWidget";
import { WhatsappBubble } from "@/features/support/WhatsappBubble";
import { assistenteDoSiteLigado } from "@/lib/features";
import { OgImage } from "@/lib/ogImage";
import { useLocation } from "react-router-dom";
import { LocaleProvider } from "@/lib/LocaleContext";
import { localeDoCaminho } from "@/lib/i18n";

/**
 * Casca do consumer.
 *
 * Não há barra fixa embaixo. Ela existiu, e saiu: no mobile ocupava 64px fixos de
 * tela em toda página e a navegação ficava repartida entre ela e o header, o que
 * a avaliação de uso apontou como confuso. Hoje a navegação do mobile é uma só, a
 * aba lateral do canto superior direito, e ela vale logado e deslogado.
 */
export function ConsumerAppShell() {
  // O idioma mora AQUI, e não na página, porque o cabeçalho e o rodapé ficam fora do
  // `Outlet`: um provider dentro da página nunca os alcançaria, e o rodapé em inglês
  // continuaria dizendo "Dúvidas sobre estacionamento de aeroporto?". Vem do caminho,
  // que é o contrato da URL, e o default é português, então toda rota que ainda não
  // tem versão traduzida segue exatamente como hoje.
  const { locale } = localeDoCaminho(useLocation().pathname);
  return (
    <LocaleProvider locale={locale}>
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Imagem-padrão do card de compartilhamento. Cada página sobrescreve com a
          sua (o destino usa a hero, a unidade usa a foto); as que não têm imagem
          própria param de compartilhar sem card, que era o caso de quase todas. */}
      <OgImage area="marca" />
      <ConsumerTopbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <ConsumerFooter />
      {/* Uma bolinha só nesse canto: as duas se sobreporiam. Hoje o canto é do
          WhatsApp, e o assistente volta com `VITE_WEB_ASSISTANT=on`. */}
      {assistenteDoSiteLigado() ? <ChatWidget /> : <WhatsappBubble />}
    </div>
    </LocaleProvider>
  );
}
