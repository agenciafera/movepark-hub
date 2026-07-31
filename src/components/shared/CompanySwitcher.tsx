import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, Check, ChevronsUpDown, Network, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/auth/context";
import { useCompanies } from "@/features/companies/api";
import { cn } from "@/lib/utils";

type Props = {
  /** Nome mostrado no gatilho: a empresa em escopo, ou a rede toda. */
  name: string;
  /** Linha de baixo: o tamanho da rede, ou nada. */
  detail: string | null;
};

/**
 * Bloco de contexto da sidebar do Manager, que também troca de conta.
 *
 * O hub_admin já podia entrar como operador de uma empresa pela tela de Empresas
 * (impersonation). Aqui o mesmo caminho fica a um clique de qualquer tela, que é
 * o que o bloco sugere ao mostrar "de quem é a conta na tela".
 *
 * Só existe pro Manager: no painel do parceiro não há mecanismo de trocar a
 * empresa ativa, e um gatilho que não leva a lugar nenhum é pior que texto
 * parado.
 */
export function CompanySwitcher({ name, detail }: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { impersonatedCompanyId, startImpersonation, stopImpersonation } = useAuth();
  const navigate = useNavigate();
  // Só busca a lista quando o menu abre: a sidebar aparece em toda tela do painel.
  const companies = useCompanies(open);

  const filtered = (companies.data ?? []).filter((c) => {
    const needle = search.trim().toLowerCase();
    return (
      !needle || c.name.toLowerCase().includes(needle) || c.slug.toLowerCase().includes(needle)
    );
  });

  function enter(id: string, companyName: string) {
    startImpersonation(id);
    setOpen(false);
    toast.success(`Entrando como operador de ${companyName}`);
    navigate("/operator", { replace: true });
  }

  function backToNetwork() {
    stopImpersonation();
    setOpen(false);
    navigate("/manager", { replace: true });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Trocar de conta"
          className="hidden w-full items-center gap-3 rounded-md bg-white/[0.06] p-3 text-left transition-colors hover:bg-white/10 desktop:flex"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-mp-primary/25 text-white/80">
            <Building2 className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body-sm font-medium text-white" title={name}>
              {name}
            </span>
            {detail && (
              <span className="mt-0.5 block truncate text-caption text-white/55">{detail}</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/55" aria-hidden />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[300px] p-0">
        <div className="border-b border-hairline p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa"
              aria-label="Buscar empresa"
              className="h-10 pl-9"
            />
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-2">
          <button
            type="button"
            onClick={backToNetwork}
            aria-pressed={!impersonatedCompanyId}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-body-sm transition-colors",
              !impersonatedCompanyId
                ? "bg-mp-pale font-medium text-mp-indigo"
                : "text-body hover:bg-surface-soft",
            )}
          >
            <Network className="h-4 w-4 shrink-0" aria-hidden />
            Rede completa
            {!impersonatedCompanyId && (
              <Check className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
          </button>

          <p className="px-3 pb-1.5 pt-3 text-caption-sm text-muted-soft">Entrar como operador</p>

          {companies.isLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-body-sm text-muted">
              Nenhuma empresa com esse nome.
            </p>
          ) : (
            filtered.map((c) => {
              const active = c.id === impersonatedCompanyId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => enter(c.id, c.name)}
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left text-body-sm transition-colors",
                    active
                      ? "bg-mp-pale font-medium text-mp-indigo"
                      : "text-body hover:bg-surface-soft",
                  )}
                >
                  <span className="truncate">{c.name}</span>
                  {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
