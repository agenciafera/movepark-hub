import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/format";
import { dataCurta } from "../paineis.logic";

type Ponto = { periodo: string; compras: number; abandonos: number; receita: number };
type Saida = { granularidade?: "dia" | "semana"; serie?: Ponto[] };

/** Compras e abandonos no tempo, com o total do período no título. */
export function Tendencia({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as Saida;
  const serie = Array.isArray(s.serie) ? s.serie : [];
  if (serie.length === 0) return <p className="text-body-sm text-muted">Sem movimento no período.</p>;
  const total = serie.reduce(
    (t, p) => ({ compras: t.compras + p.compras, abandonos: t.abandonos + p.abandonos, receita: t.receita + Number(p.receita) }),
    { compras: 0, abandonos: 0, receita: 0 },
  );
  const dados = serie.map((p) => ({ ...p, rotulo: dataCurta(p.periodo) }));
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <p className="text-body-sm text-ink">
        <span className="font-semibold">{s.granularidade === "dia" ? "Por dia" : "Por semana"}</span>
        <span className="text-muted">
          {" "}
          · {total.compras} compras, {total.abandonos} abandonos, {formatBRL(total.receita)}
        </span>
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="rotulo" fontSize={12} />
            <YAxis allowDecimals={false} fontSize={12} width={32} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="compras" name="Compras" stroke="hsl(var(--mp-primary))" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="abandonos" name="Abandonos" stroke="hsl(var(--mp-red))" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
