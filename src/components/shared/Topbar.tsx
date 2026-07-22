import { useNavigate } from "react-router-dom";
import { LogOut, Bell, Search } from "lucide-react";
import { useAuth } from "@/auth/context";
import { postLogoutPath } from "@/auth/postLoginRedirect";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
    // h-16 e não h-20: 80px era o dobro da pílula de busca que a barra carrega.
    // Num painel de dados aberto em notebook, 16px de volta em toda tela conta.
    <header className="flex h-16 items-center gap-4 border-b border-hairline bg-canvas px-4 desktop:px-6">
      <div className="tablet:hidden">
        <Monogram size={28} />
      </div>
      {/* Era um `div` com um `span`: parecia campo de busca e não fazia nada,
          nem focava nem clicava. Agora é um botão de verdade que abre a
          command palette. Sem `shadow-tier` porque é controle plano. */}
      <button
        type="button"
        onClick={onOpenSearch}
        className="hidden tablet:flex flex-1 max-w-md items-center gap-2 rounded-full border border-hairline bg-canvas px-4 py-2.5 text-body-sm text-muted transition-colors hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span>Buscar reserva, unidade, cupom...</span>
        <kbd className="ml-auto hidden rounded-xs border border-hairline px-1.5 py-0.5 text-caption-sm font-sans desktop:inline">
          {atalho}
        </kbd>
      </button>
      <div className="flex-1" />
      {rightSlot}
      <Button variant="outline" size="icon" aria-label="Notificações">
        <Bell className="h-4 w-4" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full p-1 hover:bg-surface-soft">
            <Avatar>
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{session?.fullName ?? session?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void handleSignOut()}>
            <LogOut className="h-4 w-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
