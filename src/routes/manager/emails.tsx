import * as React from "react";
import { EnvelopeSimple } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEmailEvents } from "@/features/email-events/api";
import { eventoRotulo, resumoPorDestinatario } from "@/features/email-events/logic";
import { formatDateTime } from "@/lib/format";

/**
 * E-mails (19/11/2026): o que o Amazon SES contou depois de aceitar cada mensagem.
 *
 * O envio só sabe se o SES aceitou. Quem recusa depois é o Gmail, o Outlook ou o servidor do
 * parceiro, e isso chega aqui pelo SNS (Edge `ses-events`). A tela existe para responder "esse
 * endereço está recebendo?" sem abrir o console da AWS.
 *
 * Spec: docs/specs/email-eventos-ses.md
 */
export default function ManagerEmails() {
  const [busca, setBusca] = React.useState("");
  const [soProblemas, setSoProblemas] = React.useState(false);
  const recipient = React.useDeferredValue(busca);
  const lista = useEmailEvents({ recipient, onlyProblems: soProblemas });
  const eventos = lista.data ?? [];
  const comProblema = React.useMemo(() => resumoPorDestinatario(eventos), [eventos]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="E-mails"
        description="O que aconteceu com cada e-mail depois que o Amazon SES aceitou: entregue, devolvido ou marcado como spam."
      />

      <div className="flex flex-wrap items-center gap-4">
        <Input
          placeholder="Buscar pelo e-mail do destinatário"
          aria-label="Buscar destinatário"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-md"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={soProblemas} onCheckedChange={setSoProblemas} aria-label="Mostrar só problemas" />
          Mostrar só problemas
        </label>
      </div>

      {lista.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : lista.isError ? (
        <EmptyState
          title="Não deu pra carregar os eventos"
          description={lista.error instanceof Error ? lista.error.message : "Tente de novo."}
        />
      ) : eventos.length === 0 ? (
        <EmptyState
          icon={<EnvelopeSimple className="h-10 w-10" />}
          title="Nenhum evento"
          description={busca ? "Nada para esse endereço." : "O SES ainda não mandou nenhum evento."}
        />
      ) : (
        <>
          {comProblema.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-base font-semibold">Endereços com problema</h2>
              <div className="overflow-x-auto rounded-md border border-hairline bg-canvas">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Último problema</TableHead>
                      <TableHead className="text-right">Vezes</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comProblema.map((r) => (
                      <TableRow key={r.recipient}>
                        <TableCell className="font-medium">{r.recipient}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {r.ultimoProblema}
                          <span className="text-muted-foreground"> · {formatDateTime(r.ultimoProblemaEm)}</span>
                        </TableCell>
                        <TableCell className="text-right">{r.problemas}</TableCell>
                        <TableCell>
                          <Badge tone={r.voltouAReceber ? "confirmed" : "cancelled"}>
                            {r.voltouAReceber ? "Voltou a receber" : "Sem entrega depois"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <h2 className="text-base font-semibold">Últimos eventos</h2>
            <div className="overflow-x-auto rounded-md border border-hairline bg-canvas">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Resposta do servidor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eventos.map((e) => {
                    const rotulo = eventoRotulo(e);
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm whitespace-nowrap">{formatDateTime(e.occurred_at)}</TableCell>
                        <TableCell className="text-sm">{e.recipient}</TableCell>
                        <TableCell>
                          <Badge tone={rotulo.tone} className="whitespace-nowrap">
                            {rotulo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[18rem] text-sm">{e.subject ?? "sem assunto"}</TableCell>
                        <TableCell className="max-w-[24rem] text-sm break-words text-muted-foreground">
                          {e.diagnostic ?? ""}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
