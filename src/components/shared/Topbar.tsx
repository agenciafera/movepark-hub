import { LogOut, Bell, Search } from "@/lib/icons";
import { useAuth } from "@/auth/context";
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

export function Topbar({ rightSlot }: { rightSlot?: React.ReactNode }) {
  const { session, signOut } = useAuth();
  const initials = (session?.fullName ?? session?.email ?? "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-20 items-center gap-4 border-b border-hairline bg-canvas px-4 desktop:px-6">
      <div className="tablet:hidden">
        <Monogram size={28} />
      </div>
      <div className="hidden tablet:flex flex-1 max-w-md items-center gap-2 rounded-full border border-hairline bg-canvas px-4 py-2.5 text-body-sm text-muted shadow-tier transition-shadow">
        <Search className="h-4 w-4" />
        <span>Buscar reservas, empresas, usuários…</span>
      </div>
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
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" /> Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
