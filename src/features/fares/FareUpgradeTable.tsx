import { Check, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { fareReais, type FareOption, type FareTier } from "@/lib/fares";
import { upgradeColumns } from "./fareUpgrade.logic";
import { buildFareMatrix } from "@/features/listing/fareMatrix.logic";

type Props = {
  /** O catálogo (`get_unit_fares`). */
  catalog: FareOption[];
  /** A tarifa da reserva hoje: primeira coluna, só para comparar. */
  currentTier: FareTier;
  /** Quanto a reserva já pagou pela tarifa (centavos): a diferença é sobre ele. */
  currentPriceCents: number;
  selected: FareTier | null;
  onSelect: (tier: FareTier) => void;
  /** Prefixo do data-testid de cada opção (a tela da equipe tem o seu). */
  testIdPrefix?: string;
};

/**
 * Comparativo do upgrade de tarifa em tabela (reunião de 26/11/2026). Antes o upgrade mostrava só
 * "Flex + R$ 12,90" e "Superflex + R$ 24,90", e quem ia pagar não via o que mudava. As linhas saem
 * da mesma matriz do comparativo da página da unidade (`buildFareMatrix`), então a promessa é uma só.
 */
export function FareUpgradeTable({
  catalog,
  currentTier,
  currentPriceCents,
  selected,
  onSelect,
  testIdPrefix = "fare-upgrade-option",
}: Props) {
  const colunas = upgradeColumns(catalog, currentTier);
  const { rows } = buildFareMatrix(colunas);

  return (
    <div className="overflow-x-auto rounded-md border border-hairline" data-testid="fare-upgrade-table">
      <table className="w-full border-collapse text-left text-body-sm">
        <thead>
          <tr className="border-b border-hairline">
            <th scope="col" className="p-3 font-normal text-muted">
              <span className="sr-only">O que inclui</span>
            </th>
            {colunas.map((f) => {
              const atual = f.tier === currentTier;
              const sel = selected === f.tier;
              const delta = Math.max(0, f.price_cents - currentPriceCents);
              return (
                <th key={f.tier} scope="col" className={cn("p-2 text-center align-bottom", sel && "bg-mp-pale/40")}>
                  {atual ? (
                    <span className="flex flex-col items-center gap-0.5 px-1 py-1.5">
                      <span className="text-body-sm font-semibold text-ink">{f.label}</span>
                      <span className="text-caption text-muted">sua tarifa</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid={`${testIdPrefix}-${f.tier}`}
                      aria-pressed={sel}
                      onClick={() => onSelect(f.tier)}
                      className={cn(
                        "flex w-full flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 transition-colors",
                        sel ? "border-ink ring-1 ring-ink" : "border-hairline hover:border-ink/40",
                      )}
                    >
                      <span className="text-body-sm font-semibold text-ink">{f.label}</span>
                      <span className="text-caption font-semibold tabular-nums text-mp-primary">
                        + {formatBRL(fareReais(delta))}
                      </span>
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-hairline last:border-b-0">
              <th scope="row" className="p-3 font-normal text-body">
                {r.label}
              </th>
              {colunas.map((f, i) => (
                <td key={f.tier} className={cn("p-2 text-center", selected === f.tier && "bg-mp-pale/40")}>
                  {r.included[i] ? (
                    <Check className="mx-auto h-4 w-4 text-badge-confirmed-fg" aria-label="Inclui" />
                  ) : (
                    <X className="mx-auto h-4 w-4 text-muted opacity-40" aria-label="Não inclui" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
