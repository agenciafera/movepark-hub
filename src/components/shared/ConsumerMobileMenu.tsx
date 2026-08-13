import * as React from "react";
import { Link } from "react-router-dom";
import { List } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Os rótulos são os mesmos do rodapé de propósito: dois nomes para a mesma página
 * fazem o leitor achar que são páginas diferentes.
 */
const LINKS = [
  { to: "/destinos", label: "Destinos" },
  { to: "/como-funciona", label: "Como funciona" },
  { to: "/blog/", label: "Blog" },
  { to: "/ajuda", label: "Ajuda" },
  { to: "/seja-parceiro", label: "Seja parceiro" },
];

/**
 * Menu do mobile para quem não tem sessão.
 *
 * Ele existe porque a barra inferior saiu para o visitante deslogado: ela alterna
 * entre áreas de conta, e quem não entrou não tem nenhuma. Os links principais
 * passam a morar aqui, no canto onde a mão já procura menu, sem ocupar 64px fixos
 * da tela o tempo todo.
 *
 * Só no mobile: no tablet para cima os mesmos destinos já estão no header e no
 * rodapé.
 */
export function ConsumerMobileMenu() {
  const [aberto, setAberto] = React.useState(false);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:bg-surface-soft tablet:hidden"
        >
          <List className="h-5 w-5" aria-hidden />
        </button>
      </SheetTrigger>

      <SheetContent side="right" className="sm:w-[320px] w-[280px]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        <nav className="mt-6 flex flex-col">
          {LINKS.map((l) => (
            <SheetClose asChild key={l.to}>
              <Link
                to={l.to}
                className="border-b border-hairline py-3.5 text-body-md text-ink last:border-0"
              >
                {l.label}
              </Link>
            </SheetClose>
          ))}
        </nav>

        <div className="mt-6 flex flex-col gap-3">
          <SheetClose asChild>
            <Button asChild className="w-full">
              <Link to="/login">Entrar</Link>
            </Button>
          </SheetClose>
          {/* O toggle sai do header no mobile por falta de largura, e aqui ele
              volta a ficar ao alcance sem precisar entrar na conta. */}
          <ThemeToggle className="self-start" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
