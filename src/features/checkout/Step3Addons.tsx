import * as React from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { useAuth } from "@/auth/context";
import { useMyVehicles } from "@/features/vehicles/api";
// O catálogo já tinha hook: `useLocationAddOns` do listing. Reusa em vez de
// duplicar a consulta, senão as duas telas podem divergir no preço exibido.
import { useLocationAddOns } from "@/features/listing/api";
import type { AddOnOption } from "@/features/listing/reservation.logic";
import { carroDoTitulo } from "./addons.logic";
import { useSetBookingAddons } from "./api";

type Props = {
  code: string;
  locationId: string | undefined;
  /** Veículo escolhido no passo anterior, pra chamar o carro pelo nome no título. */
  vehicleId: string | null;
  /** Quem presta o serviço. É o parceiro, não a Movepark, e a tela diz isso. */
  operatorName: string;
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
export function Step3Addons({
  code,
  locationId,
  vehicleId,
  operatorName,
  selectedIds,
  onBack,
  onNext,
}: Props) {
  const { session } = useAuth();
  const { data: addons, isLoading } = useLocationAddOns(locationId);
  // A consulta já rodou no passo do veículo, então aqui ela vem do cache.
  const { data: vehicles } = useMyVehicles(session?.userId);
  const salvar = useSetBookingAddons();
  const [marcados, setMarcados] = React.useState<string[]>(selectedIds);

  const carro = carroDoTitulo(vehicles?.find((v) => v.id === vehicleId)?.model);

  // Se a unidade não tem adicional, o passo se pula sozinho. Com a régua de passos
  // certa isso não chega a acontecer, mas segura o caso do catálogo esvaziar com a
  // tela aberta (adicional desativado no painel do parceiro).
  const vazio = !isLoading && (addons?.length ?? 0) === 0;
  React.useEffect(() => {
    if (vazio) onNext();
  }, [vazio, onNext]);

  function alternar(id: string) {
    setMarcados((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  const total = (addons ?? [])
    .filter((a) => marcados.includes(a.id))
    .reduce((sum, a) => sum + a.price, 0);

  async function seguir(ids: string[]) {
    try {
      await salvar.mutateAsync({ code, addOnIds: ids });
      onNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não conseguimos salvar os adicionais");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  if (vazio) return null;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        disabled={salvar.isPending}
        className="-ml-1 inline-flex items-center gap-2 rounded-full px-1 py-1 text-body-sm text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Voltar
      </button>

      <p className="mt-5">
        <span className="inline-flex rounded-full bg-mp-pale px-3 py-1 text-[11px] font-bold uppercase tracking-[0.4px] text-mp-indigo">
          Opcional
        </span>
      </p>

      <h2 className="mt-3 text-display-sm text-ink">Quer algum cuidado extra com o {carro}?</h2>
      <p className="mt-2 text-body-sm text-muted">
        Serviços do {operatorName}, cobrados uma vez por estadia. Você escolhe agora, antes de
        pagar.
      </p>

      <ul className="mt-6 space-y-3">
        {addons?.map((a) => (
          <AddonCard
            key={a.id}
            addon={a}
            checked={marcados.includes(a.id)}
            onToggle={() => alternar(a.id)}
          />
        ))}
      </ul>

      {total > 0 && (
        <p className="mt-5 text-body-sm text-muted">
          Você adicionou{" "}
          <span className="font-semibold tabular-nums text-ink">{formatBRL(total)}</span> em
          cuidados extras.
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button onClick={() => seguir(marcados)} disabled={salvar.isPending}>
          {salvar.isPending ? "Salvando…" : "Ir para o pagamento"}
        </Button>
        {/* Sem nada marcado este link faria o mesmo que o botão ao lado, então
            ele só aparece quando há o que descartar. */}
        {marcados.length > 0 && (
          <button
            type="button"
            onClick={() => seguir([])}
            disabled={salvar.isPending}
            className="text-body-sm text-muted underline underline-offset-4 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
          >
            Seguir sem extras
          </button>
        )}
      </div>
    </div>
  );
}

function AddonCard({
  addon,
  checked,
  onToggle,
}: {
  addon: AddOnOption;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-4 rounded-lg border p-5 transition-colors tablet:flex-row tablet:items-start",
        checked ? "border-mp-primary bg-surface-pale" : "border-hairline bg-canvas",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
          checked ? "bg-mp-primary text-white" : "bg-mp-pale text-mp-indigo",
        )}
        aria-hidden
      >
        <Sparkle className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="text-title-md text-ink">{addon.name}</h3>
        {addon.description && (
          <p className="mt-1 text-body-sm leading-relaxed text-muted">{addon.description}</p>
        )}
      </div>

      {/* No mobile o preço e o botão dividem uma linha; a partir do tablet sobem
          pra coluna da direita, com o preço em cima. */}
      <div className="flex shrink-0 items-center justify-between gap-3 tablet:flex-col tablet:items-end">
        <span className="text-title-md tabular-nums text-ink">{formatBRL(addon.price)}</span>
        <Button
          type="button"
          // `pill` já vem redonda e violeta. A não marcada usa `outline` clareada
          // pro card não ficar com dois blocos cinzas empilhados.
          variant={checked ? "pill" : "outline"}
          size="sm"
          onClick={onToggle}
          aria-pressed={checked}
          className={checked ? undefined : "rounded-full bg-canvas hover:bg-surface-soft"}
        >
          {checked && <Check className="h-4 w-4" aria-hidden />}
          {checked ? "Adicionado" : "Adicionar"}
        </Button>
      </div>
    </li>
  );
}
