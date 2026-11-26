import * as React from "react";
import { Button } from "@/components/ui/button";
import { useDecidirProposta } from "../api";
import { ehPerigosa, linhasDoCartao, type Proposta } from "../conversa.logic";

type Props = { id: string; tool: string; resumo: Record<string, unknown>; gravada: Proposta | null };

/**
 * Executar campanha ou mudar a chave geral: o agente só propõe, e o clique aqui decide. O estado
 * vem da proposta gravada no Hub quando a conversa é reaberta, então um cartão já decidido não
 * oferece o botão de novo.
 */
export function CartaoDaProposta({ id, tool, resumo, gravada }: Props) {
  const [atual, setAtual] = React.useState<Proposta | null>(gravada);
  const [falha, setFalha] = React.useState<string | null>(null);
  const decidir = useDecidirProposta();
  const { titulo, linhas, podeConfirmar } = linhasDoCartao(tool, atual?.resumo ?? resumo);
  const status = atual?.status ?? "proposed";
  const aberta = status === "proposed" || status === "blocked";

  const agir = (decisao: "confirmar" | "descartar") => {
    setFalha(null);
    decidir.mutate(
      { propostaId: id, decisao },
      { onSuccess: (p) => setAtual(p), onError: (e) => setFalha(e.message) },
    );
  };

  return (
    <div
      className={
        "space-y-2 rounded-xl border bg-surface p-3 " + (ehPerigosa(tool, resumo) ? "border-amber-400" : "border-hairline")
      }
      data-testid="cartao-proposta"
    >
      <p className="text-body-sm font-semibold text-ink">{titulo}</p>
      {linhas.map((l) => (
        <p key={l} className="text-body-sm text-body">
          {l}
        </p>
      ))}
      {aberta ? (
        <div className="flex gap-2">
          {podeConfirmar && status !== "blocked" ? (
            <Button size="sm" disabled={decidir.isPending} onClick={() => agir("confirmar")}>
              Confirmar
            </Button>
          ) : null}
          <Button size="sm" variant="outline" disabled={decidir.isPending} onClick={() => agir("descartar")}>
            Descartar
          </Button>
        </div>
      ) : status === "executing" ? (
        <p className="text-body-sm text-muted">Executando…</p>
      ) : status === "dismissed" ? (
        <p className="text-body-sm text-muted">Descartado.</p>
      ) : status === "expired" ? (
        <p className="text-body-sm text-muted">Esta proposta venceu. Peça de novo ao assistente.</p>
      ) : status === "failed" ? (
        <p className="text-body-sm text-error">Não deu: {atual?.erro}</p>
      ) : (
        <p className="text-body-sm font-medium text-ink">{atual?.resultado?.resumo ?? "Feito."}</p>
      )}
      {falha ? <p className="text-body-sm text-error">{falha}</p> : null}
    </div>
  );
}
