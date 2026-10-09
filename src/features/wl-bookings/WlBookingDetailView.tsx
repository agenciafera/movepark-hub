import * as React from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDateTime } from "@/lib/format";
import { parkingTitle } from "@/lib/parkingName";
import { wlListRowToBooking, wlOriginLabel } from "@/features/bookings/unifiedBookingRow.logic";
import { useWlBookingDetail } from "./api";
import { WlBookingActions } from "./WlBookingActions";
import { attendanceLabel, centsToReais, wlActionTimelineLabel, wlBookingStatusLabel } from "./wlBooking.logic";

function Campo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-caption text-muted">{label}</div>
      <div className="text-body-sm text-ink">{value}</div>
    </div>
  );
}

/** As chaves de UTM que valem mostrar, na ordem em que se lê uma campanha. */
const UTM_KEYS = ["source", "medium", "campaign", "utm_source", "utm_medium", "utm_campaign"];

/**
 * A tela da reserva feita no site white-label (fase 3 das reservas unificadas, 09/10/2026), no
 * mesmo layout da tela da reserva do Hub (D1): cabeçalho com status, card Reserva, linha do tempo
 * e Operação. O que só existe no Hub (plano, dinheiro destrinchado, comissão, estorno, mudança de
 * data, proteção de voo, chamados) não aparece: o pagamento e o cancelamento são do site.
 *
 * Spec: docs/specs/reservas-unificadas-hub-wl.md § 4.2.
 */
export function WlBookingDetailView({ id, audience }: { id: string | undefined; audience: "manager" | "operator" }) {
  const q = useWlBookingDetail(id);
  const b = q.data ?? null;
  const base = audience === "manager" ? "/manager" : "/operator";
  const back = { to: `${base}/bookings`, label: "Voltar para Reservas" };

  if (q.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Reserva" back={back} />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!b) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Reserva não encontrada" back={back} />
        <EmptyState title="Não achamos essa reserva" description="Abra pela lista de Reservas." />
      </div>
    );
  }

  const valor = centsToReais(b.paid_total_cents ?? b.total_cents);
  const canal = wlOriginLabel(b.origin);
  const utm = Object.entries(b.utm ?? {})
    .filter(([k, v]) => UTM_KEYS.includes(k) && v)
    .map(([, v]) => String(v));
  const vaga = [b.parking_type_name ?? b.product_slug, b.has_pcd ? "PCD" : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Reserva ${b.wl_order_number}`}
        description={parkingTitle(b.company_name, b.location_name)}
        back={back}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={b.status} />
            <Badge tone="active">White-label</Badge>
          </div>
        }
      />

      <div className="rounded-md border border-hairline bg-surface-soft p-4 text-body-sm text-ink" data-testid="aviso-site">
        Reserva feita no site white-label. O pagamento foi no site, e cancelar ou mudar a data é pelo
        painel do site.
      </div>

      {b.is_duplicate && (
        <div role="alert" className="rounded-md border border-warning/40 bg-badge-pending-bg p-4 text-body-sm text-ink" data-testid="aviso-duplicata">
          O site marcou este pedido como duplicado de outro. Confira antes de liberar a vaga.
        </div>
      )}

      <div className="grid gap-6 desktop:grid-cols-3">
        <Card className="desktop:col-span-2">
          <CardHeader>
            <CardTitle>Reserva</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 tablet:grid-cols-3">
            <Campo label="Cliente" value={b.customer_name ?? "-"} />
            <Campo label="Telefone" value={b.customer_phone ?? "-"} />
            <Campo label="E-mail" value={b.customer_email ?? "-"} />
            <Campo label="Placa" value={b.license_plate ?? "-"} />
            <Campo label="Vaga" value={vaga || "-"} />
            <Campo label="Passageiros" value={b.passenger_count ?? "-"} />
            <Campo label="Check-in" value={formatDateTime(b.check_in_at)} />
            <Campo label="Check-out" value={formatDateTime(b.check_out_at)} />
            <Campo label="Valor pago no site" value={valor === null ? "-" : formatBRL(valor)} />
            <Campo label="Comparecimento" value={attendanceLabel(b.attendance_status)} />
            <Campo label="Status no site" value={wlBookingStatusLabel(b.site_status)} />
            {canal && <Campo label="Canal" value={canal} />}
            {utm.length > 0 && <Campo label="Campanha" value={utm.join(" · ")} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-body-sm" data-testid="linha-do-tempo">
              <li className="text-muted">Comprada no site em {formatDateTime(b.wl_created_at)}</li>
              {[...b.actions].reverse().map((a) => (
                <li key={a.id} className={a.result === "ok" ? "text-muted" : "text-error"}>
                  {formatDateTime(a.created_at)}: {wlActionTimelineLabel(a)}
                </li>
              ))}
              {b.attendance_marked_at && !b.actions.some((a) => a.action === "attendance") && (
                <li className="text-muted">
                  {attendanceLabel(b.attendance_status)} em {formatDateTime(b.attendance_marked_at)} (marcado no site)
                </li>
              )}
              {audience === "manager" && (
                <li className="text-muted">Copiada do site em {formatDateTime(b.synced_at)}</li>
              )}
            </ol>
          </CardContent>
        </Card>
      </div>

      <WlBookingActions booking={wlListRowToBooking(b)} />
    </div>
  );
}
