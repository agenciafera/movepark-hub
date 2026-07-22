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
  const { hasScope, effectiveCompanyIds } = useAuth();
  const sections = filterSectionsByScopes(
    variant === "manager" ? managerSections : operatorSections,
    hasScope,
  );

  // Sob a marca vai o nome da empresa em escopo, que é a informação que o
  // parceiro precisa ("estou mexendo em qual conta?"). O `brandTitle` genérico
  // fica de fallback: o hub_admin não pertence a uma empresa, então no manager
  // continua "Backoffice" até ele impersonar, quando o nome passa a valer.
  const company = useCompany(effectiveCompanyIds[0]);
  const subtitle = company.data?.name ?? brandTitle;
  // Leads novos aguardando análise → badge no item "Parceiros" (só no manager).
  const pendingPartners = usePendingPartnerCount(variant === "manager");
  const newLeads = variant === "manager" ? (pendingPartners.data ?? 0) : 0;

  return (
    <aside className="hidden tablet:flex h-full w-[64px] desktop:w-[240px] shrink-0 flex-col overflow-y-auto border-r border-hairline bg-surface-soft px-3 py-6">
      <div className="hidden desktop:flex flex-col items-center gap-1.5 px-3 pb-8 text-center">
        <Wordmark height={22} />
        {subtitle && (
          <span
            className="line-clamp-2 text-caption font-medium text-muted-steel"
            title={subtitle}
          >
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex desktop:hidden justify-center pb-8">
        <Monogram size={28} />
      </div>

      <nav className="flex flex-col gap-4">
        {sections.map((section, index) => (
          <div key={section.title ?? index} className="flex flex-col gap-1">
            {section.title && (
              <>
                {/* Desktop mostra o título do grupo; no tablet (só-ícone) sobra um filete separando. */}
                <span className="hidden desktop:block px-3 pb-1 text-caption font-medium text-muted-steel">
                  {section.title}
                </span>
                {index > 0 && (
                  <span
                    aria-hidden
                    className="desktop:hidden mx-auto mb-1 h-px w-6 bg-hairline"
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
                      "relative flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-muted transition-colors hover:bg-canvas hover:text-ink",
                      // Ativo = pastilha branca sobre o cinza da barra, texto ink e
                      // peso médio. Três sinais já bastam. Saíram daqui a tarja de
                      // 2px na borda esquerda (a forma que o design system proíbe
                      // como acento colorido em item de lista) e a `shadow-tier`,
                      // que é sombra de hover/elevação estrutural e estava em
                      // repouso num elemento plano.
                      isActive && "bg-canvas font-medium text-ink",
                    )
                  }
                  // No tablet o rótulo fica escondido: o title vira o tooltip do ícone.
                  title={badge > 0 ? `${item.label} (${badge} novo${badge > 1 ? "s" : ""})` : item.label}
                  aria-label={badge > 0 ? `${item.label}, ${badge} lead${badge > 1 ? "s" : ""} novo${badge > 1 ? "s" : ""}` : item.label}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {/* tablet (só-ícone): contador no canto do ícone */}
                  {badge > 0 && (
                    <span className="desktop:hidden absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-mp-primary px-1 text-[10px] font-semibold leading-none text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                  <span className="hidden desktop:inline">{item.label}</span>
                  {/* desktop: pill com o número depois do rótulo */}
                  {badge > 0 && (
                    <span className="ml-auto hidden desktop:inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-mp-primary px-1.5 text-caption-sm font-semibold text-white">
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
