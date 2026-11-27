import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { listaDeOportunidades } from "../paineis.logic";

/** As jogadas que cabem hoje: o público em destaque e o botão que começa o trabalho. */
export function Oportunidades({ saida, onPedir }: { saida: unknown; onPedir?: (texto: string) => void }) {
  const lista = listaDeOportunidades(saida);
  if (lista.length === 0) return <p className="text-body-sm text-muted">Nenhuma oportunidade aberta hoje.</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {lista.map((o) => (
        <article key={o.chave} className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface p-4 text-left">
          <div className="flex items-baseline gap-2">
            <span className="text-display-sm tabular-nums text-mp-primary">{o.publico.toLocaleString("pt-BR")}</span>
            <span className="text-caption-sm text-muted">
              {o.publico === 1 ? "pessoa" : "pessoas"}, {o.alcance_email.toLocaleString("pt-BR")} com e-mail
            </span>
          </div>
          <h3 className="text-body-sm font-semibold text-ink">{o.titulo}</h3>
          <p className="text-pretty text-body-sm text-body">{o.por_que}</p>
          {o.ticket_medio ? (
            <p className="text-caption-sm text-muted">Ticket médio de {formatBRL(o.ticket_medio)}</p>
          ) : null}
          {onPedir ? (
            <Button type="button" size="sm" variant="outline" className="mt-auto self-start" onClick={() => onPedir(o.pedido)}>
              Montar esse público
            </Button>
          ) : null}
        </article>
      ))}
    </div>
  );
}
