import * as React from "react";
import { CaretUpDown, Check } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type CompanyOption = { id: string; name: string };

/** Sem acento e em minúsculas, para "agencia" achar "Agência". */
function chave(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function filtraEmpresas(companies: CompanyOption[], query: string): CompanyOption[] {
  const q = chave(query);
  if (!q) return companies;
  return companies.filter((c) => chave(c.name).includes(q));
}

/**
 * Seletor de empresa com busca (16/09/2026). O select simples virou uma lista de 19 nomes
 * para rolar; com o catálogo crescendo, quem vincula uma conta precisa digitar e achar. Mesmo
 * desenho do BankSelect: a busca é nossa, sem acento, e o cmdk não filtra por conta própria.
 */
export function CompanyCombobox({
  companies,
  value,
  onChange,
  id,
  placeholder = "Selecione",
}: {
  companies: CompanyOption[];
  value: string;
  onChange: (id: string) => void;
  id?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const results = filtraEmpresas(companies, query);
  const selected = companies.find((c) => c.id === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-14 w-full items-center justify-between gap-2 rounded-sm border border-hairline bg-canvas px-4 text-left text-body-md text-ink",
            "focus:border-2 focus:border-ink focus:outline-none",
            !selected && "text-muted",
          )}
        >
          <span className="truncate">{selected ? selected.name : placeholder}</span>
          <CaretUpDown className="h-4 w-4 shrink-0 text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Busque pelo nome da empresa"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Nenhuma empresa com esse nome.</CommandEmpty>
            <CommandGroup>
              {results.map((c) => (
                <CommandItem
                  key={c.id}
                  value={c.id}
                  onSelect={() => {
                    onChange(c.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="gap-2"
                >
                  <span className="flex-1 truncate">{c.name}</span>
                  {value === c.id && <Check className="h-4 w-4 text-success" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
