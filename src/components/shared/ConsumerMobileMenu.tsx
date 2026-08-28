import * as React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { IconProps } from "@phosphor-icons/react";
import {
  Article,
  Buildings,
  Calculator,
  CalendarX,
  ChatCircle,
  Gauge,
  Gift,
  Heart,
  Info,
  Lifebuoy,
  LockKey,
  MapPin,
  Question,
  Scales,
  SquaresFour,
  Storefront,
  Tag,
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
import { contasDoConsumidorLigadas } from "@/lib/features";

/**
 * Traços do menu que viram X quando o painel abre.
 *
 * Três `span` em vez do ícone pronto porque o Phosphor troca um desenho pelo
 * outro, e troca não tem meio do caminho: o ícone pisca. Com os traços, o de
 * cima e o de baixo giram e se encontram no centro, e o do meio some, então o
 * movimento conta o que está acontecendo com o painel.
 *
 * A morfose aparece principalmente ao fechar, quando o painel desliza para fora
 * e devolve o botão à vista. Com o painel aberto ele fica atrás dele.
 */
function IconeDeMenu({ aberto }: { aberto: boolean }) {
  const traco =
    "absolute h-[2px] w-[18px] rounded-full bg-current transition duration-300 ease-out motion-reduce:transition-none";
  return (
    <span aria-hidden className="relative flex h-[18px] w-[18px] items-center justify-center">
      {/*
        Os dois eixos entram sempre, mesmo valendo zero. Trocar `translate` por
        `rotate` deixava o transform composto preso no valor antigo (o traço
        ficava deslocado e não girava), e declarar os dois faz o giro e a
        aproximação acontecerem no mesmo movimento.
      */}
      <span
        className={cn(traco, aberto ? "translate-y-0 rotate-45" : "-translate-y-[5px] rotate-0")}
      />
      <span className={cn(traco, aberto ? "opacity-0" : "opacity-100")} />
      <span
        className={cn(traco, aberto ? "translate-y-0 -rotate-45" : "translate-y-[5px] rotate-0")}
      />
    </span>
  );
}

type Icone = React.ComponentType<IconProps>;
type ItemDeMenu = { to: string; label: string; icone: Icone };
type GrupoDeMenu = { titulo: string; itens: ItemDeMenu[] };

/**
 * Busca de vaga é o motivo de alguém abrir o site, então "Destinos" fica solto no
 * topo, antes de qualquer título de grupo. É também o único link daqui que o
 * rodapé não tem: lá a busca já está no header em toda página.
 */
const DESTINOS: ItemDeMenu = { to: "/estacionamentos", label: "Destinos", icone: MapPin };

/**
 * Os grupos, os rótulos e a ordem são os **do rodapé**, item por item.
 *
 * O menu nasceu com cinco links porque metade destas páginas ainda não existia, e
 * o rodapé foi crescendo sozinho: quem estava no celular só chegava em preços,
 * calculadora, cancelamento ou contato rolando até o fim da página.
 *
 * Copiar a hierarquia do rodapé, e não inventar uma segunda, é o que evita o
 * problema mais caro: dois nomes para a mesma página fazem o leitor achar que são
 * páginas diferentes. Ao mexer no rodapé, mexa aqui no mesmo commit; o teste
 * `ConsumerMobileMenu.test.tsx` compara as duas listas.
 *
 * A exceção é a Central de Ajuda, que o rodapé não lista: ela é a porta de
 * entrada do suporte no celular, e por isso abre o grupo em vez de ficar de fora.
 */
const GRUPOS_DO_SITE: GrupoDeMenu[] = [
  {
    titulo: "Movepark",
    itens: [
      { to: "/sobre", label: "Sobre nós", icone: Buildings },
      // Barra final de propósito: é a URL canônica do blog, herdada do WordPress.
      { to: "/blog/", label: "Blog", icone: Article },
      { to: "/precos", label: "Índice de preços", icone: Tag },
      {
        to: "/calculadora-estacionamento-aeroporto",
        label: "Calculadora de estacionamento",
        icone: Calculator,
      },
      { to: "/termos", label: "Termos de uso", icone: Scales },
      { to: "/privacidade", label: "Política de privacidade", icone: LockKey },
    ],
  },
  {
    titulo: "Estacionamentos",
    itens: [
      { to: "/seja-parceiro", label: "Seja parceiro", icone: Storefront },
      { to: "/operator", label: "Painel do estacionamento", icone: Gauge },
    ],
  },
  {
    titulo: "Suporte",
    itens: [
      { to: "/ajuda", label: "Central de ajuda", icone: Lifebuoy },
      { to: "/faq", label: "Perguntas frequentes", icone: Question },
      { to: "/como-funciona", label: "Como funciona", icone: Info },
      { to: "/cancelamento", label: "Política de cancelamento", icone: CalendarX },
      { to: "/contato", label: "Fale conosco", icone: ChatCircle },
    ],
  },
];

const LINKS_DA_CONTA: ItemDeMenu[] = [
  { to: "/account/reservas", label: "Minhas reservas", icone: Ticket },
  { to: "/account/saved", label: "Favoritos", icone: Heart },
  { to: "/account/indicar", label: "Indique e ganhe", icone: Gift },
];

/**
 * Item do menu, com ícone à esquerda e marca de seção atual.
 *
 * O ícone não é enfeite: numa lista longa ele é o que deixa o dedo achar
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
 * Bloco nomeado da lista, com o mesmo título e a mesma ordem do rodapé.
 *
 * O título é discreto de propósito: numa lista de dezesseis itens ele existe para
 * o polegar saber onde parar de rolar, não para competir com os links. Por isso
 * `text-muted` em corpo pequeno, e não o `text-title-sm` que o rodapé usa, onde
 * as três colunas ficam lado a lado e o título é que separa uma da outra.
 *
 * Em caixa alta não vai: o contrato de escrita do projeto trata eyebrow em
 * maiúscula como vício, e aqui a maiúscula ainda atrapalharia a leitura rápida.
 *
 * `role="group"` + `aria-labelledby` para o leitor de tela anunciar o título ao
 * entrar no bloco, em vez de despejar dezesseis links num nível só.
 */
function Grupo({ titulo, itens }: GrupoDeMenu) {
  const id = React.useId();
  return (
    <div role="group" aria-labelledby={id} className="mt-4 first:mt-0">
      <p id={id} className="px-3 pb-1 text-caption-sm font-semibold text-muted">
        {titulo}
      </p>
      {itens.map((i) => (
        <Item key={i.to} {...i} />
      ))}
    </div>
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
 * Os links do site são os **do rodapé**, nos mesmos grupos e na mesma ordem. O
 * menu tinha ficado com cinco links de quando metade das páginas não existia, e o
 * celular só alcançava preços, calculadora, cancelamento ou contato rolando até o
 * fim da página.
 *
 * Vale do celular até o tablet. A virada é em 1128, e não em 744: entre os dois
 * a barra de busca completa não cabe no header, e os campos dela se sobrepunham.
 * Só a partir de 1128 o header tem largura para a busca inteira, o dropdown de
 * conta e os links soltos.
 */
export function ConsumerMobileMenu() {
  const [aberto, setAberto] = React.useState(false);
  const { session, effectiveRole, signOut } = useAuth();
  const navigate = useNavigate();

  /*
    Quem opera um estacionamento já recebeu "Ir pro Operator" logo acima, e o
    "Painel do estacionamento" do rodapé leva ao mesmo /operator. Repetido, o link
    ainda acenderia duas vezes como seção atual dentro de /operator. O rodapé pode
    mantê-lo porque lá ele fala com o parceiro que ainda não entrou.
  */
  const grupos =
    effectiveRole === "company_operator"
      ? GRUPOS_DO_SITE.map((g) => ({ ...g, itens: g.itens.filter((i) => i.to !== "/operator") }))
      : GRUPOS_DO_SITE;

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
          /*
            Traços em tinta, sem o círculo violeta que já esteve aqui.

            O violeta preenchido existia para o botão não sumir num header
            branco, quando ele era a única cor da linha. Com a busca logo abaixo,
            a lupa violeta assumiu esse papel, e dois círculos violeta na mesma
            área disputavam o mesmo toque. Aceso, o menu continua a única porta de
            navegação, e três traços em tinta cheia não passam despercebidos.

            Logado, o círculo fica: as iniciais precisam de um corpo atrás delas.
          */
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full transition-colors desktop:hidden",
            session
              ? "bg-mp-primary text-white hover:bg-mp-primary-active"
              : "text-ink hover:bg-surface-soft",
          )}
        >
          {session ? (
            <span className="text-caption-sm font-bold">
              {userInitials(session.fullName, session.email)}
            </span>
          ) : (
            <IconeDeMenu aberto={aberto} />
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
        /* A entrada é mais longa que a saída de propósito: abrir apresenta o
           painel e merece ser vista, fechar é o usuário já querendo voltar ao
           conteúdo. O padrão do plugin (150ms para os dois) fazia o painel
           aparecer estalado. */
        className="w-[320px] overflow-y-auto ease-out focus:outline-none data-[state=closed]:ease-in data-[state=closed]:[animation-duration:200ms] data-[state=open]:[animation-duration:300ms]"
      >
        <SheetHeader>
          {/*
            `self-start` porque o `SheetHeader` é uma coluna de flex e a coluna
            estica o filho na transversal: sem ele a marca ia a 271px de largura
            num painel de 320, esticada, com a altura de 20px travada pelo estilo
            inline. Encostada na esquerda ela volta à proporção real.
          */}
          <Wordmark height={20} className="self-start" />
          {/* O Radix exige título para o leitor de tela; na tela quem nomeia o
              painel é a marca. */}
          <SheetTitle className="sr-only">Menu</SheetTitle>
        </SheetHeader>

        {/* Bloco de identidade: diz de quem é a conta aberta e já leva para ela,
            que é o atalho que o avatar sozinho não oferecia. */}
        {session && contasDoConsumidorLigadas() && (
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

        {/* Sem régua entre os itens: quem separa um bloco do outro é o título do
            grupo, e a linha em cima dele viraria risco em cima de risco. A régua
            só entra entre a conta e o site, que é onde separa duas naturezas. */}
        <nav aria-label="Menu" className="mt-2 flex flex-col px-3 pb-2">
          {session && (
            <>
              {contasDoConsumidorLigadas() && LINKS_DA_CONTA.map((l) => <Item key={l.to} {...l} />)}
              {effectiveRole === "hub_admin" && (
                <Item to="/manager" label="Ir pro Manager" icone={SquaresFour} />
              )}
              {effectiveRole === "company_operator" && (
                <Item to="/operator" label="Ir pro Operator" icone={SquaresFour} />
              )}
              <hr className="my-3 border-hairline" />
            </>
          )}

          <Item {...DESTINOS} />

          {grupos.map((g) => (
            <Grupo key={g.titulo} {...g} />
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4 p-6">
          {session ? (
            <Button variant="outline" className="w-full" onClick={() => void sair()}>
              Sair
            </Button>
          ) : (
            contasDoConsumidorLigadas() && (
              <SheetClose asChild>
                <Button asChild className="w-full">
                  <Link to="/login">Entrar</Link>
                </Button>
              </SheetClose>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
