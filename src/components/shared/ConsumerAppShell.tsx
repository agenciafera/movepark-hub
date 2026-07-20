import { Outlet, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ConsumerTopbar } from "./ConsumerTopbar";
import { ConsumerBottomNav } from "./ConsumerBottomNav";
import { ConsumerFooter } from "./ConsumerFooter";
import { ChatWidget } from "@/features/assistant/ChatWidget";

export function ConsumerAppShell() {
  const { pathname } = useLocation();
  // Na página do estacionamento (/p/...), o rodapé fixo do mobile passa a ser o
  // CTA de reserva do próprio ListingPage (referência Airbnb), então a bottom nav
  // some e o pb-16 (que só reservava a altura do nav) sai: quem cuida da folga do
  // CTA ali é o próprio listing.
  const isListing = pathname.startsWith("/p/");

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <ConsumerTopbar />
      <main className={cn("flex-1", !isListing && "pb-[var(--bottom-nav-space)] tablet:pb-0")}>
        <Outlet />
      </main>
      <ConsumerFooter />
      {!isListing && <ConsumerBottomNav />}
      <ChatWidget />
    </div>
  );
}
