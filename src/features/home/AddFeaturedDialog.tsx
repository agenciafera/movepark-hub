import * as React from "react";
import { CaretUpDown, Check } from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FeaturedCandidate } from "./featuredApi";

/** "Aeropark · Aeroporto de Guarulhos > Vaga Coberta" */
export function rotuloDaOferta(c: FeaturedCandidate): string {
  return `${c.companyName} · ${c.locationName} > ${c.parkingTypeName}`;
}

/**
 * Escolha de unidade e tipo de vaga para entrar na vitrine.
 *
 * O que já está na lista não aparece aqui: a tabela tem `unique` no tipo de vaga, então oferecer
 * o repetido só levaria a um erro de banco depois de dois cliques.
 */
export function AddFeaturedDialog({
  open,
  onOpenChange,
  candidatos,
  jaNaLista,
  onConfirm,
  salvando,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidatos: FeaturedCandidate[];
  jaNaLista: Set<string>;
  onConfirm: (locationParkingTypeId: string) => void;
  salvando: boolean;
}) {
  const [escolhido, setEscolhido] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);

  const disponiveis = React.useMemo(
    () => candidatos.filter((c) => !jaNaLista.has(c.locationParkingTypeId)),
    [candidatos, jaNaLista],
  );

  React.useEffect(() => {
    if (!open) setEscolhido(null);
  }, [open]);

  const selecionado = disponiveis.find((c) => c.locationParkingTypeId === escolhido) ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar destaque</DialogTitle>
          <DialogDescription>
            Escolha a unidade e o tipo de vaga que vai virar card na home.
          </DialogDescription>
        </DialogHeader>

        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            <button
              type="button"
              role="combobox"
              aria-expanded={aberto}
              aria-label="Unidade e tipo de vaga"
              className={cn(
                "flex h-14 w-full items-center justify-between gap-2 rounded-sm border border-hairline bg-canvas px-4 text-left text-body-md text-ink",
                "focus:border-2 focus:border-ink focus:outline-none",
                !selecionado && "text-muted",
              )}
            >
              <span className="truncate">
                {selecionado ? rotuloDaOferta(selecionado) : "Selecione a vaga"}
              </span>
              <CaretUpDown className="h-4 w-4 shrink-0 text-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command>
              <CommandInput placeholder="Busque por estacionamento ou unidade" />
              <CommandList>
                <CommandEmpty>Nenhuma vaga disponível para destacar.</CommandEmpty>
                <CommandGroup>
                  {disponiveis.map((c) => (
                    <CommandItem
                      key={c.locationParkingTypeId}
                      value={`${rotuloDaOferta(c)} ${c.destinationLabel ?? ""}`}
                      onSelect={() => {
                        setEscolhido(c.locationParkingTypeId);
                        setAberto(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          escolhido === c.locationParkingTypeId ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="flex flex-col">
                        <span className="text-ink">{rotuloDaOferta(c)}</span>
                        <span className="text-caption text-muted">
                          {[c.destinationLabel, c.temPreco ? null : "sem tabela de preço"]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {selecionado && !selecionado.temPreco ? (
          <p className="text-caption text-muted">
            Esta vaga não tem tabela de preço. Sem preço o card não monta, e ela fica na lista sem
            aparecer na home.
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!escolhido || salvando}
            onClick={() => escolhido && onConfirm(escolhido)}
          >
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
