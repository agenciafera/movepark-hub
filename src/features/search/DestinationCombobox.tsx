import * as React from "react";
import { Check } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDestinations, type Destination } from "./api";
import { destinationTypeIcon } from "@/lib/destination-types";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  onChange: (code: string | null) => void;
  placeholder?: string;
  /** Renderiza só o trigger compacto (sem chevron etc). */
  triggerClassName?: string;
  /** Conteúdo customizado dentro do trigger. Recebe o objeto destino atual. */
  triggerContent?: (current: Destination | null) => React.ReactNode;
};

/**
 * Combobox de destinos — usa Command (cmdk) + Popover.
 * Agrupa por país (BR / PT).
 */
export function DestinationCombobox({
  value,
  onChange,
  placeholder = "Aeroporto, cidade ou bairro",
  triggerClassName,
  triggerContent,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const { data: destinations } = useDestinations();
  const current = (destinations ?? []).find((d) => d.code === value) ?? null;

  const grouped = React.useMemo(() => {
    const map = new Map<string, Destination[]>();
    for (const d of destinations ?? []) {
      const arr = map.get(d.country) ?? [];
      arr.push(d);
      map.set(d.country, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [destinations]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-full w-full flex-col items-start justify-center gap-0.5 rounded-full px-6 text-left transition-colors hover:bg-surface-soft",
            triggerClassName,
          )}
        >
          {triggerContent ? (
            triggerContent(current)
          ) : (
            <>
              <span className="text-caption font-medium text-ink">Onde</span>
              <span className="line-clamp-1 text-body-sm text-muted">
                {current
                  ? `${current.short_name ?? current.name}`
                  : placeholder}
              </span>
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-0">
        <Command>
          <CommandInput placeholder="Aeroporto, código IATA, cidade..." />
          <CommandList>
            <CommandEmpty>Nenhum destino encontrado.</CommandEmpty>
            {grouped.map(([country, list]) => (
              <CommandGroup
                key={country}
                heading={country === "BR" ? "Brasil" : country === "PT" ? "Portugal" : country}
              >
                {list.map((d) => {
                  const Icon = destinationTypeIcon(d.type);
                  return (
                    <CommandItem
                      key={d.id}
                      value={`${d.code} ${d.name} ${d.city} ${d.short_name ?? ""}`}
                      onSelect={() => {
                        onChange(d.code);
                        setOpen(false);
                      }}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-mp-indigo" />
                      <div className="flex flex-1 flex-col">
                        <span className="text-body-sm text-ink">
                          {d.short_name ?? d.name}
                        </span>
                        <span className="text-caption-sm text-muted">
                          {d.city}
                          {d.state ? ` · ${d.state}` : ""}
                        </span>
                      </div>
                      {value === d.code && (
                        <Check className="h-4 w-4 text-mp-red" />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
