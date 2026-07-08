import * as React from "react";
import { toast } from "sonner";
import { Hourglass, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRenewBookingHold } from "./api";
import { BOOKING_HOLD_MAX_MINUTES, keepAliveState } from "./keepAlive.logic";

type Props = {
  booking: {
    id: string;
    status: string;
    expires_at: string | null;
    created_at: string;
  };
};

/**
 * Modal keep-alive "Ainda está aí?" (E0.3.1-b). Aparece ~5 min antes da vaga expirar (fase
 * pré-pagamento) e deixa o cliente renovar o hold sem pagar — respeitando o teto de 90 min.
 * Reduz expiração acidental de quem só demorou preenchendo. Server-authoritative (RPC renew).
 */
export function KeepAliveModal({ booking }: Props) {
  const renew = useRenewBookingHold();
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  // Suprime o modal (por dismiss ou após renovar) até `expires_at` mudar.
  const [ackExpires, setAckExpires] = React.useState<string | null>(null);
  const [serverCap, setServerCap] = React.useState(false);

  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = keepAliveState({
    status: booking.status,
    expiresAt: booking.expires_at,
    createdAt: booking.created_at,
    nowMs,
  });
  const atCap = serverCap || state === "cap";
  const open = (state === "warning" || state === "cap") && booking.expires_at !== ackExpires;

  const secs = booking.expires_at
    ? Math.max(0, Math.floor((new Date(booking.expires_at).getTime() - nowMs) / 1000))
    : 0;
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`;

  function dismiss() {
    setAckExpires(booking.expires_at);
  }

  async function handleRenew() {
    try {
      const r = await renew.mutateAsync(booking.id);
      if (r.ok) {
        toast.success("Prontinho, sua vaga segue reservada.");
        setServerCap(!!r.cap_reached);
        if (r.cap_reached) return; // mostra o aviso de teto
        dismiss();
      } else if (r.reason === "cap_reached") {
        setServerCap(true);
      } else {
        dismiss();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu pra renovar agora.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent className="max-w-sm">
        {atCap ? (
          <>
            <DialogHeader>
              <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-badge-pending-bg text-warning">
                <Hourglass className="h-5 w-5" />
              </span>
              <DialogTitle>Tempo de reserva esgotado</DialogTitle>
            </DialogHeader>
            <p className="text-body-md text-ink">
              Você já renovou o máximo ({BOOKING_HOLD_MAX_MINUTES} min). Finalize o pagamento agora —
              se a vaga expirar, é só refazer a busca.
            </p>
            <div className="flex justify-end pt-2">
              <Button onClick={dismiss}>Entendi</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-full bg-mp-pale text-mp-indigo">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <DialogTitle>Ainda está aí?</DialogTitle>
            </DialogHeader>
            <p className="text-body-md text-ink">
              Sua vaga está reservada por mais{" "}
              <strong className="tabular-nums">{mmss}</strong>. Quer manter a reserva?
            </p>
            <p className="text-caption text-muted">
              Você pode renovar por até {BOOKING_HOLD_MAX_MINUTES} min no total. Depois disso, a vaga
              é liberada.
            </p>
            <div className="flex justify-end pt-2">
              <Button onClick={handleRenew} disabled={renew.isPending}>
                {renew.isPending ? "Mantendo…" : "Ainda estou aqui — manter minha vaga"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
