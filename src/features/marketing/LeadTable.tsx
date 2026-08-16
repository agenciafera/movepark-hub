import * as React from "react";
import { Columns, Check } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MarketingLeadRow } from "@/types/domain";
import { cohortTone, toneClasses } from "./cohorts";
import {
  cellValue,
  LEAD_COLUMNS,
  type LeadColumnKey,
  resolveColumns,
  toggleColumn,
} from "./leadColumns.logic";

type Props = {
  leads: MarketingLeadRow[];
  isLoading: boolean;
  savedColumns: unknown;
  onSaveColumns: (columns: LeadColumnKey[]) => void;
};

/**
 * Lista de leads com colunas escolhidas pelo usuário.
 *
 * A escolha é gravada no pipeline (`column_prefs`), então ela vale para o time e não só para o
 * navegador de quem mexeu. A resolução do que aparece mora em `leadColumns.logic` porque
 * preferência salva envelhece e precisa de teste.
 */
export function LeadTable({ leads, isLoading, savedColumns, onSaveColumns }: Props) {
  const colunas = React.useMemo(() => resolveColumns(savedColumns), [savedColumns]);
  const visiveis = colunas.map((c) => c.key);

  const [ordem, setOrdem] = React.useState<{ key: LeadColumnKey; asc: boolean } | null>(null);

  const ordenados = React.useMemo(() => {
    if (!ordem) return leads;
    const copia = [...leads];
    copia.sort((a, b) => {
      const va = valorBruto(a, ordem.key);
      const vb = valorBruto(b, ordem.key);
      if (typeof va === "number" && typeof vb === "number") return ordem.asc ? va - vb : vb - va;
      return ordem.asc
        ? String(va).localeCompare(String(vb), "pt-BR")
        : String(vb).localeCompare(String(va), "pt-BR");
    });
    return copia;
  }, [leads, ordem]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns className="mr-2 size-4" />
              Colunas ({visiveis.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
            <DropdownMenuLabel>Colunas da lista</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {LEAD_COLUMNS.map((col) => {
              const marcada = visiveis.includes(col.key);
              return (
                <DropdownMenuItem
                  key={col.key}
                  disabled={col.locked}
                  onSelect={(e) => {
                    // Sem isso o menu fecha a cada clique e escolher cinco colunas vira cinco idas.
                    e.preventDefault();
                    onSaveColumns(toggleColumn(visiveis, col.key));
                  }}
                  className="flex items-center gap-2"
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded border",
                      marcada ? "border-primary bg-primary text-white" : "border-hairline",
                    )}
                    aria-hidden
                  >
                    {marcada && <Check className="size-3" weight="bold" />}
                  </span>
                  <span className={cn(col.locked && "text-muted")}>{col.label}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {ordenados.length === 0 ? (
        <EmptyState
          title="Nenhum lead por aqui"
          description="Ajuste a busca ou o filtro de estacionamento."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-hairline bg-canvas">
          <Table>
            <TableHeader>
              <TableRow>
                {colunas.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "cursor-pointer select-none whitespace-nowrap",
                      col.align === "right" && "text-right",
                    )}
                    onClick={() =>
                      setOrdem((atual) =>
                        atual?.key === col.key
                          ? { key: col.key, asc: !atual.asc }
                          : { key: col.key, asc: true },
                      )
                    }
                    aria-sort={
                      ordem?.key === col.key ? (ordem.asc ? "ascending" : "descending") : "none"
                    }
                  >
                    {col.label}
                    {ordem?.key === col.key && (ordem.asc ? " ↑" : " ↓")}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenados.map((lead) => (
                <TableRow key={lead.id}>
                  {colunas.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        "whitespace-nowrap",
                        col.align === "right" && "text-right tabular-nums",
                      )}
                    >
                      {col.key === "cohort" && lead.cohort ? (
                        <span
                          className={cn(
                            "rounded-full border px-1.5 py-0.5 text-xs font-medium",
                            toneClasses(cohortTone(lead.cohort)),
                          )}
                        >
                          {cellValue(lead, col.key)}
                        </span>
                      ) : (
                        cellValue(lead, col.key)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/** Valor cru para ordenar. Texto formatado ordenaria "R$ 1.000" antes de "R$ 90". */
function valorBruto(lead: MarketingLeadRow, key: LeadColumnKey): string | number {
  switch (key) {
    case "bookings_count":
      return lead.bookings_count;
    case "total_spent":
      return lead.total_spent;
    case "avg_ticket":
      return lead.avg_ticket;
    case "value_cents":
      return lead.value_cents ?? 0;
    case "days_since_last":
      return lead.days_since_last ?? Number.MAX_SAFE_INTEGER;
    case "created_at":
      return new Date(lead.created_at).getTime();
    default:
      return cellValue(lead, key);
  }
}
