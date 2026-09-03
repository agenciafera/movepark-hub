import * as React from "react";
import { toast } from "sonner";
import { ArrowSquareOut, Check, Warning, X } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDecidePriceResearch, usePriceResearchPending } from "@/features/price-research/api";
import { formatBRL, formatDate } from "@/lib/format";
import type { PriceResearchRow } from "@/types/domain";

/**
 * Fila de decisão do robô de pesquisa de preço (ADR-009 / ADR-010).
 *
 * O robô lê o site do lote mapeado e propõe; aqui uma pessoa decide. A separação é o que
 * sustenta o número publicado: ele é afirmação da Movepark sobre o preço de outra empresa, e
 * um modelo lendo HTML troca diária por mensalidade sem avisar.
 *
 * Por isso a tela é comparativa e mostra a prova: de um lado o que está publicado hoje, do
 * outro o que o robô achou, e embaixo o trecho literal da página que sustenta os números.
 * Quem aplica está aprovando aquele trecho, não um número solto.
 *
 * Spec: docs/specs/pesquisa-de-preco-concorrente.md
 */

const DURACOES = [
  { key: "daily", label: "Diária" },
  { key: "weekly", label: "7 diárias" },
  { key: "biweekly", label: "15 diárias" },
  { key: "monthly", label: "30 diárias" },
] as const;

function valorProposto(row: PriceResearchRow, key: (typeof DURACOES)[number]["key"]) {
  return row[`${key}_brl` as const] as number | null;
}
function valorAtual(row: PriceResearchRow, key: (typeof DURACOES)[number]["key"]) {
  return row[`atual_${key}_brl` as const] as number | null;
}

export default function ManagerPesquisaDePreco() {
  const fila = usePriceResearchPending();
  const decidir = useDecidePriceResearch();
  const [emCurso, setEmCurso] = React.useState<string | null>(null);

  async function decide(row: PriceResearchRow, action: "apply" | "reject") {
    setEmCurso(row.id);
    try {
      await decidir.mutateAsync({ id: row.id, action });
      toast.success(action === "apply" ? "Preço aplicado na ficha" : "Proposta recusada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao decidir");
    } finally {
      setEmCurso(null);
    }
  }

  const linhas = fila.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pesquisa de preço"
        description="O robô lê o site dos lotes mapeados toda semana e traz o preço para você conferir. Nada aparece na página do destino sem a sua aprovação."
      />

      {fila.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : linhas.length === 0 ? (
        <EmptyState
          title="Nada para decidir agora"
          description="O robô roda aos domingos e avisa aqui quando achar preço novo."
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lote</TableHead>
                <TableHead>Hoje na página</TableHead>
                <TableHead>O que o robô achou</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((row) => {
                const semPreco = row.status === "failed";
                const ocupado = emCurso === row.id;

                return (
                  <TableRow key={row.id}>
                    <TableCell className="align-top">
                      <div className="font-medium text-ink">{row.prospect_name}</div>
                      <div className="text-caption text-muted">{row.destination_name}</div>
                      {row.source_url && (
                        <a
                          /*
                            A regra de nunca linkar concorrente vale na página pública, onde o
                            link entrega o clique. Aqui é o contrário: quem decide precisa abrir
                            a fonte e conferir antes de aprovar.
                          */
                          href={row.source_url}
                          target="_blank"
                          rel="noreferrer nofollow"
                          className="mt-1 inline-flex items-center gap-1 text-caption text-muted underline hover:text-ink"
                        >
                          Ver a página lida
                          <ArrowSquareOut className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      {row.atual_researched_at ? (
                        <>
                          <div className="flex flex-wrap gap-x-3 text-body-sm text-ink">
                            {DURACOES.map((d) => {
                              const v = valorAtual(row, d.key);
                              return v === null ? null : (
                                <span key={d.key}>
                                  {d.label}: {formatBRL(v)}
                                </span>
                              );
                            })}
                          </div>
                          <div className="text-caption text-muted">
                            pesquisado em {formatDate(row.atual_researched_at)}
                          </div>
                        </>
                      ) : (
                        <span className="text-body-sm text-muted-soft">Sem preço publicado</span>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      {semPreco ? (
                        <div className="flex items-start gap-1.5 text-body-sm text-error">
                          <Warning className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{row.notes ?? "O robô não conseguiu ler a página."}</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap gap-x-3 text-body-sm text-ink">
                            {DURACOES.map((d) => {
                              const v = valorProposto(row, d.key);
                              return v === null ? null : (
                                <span key={d.key}>
                                  {d.label}: {formatBRL(v)}
                                </span>
                              );
                            })}
                          </div>
                          {row.fetched_at && (
                            <div className="text-caption text-muted">
                              lido em {formatDate(row.fetched_at)}
                            </div>
                          )}
                          {row.evidence && (
                            <blockquote className="mt-2 border-l-2 border-line pl-2 text-caption text-muted">
                              {row.evidence}
                            </blockquote>
                          )}
                        </>
                      )}
                    </TableCell>

                    <TableCell className="align-top">
                      <div className="flex gap-2">
                        {!semPreco && (
                          <Button
                            size="sm"
                            disabled={ocupado}
                            onClick={() => decide(row, "apply")}
                            aria-label={`Aplicar preço de ${row.prospect_name}`}
                          >
                            <Check className="h-4 w-4" /> Aplicar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={ocupado}
                          onClick={() => decide(row, "reject")}
                          aria-label={`Recusar proposta de ${row.prospect_name}`}
                        >
                          <X className="h-4 w-4" /> {semPreco ? "Dispensar" : "Recusar"}
                        </Button>
                      </div>
                      {semPreco && (
                        <Badge tone="neutral" className="mt-2">
                          Sem preço
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
