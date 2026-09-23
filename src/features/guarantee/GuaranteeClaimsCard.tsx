import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDateTime } from "@/lib/format";
import {
  GUARANTEE_STATUS_LABEL,
  useGuaranteeClaims,
  useResolveGuaranteeClaim,
  type GuaranteeClaimRow,
  type GuaranteeOutcome,
} from "./api";

/**
 * Fila de acionamentos da garantia de vaga (Manager). Some quando não há nenhum aberto: a
 * garantia é rara por desenho, e uma seção vazia na tela de Reservas só ocuparia espaço.
 */
export function GuaranteeClaimsCard() {
  const claims = useGuaranteeClaims("open");
  const [resolving, setResolving] = React.useState<GuaranteeClaimRow | null>(null);
  const abertos = claims.data ?? [];
  if (abertos.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Garantia de vaga acionada</CardTitle>
        <p className="mt-1 text-body-sm text-muted">
          Cliente chegou e não tinha vaga. Realoque num parceiro próximo cobrindo a diferença, ou devolva o valor com um crédito, e feche aqui com o que foi feito.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Acionada em</TableHead>
              <TableHead>Reserva</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {abertos.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="tabular-nums">{formatDateTime(g.opened_at)}</TableCell>
                <TableCell>
                  {g.booking ? (
                    <Link to={`/manager/bookings/${g.booking.code}`} className="font-mono text-caption text-ink">
                      {g.booking.code}
                    </Link>
                  ) : (
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="text-ink">{g.booking?.customer_name ?? "-"}</span>
                    {g.booking?.customer_phone && <span className="text-caption text-muted">{g.booking.customer_phone}</span>}
                  </div>
                </TableCell>
                <TableCell>
                  {g.booking?.location ? `${g.booking.location.company.name} · ${g.booking.location.name}` : "-"}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="secondary" onClick={() => setResolving(g)}>
                    Fechar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      {resolving && <ResolveDialog claim={resolving} onClose={() => setResolving(null)} />}
    </Card>
  );
}

function ResolveDialog({ claim, onClose }: { claim: GuaranteeClaimRow; onClose: () => void }) {
  const resolve = useResolveGuaranteeClaim();
  const [status, setStatus] = React.useState<GuaranteeOutcome>("relocated");
  const [covered, setCovered] = React.useState("");
  const [note, setNote] = React.useState("");

  async function submit() {
    const reais = Number(covered.replace(",", ".") || "0");
    if (!Number.isFinite(reais) || reais < 0) {
      toast.error("Informe o valor coberto em reais, ou deixe zero.");
      return;
    }
    try {
      await resolve.mutateAsync({ id: claim.id, status, coveredCents: Math.round(reais * 100), note: note.trim() || null });
      toast.success("Acionamento fechado.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao fechar o acionamento.");
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fechar acionamento {claim.booking?.code ?? ""}</DialogTitle>
          <DialogDescription>O que a Movepark fez pelo cliente e quanto cobriu. Fica no histórico.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-status">Desfecho</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as GuaranteeOutcome)}>
              <SelectTrigger id="g-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="relocated">{GUARANTEE_STATUS_LABEL.relocated} em outro parceiro</SelectItem>
                <SelectItem value="refunded">{GUARANTEE_STATUS_LABEL.refunded} (100% mais crédito)</SelectItem>
                <SelectItem value="dismissed">{GUARANTEE_STATUS_LABEL.dismissed} (tinha vaga)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-covered">Valor coberto pela Movepark (R$)</Label>
            <Input id="g-covered" inputMode="decimal" value={covered} onChange={(e) => setCovered(e.target.value)} placeholder="0,00" />
            <span className="text-caption text-muted">Diferença de preço paga, ou o crédito dado. {covered ? formatBRL(Number(covered.replace(",", ".")) || 0) : ""}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-note">O que aconteceu</Label>
            <Textarea id="g-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Realocado no parceiro X, diferença de R$ 15 paga por PIX." />
          </div>
          <Badge tone="neutral" className="w-fit">
            {GUARANTEE_STATUS_LABEL[status]}
          </Badge>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={resolve.isPending}>
            {resolve.isPending ? "Fechando…" : "Fechar acionamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
