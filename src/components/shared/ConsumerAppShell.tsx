import { Outlet } from "react-router-dom";
import { ConsumerTopbar } from "./ConsumerTopbar";
import { ConsumerFooter } from "./ConsumerFooter";
import { ChatWidget } from "@/features/assistant/ChatWidget";

/**
 * Casca do consumer.
 *
 * Não há barra fixa embaixo. Ela existiu, e saiu: no mobile ocupava 64px fixos de
 * tela em toda página e a navegação ficava repartida entre ela e o header, o que
 * a avaliação de uso apontou como confuso. Hoje a navegação do mobile é uma só, a
 * aba lateral do canto superior direito, e ela vale logado e deslogado.
 */
export function ConsumerAppShell() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <ConsumerTopbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <ConsumerFooter />
      <ChatWidget />
    </div>
  );
}
