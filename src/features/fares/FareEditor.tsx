import * as React from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  cancelWindowLabel,
  FARE_BENEFIT_LABELS,
  FARE_TIER_LABEL,
  fareReais,
  type FareBenefitKey,
} from "@/lib/fares";
import { useAdminSetFare, useFareAdminList, type FareAdminRow } from "./api";

/** Editor de uma tarifa global (hub_admin). Estado local + salvar via admin_set_fare. */
function FareTierCard({ row }: { row: FareAdminRow }) {
  const save = useAdminSetFare();
  const [draft, setDraft] = React.useState<FareAdminRow>(row);

  // Recarrega o rascunho quando a linha muda (ex: após salvar e refetch).
  React.useEffect(() => setDraft(row), [row]);

  const isBasica = row.tier === "basica";
  const dirty = JSON.stringify(draft) !== JSON.stringify(row);

  function set<K extends keyof FareAdminRow>(k: K, v: FareAdminRow[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }
  function toggleBenefit(key: FareBenefitKey, on: boolean) {
    setDraft((d) => ({ ...d, benefits: { ...d.benefits, [key]: on } }));
  }

  async function onSave() {
    try {
      await save.mutateAsync(draft);
      toast.success(`Tarifa ${draft.label} salva.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{FARE_TIER_LABEL[row.tier]}</CardTitle>
        <label className="flex items-center gap-2 text-body-sm text-muted">
          <Switch
            checked={draft.is_active}
            onCheckedChange={(v) => set("is_active", v)}
            aria-label={`Tarifa ${FARE_TIER_LABEL[row.tier]} ativa`}
          />
          {draft.is_active ? "Ativa" : "Inativa"}
        </label>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 tablet:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`label-${row.tier}`}>Rótulo</Label>
            <Input
              id={`label-${row.tier}`}
              value={draft.label}
              onChange={(e) => set("label", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`price-${row.tier}`}>Preço</Label>
            {isBasica ? (
              <div className="flex h-12 items-center text-body-sm text-muted">Sempre grátis</div>
            ) : (
              <CurrencyInput
                id={`price-${row.tier}`}
                value={fareReais(draft.price_cents)}
                onChange={(v) => set("price_cents", Math.round((v ?? 0) * 100))}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`win-${row.tier}`}>Cancelamento grátis (min antes do check-in)</Label>
            <Input
              id={`win-${row.tier}`}
              type="number"
              min={0}
              value={draft.cancel_window_minutes ?? ""}
              onChange={(e) =>
                set(
                  "cancel_window_minutes",
                  e.target.value === "" ? null : Math.max(0, Number(e.target.value)),
                )
              }
            />
            <span className="text-caption text-muted">
              {cancelWindowLabel(draft.cancel_window_minutes) ?? "Sem cancelamento grátis"}
            </span>
          </div>
          <label className="flex items-center gap-2 self-end pb-3 text-body-sm text-ink">
            <Switch
              checked={draft.is_popular}
              onCheckedChange={(v) => set("is_popular", v)}
              aria-label="Selo popular"
            />
            Selo &quot;popular&quot;
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-caption font-medium text-muted">Benefícios</legend>
          <div className="grid grid-cols-1 gap-2 tablet:grid-cols-2">
            {FARE_BENEFIT_LABELS.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-body-sm text-ink">
                <Checkbox
                  checked={draft.benefits[key] ?? false}
                  onCheckedChange={(v) => toggleBenefit(key, v === true)}
                  aria-label={label}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={!dirty || save.isPending}>
            {save.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Editor do catálogo global de tarifas, um card por tier. */
export function FareEditor() {
  const { data, isLoading, isError } = useFareAdminList();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        title="Não consegui carregar as tarifas"
        description="Pode ter sido a conexão. Tente de novo em instantes."
      />
    );
  }
  if (!data || data.length === 0) {
    return <EmptyState title="Sem tarifas cadastradas" />;
  }

  return (
    <div className="flex flex-col gap-4">
      {data.map((row) => (
        <FareTierCard key={row.tier} row={row} />
      ))}
    </div>
  );
}
