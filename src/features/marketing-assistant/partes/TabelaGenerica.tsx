import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** A primeira lista de objetos dentro da saída, ou a própria saída se ela já for lista. */
function linhasDe(saida: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(saida)) return saida.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
  if (saida && typeof saida === "object") {
    for (const v of Object.values(saida)) {
      if (Array.isArray(v) && v.every((x) => x && typeof x === "object")) return v as Array<Record<string, unknown>>;
    }
  }
  return null;
}

const celula = (v: unknown) =>
  v === null || v === undefined ? "-" : typeof v === "object" ? JSON.stringify(v).slice(0, 80) : String(v);

/** O que não tem componente próprio: a primeira lista vira tabela; o resto, pares de campo e valor. */
export function TabelaGenerica({ saida }: { saida: unknown }) {
  const linhas = linhasDe(saida);
  if (!linhas) {
    const pares = saida && typeof saida === "object" ? Object.entries(saida as Record<string, unknown>) : [];
    if (pares.length === 0) return null;
    return (
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
        {pares.slice(0, 12).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="text-ink">{celula(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  if (linhas.length === 0) return <p className="text-body-sm text-muted">Nenhum resultado.</p>;
  const colunas = Object.keys(linhas[0]).slice(0, 6);
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <Table>
        <TableHeader>
          <TableRow>
            {colunas.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.slice(0, 20).map((l, i) => (
            <TableRow key={i}>
              {colunas.map((c) => (
                <TableCell key={c}>{celula(l[c])}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {linhas.length > 20 ? <p className="p-2 text-body-sm text-muted">Mostrando 20 de {linhas.length}.</p> : null}
    </div>
  );
}
