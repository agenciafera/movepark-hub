import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import { filterSectionsByScopes } from "./Sidebar.logic";
import { managerSections, operatorSections } from "./nav-items";
import { Monogram, Wordmark } from "./Brand";

export function Sidebar({
  variant,
  brandTitle,
}: {
  variant: "manager" | "operator";
  brandTitle?: string;
}) {
  const { hasScope } = useAuth();
  const sections = filterSectionsByScopes(
    variant === "manager" ? managerSections : operatorSections,
    hasScope,
  );

  return (
    <aside className="hidden tablet:flex h-full w-[64px] desktop:w-[240px] shrink-0 flex-col overflow-y-auto border-r border-hairline bg-surface-soft px-3 py-6">
      <div className="hidden desktop:flex flex-col gap-1 px-3 pb-8">
        <Wordmark height={22} />
        {brandTitle && (
          <span className="pl-px text-[11px] font-bold uppercase tracking-[0.4px] text-muted-steel">
            {brandTitle}
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
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/manager" || item.to === "/operator"}
                className={({ isActive }) =>
                  cn(
                    "relative flex items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-muted transition-colors hover:bg-canvas hover:text-ink",
                    isActive &&
                      "bg-canvas font-medium text-ink shadow-tier before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:bg-mp-navy",
                  )
                }
                // No tablet o rótulo fica escondido: o title vira o tooltip do ícone.
                title={item.label}
                aria-label={item.label}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span className="hidden desktop:inline">{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
