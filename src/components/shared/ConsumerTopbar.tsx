import * as React from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Calendar,
  CaretDown,
  Gift,
  Heart,
  MagnifyingGlass,
  MapPin,
  SignOut,
  SquaresFour,
  User,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchBarPill } from "@/features/search/SearchBarPill";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/auth/context";
import { cn } from "@/lib/utils";
import { userInitials } from "@/lib/initials";
import { postLogoutPath } from "@/auth/postLoginRedirect";
import { useDestinations } from "@/features/search/api";
import { Wordmark } from "./Brand";
import { ConsumerMobileMenu } from "./ConsumerMobileMenu";
import { ThemeToggle } from "./ThemeToggle";
import { useHeaderOculto } from "./useHeaderOculto";
import { useHeroSearchPassed } from "./useHeroSearchPassed";
import type { Destination } from "@/features/search/api";

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function DestinoItem({ d }: { d: Destination }) {
  return (
    <DropdownMenuItem asChild>
      <Link to={`/destinos/${d.slug}`} className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted" />
        <span className="flex flex-col">
          <span>{d.short_name ?? d.name}</span>
          <span className="text-caption text-muted">
            {d.city}
            {d.state ? ` · ${d.state}` : ""}
          </span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

/** Menu "Destinos" com submenu de aeroportos/destinos publicados. */
function DestinosMenu() {
  const { data: destinations } = useDestinations();
  const popular = (destinations ?? []).filter((d) => d.is_popular);
  const others = (destinations ?? []).filter((d) => !d.is_popular);
  if (!destinations?.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="hidden items-center gap-1 rounded-sm px-2 py-1.5 text-body-sm text-ink hover:bg-surface-soft tablet:inline-flex">
          Destinos <CaretDown className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] min-w-[260px] overflow-y-auto">
        <DropdownMenuItem asChild>
          <Link to="/destinos" className="font-medium text-mp-primary">
            Ver todos os destinos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {popular.length > 0 && <DropdownMenuLabel>Mais buscados</DropdownMenuLabel>}
        {popular.map((d) => (
          <DestinoItem key={d.id} d={d} />
        ))}
        {others.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Outros destinos</DropdownMenuLabel>
            {others.map((d) => (
              <DestinoItem key={d.id} d={d} />
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Topbar pública do consumer.
 * - Wordmark à esquerda → vai pra `/`
 * - Pill de busca colapsada no centro (apenas placeholder visual; abrir busca em popover/sheet vem na Fase 2)
 * - Direita: logado → avatar dropdown; anônimo → botão "Entrar"
 */
export function ConsumerTopbar() {
  const { session, effectiveRole, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const isHome = location.pathname === "/";
  // Rotas onde a busca de vaga não faz sentido: a landing B2B de parceiro fala com um
  // dono de estacionamento, não com um viajante, e o widget de busca só divide o foco.
  const hideSearch = location.pathname === "/seja-parceiro";
  /*
    Na home a busca do header entra só depois que a barra do hero sobe. Duas
    barras na mesma tela competem pelo mesmo clique; passada a primeira, o header
    assume e a busca volta a estar a um toque, como nas outras páginas.
  */
  const heroPassou = useHeroSearchPassed(isHome);
  const oculto = useHeaderOculto();
  const mostrarBusca = (!isHome || heroPassou) && !hideSearch;

  async function handleSignOut() {
    // Consumidor volta pra home; captura o papel antes de limpar a sessão.
    const target = postLogoutPath(effectiveRole);
    await signOut();
    navigate(target, { replace: true });
  }

  // Escopo da busca lido da URL pra semear a barra do header (na /search vem preenchido; em outras
  // páginas começa do padrão). vehicle pode ser car|motorcycle.
  const destParam = searchParams.get("dest");
  const pointParam = searchParams.get("point");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const vehicleParam = searchParams.get("vehicle") === "motorcycle" ? "motorcycle" : "car";

  const initials = userInitials(session?.fullName, session?.email);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-hairline bg-canvas",
        // Descer devolve a tela ao conteúdo; subir traz a navegação de volta.
        // `will-change` evita o repintar do header inteiro a cada quadro.
        "transition-transform duration-300 will-change-transform motion-reduce:transition-none",
        oculto && "-translate-y-full",
      )}
    >
      <div className="mx-auto flex h-20 w-full max-w-[1280px] items-center gap-4 px-4 desktop:px-8">
        {/*
          A marca inteira também no celular. O monograma sozinho economizava
          largura numa época em que o header carregava mais botão; com o menu
          unificado sobrou espaço, e um símbolo isolado não diz o nome de quem
          ainda não conhece a marca. Vai menor no mobile (18px contra 22) para o
          nome caber sem espremer a busca do meio.
        */}
        {/* Duas instâncias porque o `Wordmark` aplica a altura como estilo
            inline, e estilo inline vence classe: `tablet:h-[22px]` não teria
            efeito nenhum. */}
        <Link to="/" className="shrink-0" aria-label="Ir para a home">
          <Wordmark height={18} className="tablet:hidden" />
          <Wordmark height={22} className="hidden tablet:block" />
        </Link>

        <DestinosMenu />

        {/* `min-w-0` porque item de flex não encolhe abaixo do conteúdo por
            padrão: sem ele a barra de busca segurava a largura mínima dela e
            empurrava os botões da direita para fora da tela. A 854px o header
            passava 63px do viewport e a página ganhava rolagem horizontal. */}
        <div className="flex min-w-0 flex-1 justify-center">
          {/* Busca real e persistente no header (sticky). Na home ela entra quando a do hero sobe. */}
          {mostrarBusca && (
            <>
              {/* Desktop/tablet: a SearchBarPill funcional, semeada com a busca atual e preservando
                os filtros já aplicados (estacionamento, comodidades, ordenação…). */}
              <SearchBarPill
                variant="compact"
                className="hidden w-full max-w-3xl tablet:flex"
                key={`${destParam ?? ""}|${pointParam ?? ""}|${fromParam ?? ""}|${toParam ?? ""}|${vehicleParam}`}
                initialDest={destParam}
                initialPoint={pointParam}
                initialFrom={parseDate(fromParam)}
                initialTo={parseDate(toParam)}
                initialVehicle={vehicleParam}
                preserveParams
              />
              {/* Mobile: pill compacta que abre o modal de busca por cima da página (estilo Airbnb),
                sem voltar pra home. */}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex h-11 w-full max-w-[190px] items-center gap-3 rounded-full border border-hairline bg-canvas px-3.5 text-body-sm text-muted shadow-tier transition-shadow hover:shadow-tier tablet:hidden"
              >
                <MagnifyingGlass className="h-4 w-4 shrink-0" />
                {/* O rótulo curto é o mesmo do título do modal que este botão abre.
                  "Onde · Quando · Veículo" media 222px e não sobrava espaço no header. */}
                <span className="truncate">{destParam ? destParam : "Buscar vaga"}</span>
              </button>
              {/* modal={false}: sem o body-lock/focus-trap do Radix Dialog modal, que quebra os
                Popover/cmdk aninhados (DestinationCombobox, DateRangePicker) portados pra fora do
                content (tocar num destino ou dia não seleciona). Como modal={false} deixa o fundo
                clicável, o content é full-screen e opaco: cobre a página toda e não sobra brecha
                pro clique vazar pro fundo. */}
              <Dialog open={searchOpen} onOpenChange={setSearchOpen} modal={false}>
                <DialogContent className="inset-0 left-0 top-0 h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 content-start gap-4 rounded-none border-0 tablet:hidden">
                  <DialogHeader>
                    <DialogTitle>Buscar vaga</DialogTitle>
                  </DialogHeader>
                  <SearchBarPill
                    variant="compact"
                    className="border-0 shadow-none"
                    initialDest={destParam}
                    initialPoint={pointParam}
                    initialFrom={parseDate(fromParam)}
                    initialTo={parseDate(toParam)}
                    initialVehicle={vehicleParam}
                    preserveParams
                    onSubmit={() => setSearchOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* No mobile o toggle sai do header: ele custava 36px + gap e era o que
            estourava a largura da barra em 375px. O controle de tema mora em
            /account/preferences, que é onde ele continua acessível no celular. */}
          <ThemeToggle className="hidden tablet:inline-flex" />
          {!session && (
            <>
              <Button variant="ghost" size="sm" className="hidden tablet:inline-flex" asChild>
                <Link to="/seja-parceiro">Seja parceiro</Link>
              </Button>
              {/* No mobile o "Entrar" mora dentro da aba lateral: são 375px de
                  largura, e o header não comporta botão e menu sem espremer a
                  busca do meio. */}
              <Button size="sm" variant="primary" className="hidden tablet:inline-flex" asChild>
                <Link to="/login">Entrar</Link>
              </Button>
            </>
          )}

          {session && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  /* Só no desktop: no mobile o avatar é o gatilho da aba lateral,
                     e o dropdown aqui daria dois menus colados no mesmo canto. */
                  className="hidden items-center gap-2 rounded-full border border-hairline px-2 py-1 hover:shadow-tier tablet:flex"
                  aria-label="Menu da conta"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                <DropdownMenuLabel className="line-clamp-1">
                  {session.fullName ?? session.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {effectiveRole === "customer" && (
                  <>
                    <DropdownMenuItem onClick={() => navigate("/account")}>
                      <User className="h-4 w-4" /> Conta
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/account/reservas")}>
                      <Calendar className="h-4 w-4" /> Minhas reservas
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/account/saved")}>
                      <Heart className="h-4 w-4" /> Favoritos
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/account/indicar")}>
                      <Gift className="h-4 w-4" /> Indique e ganhe
                    </DropdownMenuItem>
                  </>
                )}
                {effectiveRole === "hub_admin" && (
                  <DropdownMenuItem onClick={() => navigate("/manager")}>
                    <SquaresFour className="h-4 w-4" /> Ir pro Manager
                  </DropdownMenuItem>
                )}
                {effectiveRole === "company_operator" && (
                  <DropdownMenuItem onClick={() => navigate("/operator")}>
                    <SquaresFour className="h-4 w-4" /> Ir pro Operator
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleSignOut()}>
                  <SignOut className="h-4 w-4" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/*
            A aba lateral vale logado e deslogado, e é a navegação do mobile desde
            que a barra de baixo saiu. Fica depois do avatar de propósito: é o
            último alvo da direita, no canto onde a mão já procura menu.
          */}
          <ConsumerMobileMenu />
        </div>
      </div>
    </header>
  );
}
