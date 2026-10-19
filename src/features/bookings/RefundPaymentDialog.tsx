import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL } from "@/lib/format";
import { useRefundPayment, type GatewayTrailPayment } from "./api";

type Props = {
  payment: GatewayTrailPayment | null;
  /** O único pagamento aprovado da reserva: o estorno a deixa confirmada sem pagamento. */
  lastLivePayment: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Estorno avulso de UM pagamento, sem cancelar a reserva (19/10/2026). Só aparece para a equipe
 * (o rastro do gateway é do hub_admin) e a Edge `refund-payment` revalida tudo no servidor.
 */
export function RefundPaymentDialog({ payment, lastLivePayment, open, onOpenChange }: Props) {
  const refund = useRefundPayment();
  const [reason, setReason] = React.useState("");
  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);
  if (!payment) return null;

  const valor = formatBRL(Number(payment.amount));
  const motivoOk = reason.trim().length >= 5;
  const meio =
    payment.method === "pix"
      ? "PIX"
      : payment.method === "card"
        ? `Cartão${payment.installments ? ` ${payment.installments}x` : ""}`
        : payment.method;

  async function confirmar() {
    try {
      const r = await refund.mutateAsync({ paymentId: payment!.id, reason: reason.trim() });
      toast.success(
        r.refund_pending
          ? "Estorno pedido. A reserva continua como estava; o PIX volta ao cliente em até 1 dia útil."
          : "Estorno feito. A reserva continua como estava.",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível estornar.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Estornar pagamento</DialogTitle>
          <DialogDescription>
            Devolve o valor ao cliente pela Pagar.me. A reserva continua como está.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-body-sm">
          <p className="text-ink">
            {valor} · {meio}
            {payment.provider_charge_id ? (
              <span className="text-muted"> · {payment.provider_charge_id}</span>
            ) : null}
          </p>
          <p className="text-pretty text-muted">
            A parte do parceiro sai do saldo dele ou vira dívida, descontada das próximas vendas.
          </p>
          {lastLivePayment && (
            <p className="text-pretty text-error" data-testid="refund-last-payment">
              Este é o único pagamento aprovado da reserva. Depois do estorno, ela continua
              confirmada sem pagamento.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="refund-reason">Motivo (fica no rastro e no relatório)</Label>
            <Textarea
              id="refund-reason"
              placeholder="Ex.: cobrança em dobro"
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={refund.isPending}>
            Voltar
          </Button>
          <Button onClick={confirmar} disabled={!motivoOk || refund.isPending}>
            {refund.isPending ? "Estornando…" : `Estornar ${valor}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
