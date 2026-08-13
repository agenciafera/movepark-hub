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
import { useAuth } from "@/auth/context";
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
 * Aba lateral do mobile, e a única navegação de seção do celular.
 *
 * A barra fixa de baixo saiu: ocupava 64px de tela em toda página e repartia a
 * navegação entre ela e o header, o que a avaliação de uso apontou como confuso.
 * Aqui os links moram num lugar só, no canto onde a mão já procura menu, e a
 * tela inteira volta a ser conteúdo.
 *
 * Vale logado e deslogado. Muda só o rodapé do painel: quem já entrou tem a
 * conta no avatar do header, então o "Entrar" não aparece.
 *
 * Só no mobile: no tablet para cima os mesmos destinos já estão no header e no
 * rodapé.
 */
export function ConsumerMobileMenu() {
  const [aberto, setAberto] = React.useState(false);
  const { session } = useAuth();

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

      {/*
        O `SheetContent` não traz padding próprio: quem tinha era só o
        `SheetHeader`. Por isso o padding mora em cada bloco daqui, e não no
        container: assim o item do menu pode sangrar até a borda no hover e ainda
        ter o texto recuado.
      */}
      <SheetContent
        side="right"
        /*
          O foco automático do Radix estava caindo no botão de tema, o último
          controle do painel, e abrir o menu acendia um anel de foco num alvo que
          ninguém escolheu. Mandando o foco para o próprio painel, o teclado
          continua entrando no diálogo (o Radix já dá `tabindex=-1` a ele) e a
          primeira tabulação segue para "Destinos", que é o topo da lista.
        */
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        /* Sem anel no container: o foco aqui é programático, para o teclado
           entrar no diálogo, e desenhar um contorno em volta do painel inteiro
           parece erro de layout. Os controles de dentro mantêm o anel deles. */
        className="w-[320px] focus:outline-none"
      >
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>

        {/* Sem régua entre os itens: em lista curta a linha divide o que o espaço
            já separa, e ainda briga com a borda do próprio painel. */}
        <nav className="mt-4 flex flex-col px-3">
          {LINKS.map((l) => (
            <SheetClose asChild key={l.to}>
              <Link
                to={l.to}
                className="rounded-sm px-3 py-3 text-body-md text-ink transition-colors hover:bg-surface-soft"
              >
                {l.label}
              </Link>
            </SheetClose>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4 p-6">
          {/* Quem já entrou tem a conta no avatar do header; repetir "Entrar"
              aqui só confundiria. */}
          {!session && (
            <SheetClose asChild>
              <Button asChild className="w-full">
                <Link to="/login">Entrar</Link>
              </Button>
            </SheetClose>
          )}
          {/* O toggle sai do header no mobile por falta de largura, e aqui ele
              volta a ficar ao alcance sem precisar entrar na conta. */}
          <ThemeToggle className="self-start" />
        </div>
      </SheetContent>
    </Sheet>
  );
}
