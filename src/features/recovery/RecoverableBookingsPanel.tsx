import * as React from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { format } from "date-fns";
import { DownloadSimple, Info, UserMinus, WhatsappLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatBRL, formatDateTime } from "@/lib/format";
import { downloadCsv, toCsv } from "@/lib/csv";
import { fetchRecoverableBookings, useRecoverableBookings } from "./api";
import {
  RECOVERY_CSV_HEADERS,
  formatRecoveryPhone,
  recoveryCsvRow,
  recoveryOriginLabel,
  stoppedAtLabel,
  talkedToMia,
  whatsappLink,
} from "./recovery.logic";

/**
 * Lista de reservas não concluídas que ainda dá para recuperar, com o botão de baixar CSV. A
 * mesma peça serve o Operator e o Manager (`bookingHref` muda o destino do código).
 */
export function RecoverableBookingsPanel({
  companyId,
  bookingHref,
  filePrefix = "nao-concluidas",
}: {
  companyId: string;
  bookingHref?: (code: string) => string;
  filePrefix?: string;
}) {
  const { data, isLoading, error } = useRecoverableBookings(companyId);
  const [busy, setBusy] = React.useState(false);
  const rows = data ?? [];

  async function baixar() {
    setBusy(true);
    try {
      // Busca de novo com `exportar`: o arquivo sai do instante do clique e o servidor registra.
      const lista = await fetchRecoverableBookings(companyId, true);
      if (lista.length === 0) {
        toast.error("Ninguém na lista para baixar.");
        return;
      }
      const csv = toCsv(lista.map(recoveryCsvRow), [...RECOVERY_CSV_HEADERS]);
      downloadCsv(`${filePrefix}-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`, csv);
      toast.success(
        lista.length === 1 ? "Lista baixada com 1 pessoa." : `Lista baixada com ${lista.length} pessoas.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não deu para baixar a lista.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p
          role="note"
          className="flex max-w-[68ch] items-start gap-2 rounded-sm bg-surface-soft p-3 text-body-sm text-ink"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-steel" aria-hidden />
          <span className="text-pretty">
            Estes contatos são de quem ainda não é seu cliente. Fale uma vez com cada pessoa, só
            sobre a reserva que ela começou.
          </span>
        </p>
        <Button variant="secondary" onClick={baixar} disabled={busy || rows.length === 0}>
          <DownloadSimple className="h-4 w-4" aria-hidden />
          {busy ? "Baixando..." : "Baixar lista (CSV)"}
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <EmptyState
          title="Não deu para carregar a lista"
          description={error instanceof Error ? error.message : undefined}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UserMinus className="h-10 w-10" />}
          title="Ninguém para chamar agora"
          description="Quando alguém começar uma reserva, não pagar e ainda tiver a viagem pela frente, a pessoa aparece aqui."
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pessoa</TableHead>
                <TableHead>Reserva</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Saída</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Onde parou</TableHead>
                <TableHead>Origem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const fone = formatRecoveryPhone(r.customer_phone);
                const wa = whatsappLink(r.customer_phone);
                return (
                  <TableRow key={r.booking_id} data-testid={`recuperavel-${r.code}`}>
                    <TableCell>
                      <div className="font-medium text-ink">{r.customer_name ?? "Sem nome"}</div>
                      {fone && (
                        <div className="flex items-center gap-1 text-caption text-muted-steel">
                          {fone}
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Abrir conversa no WhatsApp com ${fone}`}
                              className="text-mp-primary"
                            >
                              <WhatsappLogo className="h-4 w-4" aria-hidden />
                            </a>
                          )}
                        </div>
                      )}
                      {r.customer_email && (
                        <div className="text-caption text-muted-steel">{r.customer_email}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {bookingHref ? (
                        <Link
                          to={bookingHref(r.code)}
                          className="font-mono text-body-sm underline-offset-2 hover:underline"
                        >
                          {r.code}
                        </Link>
                      ) : (
                        <span className="font-mono text-body-sm">{r.code}</span>
                      )}
                      <div className="text-caption text-muted-steel">
                        {[r.parking_type, r.days ? `${r.days} ${r.days === 1 ? "diária" : "diárias"}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                      {r.attempts > 1 && (
                        <div className="text-caption text-muted-steel">{r.attempts} tentativas</div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.check_in_at)}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(r.check_out_at)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {formatBRL(r.total_amount)}
                    </TableCell>
                    <TableCell>{stoppedAtLabel(r.stopped_at)}</TableCell>
                    <TableCell>
                      <div>{recoveryOriginLabel(r.origin)}</div>
                      {talkedToMia(r.origin) && (
                        <span className="mt-1 inline-block rounded-sm bg-surface-soft px-1.5 py-0.5 text-caption text-muted-steel">
                          Falou com a Mia
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
