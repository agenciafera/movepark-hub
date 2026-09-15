import * as React from "react";
import { toast } from "sonner";
import { HandCoins } from "@phosphor-icons/react";
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
import { useManualRefunds, useMarkManualRefundPaid, type ManualRefundRow } from "./api";

const brl = (cents: number) => formatBRL(cents / 100);

const motivo: Record<ManualRefundRow["reason"], string> = {
  gateway_deadline: "Prazo do meio de pagamento venceu",
  gateway_no_balance: "Sem saldo no master",
  gateway_refused: "Gateway recusou",
};

/**
 * Fila de reembolso manual (E0.3.5, decisão 7). Entra aqui o cancelamento que o gateway recusou
 * de forma definitiva: a reserva já cancelou e liberou a vaga, e falta devolver o dinheiro por
 * fora. Marcar como pago vira o pagamento em estornado e, se a venda foi com split, a perna do
 * parceiro entra na dívida dele.
 */
export function ManualRefundQueueCard() {
  const { data, isLoading } = useManualRefunds();
  const marcar = useMarkManualRefundPaid();
  const [alvo, setAlvo] = React.useState<ManualRefundRow | null>(null);
  const [nota, setNota] = React.useState("");

  const pendentes = (data ?? []).filter((r) => r.status === "pending");

  async function confirmar() {
    if (!alvo) return;
    try {
      await marcar.mutateAsync({ id: alvo.id, note: nota.trim() || undefined });
      toast.success(`Reembolso de ${brl(alvo.amount_cents)} marcado como pago.`);
      setAlvo(null);
      setNota("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui marcar o reembolso.");
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (pendentes.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HandCoins />
            Reembolsos para fazer por fora
          </CardTitle>
          <p className="text-body-sm text-muted">
            O gateway recusou o estorno e a reserva já foi cancelada. Devolva ao cliente pelo banco e
            marque aqui.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reserva</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendentes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-ink">{r.booking?.code ?? "-"}</TableCell>
                  <TableCell>
                    <div className="text-ink">{r.booking?.customer_name ?? "-"}</div>
                    <div className="text-caption text-muted">{r.booking?.customer_email ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-ink">{brl(r.amount_cents)}</TableCell>
                  <TableCell>
                    <Badge tone="pending">{motivo[r.reason]}</Badge>
                  </TableCell>
                  <TableCell className="text-muted">{formatDate(r.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setAlvo(r)}>
                      Marcar como pago
                    </Button>
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
            <DialogTitle>Marcar reembolso como pago</DialogTitle>
            <DialogDescription>
              Confirme que {brl(alvo?.amount_cents ?? 0)} da reserva {alvo?.booking?.code} já foi
              devolvido ao cliente. O pagamento vira estornado e a conta com o parceiro se ajusta.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reembolso-nota">Como foi devolvido</Label>
            <Textarea
              id="reembolso-nota"
              placeholder="Ex.: PIX para a chave do cliente em 15/09"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlvo(null)}>
              Voltar
            </Button>
            <Button onClick={confirmar} disabled={marcar.isPending}>
              {marcar.isPending ? "Marcando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
