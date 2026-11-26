import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Saida = {
  campanha?: { name?: string; status?: string };
  matriculas?: Record<string, number>;
  problemas?: string[];
};

// Os valores de `marketing_enrollment_status` (migration 20261027093000).
const STATUS: Record<string, string> = {
  active: "Ativas",
  waiting: "Esperando",
  completed: "Concluídas",
  exited: "Saíram",
  failed: "Falharam",
};

/** A campanha aberta: em que pé estão as matrículas, em gráfico, e o que impede de rodar. */
export function NumerosDaCampanha({ saida }: { saida: unknown }) {
  const s = (saida ?? {}) as Saida;
  const dados = Object.entries(s.matriculas ?? {}).map(([k, v]) => ({ status: STATUS[k] ?? k, total: v }));
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink">
        <span className="font-semibold">{s.campanha?.name ?? "Campanha"}</span>
        {s.campanha?.status ? <span className="text-muted"> · {s.campanha.status}</span> : null}
      </p>
      {dados.length > 0 ? (
        <div className="h-40 text-mp-primary">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados}>
              <XAxis dataKey="status" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} width={32} />
              <Tooltip />
              <Bar dataKey="total" fill="currentColor" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-body-sm text-muted">Ninguém entrou nesta campanha ainda.</p>
      )}
      {s.problemas?.length ? (
        <ul className="list-disc space-y-1 pl-5 text-body-sm text-error">
          {s.problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
