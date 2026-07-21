import * as React from "react";
import { ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { BANKS, searchBanks, bankName } from "@/lib/banks";
import { cn } from "@/lib/utils";

/**
 * Seleção de banco com busca por código ou nome (COMPE). Substitui o input cru de código no
 * recebimento. Guarda só o código (o que a Pagar.me usa); a busca própria (searchBanks) cobre
 * código por prefixo e nome por substring, sem depender do filtro interno do cmdk.
 */
export function BankSelect({
  value,
  onChange,
  invalid,
  id,
  "aria-describedby": ariaDescribedby,
}: {
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  id?: string;
  "aria-describedby"?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const results = query ? searchBanks(query) : BANKS;
  const selectedName = value ? bankName(value) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-describedby={ariaDescribedby}
          className={cn(
            "flex h-14 w-full items-center justify-between gap-2 rounded-sm border border-hairline bg-canvas px-4 text-left text-body-md text-ink",
            "focus:border-2 focus:border-ink focus:outline-none",
            !value && "text-muted",
          )}
        >
          <span className="truncate">
            {value ? `${value} - ${selectedName ?? "Banco"}` : "Selecione o banco"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Busque por código ou nome"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
            <CommandGroup>
              {results.map((b) => (
                <CommandItem
                  key={b.code}
                  value={b.code}
                  onSelect={() => {
                    onChange(b.code);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="gap-2"
                >
                  <span className="w-10 shrink-0 font-mono text-caption text-muted-steel">{b.code}</span>
                  <span className="flex-1 truncate">{b.name}</span>
                  {value === b.code && <Check className="h-4 w-4 text-success" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
