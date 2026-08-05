import { useNavigate } from "react-router-dom";
import { Bell, MagnifyingGlass, SignOut } from "@phosphor-icons/react";
import { useAuth } from "@/auth/context";
import { postLogoutPath } from "@/auth/postLoginRedirect";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Monogram } from "./Brand";

export function Topbar({
  rightSlot,
  onOpenSearch,
}: {
  rightSlot?: React.ReactNode;
  onOpenSearch: () => void;
}) {
  const { session, effectiveRole, signOut } = useAuth();
  const navigate = useNavigate();

  // O rótulo do atalho segue o teclado de quem está olhando. `navigator.platform`
  // é depreciado mas continua sendo o teste que funciona nos navegadores atuais;
  // no SSR não existe `navigator`, então cai no Ctrl.
  const atalho =
    typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform)
      ? "⌘K"
      : "Ctrl K";

  async function handleSignOut() {
    // Backoffice sai pro login; captura o papel antes de limpar a sessão.
    const target = postLogoutPath(effectiveRole);
    await signOut();
    navigate(target, { replace: true });
  }

  const initials = (session?.fullName ?? session?.email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    // Sem régua e sem fundo próprio: a barra fica sobre o fundo da página e os
    // controles viram pílulas soltas de 48px, como no Dashboard v2.
    <header className="flex shrink-0 flex-wrap items-center gap-2.5 px-4 pt-4 tablet:px-0 tablet:pt-0">
      <div className="tablet:hidden">
        <Monogram size={28} />
      </div>
      {/* Era um `div` com um `span`: parecia campo de busca e não fazia nada,
          nem focava nem clicava. Agora é um botão de verdade que abre a
          command palette. Sem `shadow-tier` porque é controle plano. */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden h-12 max-w-md flex-1 items-center gap-2.5 rounded-full bg-canvas px-5 text-body-sm text-muted transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 tablet:flex"
      >
        <MagnifyingGlass className="h-4 w-4 shrink-0" />
        <span className="truncate">Buscar reserva, unidade, cupom</span>
        <kbd className="ml-auto hidden rounded-xs bg-surface-soft px-1.5 py-0.5 font-sans text-caption-sm desktop:inline">
          {atalho}
        </kbd>
      </button>
      <div className="flex-1" />
      {rightSlot}
      <button
        type="button"
        aria-label="Notificações"
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-canvas text-ink transition-colors hover:bg-surface-soft"
      >
        <Bell className="h-5 w-5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mp-navy text-body-sm font-semibold text-white transition-opacity hover:opacity-90">
            {initials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{session?.fullName ?? session?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleSignOut()}>
            <SignOut className="h-4 w-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
