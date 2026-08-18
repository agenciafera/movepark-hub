import * as React from "react";
import { Check, GlobeHemisphereWest } from "@phosphor-icons/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { MapPin } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAllDestinationPoints, useDestinations, type Destination } from "./api";
import { destinationTypeIcon } from "@/lib/destination-types";
import { cn } from "@/lib/utils";

type Props = {
  value: string | null;
  onChange: (code: string | null, pointId?: string | null) => void;
  /** Terminal/ponto selecionado (E2.1.2). */
  pointValue?: string | null;
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
  pointValue = null,
  placeholder = "Aeroporto, cidade ou bairro",
  triggerClassName,
  triggerContent,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const { data: destinations } = useDestinations();
  const { data: points } = useAllDestinationPoints();
  const current = (destinations ?? []).find((d) => d.code === value) ?? null;
  const currentPoint = (points ?? []).find((p) => p.id === pointValue) ?? null;

  // pontos (terminais) por destino, na ordem de sort_order
  const pointsByDest = React.useMemo(() => {
    const map = new Map<string, typeof points>();
    for (const p of points ?? []) {
      const arr = map.get(p.destination_id) ?? [];
      arr.push(p);
      map.set(p.destination_id, arr as typeof points);
    }
    return map;
  }, [points]);

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
                  ? `${current.short_name ?? current.name}${currentPoint ? ` · ${currentPoint.name}` : ""}`
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
            {/*
              Sem destino a busca roda em todos os aeroportos, e até aqui esse era
              um estado que dava para chegar sem querer (abrindo a home) mas não
              para escolher: depois de marcar um destino, não havia como desmarcar.

              Fica fora dos grupos de país de propósito, porque não pertence a
              nenhum, e fora do `value` de busca do cmdk pelos nomes dos destinos,
              para não brigar com a digitação: quem escreve "GRU" quer o GRU.
            */}
            <CommandGroup>
              <CommandItem
                value="todos os destinos todo qualquer lugar"
                onSelect={() => {
                  onChange(null, null);
                  setOpen(false);
                }}
              >
                <GlobeHemisphereWest className="h-4 w-4 shrink-0 text-mp-indigo" />
                <div className="flex flex-1 flex-col">
                  <span className="text-body-sm text-ink">Todos os destinos</span>
                  <span className="text-caption-sm text-muted">
                    Compara os aeroportos de uma vez
                  </span>
                </div>
                {!value && !pointValue && <Check className="h-4 w-4 text-mp-primary" />}
              </CommandItem>
            </CommandGroup>
            {grouped.map(([country, list]) => (
              <CommandGroup
                key={country}
                heading={country === "BR" ? "Brasil" : country === "PT" ? "Portugal" : country}
              >
                {list.map((d) => {
                  const Icon = destinationTypeIcon(d.type);
                  const terminals = pointsByDest.get(d.id) ?? [];
                  return (
                    <React.Fragment key={d.id}>
                      <CommandItem
                        value={`${d.code} ${d.name} ${d.city} ${d.short_name ?? ""}`}
                        onSelect={() => {
                          onChange(d.code, null);
                          setOpen(false);
                        }}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-mp-indigo" />
                        <div className="flex flex-1 flex-col">
                          <span className="text-body-sm text-ink">{d.short_name ?? d.name}</span>
                          <span className="text-caption-sm text-muted">
                            {d.city}
                            {d.state ? ` · ${d.state}` : ""}
                          </span>
                        </div>
                        {value === d.code && !pointValue && (
                          <Check className="h-4 w-4 text-mp-primary" />
                        )}
                      </CommandItem>
                      {terminals.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${d.code} ${d.name} ${d.short_name ?? ""} ${p.name} terminal`}
                          onSelect={() => {
                            onChange(d.code, p.id);
                            setOpen(false);
                          }}
                        >
                          <MapPin className="ml-5 h-3.5 w-3.5 shrink-0 text-muted" />
                          <span className="flex-1 text-body-sm text-ink">
                            {p.name}{" "}
                            <span className="text-caption-sm text-muted">
                              · {d.short_name ?? d.name}
                            </span>
                          </span>
                          {pointValue === p.id && <Check className="h-4 w-4 text-mp-primary" />}
                        </CommandItem>
                      ))}
                    </React.Fragment>
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
