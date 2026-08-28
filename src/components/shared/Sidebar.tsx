import * as React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { abrirStudio } from "@/features/studio/api";
import { ArrowSquareOut, Buildings, CaretRight, ShieldWarning } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { usePendingPartnerCount } from "@/features/onboarding/managerApi";
import { useConversas } from "@/features/inbox/api";
import { contarNaoLidas, juntarPaginas } from "@/features/inbox/inbox.logic";
import { filterSectionsByScopes } from "./Sidebar.logic";
import { managerSections, operatorSections, type Item } from "./nav-items";
import { secaoAtiva } from "./menuAtivo";
import { Monogram, Wordmark } from "./Brand";
import { useCompany } from "@/features/companies/api";
import { useNetworkSize } from "@/features/locations/api";
import { CompanySwitcher } from "./CompanySwitcher";

/** Uma linha de menu que é link. Serve para item solto e para subitem. */
function NavRow({
  item,
  badge = 0,
  nested = false,
  end = false,
}: {
  item: Item;
  badge?: number;
  nested?: boolean;
  end?: boolean;
}) {
  // Item externo não navega: abre outra aba. Mesmo desenho da linha, para não parecer
  // outra coisa, e um `title` que avisa o destino antes do clique.
  if (item.externo) {
    return (
      <button
        type="button"
        onClick={() => {
          void abrirStudio().catch((erro) => {
            toast.error(
              erro instanceof Error && erro.message
                ? erro.message
                : "Não consegui abrir o Studio agora.",
            );
          });
        }}
        title={`${item.label} (abre em nova aba)`}
        className="relative flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-body-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="hidden desktop:inline">{item.label}</span>
        <ArrowSquareOut className="ml-auto hidden h-3.5 w-3.5 shrink-0 opacity-50 desktop:inline" />
      </button>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={end || item.to === "/manager" || item.to === "/operator"}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 rounded-sm px-3 py-2.5 text-body-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white",
          // Barra navy (identidade da marca): item ativo = pílula violeta
          // (o violeta-CTA é permitido como indicador de seleção ativa),
          // texto branco e peso semibold. Sem tarja lateral (proibida pelo
          // design system) e sem sombra em repouso.
          isActive && "bg-mp-primary font-semibold text-white",
          // Subitem recua e afina só no desktop. No tablet a sidebar é só-ícone e o recuo
          // empurraria o ícone para fora do centro da coluna.
          nested && "desktop:pl-9 desktop:text-caption",
        )
      }
      // No tablet o rótulo fica escondido: o title vira o tooltip do ícone.
      title={badge > 0 ? `${item.label} (${badge} novo${badge > 1 ? "s" : ""})` : item.label}
      aria-label={
        badge > 0
          ? `${item.label}, ${badge} lead${badge > 1 ? "s" : ""} novo${badge > 1 ? "s" : ""}`
          : item.label
      }
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {/* tablet (só-ícone): contador no canto do ícone */}
      {badge > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold leading-none text-mp-navy desktop:hidden">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
      <span className="hidden desktop:inline">{item.label}</span>
      {/* desktop: pílula com o número depois do rótulo */}
      {badge > 0 && (
        <span className="ml-auto hidden h-5 min-w-5 items-center justify-center rounded-full bg-white/15 px-2 text-caption-sm font-bold text-white desktop:inline-flex">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

/**
 * Item com subitens: uma gaveta que abre e fecha.
 *
 * O pai não é link. Ele existe para a área ocupar uma linha do menu em vez de quatro, e clicar
 * nele abre a lista em vez de navegar: navegar e abrir no mesmo clique faria o usuário sair da
 * página só para ver as opções.
 *
 * A gaveta nasce aberta quando a pessoa já está numa das telas de dentro, senão o menu esconderia
 * justamente onde ela está.
 */
function NavGroup({ item }: { item: Item }) {
  const { pathname } = useLocation();
  const filhos = item.children ?? [];
  const temFilhoAtivo = filhos.some((filho) => secaoAtiva(pathname, filho.to));
  const [aberto, setAberto] = React.useState(temFilhoAtivo);

  // Navegar para dentro do grupo (por link da página, busca, URL colada) reabre a gaveta.
  React.useEffect(() => {
    if (temFilhoAtivo) setAberto(true);
  }, [temFilhoAtivo]);

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        title={item.label}
        className={cn(
          "flex items-center gap-3 rounded-sm px-3 py-2.5 text-body-sm font-medium text-white/70 transition-colors hover:bg-white/[0.06] hover:text-white",
          // Fechada com uma tela de dentro ativa, a linha do pai fica marcada: é o único
          // sinal que sobra de onde a pessoa está.
          temFilhoAtivo && !aberto && "bg-white/[0.06] text-white",
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="hidden desktop:inline">{item.label}</span>
        <CaretRight
          aria-hidden
          className={cn(
            "ml-auto hidden h-3 w-3 transition-transform desktop:block",
            aberto && "rotate-90",
          )}
        />
      </button>

      {aberto && (
        <div className="flex flex-col gap-0.5">
          {filhos.map((filho) => (
            <NavRow
              key={filho.to}
              item={filho}
              nested
              // O filho-índice divide o prefixo com os irmãos (/marketing e /marketing/leads),
              // então sem `end` ele acenderia junto com todos eles.
              end={filhos.some((outro) => outro.to.startsWith(`${filho.to}/`))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  variant,
  brandTitle,
}: {
  variant: "manager" | "operator";
  brandTitle?: string;
}) {
  const { session, hasScope, effectiveCompanyIds, impersonatedCompanyId, stopImpersonation } =
    useAuth();
  const navigate = useNavigate();
  const sections = filterSectionsByScopes(
    variant === "manager" ? managerSections : operatorSections,
    hasScope,
  );

  // O bloco de contexto responde "estou mexendo em qual conta?".
  //
  // No operator o nome vem da empresa em escopo. No manager NÃO pode vir de
  // `effectiveCompanyIds[0]`: para o hub_admin isso é só a primeira empresa da
  // lista e aparecia como se ele fosse dela (ex.: "Virapark"). Sem impersonar, o
  // manager vê o tamanho da rede; o nome da empresa só entra quando ele está de
  // fato dentro de uma.
  const scopedCompanyId =
    variant === "operator" ? effectiveCompanyIds[0] : (impersonatedCompanyId ?? undefined);
  const company = useCompany(scopedCompanyId);
  const network = useNetworkSize(variant === "manager" && !impersonatedCompanyId);

  const contextName = company.data?.name ?? (variant === "manager" ? "Rede completa" : "Sua conta");
  // No manager sem impersonar, a linha de baixo é o tamanho da rede. Impersonando
  // ou no operator, o nome da empresa já diz tudo e a linha some: "Trocar unidade"
  // esteve aqui e era promessa vazia, porque o painel do parceiro não troca de
  // empresa ativa.
  const contextDetail =
    variant === "manager" && !impersonatedCompanyId
      ? network.data
        ? `${network.data.locations} ${network.data.locations === 1 ? "unidade" : "unidades"} · ${network.data.companies} ${network.data.companies === 1 ? "empresa" : "empresas"}`
        : "toda a rede"
      : null;

  // Leads novos aguardando análise → badge no item "Parceiros" (só no manager).
  const pendingPartners = usePendingPartnerCount(variant === "manager");
  const newLeads = variant === "manager" ? (pendingPartners.data ?? 0) : 0;

  /**
   * Conversas do WhatsApp esperando resposta → badge em "Conversas".
   *
   * A query é a mesma da tela, então abrir a caixa de entrada não refaz a chamada: o
   * TanStack Query serve as duas pela mesma chave.
   */
  const conversas = useConversas(variant === "manager");
  const naoLidas =
    variant === "manager"
      ? contarNaoLidas(juntarPaginas(conversas.data?.pages))
      : 0;

  const impersonating = !!impersonatedCompanyId && session?.role === "hub_admin";

  return (
    <aside className="hidden h-full w-[76px] shrink-0 flex-col gap-6 overflow-y-auto bg-mp-navy px-3 py-6 tablet:flex tablet:rounded-lg desktop:w-72 desktop:px-4">
      <div className="hidden px-2 desktop:block">
        <Wordmark height={20} className="brightness-0 invert" />
        {brandTitle && (
          <div className="mt-1.5 text-caption font-medium text-white/45">{brandTitle}</div>
        )}
      </div>
      <div className="flex justify-center desktop:hidden">
        <Monogram size={28} className="brightness-0 invert" />
      </div>

      {/* Contexto: de quem é a conta que está na tela. No manager ele também
          troca de conta, que é o que o bloco sugere ao nomear a conta. */}
      {variant === "manager" ? (
        <CompanySwitcher name={contextName} detail={contextDetail} />
      ) : (
        <div className="hidden items-center gap-3 rounded-md bg-white/[0.06] p-3 desktop:flex">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-mp-primary/25 text-white/80">
            <Buildings className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate text-body-sm font-medium text-white"
              title={contextName}
            >
              {contextName}
            </span>
          </span>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-6">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className="flex flex-col gap-0.5">
            {section.title && (
              <>
                {/* Desktop mostra o título do grupo; no tablet (só-ícone) sobra um filete separando. */}
                <span className="hidden px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.4px] text-white/40 desktop:block">
                  {section.title}
                </span>
                {index > 0 && (
                  <span aria-hidden className="mx-auto mb-1 h-px w-6 bg-white/10 desktop:hidden" />
                )}
              </>
            )}
            {section.items.map((item) =>
              item.children?.length ? (
                <NavGroup key={item.to} item={item} />
              ) : (
                <NavRow
                  key={item.to}
                  item={item}
                  badge={
                    item.to === "/manager/partners"
                      ? newLeads
                      : item.to === "/manager/conversas"
                        ? naoLidas
                        : 0
                  }
                />
              ),
            )}
          </div>
        ))}
      </nav>

      {/* Impersonation mora aqui, no rodapé da sidebar, e não numa faixa acima do
          conteúdo: a faixa empurrava a página toda pra baixo em toda tela. */}
      {impersonating && (
        <div className="hidden rounded-md bg-mp-red/15 p-4 ring-1 ring-inset ring-mp-red/30 desktop:block">
          <div className="flex items-center gap-2">
            <ShieldWarning className="h-4 w-4 shrink-0 text-mp-red" aria-hidden />
            <span className="text-caption font-bold text-white">Modo operador</span>
          </div>
          <p className="mt-2 text-caption leading-relaxed text-white/60">
            Você está vendo o painel como {company.data?.name ?? "a empresa"}.
          </p>
          <button
            type="button"
            onClick={() => {
              stopImpersonation();
              navigate("/manager", { replace: true });
            }}
            className="mt-3 h-9 w-full rounded-sm bg-white/10 text-caption font-semibold text-white transition-colors hover:bg-white/20"
          >
            Sair do modo
          </button>
        </div>
      )}
    </aside>
  );
}
