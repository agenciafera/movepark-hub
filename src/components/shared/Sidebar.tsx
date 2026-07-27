import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { usePendingPartnerCount } from "@/features/onboarding/managerApi";
import { filterSectionsByScopes } from "./Sidebar.logic";
import { managerSections, operatorSections } from "./nav-items";
import { Monogram, Wordmark } from "./Brand";
import { useCompany } from "@/features/companies/api";

export function Sidebar({
  variant,
  brandTitle,
}: {
  variant: "manager" | "operator";
  brandTitle?: string;
}) {
  const { hasScope, effectiveCompanyIds, impersonatedCompanyId } = useAuth();
  const sections = filterSectionsByScopes(
    variant === "manager" ? managerSections : operatorSections,
    hasScope,
  );

  // Sob a marca vai o nome da empresa em escopo, que é a informação que o
  // parceiro precisa ("estou mexendo em qual conta?"). O `brandTitle` genérico
  // fica de fallback: o hub_admin não pertence a uma empresa, então no manager
  // continua "Backoffice" até ele impersonar, quando o nome passa a valer.
  //
  // No operator o nome vem da empresa em escopo. No manager NÃO pode vir de
  // `effectiveCompanyIds[0]`: para o hub_admin isso é só a primeira empresa da
  // lista e aparecia como se ele fosse dela (ex.: "Virapark"). Só mostra o nome
  // quando está de fato impersonando.
  const subtitleCompanyId =
    variant === "operator" ? effectiveCompanyIds[0] : (impersonatedCompanyId ?? undefined);
  const company = useCompany(subtitleCompanyId);
  const subtitle = company.data?.name ?? brandTitle;
  // Leads novos aguardando análise → badge no item "Parceiros" (só no manager).
  const pendingPartners = usePendingPartnerCount(variant === "manager");
  const newLeads = variant === "manager" ? (pendingPartners.data ?? 0) : 0;

  return (
    <aside className="hidden tablet:flex h-full w-[64px] desktop:w-[240px] shrink-0 flex-col overflow-y-auto bg-mp-navy px-3 py-6">
      <div className="hidden desktop:flex flex-col items-center gap-1.5 px-3 pb-8 text-center">
        <Wordmark height={22} className="brightness-0 invert" />
        {subtitle && (
          <span
            className="line-clamp-2 text-caption font-medium text-white/50"
            title={subtitle}
          >
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex desktop:hidden justify-center pb-8">
        <Monogram size={28} className="brightness-0 invert" />
      </div>

      <nav className="flex flex-col gap-4">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className="flex flex-col gap-1">
            {section.title && (
              <>
                {/* Desktop mostra o título do grupo; no tablet (só-ícone) sobra um filete separando. */}
                <span className="hidden desktop:block px-3 pb-1 text-caption font-medium uppercase tracking-[0.3px] text-white/40">
                  {section.title}
                </span>
                {index > 0 && (
                  <span
                    aria-hidden
                    className="desktop:hidden mx-auto mb-1 h-px w-6 bg-white/10"
                  />
                )}
              </>
            )}
            {section.items.map((item) => {
              const badge = item.to === "/manager/partners" ? newLeads : 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/manager" || item.to === "/operator"}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white",
                      // Barra navy (identidade da marca): item ativo = pílula violeta
                      // (o violeta-CTA é permitido como indicador de seleção ativa),
                      // texto branco e peso médio. Sem tarja lateral (proibida pelo
                      // design system) e sem sombra em repouso.
                      isActive && "bg-mp-primary font-medium text-white",
                    )
                  }
                  // No tablet o rótulo fica escondido: o title vira o tooltip do ícone.
                  title={badge > 0 ? `${item.label} (${badge} novo${badge > 1 ? "s" : ""})` : item.label}
                  aria-label={badge > 0 ? `${item.label}, ${badge} lead${badge > 1 ? "s" : ""} novo${badge > 1 ? "s" : ""}` : item.label}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {/* tablet (só-ícone): contador no canto do ícone */}
                  {badge > 0 && (
                    <span className="desktop:hidden absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-semibold leading-none text-mp-navy">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                  <span className="hidden desktop:inline">{item.label}</span>
                  {/* desktop: pill com o número depois do rótulo */}
                  {badge > 0 && (
                    <span className="ml-auto hidden desktop:inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-caption-sm font-semibold text-mp-navy">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
