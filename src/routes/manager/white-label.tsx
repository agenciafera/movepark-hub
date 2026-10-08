import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowsClockwise, CheckCircle, Warning } from "@phosphor-icons/react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRetryWlDelivery, useWlHealth } from "@/features/wl-health/api";
import { useTriggerWlMirror } from "@/features/parking-types/api";
import {
  healthReasonLabel,
  importStatusView,
  isMirrorStale,
  mirrorStatusView,
  reconcileStatusView,
  TONE_BADGE,
  type StatusView,
} from "@/features/wl-health/wlHealth.logic";
import { formatDateTime } from "@/lib/format";
import type { WlDeliveryIssue, WlImportStatus, WlUnitHealth } from "@/types/domain";

/**
 * Saúde da integração com os sites white-label dos parceiros.
 *
 * Existe porque a integração falhava calada: entrega recusada virava `failed` sem ninguém saber,
 * a reconciliação só escrevia no console e o espelho de preço errou 140 vezes na BePark com a
 * tela dizendo "ok". Aqui aparece o que precisa de alguém, com o botão para resolver na mesma
 * linha. O alarme diário (workflow wl-health.yml) lê a mesma saúde.
 *
 * Spec: docs/specs/shared-availability.md (§ Saúde da integração).
 */
export default function ManagerWhiteLabel() {
  const report = useWlHealth();
  const health = report.data?.health;

  return (
    <div className="space-y-6">
      <PageHeader
        title="White-label"
        description="Reservas enviadas aos sites dos parceiros, vendas lidas de lá e preço espelhado. O que precisar de você aparece aqui."
        actions={
          <Button variant="outline" onClick={() => report.refetch()} disabled={report.isFetching}>
            <ArrowsClockwise />
            {report.isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        }
      />

      {report.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : report.error ? (
        <div className="rounded-md border border-error bg-badge-cancelled-bg p-4 text-body-sm text-error">
          Não deu para carregar a saúde do white-label:{" "}
          {report.error instanceof Error ? report.error.message : "erro desconhecido"}
        </div>
      ) : (
        <>
          <ResumoSaude
            ok={!!health?.ok}
            motivos={health?.motivos ?? []}
            entregues24h={report.data?.recent.delivered_24h ?? 0}
            pendentes={report.data?.recent.pending ?? 0}
            ultimaEntrega={report.data?.recent.last_delivered_at ?? null}
          />
          <EntregasComProblema deliveries={report.data?.deliveries ?? []} />
          <Vagas units={report.data?.units ?? []} />
          <ImportacaoDoSite
            enabled={report.data?.import_enabled ?? false}
            imports={report.data?.imports ?? []}
          />
        </>
      )}
    </div>
  );
}

function ResumoSaude({
  ok,
  motivos,
  entregues24h,
  pendentes,
  ultimaEntrega,
}: {
  ok: boolean;
  motivos: string[];
  entregues24h: number;
  pendentes: number;
  ultimaEntrega: string | null;
}) {
  return (
    <section
      className={`rounded-lg border p-4 ${ok ? "border-hairline" : "border-error bg-badge-cancelled-bg"}`}
      aria-label="Resumo da saúde"
    >
      <div className="flex items-start gap-3">
        {ok ? (
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-badge-confirmed-fg" />
        ) : (
          <Warning className="mt-0.5 h-5 w-5 shrink-0 text-error" />
        )}
        <div className="space-y-2">
          <p className="text-body-sm font-medium text-ink">
            {ok ? "Tudo em dia." : "Tem coisa pedindo atenção."}
          </p>
          {!ok && (
            <ul className="list-disc space-y-1 pl-4 text-body-sm text-ink">
              {motivos.map((m) => (
                <li key={m}>{healthReasonLabel(m)}</li>
              ))}
            </ul>
          )}
          <p className="text-caption text-muted">
            {entregues24h} envios nas últimas 24 horas · {pendentes} na fila
            {ultimaEntrega ? ` · último em ${formatDateTime(ultimaEntrega)}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}

function StatusBadgeView({ view }: { view: StatusView }) {
  return <Badge tone={TONE_BADGE[view.tone]}>{view.label}</Badge>;
}

function EntregasComProblema({ deliveries }: { deliveries: WlDeliveryIssue[] }) {
  const retry = useRetryWlDelivery();

  const reenviar = (d: WlDeliveryIssue) => {
    retry.mutate(d.id, {
      onSuccess: (voltou) =>
        voltou
          ? toast.success("Voltou para a fila. O envio sai no próximo minuto.")
          : toast.info("Esse envio já não estava travado."),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Não deu para reenviar."),
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-title-md text-ink">Envios ao site do parceiro</h2>
      {deliveries.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="h-10 w-10" />}
          title="Nenhum envio travado"
          description="Toda reserva e liberação saiu para o site do parceiro."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reserva</TableHead>
                <TableHead>Envio</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Último erro</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="font-medium">
                      {d.booking_code ? (
                        <Link className="underline" to={`/manager/bookings/${d.booking_code}`}>
                          {d.booking_code}
                        </Link>
                      ) : (
                        "reserva apagada"
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">{d.company_name}</div>
                  </TableCell>
                  <TableCell>
                    <div>{d.operation === "reserve" ? "Ocupar vaga" : "Liberar vaga"}</div>
                    {d.start_date ? (
                      <div className="text-sm text-muted-foreground">
                        {d.start_date} a {d.end_date}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge tone={d.status === "failed" ? "cancelled" : "pending"}>
                      {d.status === "failed" ? "falhou" : "na fila"}
                    </Badge>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {d.attempts} de {d.max_attempts} tentativas
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[28rem] text-sm">
                    {d.last_status ? <span className="font-medium">HTTP {d.last_status} </span> : null}
                    <span className="break-words text-muted-foreground">{d.last_error ?? "-"}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    {d.status === "failed" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => reenviar(d)}
                        disabled={retry.isPending}
                      >
                        Reenviar
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

function Vagas({ units }: { units: WlUnitHealth[] }) {
  const trigger = useTriggerWlMirror();

  const conferir = (u: WlUnitHealth) => {
    trigger.mutate(u.location_parking_type_id, {
      onSuccess: () => toast.success("Conferência pedida. O resultado aparece em uns 2 minutos."),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Não deu para pedir a conferência."),
    });
  };

  return (
    <section className="space-y-3">
      <h2 className="text-title-md text-ink">Vagas ligadas ao white-label</h2>
      {units.length === 0 ? (
        <EmptyState
          icon={<Warning className="h-10 w-10" />}
          title="Nenhuma vaga mapeada"
          description="Mapeie o tipo de vaga no site do parceiro na tela de tipos de vaga da unidade."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vaga</TableHead>
                <TableHead>Reserva fecha</TableHead>
                <TableHead>Vendas do parceiro</TableHead>
                <TableHead>Preço espelhado</TableHead>
                <TableHead className="text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.map((u) => {
                const rec = reconcileStatusView(u);
                const mir = mirrorStatusView(u);
                const atrasado = mir.tone === "ok" && isMirrorStale(u.mirror_verified_at);
                return (
                  <TableRow key={u.location_parking_type_id}>
                    <TableCell>
                      <div className="font-medium">{u.parking_type_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {u.company_name} · {u.location_name}
                      </div>
                    </TableCell>
                    <TableCell>{u.checkout_mode === "hub" ? "No Hub" : "No site do parceiro"}</TableCell>
                    <TableCell>
                      <StatusBadgeView view={rec} />
                      {u.reconciled_at ? (
                        <div className="mt-1 text-sm text-muted-foreground">
                          lido em {formatDateTime(u.reconciled_at)}
                        </div>
                      ) : null}
                      {rec.detail ? <div className="mt-1 text-sm text-error">{rec.detail}</div> : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadgeView
                        view={atrasado ? { label: "atrasado", tone: "warn" } : mir}
                      />
                      {u.mirror_verified_at ? (
                        <div className="mt-1 text-sm text-muted-foreground">
                          conferido em {formatDateTime(u.mirror_verified_at)}
                        </div>
                      ) : null}
                      {mir.detail ? (
                        <div className="mt-1 max-w-[24rem] break-words text-sm text-error">
                          {mir.detail}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => conferir(u)}
                        disabled={trigger.isPending}
                      >
                        Conferir preço agora
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

/**
 * Reservas feitas no site do parceiro, trazidas para o Hub (`wl_booking`). Contadas à parte:
 * o dinheiro não passa pelo Hub e nada de capacidade, repasse ou comissão olha para elas.
 * Spec: docs/specs/reservas-wl-no-hub.md.
 */
function ImportacaoDoSite({ enabled, imports }: { enabled: boolean; imports: WlImportStatus[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-title-md text-ink">Reservas feitas no site do parceiro</h2>
      {!enabled ? (
        <p className="text-body-sm text-muted">
          A importação está desligada. Ela liga quando a rota de lista de pedidos estiver publicada
          no site do parceiro.
        </p>
      ) : null}
      {imports.length === 0 ? null : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Parceiro</TableHead>
                <TableHead>Importação</TableHead>
                <TableHead className="text-right">Reservas trazidas</TableHead>
                <TableHead className="text-right">Ainda vão acontecer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imports.map((imp) => {
                const view = importStatusView(imp, enabled);
                return (
                  <TableRow key={imp.company_id}>
                    <TableCell className="font-medium">{imp.company_name}</TableCell>
                    <TableCell>
                      <StatusBadgeView view={view} />
                      {imp.last_ok_at ? (
                        <div className="mt-1 text-sm text-muted-foreground">
                          lido em {formatDateTime(imp.last_ok_at)}
                        </div>
                      ) : null}
                      {view.detail ? <div className="mt-1 text-sm text-error">{view.detail}</div> : null}
                    </TableCell>
                    <TableCell className="text-right">{imp.bookings}</TableCell>
                    <TableCell className="text-right">{imp.upcoming}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
