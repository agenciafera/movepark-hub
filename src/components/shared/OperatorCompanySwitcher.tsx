import * as React from "react";
import { Buildings, CaretUpDown, Check } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useCompanySwitch } from "@/features/companies/useCompanySwitch";
import { cn } from "@/lib/utils";

/**
 * Bloco de contexto da sidebar do parceiro quando ele é membro de mais de uma empresa
 * (13/10/2026): mostra a empresa ativa e troca entre as dele. Com uma empresa só, a sidebar
 * mantém o bloco parado, porque um gatilho que não leva a lugar nenhum é pior que texto.
 *
 * Mesmo visual do `CompanySwitcher` do Manager, sem a busca: aqui a lista é curta. No tablet e
 * no celular a sidebar some ou vira só ícone, e a troca fica no menu do avatar (Topbar).
 */
export function OperatorCompanySwitcher({ name }: { name: string }) {
  const [open, setOpen] = React.useState(false);
  const { count, activeId, options, isLoading, select } = useCompanySwitch();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Trocar de empresa"
          className="hidden w-full items-center gap-3 rounded-md bg-white/[0.06] p-3 text-left transition-colors hover:bg-white/10 desktop:flex"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-mp-primary/25 text-white/80">
            <Buildings className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-sm font-medium text-white" title={name}>
              {name}
            </span>
            <span className="mt-0.5 block truncate text-caption text-white/55">
              {count} empresas
            </span>
          </span>
          <CaretUpDown className="h-4 w-4 shrink-0 text-white/55" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[280px] p-2">
        <p className="px-3 pb-1.5 pt-1 text-caption-sm text-muted-soft">Suas empresas</p>
        {isLoading ? (
          <div className="space-y-2 p-1">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        ) : (
          options.map((c) => {
            const active = c.id === activeId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  select(c.id);
                }}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors",
                  active ? "bg-mp-pale text-mp-indigo" : "text-body hover:bg-surface-soft",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className={cn("block truncate text-body-sm", active && "font-medium")}
                    title={c.name}
                  >
                    {c.name}
                  </span>
                  {c.roleLabel && (
                    <span className="block text-caption text-muted">{c.roleLabel}</span>
                  )}
                </span>
                {active && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              </button>
            );
          })
        )}
      </PopoverContent>
    </Popover>
  );
}
