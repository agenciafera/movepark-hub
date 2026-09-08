import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import type { MarketingRfmContact } from "@/types/domain";
import { useRfmContacts } from "./api";
import { rfmLabel } from "./rfm.logic";

type Props = {
  segmento: string | null;
  locationIds?: string[];
  onClose: () => void;
};

/**
 * Quem está numa célula da matriz (RF-006).
 *
 * A lista abre ordenada por receita, não por nome: o ponto do M como terceira dimensão é que,
 * dentro da mesma célula, quem vale mais é atendido antes. Ordenar alfabeticamente jogaria fora
 * exatamente a informação que fez a célula ser clicada.
 */
export function RfmContactSheet({ segmento, locationIds, onClose }: Props) {
  const { data, isLoading } = useRfmContacts(segmento, locationIds);

  return (
    <Sheet open={Boolean(segmento)} onOpenChange={(aberto) => !aberto && onClose()}>
      <SheetContent className="w-full max-w-xl overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{segmento ? rfmLabel(segmento) : ""}</SheetTitle>
          <SheetDescription>
            {isLoading
              ? "Carregando..."
              : `${data?.length ?? 0} contato(s), do maior para o menor valor gerado.`}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 flex flex-col gap-3">
          {isLoading &&
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-md" />)}

          {!isLoading && (data?.length ?? 0) === 0 && (
            <p className="text-body-sm text-muted">Ninguém nesta célula no recorte atual.</p>
          )}

          {(data ?? []).map((c) => (
            <Linha key={c.contact_key} contato={c} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Linha({ contato }: { contato: MarketingRfmContact }) {
  const identidade = contato.display_name ?? contato.email ?? contato.phone ?? contato.contact_key;
  return (
    <div className="rounded-md border border-hairline p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-body-sm font-medium text-ink">{identidade}</p>
          <p className="truncate text-caption text-muted">
            {contato.email ?? contato.phone ?? "sem contato registrado"}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-caption-sm font-medium tabular-nums text-muted">
          R{contato.r_score} F{contato.f_score} M{contato.m_score}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption tabular-nums text-muted">
        <span>{contato.bookings_count} reserva(s)</span>
        <span>{formatBRL(contato.total_spent)} no total</span>
        <span>{formatBRL(contato.avg_ticket)} de ticket</span>
        {contato.days_since_last !== null && <span>{contato.days_since_last} dias sem voltar</span>}
        {contato.avg_gap_days !== null && <span>ciclo de {contato.avg_gap_days} dias</span>}
        {contato.vehicle_model && <span>{contato.vehicle_model}</span>}
      </div>
    </div>
  );
}
