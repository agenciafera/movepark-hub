import * as React from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  useCompanies,
  useSetCompanyTakeRate,
  useSetCompanyWlTakeRate,
} from "@/features/companies/api";
import { companyHasWl } from "@/features/companies/hasWl.logic";
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
import { CommissionRulesCard } from "@/features/commission/CommissionRulesCard";
import { ChannelReportCard } from "@/features/commission/ChannelReportCard";
import {
  bpsToPctString,
  isCommissionDirty,
  isOptionalCommissionDirty,
  optionalBpsToPctString,
  parseCommissionPct,
  parseOptionalCommissionPct,
} from "./finance-commissions.logic";

export default function ManagerFinanceCommissions() {
  const { data, isLoading } = useCompanies();
  const setTakeRate = useSetCompanyTakeRate();
  const setWlTakeRate = useSetCompanyWlTakeRate();
  // Rascunho da comissão do white-label, separado do Hub (D4b). Chave: id da empresa.
  const [wlDrafts, setWlDrafts] = React.useState<Record<string, string>>({});
  const algumComSite = (data ?? []).some(companyHasWl);
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

  async function saveWl(companyId: string, savedBps: number | null | undefined) {
    const raw = wlDrafts[companyId] ?? optionalBpsToPctString(savedBps);
    const parsed = parseOptionalCommissionPct(raw);
    if ("error" in parsed) {
      toast.error(parsed.error);
      return;
    }
    setSavingId(`${companyId}:wl`);
    try {
      await setWlTakeRate.mutateAsync({ companyId, wlTakeRateBps: parsed.bps });
      toast.success(
        parsed.bps == null
          ? "Comissão do white-label removida."
          : "Comissão do white-label atualizada.",
      );
      setWlDrafts((d) => {
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
        description="Quanto a Movepark fica de cada venda: a regra por origem quando o estacionamento traz o cliente, e o padrão da empresa no resto."
      />

      <CommissionRulesCard />

      <div>
        <h2 className="text-title-md text-ink">Comissão padrão por empresa</h2>
        <p className="text-body-sm text-muted">
          Vale para toda venda que não casa com nenhuma regra acima, como a busca no site da
          Movepark.
          {algumComSite &&
            " A coluna White-label é a comissão sobre o que o site próprio do estacionamento vende; vazia, a venda do site não entra na comissão."}
        </p>
      </div>

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
                  {algumComSite && (
                    <TableHead className="w-44 text-right">White-label (%)</TableHead>
                  )}
                  {algumComSite && <TableHead className="w-32" />}
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
                            onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && dirty && !saving)
                                save(c.id, c.take_rate_bps);
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
                      {algumComSite &&
                        (companyHasWl(c) ? (
                          (() => {
                            const wlValue =
                              wlDrafts[c.id] ?? optionalBpsToPctString(c.wl_take_rate_bps);
                            const wlDirty = isOptionalCommissionDirty(c.wl_take_rate_bps, wlValue);
                            const wlSaving = savingId === `${c.id}:wl`;
                            return (
                              <>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <Input
                                      type="number"
                                      inputMode="decimal"
                                      min={0}
                                      max={100}
                                      step="0.1"
                                      placeholder="não combinada"
                                      value={wlValue}
                                      onChange={(e) =>
                                        setWlDrafts((d) => ({ ...d, [c.id]: e.target.value }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && wlDirty && !wlSaving)
                                          saveWl(c.id, c.wl_take_rate_bps);
                                      }}
                                      className="h-9 max-w-32 text-right tabular-nums"
                                      aria-label={`Comissão do white-label de ${c.name} em porcentagem`}
                                    />
                                    <span className="text-body-sm text-muted">%</span>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={!wlDirty || wlSaving}
                                    onClick={() => saveWl(c.id, c.wl_take_rate_bps)}
                                  >
                                    {wlSaving ? "Salvando…" : "Salvar"}
                                  </Button>
                                </TableCell>
                              </>
                            );
                          })()
                        ) : (
                          <>
                            <TableCell className="text-right text-caption text-muted">
                              sem site
                            </TableCell>
                            <TableCell />
                          </>
                        ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ChannelReportCard />

      <p className="text-caption text-muted">
        A comissão é descontada do preço base da reserva no split do pagamento; o parceiro recebe o
        restante. Apenas administradores da Movepark podem alterar.
      </p>
    </div>
  );
}
