import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/format";
import { variacao } from "../paineis.logic";

type Lado = { reservas: number; receita: number };
type Saida = {
  campanha?: string;
  janela_dias?: number;
  executada?: boolean;
  matriculados?: number;
  mensagens_enviadas?: number;
  janela_completa?: boolean;
  antes?: Lado;
  depois?: Lado;
  aviso?: string;
};

/** Reservas pagas de quem entrou na campanha, antes e depois. Comparação, não prova. */
export function ResultadoDaCampanha({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as Saida;
  if (!s.executada) {
    return (
      <p className="text-body-sm text-muted">
        {s.campanha ? `A campanha ${s.campanha} ainda não rodou` : "A campanha ainda não rodou"}, então não há resultado para medir.
      </p>
    );
  }
  const antes = s.antes ?? { reservas: 0, receita: 0 };
  const depois = s.depois ?? { reservas: 0, receita: 0 };
  const dias = s.janela_dias ?? 30;
  const v = variacao(antes.reservas, depois.reservas);
  const dados = [
    { lado: `${dias} dias antes`, reservas: antes.reservas },
    { lado: `${dias} dias depois`, reservas: depois.reservas },
  ];
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <p className="text-body-sm text-ink">
        <span className="font-semibold">{s.campanha}</span>
        <span className="text-muted">
          {" "}
          · {s.matriculados ?? 0} pessoas, {s.mensagens_enviadas ?? 0} mensagens enviadas
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
        <div className="h-32 min-w-[12rem] flex-1 text-mp-primary">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados}>
              <XAxis dataKey="lado" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} width={28} />
              <Tooltip />
              <Bar dataKey="reservas" name="Reservas pagas" fill="currentColor" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {v ? (
          <div className="flex flex-col">
            <span className="text-display-sm tabular-nums text-ink">{v}</span>
            <span className="text-caption-sm text-muted">nas reservas pagas</span>
          </div>
        ) : null}
      </div>
      <p className="text-body-sm text-muted">
        Receita de {formatBRL(antes.receita)} antes e {formatBRL(depois.receita)} depois.
      </p>
      {s.janela_completa === false ? (
        <p className="text-caption-sm text-muted">A janela de {dias} dias ainda não fechou para todo mundo.</p>
      ) : null}
      {s.aviso ? <p className="text-caption-sm text-muted">{s.aviso}</p> : null}
    </div>
  );
}
