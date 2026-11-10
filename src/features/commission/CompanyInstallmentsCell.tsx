import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSetCompanyInstallments } from "@/features/companies/api";
import { installmentsPreview, parseInstallmentsPair } from "./rule.logic";

type Props = {
  companyId: string;
  companyName: string;
  max: number | null;
  interestFree: number | null;
};

const asText = (n: number | null) => (n == null ? "" : String(n));

/**
 * Parcelamento padrão de um estacionamento na tabela de Comissões (09/11/2026). Vale para toda
 * venda dele que não casa com uma regra de repasse; a regra, quando define, vence este valor.
 */
export function CompanyInstallmentsCell({ companyId, companyName, max, interestFree }: Props) {
  const [maxText, setMaxText] = React.useState(asText(max));
  const [freeText, setFreeText] = React.useState(asText(interestFree));
  const save = useSetCompanyInstallments();

  React.useEffect(() => {
    setMaxText(asText(max));
    setFreeText(asText(interestFree));
  }, [max, interestFree]);

  const dirty = maxText.trim() !== asText(max) || freeText.trim() !== asText(interestFree);

  async function submit() {
    const pair = parseInstallmentsPair(maxText, freeText);
    if ("error" in pair) {
      toast.error(pair.error);
      return;
    }
    try {
      await save.mutateAsync({ companyId, max: pair.max, interestFree: pair.interestFree });
      toast.success("Parcelamento atualizado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar o parcelamento.");
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          value={maxText}
          onChange={(e) => setMaxText(e.target.value)}
          placeholder="Máx."
          className="h-9 w-16 text-right tabular-nums"
          aria-label={`Máximo de parcelas de ${companyName}`}
        />
        <Input
          inputMode="numeric"
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Sem juros"
          className="h-9 w-24 text-right tabular-nums"
          aria-label={`Parcelas sem juros de ${companyName}`}
        />
        <Button size="sm" variant="secondary" disabled={!dirty || save.isPending} onClick={submit}>
          {save.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      <span className="text-caption text-muted">
        No checkout: {installmentsPreview(maxText, freeText, "a política da plataforma")}
      </span>
    </div>
  );
}
