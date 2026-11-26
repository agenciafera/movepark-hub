import * as React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import type { MarketingSegmentPreview } from "@/types/domain";
import { colunasDaAmostra } from "../conversa.logic";

type Saida = { problems?: string[]; preview?: MarketingSegmentPreview | null };

const valor = (chave: string, v: unknown) =>
  v === null || v === undefined ? "-" : chave === "total_spent" ? formatBRL(Number(v)) : String(v);

function Numero({ valor: v, rotulo, destaque }: { valor: number; rotulo: string; destaque?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className={"text-display-sm tabular-nums " + (destaque ? "text-mp-primary" : "text-ink")}>
        {v.toLocaleString("pt-BR")}
      </span>
      <span className="text-caption-sm text-muted">{rotulo}</span>
    </div>
  );
}

/** A medida de um segmento: quantos casam e quantos dá para alcançar. A amostra fica a um clique. */
export function PreviaDeSegmento({ saida }: { saida: unknown }) {
  const [verAmostra, setVerAmostra] = React.useState(false);
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
  const p = s.preview;
  if (!p) return null;
  const amostra = p.sample ?? [];
  const colunas = colunasDaAmostra(amostra);
  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface p-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <Numero valor={p.total} rotulo="pessoas no segmento" destaque />
        <Numero valor={p.reachable_email} rotulo="com e-mail" />
        <Numero valor={p.reachable_whatsapp} rotulo="com WhatsApp" />
      </div>
      {amostra.length > 0 && colunas.length > 0 ? (
        <>
          <button
            type="button"
            className="text-body-sm font-medium text-mp-primary underline-offset-2 hover:underline"
            onClick={() => setVerAmostra((v) => !v)}
          >
            {verAmostra ? "Esconder a amostra" : "Ver uma amostra"}
          </button>
          {verAmostra ? (
            <div className="overflow-x-auto rounded-lg border border-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    {colunas.map((c) => (
                      <TableHead key={c.chave}>{c.rotulo}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {amostra.slice(0, 10).map((a) => (
                    <TableRow key={a.contact_key}>
                      {colunas.map((c) => (
                        <TableCell key={c.chave}>{valor(c.chave, a.doc?.[c.chave])}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
