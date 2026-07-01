import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanies, useSetCompanyTakeRate } from "@/features/companies/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  bpsToPctString,
  isCommissionDirty,
  parseCommissionPct,
} from "./finance-commissions.logic";

export default function ManagerFinanceCommissions() {
  const { data, isLoading } = useCompanies();
  const setTakeRate = useSetCompanyTakeRate();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);

  async function save(companyId: string, savedBps: number) {
    const raw = drafts[companyId] ?? bpsToPctString(savedBps);
    const parsed = parseCommissionPct(raw);
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }
    setSavingId(companyId);
    try {
      await setTakeRate.mutateAsync({ companyId, takeRateBps: parsed.bps });
      toast.success("Comissão atualizada.");
      // Limpa o rascunho → a linha passa a refletir o valor salvo (já invalidado).
      setDrafts((d) => {
        const next = { ...d };
        delete next[companyId];
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar a comissão.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Comissões"
        description="Comissão da Movepark (take rate) por empresa parceira, aplicada no split de cada pagamento."
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-6">
              <EmptyState title="Sem empresas" description="Nenhuma empresa cadastrada." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="w-44 text-right">Comissão (%)</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((c) => {
                  const value = drafts[c.id] ?? bpsToPctString(c.take_rate_bps);
                  const dirty = isCommissionDirty(c.take_rate_bps, value);
                  const saving = savingId === c.id;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="text-ink">{c.name}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            max={100}
                            step="0.1"
                            value={value}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [c.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && dirty && !saving) save(c.id, c.take_rate_bps);
                            }}
                            className="h-9 max-w-24 text-right tabular-nums"
                            aria-label={`Comissão de ${c.name} em porcentagem`}
                          />
                          <span className="text-body-sm text-muted">%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!dirty || saving}
                          onClick={() => save(c.id, c.take_rate_bps)}
                        >
                          {saving ? "Salvando…" : "Salvar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-caption text-muted">
        A comissão é descontada do preço base da reserva no split do pagamento; o parceiro recebe o
        restante. Apenas administradores da Movepark podem alterar.
      </p>
    </div>
  );
}
