import * as React from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HORARIO_SUPORTE } from "@/lib/suporte";
import { useOpenSupportTicket } from "./api";
import { MESSAGE_MAX, TICKET_KINDS, TICKET_KIND_LABEL, type TicketKind, validateTicket } from "./supportTicket.logic";

type Props = {
  bookingCode: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Chamado de atendimento (25/09/2026): o cliente escolhe o motivo, conta o que houve e a
 * Movepark responde por uma pessoa, no WhatsApp, em horário comercial. O agente não entra nessa
 * conversa. Spec: docs/specs/chamado-de-atendimento.md
 */
export function SupportTicketDialog({ bookingCode, open, onOpenChange }: Props) {
  const openTicket = useOpenSupportTicket();
  const [kind, setKind] = React.useState<TicketKind>("complaint");
  const [message, setMessage] = React.useState("");
  const [done, setDone] = React.useState<{ code: string; whatsapp: boolean } | null>(null);

  React.useEffect(() => {
    if (open) {
      setDone(null);
      setMessage("");
      setKind("complaint");
    }
  }, [open]);

  async function enviar() {
    const erro = validateTicket(kind, message);
    if (erro) {
      toast.error(erro);
      return;
    }
    try {
      const r = await openTicket.mutateAsync({ booking_code: bookingCode, kind, message: message.trim() });
      setDone(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui abrir o chamado.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{done ? "Chamado aberto" : "Falar com a Movepark"}</DialogTitle>
          <DialogDescription>
            {done
              ? `Seu chamado é o ${done.code}.`
              : `Uma pessoa da nossa equipe responde ${HORARIO_SUPORTE}. Reserva ${bookingCode}.`}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col gap-3">
            <p className="text-body-sm text-body">
              {done.whatsapp
                ? "Mandamos a confirmação no seu WhatsApp. A resposta chega por lá, e você pode acrescentar detalhes na mesma conversa."
                : "Mandamos a confirmação no seu e-mail. A resposta chega por lá."}
            </p>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Entendi</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-kind">Motivo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as TicketKind)}>
                <SelectTrigger id="ticket-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {TICKET_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticket-message">O que aconteceu</Label>
              <Textarea
                id="ticket-message"
                rows={5}
                maxLength={MESSAGE_MAX}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Conte com detalhes: o que houve, quando e o que você espera da gente."
              />
              <p className="text-caption text-muted">
                {message.trim().length}/{MESSAGE_MAX}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={enviar} disabled={openTicket.isPending}>
                {openTicket.isPending ? "Enviando…" : "Abrir chamado"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
