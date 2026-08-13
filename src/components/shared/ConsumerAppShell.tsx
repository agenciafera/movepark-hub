import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { ConsumerTopbar } from "./ConsumerTopbar";
import { ConsumerBottomNav } from "./ConsumerBottomNav";
import { ConsumerFooter } from "./ConsumerFooter";
import { ChatWidget } from "@/features/assistant/ChatWidget";

export function ConsumerAppShell() {
  const { pathname } = useLocation();
  const { session } = useAuth();
  // Na página do estacionamento (/p/...), o rodapé fixo do mobile passa a ser o
  // CTA de reserva do próprio ListingPage (referência Airbnb), então a bottom nav
  // some e o pb-16 (que só reservava a altura do nav) sai: quem cuida da folga do
  // CTA ali é o próprio listing.
  const isListing = pathname.startsWith("/p/");
  /*
    A barra de baixo é para quem já tem conta.

    Ela existe para alternar entre áreas de uso recorrente (reservas, conta), e
    quem chega deslogado não tem nenhuma delas: dos quatro alvos, dois viravam
    "Entrar" e "Parceiro", ou seja, ela ocupava 64px fixos de uma tela pequena
    para oferecer o que o header já oferece. Sem sessão, os links principais moram
    no menu do canto superior direito.
  */
  const comBottomNav = Boolean(session) && !isListing;

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <ConsumerTopbar />
      <main className={cn("flex-1", comBottomNav && "pb-[var(--bottom-nav-space)] tablet:pb-0")}>
        <Outlet />
      </main>
      <ConsumerFooter />
      {comBottomNav && <ConsumerBottomNav />}
      <ChatWidget />
    </div>
  );
}
