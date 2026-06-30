import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/format";
import { fareReais, type FareTier } from "@/lib/fares";
import { useLocationFareConfig, useSetUnitFare, type UnitFareConfig } from "./api";

type RowState = { enabled: boolean; priceInput: string };

/** Config das Tarifas de UMA unidade (E2.8-f): liga/desliga + preço por nível. */
export function FareConfigCard({ lptId, title }: { lptId: string; title: string }) {
  const { data, isLoading } = useLocationFareConfig(lptId);
  const setFare = useSetUnitFare();
  const [rows, setRows] = React.useState<Record<FareTier, RowState>>();

  // Inicializa o estado editável quando os dados chegam.
  React.useEffect(() => {
    if (!data) return;
    const next = {} as Record<FareTier, RowState>;
    for (const f of data) {
      const cents = f.price_override_cents ?? f.default_price_cents;
      next[f.tier] = { enabled: f.enabled, priceInput: cents > 0 ? String(fareReais(cents)) : "" };
    }
    setRows(next);
  }, [data]);

  if (isLoading || !data || !rows) return <Skeleton className="h-40 w-full rounded-md" />;

  function patch(tier: FareTier, p: Partial<RowState>) {
    setRows((prev) => (prev ? { ...prev, [tier]: { ...prev[tier], ...p } } : prev));
  }

  async function save(f: UnitFareConfig) {
    const st = rows![f.tier];
    const isBasica = f.tier === "basica";
    const priceCents = isBasica
      ? null
      : st.priceInput.trim()
        ? Math.round(Number(st.priceInput.replace(",", ".")) * 100)
        : null; // vazio = usar o padrão do catálogo
    if (priceCents != null && (!Number.isFinite(priceCents) || priceCents < 0)) {
      toast.error("Preço inválido.");
      return;
    }
    try {
      await setFare.mutateAsync({
        location_parking_type_id: lptId,
        tier: f.tier,
        enabled: st.enabled,
        price_cents: priceCents,
      });
      toast.success(`Tarifa ${f.label} salva.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-canvas p-5">
      <h4 className="text-title-sm text-ink">{title}</h4>
      <div className="mt-3 space-y-3">
        {data.map((f) => {
          const st = rows[f.tier];
          const isBasica = f.tier === "basica";
          return (
            <div key={f.tier} className="flex flex-wrap items-center gap-3 border-t border-hairline-soft pt-3">
              <span className="w-24 text-body-sm font-medium text-ink">{f.label}</span>
              <label className="flex items-center gap-2 text-caption text-muted">
                <Switch checked={st.enabled} onCheckedChange={(v) => patch(f.tier, { enabled: v })} />
                {st.enabled ? "Ativa" : "Desativada"}
              </label>
              {isBasica ? (
                <span className="text-body-sm text-muted">Grátis</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-caption text-muted">R$</span>
                  <Input
                    value={st.priceInput}
                    onChange={(e) => patch(f.tier, { priceInput: e.target.value })}
                    placeholder={String(fareReais(f.default_price_cents))}
                    inputMode="decimal"
                    className="h-9 w-24 tabular-nums"
                    aria-label={`Preço da Tarifa ${f.label}`}
                  />
                  <span className="text-caption text-muted">
                    (padrão {formatBRL(fareReais(f.default_price_cents))})
                  </span>
                </div>
              )}
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                onClick={() => save(f)}
                disabled={setFare.isPending}
              >
                Salvar
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
