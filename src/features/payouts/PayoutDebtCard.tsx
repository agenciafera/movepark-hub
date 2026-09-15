import * as React from "react";
import { toast } from "sonner";
import { Scales } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, formatDate } from "@/lib/format";
import { usePayoutDebtOverview, useSettlePayoutDebt, type PayoutDebtOverviewRow } from "./api";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * Dívida do parceiro com a Movepark (E0.3.5). Nasce quando a Movepark devolve ao cliente um valor
 * que o gateway já tinha creditado ao parceiro (estorno, chargeback), e se paga sozinha pelo split
 * dinâmico das vendas seguintes. Aqui a Movepark vê quem deve, desde quando, e lança o acerto
 * manual quando o parceiro paga por fora. Cobrar é conversa e contrato, não código (decisão 9).
 */
export function PayoutDebtCard() {
  const { data, isLoading } = usePayoutDebtOverview();
  const acertar = useSettlePayoutDebt();
  const [alvo, setAlvo] = React.useState<PayoutDebtOverviewRow | null>(null);
  const [valor, setValor] = React.useState("");
  const [nota, setNota] = React.useState("");

  const linhas = data ?? [];
  const valorCents = Math.round(Number(valor.replace(",", ".")) * 100);
  const valorValido = Number.isFinite(valorCents) && valorCents > 0;

  async function confirmar() {
    if (!alvo || !valorValido) return;
    try {
      await acertar.mutateAsync({
        company_id: alvo.company_id,
        amount_cents: valorCents,
        kind: "manual_payment",
        note: nota.trim() || undefined,
      });
      toast.success(`Acerto de ${brl(valorCents)} lançado para ${alvo.company_name}.`);
      setAlvo(null);
      setValor("");
      setNota("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui lançar o acerto.");
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (linhas.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scales />
            Dívida de parceiros
          </CardTitle>
          <p className="text-body-sm text-muted">
            O que a Movepark devolveu a clientes por vendas que o gateway já tinha pago ao parceiro.
            As vendas seguintes dele abatem sozinhas; o acerto manual é para quando ele paga por fora.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Dívida</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>Último abatimento</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.company_id}>
                  <TableCell className="text-ink">{l.company_name}</TableCell>
                  <TableCell className="text-right tabular-nums text-ink">
                    {l.debt_raw_cents < 0 ? (
                      // Abateu mais do que devia (duas vendas no mesmo instante): agora somos nós
                      // que devemos. Aparece para alguém resolver, em vez de sumir no zero.
                      <Badge tone="pending">A devolver {brl(-l.debt_raw_cents)}</Badge>
                    ) : (
                      brl(l.debt_cents)
                    )}
                  </TableCell>
                  <TableCell className="text-muted">{l.since ? formatDate(l.since) : "-"}</TableCell>
                  <TableCell className="text-muted">
                    {l.last_recovery_at ? formatDate(l.last_recovery_at) : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.debt_cents > 0 ? (
                      <Button size="sm" variant="outline" onClick={() => setAlvo(l)}>
                        Lançar acerto
                      </Button>
                    ) : (
                      <span className="text-caption text-muted">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!alvo} onOpenChange={(open) => !open && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lançar acerto de dívida</DialogTitle>
            <DialogDescription>
              Use quando {alvo?.company_name} pagou por fora (PIX para a Movepark). O valor abate a
              dívida de {alvo ? brl(alvo.debt_cents) : ""} e fica no histórico dos dois lados.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acerto-valor">Valor recebido (R$)</Label>
              <Input
                id="acerto-valor"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acerto-nota">Observação</Label>
              <Textarea
                id="acerto-nota"
                placeholder="Ex.: PIX recebido em 15/09, comprovante no Drive"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlvo(null)}>
              Voltar
            </Button>
            <Button onClick={confirmar} disabled={!valorValido || acertar.isPending}>
              {acertar.isPending ? "Lançando..." : "Lançar acerto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
