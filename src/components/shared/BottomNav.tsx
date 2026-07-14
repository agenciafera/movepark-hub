import * as React from "react";
import { NavLink } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { buildBottomNav } from "./Sidebar.logic";
import {
  managerPrimaryPaths,
  managerSections,
  operatorPrimaryPaths,
  operatorSections,
} from "./nav-items";

const isRoot = (path: string) => path === "/manager" || path === "/operator";

/**
 * Barra inferior do mobile: 4 destinos diretos e um botão "Mais" com todo o resto do menu.
 * A lista sai das mesmas seções da sidebar, já filtradas por escopo (ADR-005), então nenhuma
 * página permitida fica inalcançável no celular. Alvos de toque com no mínimo 44px.
 */
export function BottomNav({ variant }: { variant: "manager" | "operator" }) {
  const { hasScope } = useAuth();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const { primary, more } = buildBottomNav(
    variant === "manager" ? managerSections : operatorSections,
    hasScope,
    variant === "manager" ? managerPrimaryPaths : operatorPrimaryPaths,
  );

  return (
    <>
      <nav className="tablet:hidden fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-hairline bg-canvas">
        {primary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={isRoot(item.to)}
            className={({ isActive }) =>
              cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 py-2 text-caption-sm text-muted",
                isActive && "text-ink",
              )
            }
          >
            <item.icon className="h-4 w-4" />
            <span>{item.shortLabel ?? item.label}</span>
          </NavLink>
        ))}

        {more.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Mais opções"
            className="flex min-h-[44px] flex-col items-center justify-center gap-1 px-1 py-2 text-caption-sm text-muted"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span>Mais</span>
          </button>
        )}
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent className="tablet:hidden">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Tudo que você pode acessar nesta conta.</SheetDescription>
          </SheetHeader>
          <nav className="flex flex-col gap-6 overflow-y-auto px-6 py-4">
            {more.map((section, index) => (
              <div key={section.title ?? index} className="flex flex-col gap-1">
                {section.title && (
                  <span className="px-3 pb-1 text-caption font-medium text-muted-steel">
                    {section.title}
                  </span>
                )}
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={isRoot(item.to)}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-[44px] items-center gap-3 rounded-sm px-3 py-2 text-body-sm text-muted",
                        isActive && "bg-surface-soft font-medium text-ink",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
