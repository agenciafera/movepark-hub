import * as React from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, MapPin, Tag, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { managerSections, operatorSections } from "@/components/shared/nav-items";
import { filterSectionsByScopes } from "@/components/shared/Sidebar.logic";
import { useAuth } from "@/auth/context";
import { useAdminSearch, MIN_TERM, type SearchHit } from "./api";
import { groupHits, navCommands, type PaletteVariant } from "./palette.logic";

const KIND_ICON: Record<SearchHit["kind"], React.ComponentType<{ className?: string }>> = {
  booking: Calendar,
  location: MapPin,
  coupon: Tag,
};

export function CommandPalette({
  variant,
  open,
  onOpenChange,
}: {
  variant: PaletteVariant;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { hasScope } = useAuth();
  const [term, setTerm] = React.useState("");

  const { data: hits = [], isFetching } = useAdminSearch(term);

  // A navegação respeita os mesmos escopos da sidebar: a palette não pode ser
  // um atalho para uma tela que o papel do usuário não abre (ADR-005).
  const sections = React.useMemo(
    () => filterSectionsByScopes(variant === "manager" ? managerSections : operatorSections, hasScope),
    [variant, hasScope],
  );
  const comandos = React.useMemo(() => {
    const todos = navCommands(sections);
    const alvo = term.trim().toLowerCase();
    if (alvo.length < MIN_TERM) return todos;
    return todos.filter((c) => c.label.toLowerCase().includes(alvo));
  }, [sections, term]);
  const grupos = React.useMemo(() => groupHits(hits, variant), [hits, variant]);

  // Cada abertura começa limpa: reaproveitar o termo anterior faz a palette
  // abrir mostrando resultado de outra busca.
  React.useEffect(() => {
    if (open) setTerm("");
  }, [open]);

  function go(url: string) {
    onOpenChange(false);
    navigate(url);
  }

  const buscando = term.trim().length >= MIN_TERM;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl overflow-hidden p-0">
        <DialogTitle className="sr-only">Buscar no painel</DialogTitle>
        {/* `shouldFilter={false}`: quem filtra é o Postgres. O filtro embutido do
            cmdk descartaria resultado que casa por endereço ou por e-mail do
            cliente, já que o texto visível é só o título. */}
        <Command shouldFilter={false}>
          <CommandInput
            value={term}
            onValueChange={setTerm}
            placeholder="Buscar reserva, unidade, cupom ou ir para uma tela..."
          />
          <CommandList>
            <CommandEmpty>
              {buscando
                ? isFetching
                  ? "Buscando..."
                  : "Nada encontrado. Tente o código da reserva ou o nome da unidade."
                : "Digite para buscar, ou escolha uma tela abaixo."}
            </CommandEmpty>

            {grupos.map((grupo) => {
              const Icone = KIND_ICON[grupo.kind];
              return (
                <CommandGroup key={grupo.kind} heading={grupo.label}>
                  {grupo.hits.map(({ hit, url }) => (
                    <CommandItem key={hit.id} value={hit.id} onSelect={() => go(url)}>
                      <Icone className="h-4 w-4 shrink-0 text-muted" />
                      <span className="truncate font-medium">{hit.title}</span>
                      <span className="truncate text-caption text-muted">{hit.subtitle}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}

            {grupos.length > 0 && comandos.length > 0 && <CommandSeparator />}

            {/* Sem itens não se renderiza o grupo: um cabeçalho "Ir para"
                sozinho parece resultado que não carregou. */}
            {comandos.length > 0 && (
              <CommandGroup heading="Ir para">
                {comandos.map((c) => (
                  <CommandItem key={c.to} value={c.to} onSelect={() => go(c.to)}>
                    <c.icon className="h-4 w-4 shrink-0 text-muted" />
                    <span className="font-medium">{c.label}</span>
                    <span className="text-caption text-muted">{c.group}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>

          <div className="flex items-center justify-end gap-1.5 border-t border-hairline-soft px-3 py-2 text-caption-sm text-muted">
            <CornerDownLeft className="h-3 w-3" aria-hidden="true" />
            para abrir
            <kbd className="ml-2 rounded-xs border border-hairline px-1.5 py-0.5 font-sans">esc</kbd>
            para fechar
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
