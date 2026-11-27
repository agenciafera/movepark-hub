import { dataCurta, situacaoDaJanela } from "../paineis.logic";

type Data = {
  nome: string;
  data: string;
  tipo: "feriado" | "ferias";
  aproximada: boolean;
  janela_de: string;
  janela_ate: string;
  abre_em_dias: number;
};

/** As próximas datas, cada uma com a janela de envio. */
export function Calendario({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as { hoje?: string; datas?: Data[] };
  const datas = Array.isArray(s.datas) ? s.datas : [];
  if (datas.length === 0) return <p className="text-body-sm text-muted">Nenhum feriado nos próximos dias.</p>;
  return (
    <ol className="space-y-2 rounded-xl border border-hairline bg-surface p-4">
      {datas.map((d) => (
        <li key={d.nome + d.data} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-body-sm">
          <span className="text-ink">
            {d.aproximada ? <span className="text-muted">Por volta de </span> : null}
            <span className="font-semibold tabular-nums">{dataCurta(d.data)}</span> {d.nome}
          </span>
          <span className="text-muted">
            {`Enviar de ${dataCurta(d.janela_de)} a ${dataCurta(d.janela_ate)}, ${situacaoDaJanela(d, s.hoje)}`}
          </span>
        </li>
      ))}
    </ol>
  );
}
