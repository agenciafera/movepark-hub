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
import { useHeaderOculto } from "./useHeaderOculto";
import { contasDoConsumidorLigadas } from "@/lib/features";
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
        <button className="hidden items-center gap-1 rounded-sm px-2 py-1.5 text-body-sm text-ink hover:bg-surface-soft desktop:inline-flex">
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
    Duas leituras diferentes, porque abaixo do desktop o hero não tem mais busca.

    No celular a barra grande virava um cartão de quatro linhas em cima do vídeo
    e comia o banner inteiro. Ela saiu de lá, então o atalho do header vale desde
    o primeiro quadro: é a única busca da tela e precisa estar sempre a um toque.

    No desktop a barra do hero continua, e ali as duas competiriam pelo mesmo
    clique: o header só assume depois que a do hero sobe.
  */
  const heroPassou = useHeroSearchPassed(isHome);
  const oculto = useHeaderOculto();
  const mostrarBusca = !hideSearch;
  const mostrarBarraDesktop = (!isHome || heroPassou) && !hideSearch;

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
      {/*
        Duas linhas no celular, uma no desktop.

        Enfileirar marca, busca e menu numa linha só deixava 243px para a busca
        numa tela de 375, e o nome da marca não cabia junto: era o monograma
        sozinho, que não diz o nome de quem ainda não conhece a Movepark. Em duas
        linhas a marca volta inteira e a busca ocupa a largura do dedo.

        A linha que a busca custa é devolvida com juros pelo banner: a barra
        grande que morava lá empilhava quatro campos por cima do vídeo.
      */}
      <div className="mx-auto w-full max-w-[1280px] px-4 desktop:hidden">
        <div className="relative flex h-16 items-center justify-end">
          {/* Centrada de verdade: em `justify-between` com o menu de um lado só,
              a marca ficava deslocada pela largura do botão. */}
          <Link to="/" className="absolute left-1/2 -translate-x-1/2" aria-label="Ir para a home">
            <Wordmark height={22} />
          </Link>
          <ConsumerMobileMenu />
        </div>

        {mostrarBusca && (
          <div
            /* `max-w-2xl` porque no tablet a pílula chegava a 736px de largura
               para carregar duas palavras, e o alvo do dedo não melhora depois
               de um ponto. */
            className="mx-auto max-w-2xl pb-3"
          >
            {/*
              O atalho que abre a busca por cima da página, no lugar da barra
              inteira: entre 744 e 1128 os campos dela se sobrepunham, e "Onde",
              "Check-in", "Check-out" e "Veículo" saíam empilhados um sobre o
              outro.

              Violeta só na lupa. O botão é a ação da linha, e o fundo cinza da
              pílula é o que separa campo de página sem gritar.
            */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Buscar vaga"
              className="flex h-14 w-full items-center justify-between gap-3 rounded-full border border-hairline bg-surface-soft py-1.5 pl-5 pr-1.5 text-left text-body-md text-muted"
            >
              {/* O rótulo curto é o mesmo do título do modal que este botão abre.
                  "Onde · Quando · Veículo" media 222px e não cabia. */}
              <span className="truncate">{destParam ? destParam : "Buscar vaga"}</span>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-mp-primary text-white">
                <MagnifyingGlass className="h-5 w-5" weight="bold" />
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="mx-auto hidden h-20 w-full max-w-[1280px] items-center gap-4 px-4 desktop:flex desktop:px-8">
        <Link to="/" className="shrink-0" aria-label="Ir para a home">
          <Wordmark height={22} />
        </Link>

        <DestinosMenu />

        {/* `min-w-0` porque item de flex não encolhe abaixo do conteúdo por
            padrão: sem ele a barra de busca segurava a largura mínima dela e
            empurrava os botões da direita para fora da tela. */}
        <div className="flex min-w-0 flex-1 justify-center">
          {/* A SearchBarPill funcional, semeada com a busca atual e preservando os filtros já
              aplicados (estacionamento, comodidades, ordenação…). Na home ela entra quando a do
              hero sobe. */}
          {mostrarBarraDesktop && (
            <SearchBarPill
              variant="compact"
              className="w-full max-w-3xl"
              key={`${destParam ?? ""}|${pointParam ?? ""}|${fromParam ?? ""}|${toParam ?? ""}|${vehicleParam}`}
              initialDest={destParam}
              initialPoint={pointParam}
              initialFrom={parseDate(fromParam)}
              initialTo={parseDate(toParam)}
              initialVehicle={vehicleParam}
              preserveParams
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          {!session && (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/seja-parceiro">Seja parceiro</Link>
              </Button>
              {/* Até o desktop o "Entrar" mora dentro da aba lateral: a linha de
                  cima do celular só comporta a marca e o menu. */}
              {contasDoConsumidorLigadas() && (
                <Button size="sm" variant="primary" asChild>
                  <Link to="/login">Entrar</Link>
                </Button>
              )}
            </>
          )}

          {session && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  /* Só no desktop: no celular o avatar é o gatilho da aba lateral,
                     e o dropdown aqui daria dois menus colados no mesmo canto. */
                  className="flex items-center gap-2 rounded-full border border-hairline px-2 py-1 hover:shadow-tier"
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
                {/* Atalhos de cliente. "Ir pro Manager" e "Ir pro Operator"
                    seguem abaixo sem gate: são navegação da equipe. */}
                {effectiveRole === "customer" && contasDoConsumidorLigadas() && (
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
        </div>
      </div>

      {/* modal={false}: sem o body-lock/focus-trap do Radix Dialog modal, que quebra os
          Popover/cmdk aninhados (DestinationCombobox, DateRangePicker) portados pra fora do
          content (tocar num destino ou dia não seleciona). Como modal={false} deixa o fundo
          clicável, o content é full-screen e opaco: cobre a página toda e não sobra brecha
          pro clique vazar pro fundo. */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen} modal={false}>
        <DialogContent className="inset-0 left-0 top-0 h-full max-h-none w-full max-w-none translate-x-0 translate-y-0 content-start gap-4 rounded-none border-0 desktop:hidden">
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
    </header>
  );
}
