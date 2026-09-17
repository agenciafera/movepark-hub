import * as React from "react";
import { bookingCustomerName } from "./bookings.logic";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate, formatDateTime } from "@/lib/format";
import { parkingTitle } from "@/lib/parkingName";
import type { BookingWithRelations } from "@/types/domain";
import { useAuth } from "@/auth/context";
import { useCancelBookingStaff } from "./api";
import { paymentBadge, paymentState, refundWindow } from "./payment.logic";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { GatewayTrail } from "./GatewayTrail";

type Props = {
  booking: BookingWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BookingModal({ booking, open, onOpenChange }: Props) {
  const { hasScope, effectiveRole } = useAuth();
  const cancelMutation = useCancelBookingStaff();
  const [confirming, setConfirming] = React.useState(false);

  // Reseta a confirmação ao fechar/trocar de reserva.
  React.useEffect(() => {
    if (!open) setConfirming(false);
  }, [open]);

  if (!booking) return null;

  const pay = paymentState(booking.payments);
  // Dois status, de propósito: o da reserva e o do dinheiro. Cancelada com devolução pendente
  // precisa gritar aqui, e a fila manual (Financeiro › Repasses) é onde se tenta de novo.
  const dinheiro = paymentBadge(booking.payments, booking.status);
  // Janela de estorno do gateway (PIX 90 dias, cartão 180, contados do pagamento). Vencida, o
  // cancelamento ainda acontece, mas a devolução cai na fila de reembolso manual.
  const janela = pay.canRefund ? refundWindow(booking.payments) : null;
  // Cancelar (que reembolsa) só antes do check-in, e com escopo. Depois do check-in não há estorno.
  const canCancel =
    (booking.status === "pending" || booking.status === "confirmed") &&
    hasScope("bookings:cancel", booking.location?.company?.id);

  const refundHint = pay.canRefund
    ? `estorna ${formatBRL(booking.total_amount)} ao cliente`
    : pay.badge === "Estornado"
      ? "o valor já foi estornado"
      : null;

  function handleCancel() {
    cancelMutation.mutate(booking!.code, {
      onSuccess: (r) => {
        toast.success(
          r.refunded
            ? r.refund_pending
              ? "Reserva cancelada. Estorno do PIX em processamento."
              : "Reserva cancelada e valor estornado."
            : "Reserva cancelada.",
        );
        onOpenChange(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Falha ao cancelar"),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reserva {booking.code}</DialogTitle>
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={booking.status} />
            {dinheiro && (
              <Badge tone={dinheiro.tone} data-testid="badge-pagamento">
                {dinheiro.label}
              </Badge>
            )}
            <span className="text-body-sm text-muted">
              {parkingTitle(booking.location?.company?.name, booking.location?.name)}
            </span>
          </div>
          {dinheiro?.manualRefund && (
            <p className="text-caption text-error" data-testid="aviso-devolucao-pendente">
              O gateway recusou o estorno; o cliente ainda não recebeu.{" "}
              <Link to="/manager/finance/payouts" className="underline underline-offset-2">
                Tentar de novo ou marcar como devolvido
              </Link>
            </p>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 text-body-sm">
          <Field label="Cliente" value={bookingCustomerName(booking) ?? "-"} />
          <Field label="Telefone" value={booking.customer_phone ?? "-"} />
          <Field label="Check-in" value={formatDateTime(booking.check_in_at)} />
          <Field label="Check-out" value={formatDateTime(booking.check_out_at)} />
          <Field label="Veículo" value={booking.vehicle?.license_plate ?? "-"} />
          <Field label="Valor total" value={formatBRL(booking.total_amount)} />
        </div>

        <Separator />

        <div className="space-y-2">
          <h4 className="text-title-md">Linha do tempo</h4>
          <ol className="space-y-1 text-body-sm">
            <li className="text-muted">Criada em {formatDateTime(booking.created_at)}</li>
            {booking.checked_in_at && (
              <li className="text-muted">Check-in em {formatDateTime(booking.checked_in_at)}</li>
            )}
            {booking.checked_out_at && (
              <li className="text-muted">Check-out em {formatDateTime(booking.checked_out_at)}</li>
            )}
            {booking.deleted_at && (
              <li className="text-error">Cancelada em {formatDateTime(booking.deleted_at)}</li>
            )}
          </ol>
        </div>

        {/* Rastro do gateway (E0.3.9): a equipe sempre vê o que a Pagar.me devolveu. */}
        {effectiveRole === "hub_admin" && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-title-md">Gateway (Pagar.me)</h4>
              <GatewayTrail bookingId={booking.id} />
            </div>
          </>
        )}

        {canCancel && janela && (janela.expired || janela.daysLeft <= 7) && (
          <div
            className={`rounded-md border p-3 text-body-sm ${janela.expired ? "border-error/40 bg-error/5 text-error" : "border-warning/40 bg-warning/5 text-ink"}`}
            data-testid="aviso-janela-estorno"
          >
            {janela.expired
              ? `O prazo de estorno pelo gateway venceu em ${formatDate(janela.deadline)} (${janela.method === "pix" ? "PIX: 90 dias" : "cartão: 180 dias"} depois do pagamento). Cancelar ainda funciona, mas a devolução ao cliente vai para a fila de reembolso manual, para pagar por fora.`
              : `O prazo de estorno pelo gateway vence em ${formatDate(janela.deadline)} (${janela.daysLeft} dia${janela.daysLeft === 1 ? "" : "s"}). Depois disso a devolução vai para a fila manual.`}
          </div>
        )}

        {canCancel && (
          <div className="flex flex-col items-end gap-2 pt-2">
            {!confirming ? (
              <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
                Cancelar reserva
              </Button>
            ) : (
              <div className="w-full space-y-2 rounded-md border border-hairline bg-surface-soft p-3">
                <p className="text-body-sm text-ink">
                  Cancela a reserva{refundHint ? ` e ${refundHint}` : ""}. Só é possível antes do
                  check-in. Confirmar?
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirming(false)}
                    disabled={cancelMutation.isPending}
                  >
                    Voltar
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? "Cancelando…" : "Confirmar cancelamento"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  );
}
