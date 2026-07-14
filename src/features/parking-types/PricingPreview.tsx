import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { fetchDraftCurve, findCurveInversions, PREVIEW_DAYS } from "./pricing-curve";

type Props = {
  /** Regra em edição (o rascunho da tela, não o que está salvo). */
  rule: Record<string, unknown>;
  /** Faixas em edição. */
  tiers: unknown[];
  /** Se preenchido, falta dado pra calcular: mostramos o motivo em vez de um preço errado. */
  blockedReason: string | null;
};

/**
 * Preço que o cliente vai pagar COM as alterações que estão na tela, calculado pelo motor
 * do banco (`simulate_pricing_draft`). Antes disso, o simulador daqui lia a regra salva e
 * mostrava o preço antigo enquanto o parceiro editava o novo.
 */
export function PricingPreview({ rule, tiers, blockedReason }: Props) {
  // O rascunho muda a cada tecla; espera o parceiro parar de digitar antes de perguntar o preço.
  const draftKey = JSON.stringify({ rule, tiers });
  const [debouncedKey, setDebouncedKey] = React.useState(draftKey);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedKey(draftKey), 400);
    return () => clearTimeout(t);
  }, [draftKey]);

  const preview = useQuery({
    queryKey: ["pricing-draft-preview", debouncedKey],
    queryFn: () => fetchDraftCurve(rule, tiers),
    enabled: !blockedReason,
    staleTime: 60_000,
  });

  const rows = preview.data ?? [];
  const inversion = findCurveInversions(rows)[0];
  const failed = rows.find((r) => r.error);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h4 className="text-title-md">Prévia do preço</h4>
        <p className="text-caption text-muted">
          O que o cliente vai pagar com as alterações desta tela, antes de você salvar. Reservas já
          confirmadas mantêm o preço que foi cobrado.
        </p>
      </div>

      {blockedReason ? (
        <p className="rounded-sm bg-surface-soft p-3 text-body-sm text-muted">{blockedReason}</p>
      ) : preview.isPending ? (
        <div className="grid grid-cols-4 gap-2">
          {PREVIEW_DAYS.map((d) => (
            <Skeleton key={d} className="h-14 w-full" />
          ))}
        </div>
      ) : preview.isError || failed ? (
        <p className="rounded-sm bg-badge-cancelled-bg p-3 text-body-sm text-error">
          {failed?.error ??
            (preview.error instanceof Error ? preview.error.message : "Não deu pra calcular.")}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {rows.map((r) => (
              <div
                key={r.days}
                className="rounded-sm border border-hairline bg-canvas p-2 text-center"
              >
                <div className="text-caption text-muted">
                  {r.days} {r.days === 1 ? "dia" : "dias"}
                </div>
                <div className="text-body-sm font-medium text-ink tabular-nums">
                  {r.price === null ? "n/d" : formatBRL(r.price)}
                </div>
              </div>
            ))}
          </div>

          {inversion && (
            <p className="flex items-start gap-2 rounded-sm bg-badge-pending-bg p-3 text-body-sm text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {inversion.days} dias custa {formatBRL(inversion.price)} e {inversion.nextDays} dias
                custa {formatBRL(inversion.nextPrice)}. Quem fica menos tempo paga mais.
              </span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
