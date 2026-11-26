import { PanelStat } from "@/components/shared/Panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import type { MarketingSegmentPreview } from "@/types/domain";
import { colunasDaAmostra } from "../conversa.logic";

type Saida = { problems?: string[]; preview?: MarketingSegmentPreview | null };

const valor = (chave: string, v: unknown) =>
  v === null || v === undefined ? "-" : chave === "total_spent" ? formatBRL(Number(v)) : String(v);

/** A medida de um segmento: quantos casam, quantos dá para alcançar e uma amostra. */
export function PreviaDeSegmento({ saida }: { saida: unknown }) {
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
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <PanelStat rotulo="Pessoas" valor={p.total.toLocaleString("pt-BR")} destaque />
        <PanelStat rotulo="Com e-mail" valor={p.reachable_email.toLocaleString("pt-BR")} />
        <PanelStat rotulo="Com WhatsApp" valor={p.reachable_whatsapp.toLocaleString("pt-BR")} />
      </div>
      {amostra.length > 0 && colunas.length > 0 ? (
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
    </div>
  );
}
