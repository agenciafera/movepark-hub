import { toast } from "sonner";
import { CalendarCheck, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { useCancelPricingSchedule, usePricingSchedules } from "./api";
import { PricingRuleSummary, type SummaryRule } from "./PricingSummary";
import { visibleSchedules } from "./pricing-schedule.logic";

/**
 * Próximas tabelas de um tipo de vaga, abaixo do preço de hoje. Mostra também a que falhou na
 * troca, porque falha silenciosa aqui é preço errado no site.
 */
export function PricingScheduleList({
  lptId,
  canEditPricing,
}: {
  lptId: string;
  canEditPricing: boolean;
}) {
  const { data } = usePricingSchedules(lptId);
  const cancel = useCancelPricingSchedule();
  const items = visibleSchedules(data ?? []);

  if (items.length === 0) return null;

  async function handleCancel(id: string) {
    try {
      await cancel.mutateAsync(id);
      toast.success("Tabela programada cancelada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
    }
  }

  return (
    <ul className="space-y-2" aria-label="Tabelas programadas">
      {items.map((s) => {
        const failed = s.status === "failed";
        const rule = { ...(s.rule as object), tiers: s.tiers } as SummaryRule;
        return (
          <li
            key={s.id}
            className={
              failed
                ? "space-y-1.5 rounded-md border border-error/40 bg-error/5 p-3"
                : "space-y-1.5 rounded-md border border-hairline bg-surface-soft p-3"
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-body-sm font-medium text-ink">
                {failed ? (
                  <WarningCircle className="h-4 w-4 text-error" />
                ) : (
                  <CalendarCheck className="h-4 w-4 text-mp-indigo" />
                )}
                {failed
                  ? `A troca de ${formatDate(s.effective_date)} falhou`
                  : `A partir de ${formatDate(s.effective_date)}`}
              </span>
              {!failed && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleCancel(s.id)}
                  disabled={!canEditPricing || cancel.isPending}
                >
                  Cancelar
                </Button>
              )}
            </div>
            <PricingRuleSummary rule={rule} />
            {s.minimum_stay_days != null && (
              <p className="text-caption text-muted">
                Estadia mínima passa a ser de {s.minimum_stay_days}{" "}
                {s.minimum_stay_days === 1 ? "diária" : "diárias"}.
              </p>
            )}
            {failed && s.error && (
              <p className="text-caption text-error">
                {s.error} O preço de hoje continua valendo.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
