import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { useBookingSupportTickets, useCloseSupportTicket } from "./api";
import { kindLabel } from "./supportTicket.logic";

/**
 * Chamados da reserva, para a equipe Movepark (Manager). Encerrar aqui fecha o chamado; a
 * conversa volta ao agente só em Conversas, quando alguém devolver.
 */
export function SupportTicketsCard({ bookingId, canClose }: { bookingId: string; canClose: boolean }) {
  const tickets = useBookingSupportTickets(bookingId);
  const close = useCloseSupportTicket();
  const list = tickets.data ?? [];
  if (list.length === 0) return null;

  async function encerrar(id: string) {
    try {
      await close.mutateAsync(id);
      toast.success("Chamado encerrado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao encerrar.");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle>Chamados do cliente</CardTitle>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/manager/conversas">Abrir Conversas</Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {list.map((t) => (
          <div key={t.id} className="flex flex-col gap-2 rounded-md bg-surface-soft p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-caption text-ink">{t.code}</span>
              <Badge tone={t.status === "open" ? "pending" : "neutral"}>{t.status === "open" ? "Aberto" : "Encerrado"}</Badge>
              <span className="text-caption text-muted">{kindLabel(t.kind)} · {formatDateTime(t.created_at)}</span>
              {!t.whatsapp_sent && <span className="text-caption text-muted">sem WhatsApp: responder por e-mail</span>}
            </div>
            <p className="whitespace-pre-wrap text-body-sm text-body">{t.message}</p>
            {t.status === "open" && canClose && (
              <div>
                <Button size="sm" variant="secondary" onClick={() => encerrar(t.id)} disabled={close.isPending}>
                  Encerrar chamado
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
