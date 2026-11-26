import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";
import { useExtraDaysTable } from "./api";
import { extraDaysRows, quoteExit, type ExitQuote, type ExtraDaysTable } from "./extraDays.logic";

/** Linhas abertas de saída: uma semana. O resto da tabela (até 30 dias) abre no botão. */
const LINHAS_INICIAIS = 7;
const LINHAS_TODAS = 30;

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const diarias = (n: number) => `${n} ${n === 1 ? "diária" : "diárias"}`;

/** Saída sugerida: agora, se o cliente já passou do combinado; senão, a saída da reserva. */
function saidaInicial(checkOutIso: string): string {
  const agora = new Date();
  const saida = new Date(checkOutIso);
  return toLocalInput(agora > saida ? agora : saida);
}

function Resultado({ q }: { q: ExitQuote | null }) {
  if (!q) return <p className="text-body-sm text-muted">Informe a data e a hora da saída.</p>;
  switch (q.kind) {
    case "within":
      return <p className="text-body-sm text-ink">Dentro do período reservado. Nada a cobrar.</p>;
    case "charge":
      return (
        <p className="text-body-sm text-ink" data-testid="dias-a-mais-cobrar">
          {diarias(q.extra)} a mais: cobrar{" "}
          <strong className="font-semibold tabular-nums">{formatBRL(q.charge)}</strong>
        </p>
      );
    case "no_price":
      return (
        <p className="text-body-sm text-ink">A tabela não tem preço para {diarias(q.days)}.</p>
      );
    case "beyond":
      return (
        <p className="text-body-sm text-ink">
          Esta tabela vai até {diarias(q.lastDay)}, e essa saída dá {q.days}.
        </p>
      );
  }
}

function Tabela({ t, destaque }: { t: ExtraDaysTable; destaque: number | null }) {
  const [todas, setTodas] = React.useState(false);
  const rows = extraDaysRows(t, todas ? LINHAS_TODAS : LINHAS_INICIAIS);
  const temMais = !todas && t.lastDay > t.bookedDays + LINHAS_INICIAIS;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-md border border-hairline bg-canvas">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Estadia</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">A cobrar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.days}
                className={cn(r.days === destaque && "bg-surface-soft")}
                aria-current={r.days === destaque ? "true" : undefined}
              >
                <TableCell className="text-ink">
                  <span className="font-medium">{diarias(r.days)}</span>
                  {r.extra === 0 ? (
                    <span className="ml-2 rounded-sm bg-mp-pale px-1.5 py-0.5 text-caption text-mp-indigo">
                      reservada
                    </span>
                  ) : (
                    <span className="ml-2 text-caption text-muted">
                      +{r.extra} {r.extra === 1 ? "dia" : "dias"}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted">
                  {r.total == null ? "-" : formatBRL(r.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-ink">
                  {r.extra === 0 || r.charge == null ? "-" : formatBRL(r.charge)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {temMais && (
        <div>
          <Button size="sm" variant="secondary" onClick={() => setTodas(true)}>
            Ver até {LINHAS_TODAS} dias a mais
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Dias a mais (26/11/2026): quanto o balcão cobra de quem sai depois do combinado. Mostra a tabela
 * da estadia reservada e de cada dia seguinte, e um campo de saída real que diz quantas diárias a
 * mais deram e quanto cobrar. A conta está em `extraDays.logic.ts`; a tabela vem da RPC
 * `booking_extra_days_table`, que o balcão também chama (só preço de tabela, nada do que a reserva
 * pagou).
 */
export function ExtraDaysCard({ bookingId }: { bookingId: string }) {
  const q = useExtraDaysTable(bookingId);
  const t = q.data ?? null;
  const [saida, setSaida] = React.useState<string | null>(null);
  const valor = saida ?? (t ? saidaInicial(t.checkOutAt) : "");
  const data = valor ? new Date(valor) : null;
  const cotacao = t && data && !Number.isNaN(data.getTime()) ? quoteExit(t, data.toISOString()) : null;

  return (
    <Card data-testid="dias-a-mais">
      <CardHeader>
        <CardTitle>Dias a mais</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !t ? (
          <p className="text-body-sm text-muted">
            {q.isError
              ? "Não deu para carregar a tabela de preço desta reserva."
              : "A tabela de preço desta vaga não está disponível."}
          </p>
        ) : (
          <>
            <p className="text-body-sm text-muted">
              {t.source === "compra"
                ? "Se o cliente sair depois do combinado, cobre a diferença pela tabela de preço do dia da compra."
                : "Se o cliente sair depois do combinado, cobre a diferença pela tabela de hoje, porque esta reserva é de antes de o Hub guardar a tabela da compra."}
            </p>
            <div className="flex flex-col gap-2 tablet:flex-row tablet:items-end tablet:gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="dias-a-mais-saida">Saída real</Label>
                <Input
                  id="dias-a-mais-saida"
                  type="datetime-local"
                  className="tablet:w-60"
                  value={valor}
                  onChange={(e) => setSaida(e.target.value)}
                />
              </div>
              <div className="tablet:pb-2" aria-live="polite">
                <Resultado q={cotacao} />
              </div>
            </div>
            <Tabela t={t} destaque={cotacao && cotacao.kind !== "beyond" ? cotacao.days : null} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
