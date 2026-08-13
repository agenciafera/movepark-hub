import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { IconProps } from "@phosphor-icons/react";
import {
  Article,
  Gift,
  Heart,
  Info,
  List,
  MapPin,
  Question,
  SquaresFour,
  Storefront,
  Ticket,
} from "@phosphor-icons/react";
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
import { cn } from "@/lib/utils";
import { userInitials } from "@/lib/initials";
import { secaoAtiva } from "./menuAtivo";
import { postLogoutPath } from "@/auth/postLoginRedirect";
import { Wordmark } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

type Icone = React.ComponentType<IconProps>;
type ItemDeMenu = { to: string; label: string; icone: Icone };

/**
 * Os rótulos são os mesmos do rodapé e do dropdown do desktop de propósito: dois
 * nomes para a mesma página fazem o leitor achar que são páginas diferentes.
 */
const LINKS_DO_SITE: ItemDeMenu[] = [
  { to: "/destinos", label: "Destinos", icone: MapPin },
  { to: "/como-funciona", label: "Como funciona", icone: Info },
  { to: "/blog/", label: "Blog", icone: Article },
  { to: "/ajuda", label: "Ajuda", icone: Question },
  { to: "/seja-parceiro", label: "Seja parceiro", icone: Storefront },
];

const LINKS_DA_CONTA: ItemDeMenu[] = [
  { to: "/account/reservas", label: "Minhas reservas", icone: Ticket },
  { to: "/account/saved", label: "Favoritos", icone: Heart },
  { to: "/account/indicar", label: "Indique e ganhe", icone: Gift },
];

/**
 * Item do menu, com ícone à esquerda e marca de seção atual.
 *
 * O ícone não é enfeite: numa lista de nove itens ele é o que deixa o dedo achar
 * o alvo sem ler a lista inteira, e é o que as duas referências (QuintoAndar e
 * Airbnb) fazem. A cor é `mp-indigo`, a mesma que a lista da conta
 * (`AccountSidebar`) já usa em ícone de navegação.
 *
 * O item atual é o único violeta. O contrato do consumer reserva o `mp-primary`
 * para elemento acionável e indicador de seleção, e é exatamente este caso: com
 * todos os ícones em violeta, nenhum item se destacaria.
 *
 * O ativo é calculado à mão, e não pelo `NavLink`: dentro de `SheetClose asChild`
 * o Slot do Radix concatena `className` como string, e uma `className` em função
 * (a API do `NavLink`) ia parar no DOM como o **código-fonte da função**. O item
 * perdia toda a estilização sem erro nenhum no console.
 *
 * `min-h-11` mantém o alvo de toque acessível.
 */
function Item({ to, label, icone: Icone }: ItemDeMenu) {
  const { pathname } = useLocation();
  const ativo = secaoAtiva(pathname, to);

  return (
    <SheetClose asChild>
      <Link
        to={to}
        aria-current={ativo ? "page" : undefined}
        className={cn(
          "flex min-h-11 items-center gap-3 rounded-sm px-3 py-2.5 text-body-md transition-colors",
          ativo
            ? "bg-surface-soft font-semibold text-mp-primary"
            : "text-ink hover:bg-surface-soft",
        )}
      >
        <Icone
          className={cn("h-5 w-5 shrink-0", ativo ? "text-mp-primary" : "text-mp-indigo")}
          weight={ativo ? "fill" : "regular"}
          aria-hidden
        />
        {label}
      </Link>
    </SheetClose>
  );
}

/**
 * Aba lateral do mobile, e a **única** porta de navegação do celular.
 *
 * Duas coisas foram parar aqui dentro, e o motivo das duas é o mesmo: no celular
 * cada menu a mais é um lugar a mais para procurar.
 *
 * A barra fixa de baixo saiu porque ocupava 64px de tela em toda página e
 * repartia a navegação com o header. Depois o avatar do header também virou
 * gatilho desta aba, porque ele abria um dropdown de conta ao lado de um menu de
 * seções: dois botões colados, cada um com metade dos destinos, e nenhum com
 * tudo.
 *
 * Por isso o gatilho é um só e muda de cara conforme a sessão: avatar para quem
 * entrou, ícone de menu para quem não entrou. O conteúdo é que se ajusta.
 *
 * O formato segue o menu do QuintoAndar: marca no topo, bloco de identidade com
 * atalho para a conta, itens com ícone, e uma régua separando a conta do site.
 *
 * Só no mobile. No tablet para cima o header tem largura para o dropdown de
 * conta e os links, e nada disso muda.
 */
export function ConsumerMobileMenu() {
  const [aberto, setAberto] = React.useState(false);
  const { session, effectiveRole, signOut } = useAuth();
  const navigate = useNavigate();

  async function sair() {
    setAberto(false);
    const destino = postLogoutPath(effectiveRole);
    await signOut();
    navigate(destino, { replace: true });
  }

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menu"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-hairline text-ink transition-colors hover:bg-surface-soft tablet:hidden"
        >
          {session ? (
            <span className="text-caption-sm font-bold">
              {userInitials(session.fullName, session.email)}
            </span>
          ) : (
            <List className="h-5 w-5" aria-hidden />
          )}
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
          O foco automático do Radix estava caindo no último controle do painel, e
          abrir o menu acendia um anel de foco num alvo que ninguém escolheu.
          Mandando o foco para o próprio painel, o teclado continua entrando no
          diálogo (o Radix já dá `tabindex=-1` a ele) e a primeira tabulação segue
          para o topo da lista.
        */
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
        /* Sem anel no container: o foco aqui é programático, para o teclado
           entrar no diálogo, e desenhar um contorno em volta do painel inteiro
           parece erro de layout. Os controles de dentro mantêm o anel deles. */
        className="w-[320px] overflow-y-auto focus:outline-none"
      >
        <SheetHeader>
          <Wordmark height={20} />
          {/* O Radix exige título para o leitor de tela; na tela quem nomeia o
              painel é a marca. */}
          <SheetTitle className="sr-only">Menu</SheetTitle>
        </SheetHeader>

        {/* Bloco de identidade: diz de quem é a conta aberta e já leva para ela,
            que é o atalho que o avatar sozinho não oferecia. */}
        {session && (
          <SheetClose asChild>
            <Link
              to="/account"
              className="mx-3 mt-4 flex items-center gap-3 rounded-sm px-3 py-2.5 transition-colors hover:bg-surface-soft"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-strong text-caption-sm font-bold text-ink">
                {userInitials(session.fullName, session.email)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-body-md font-semibold text-ink">
                  {session.firstName ?? session.fullName ?? session.email}
                </span>
                <span className="block text-caption-sm text-muted">Ver conta</span>
              </span>
            </Link>
          </SheetClose>
        )}

        {/* Sem régua entre os itens: em lista curta a linha divide o que o espaço
            já separa. Ela só entra entre a conta e o site, que é onde separa duas
            naturezas, do mesmo jeito que as referências fazem. */}
        <nav className="mt-2 flex flex-col px-3">
          {session && (
            <>
              {LINKS_DA_CONTA.map((l) => (
                <Item key={l.to} {...l} />
              ))}
              {effectiveRole === "hub_admin" && (
                <Item to="/manager" label="Ir pro Manager" icone={SquaresFour} />
              )}
              {effectiveRole === "company_operator" && (
                <Item to="/operator" label="Ir pro Operator" icone={SquaresFour} />
              )}
              <hr className="my-3 border-hairline" />
            </>
          )}

          {LINKS_DO_SITE.map((l) => (
            <Item key={l.to} {...l} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4 p-6">
          {session ? (
            <Button variant="outline" className="w-full" onClick={() => void sair()}>
              Sair
            </Button>
          ) : (
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
