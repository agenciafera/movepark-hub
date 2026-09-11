import * as React from "react";
import { toast } from "sonner";
import { ArrowsLeftRight, Warning } from "@phosphor-icons/react";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { usePayoutOwed, useRequestPayoutTransfer, type PayoutOwedRow } from "./api";

const brl = (cents: number) => formatBRL(cents / 100);

/**
 * Repasse ao parceiro (E0.3.4). Com a custódia ligada, a venda cai inteira na conta da Movepark e
 * este é o caminho pelo qual o dinheiro do parceiro sai de lá.
 *
 * Move dinheiro real, então o botão nunca dispara direto: abre um diálogo que mostra empresa,
 * recebedor de destino e valor antes de confirmar. O valor exibido é conferência; quem manda no
 * quanto é o servidor, que recalcula o devido e recusa o que passar disso.
 */
export function PayoutTransferCard() {
  const { data, isLoading } = usePayoutOwed();
  const repassar = useRequestPayoutTransfer();
  const [alvo, setAlvo] = React.useState<PayoutOwedRow | null>(null);

  const linhas = data ?? [];

  async function confirmar() {
    if (!alvo) return;
    try {
      await repassar.mutateAsync({
        company_id: alvo.company_id,
        amount_cents: alvo.available_cents,
      });
      toast.success(`Repasse de ${brl(alvo.available_cents)} enviado para ${alvo.company_name}.`);
      setAlvo(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui enviar o repasse.");
    }
  }

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (linhas.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowsLeftRight />
            A repassar
          </CardTitle>
          <p className="text-body-sm text-muted">
            O que a Movepark ainda deve, das vendas que caíram inteiras na nossa conta.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Devido</TableHead>
                <TableHead className="text-right">Já repassado</TableHead>
                <TableHead className="text-right">A repassar</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const apto = l.recipient_status === "active" && !!l.target_recipient_id;
                return (
                  <TableRow key={l.company_id}>
                    <TableCell className="text-ink">{l.company_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(l.owed_cents)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted">
                      {l.transferred_cents > 0 ? brl(l.transferred_cents) : "-"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-ink">
                      {brl(l.available_cents)}
                    </TableCell>
                    <TableCell className="text-right">
                      {l.em_andamento ? (
                        <Badge tone="pending">Repasse em andamento</Badge>
                      ) : !apto ? (
                        <Badge tone="cancelled" className="gap-1">
                          <Warning />
                          Sem recebedor apto
                        </Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setAlvo(l)}>
                          Repassar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!alvo} onOpenChange={(aberto) => !aberto && setAlvo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar repasse</DialogTitle>
            <DialogDescription>
              O dinheiro sai da conta da Movepark e entra na do parceiro. Não dá para desfazer pelo
              painel.
            </DialogDescription>
          </DialogHeader>
          {alvo && (
            <dl className="flex flex-col gap-3 text-body-sm">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Empresa</dt>
                <dd className="text-ink">{alvo.company_name}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Recebedor de destino</dt>
                <dd className="font-mono text-caption text-ink">{alvo.target_recipient_id}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted">Valor</dt>
                <dd className="text-display-sm text-ink">{brl(alvo.available_cents)}</dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAlvo(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={repassar.isPending}>
              {repassar.isPending ? "Enviando..." : "Confirmar repasse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
