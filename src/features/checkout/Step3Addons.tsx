import * as React from "react";
import { toast } from "sonner";
import { Check, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
// O catálogo já tinha hook: `useLocationAddOns` do listing. Reusa em vez de
// duplicar a consulta, senão as duas telas podem divergir no preço exibido.
import { useLocationAddOns } from "@/features/listing/api";
import type { AddOnOption } from "@/features/listing/reservation.logic";
import { useSetBookingAddons } from "./api";

type Props = {
  code: string;
  locationId: string | undefined;
  /** Adicionais já gravados na reserva, pra tela abrir com o que foi escolhido. */
  selectedIds: string[];
  onBack: () => void;
  onNext: () => void;
};

/**
 * Passo de adicionais (variante A do handoff: passo próprio, entre veículo e
 * pagamento). Some inteiro quando a unidade não oferece nada: um passo vazio só
 * alonga o funil.
 *
 * Nada aqui manda preço pro servidor. A RPC relê o catálogo da unidade e recalcula
 * o total, então marcar um card não é o mesmo que escolher quanto pagar.
 */
export function Step3Addons({ code, locationId, selectedIds, onBack, onNext }: Props) {
  const { data: addons, isLoading } = useLocationAddOns(locationId);
  const salvar = useSetBookingAddons();
  const [marcados, setMarcados] = React.useState<string[]>(selectedIds);

  // Se a unidade não tem adicional, o passo se pula sozinho.
  const vazio = !isLoading && (addons?.length ?? 0) === 0;
  React.useEffect(() => {
    if (vazio) onNext();
  }, [vazio, onNext]);

  function alternar(id: string) {
    setMarcados((atual) =>
      atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id],
    );
  }

  const total = (addons ?? [])
    .filter((a) => marcados.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);

  async function continuar() {
    try {
      await salvar.mutateAsync({ code, addOnIds: marcados });
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não conseguimos salvar os adicionais");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
      </div>
    );
  }
  if (vazio) return null;

  return (
    <div>
      <h2 className="text-title-md text-ink">Quer algum cuidado extra com o carro?</h2>
      <p className="mt-1 text-body-sm text-muted">
        Opcional, cobrado uma vez por estadia. Dá pra adicionar depois, até o check-in.
      </p>

      <ul className="mt-5 space-y-3">
        {addons?.map((a) => (
          <AddonRow
            key={a.id}
            addon={a}
            checked={marcados.includes(a.id)}
            onToggle={() => alternar(a.id)}
          />
        ))}
      </ul>

      {total > 0 && (
        <p className="mt-4 text-body-sm text-muted">
          Você adicionou{" "}
          <span className="font-semibold text-ink tabular-nums">{formatBRL(total)}</span> em
          cuidados extras.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={continuar} disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando…" : marcados.length > 0 ? "Continuar" : "Seguir sem extras"}
        </Button>
        <Button variant="outline" onClick={onBack} disabled={salvar.isPending}>
          Voltar
        </Button>
      </div>
    </div>
  );
}

function AddonRow({
  addon,
  checked,
  onToggle,
}: {
  addon: AddOnOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className={cn(
          "flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors",
          checked ? "border-mp-primary bg-surface-pale" : "border-hairline bg-canvas hover:bg-surface-soft",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border",
            checked ? "border-mp-primary bg-mp-primary text-white" : "border-border-strong",
          )}
          aria-hidden
        >
          {checked ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3 w-3 text-muted" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-title-sm text-ink">{addon.name}</span>
            <span className="whitespace-nowrap text-body-sm font-semibold tabular-nums text-ink">
              {formatBRL(addon.price)}
            </span>
          </span>
          {addon.description && (
            <span className="mt-1 block text-caption-sm leading-relaxed text-muted">
              {addon.description}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
