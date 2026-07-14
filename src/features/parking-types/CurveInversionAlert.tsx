import { AlertTriangle } from "lucide-react";
import { formatBRL } from "@/lib/format";
import type { CurveInversion } from "./pricing-curve";

type Props = {
  inversion: CurveInversion;
  /** Abre a tabela completa de preços. */
  onOpenSimulation: () => void;
};

/**
 * Avisa que a tabela cobra menos de quem fica mais tempo. Aparece no card do tipo de vaga
 * e na página de Preços: sem isso, a inversão só era visível pra quem abrisse o simulador.
 */
export function CurveInversionAlert({ inversion, onOpenSimulation }: Props) {
  return (
    <button
      type="button"
      onClick={onOpenSimulation}
      className="flex w-full items-start gap-2 rounded-sm bg-badge-pending-bg p-3 text-left text-body-sm text-warning"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        {inversion.days} dias custa {formatBRL(inversion.price)} e {inversion.nextDays} dias custa{" "}
        {formatBRL(inversion.nextPrice)}. Quem fica menos tempo paga mais. Veja a tabela inteira.
      </span>
    </button>
  );
}
