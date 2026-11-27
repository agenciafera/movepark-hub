import { percentual } from "../paineis.logic";

type Item = { valor: string; rotulo: string; pessoas: number; percentual: number | null };
type Saida = { problems?: string[]; dimensao?: string; total?: number; itens?: Item[]; itens_aviso?: string };

const TITULO: Record<string, string> = {
  aeroporto: "Por aeroporto",
  tarifa: "Por tarifa",
  canal: "Por canal da primeira compra",
  origem_trafego: "Por origem do tráfego",
  pagamento: "Por forma de pagamento",
  faixa_ticket: "Por faixa de ticket",
  dia_semana_entrada: "Por dia da semana da entrada",
};

/** O público dividido por uma dimensão, em barras com quantidade e percentual. */
export function Distribuicao({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as Saida;
  if (s.problems && s.problems.length > 0) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-body-sm text-error">
        {s.problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    );
  }
  const itens = Array.isArray(s.itens) ? s.itens : [];
  if (itens.length === 0) return <p className="text-body-sm text-muted">Ninguém no público para dividir.</p>;
  const maior = Math.max(...itens.map((i) => i.pessoas), 1);
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <p className="text-body-sm text-ink">
        <span className="font-semibold">{TITULO[s.dimensao ?? ""] ?? "Distribuição"}</span>
        <span className="text-muted"> · {(s.total ?? 0).toLocaleString("pt-BR")} pessoas</span>
      </p>
      <ul className="space-y-2">
        {itens.map((i) => (
          <li key={i.valor} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="text-ink">{i.rotulo}</span>
              <span className="tabular-nums text-muted">
                {i.percentual !== null ? `${i.pessoas.toLocaleString("pt-BR")} (${percentual(i.percentual)})` : i.pessoas.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="h-2 rounded-full bg-hairline" aria-hidden>
              <div className="h-2 rounded-full bg-mp-primary" style={{ width: `${(i.pessoas / maior) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {s.itens_aviso ? <p className="text-caption-sm text-muted">{s.itens_aviso}</p> : null}
    </div>
  );
}
