import * as React from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDateTime } from "@/lib/format";
import { parkingTitle } from "@/lib/parkingName";
import { wlListRowToBooking, wlOriginLabel } from "@/features/bookings/unifiedBookingRow.logic";
import { useWlBookingDetail } from "./api";
import { WlBookingActions } from "./WlBookingActions";
import {
  attendanceLabel,
  buildWlTimeline,
  centsToReais,
  wlBookingStatusLabel,
  wlPaymentMethodLabel,
} from "./wlBooking.logic";

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
 * mesmo layout da tela da reserva do Hub (D1): cabeçalho com status e voucher, card Reserva, itens,
 * trocas de placa, linha do tempo e Operação. A ficha completa (pagamento, veículo, itens, voucher,
 * histórico do site) chegou na fase 4; enquanto a cópia não trouxe, o campo simplesmente não aparece. O que só existe no Hub (plano, dinheiro destrinchado, comissão, estorno, mudança de
 * data, proteção de voo, chamados) não aparece: o pagamento e o cancelamento são do site.
 *
 * Spec: docs/specs/reservas-unificadas-hub-wl.md § 4.2.
 */
export function WlBookingDetailView({
  id,
  audience,
}: {
  id: string | undefined;
  audience: "manager" | "operator";
}) {
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
  const vaga = [b.parking_type_name ?? b.product_slug, b.has_pcd ? "PCD" : null]
    .filter(Boolean)
    .join(" · ");
  const veiculo = [b.vehicle?.description, b.vehicle?.color].filter(Boolean).join(" · ");
  const itens = b.items ?? [];
  const somaItens = itens.reduce((acc, it) => acc + it.unit_price * it.quantity, 0);
  const trocas = (b.site_events ?? []).filter((e) => e.kind === "plate_change");
  const linha = buildWlTimeline(b);

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
            {b.voucher_url && (
              <Button asChild size="sm" variant="secondary">
                <a href={b.voucher_url} target="_blank" rel="noopener noreferrer">
                  Voucher
                </a>
              </Button>
            )}
          </div>
        }
      />

      <div
        className="rounded-md border border-hairline bg-surface-soft p-4 text-body-sm text-ink"
        data-testid="aviso-site"
      >
        Reserva feita no site white-label. O pagamento foi no site, e cancelar ou mudar a data é
        pelo painel do site.
      </div>

      {b.is_duplicate && (
        <div
          role="alert"
          className="rounded-md border border-warning/40 bg-badge-pending-bg p-4 text-body-sm text-ink"
          data-testid="aviso-duplicata"
        >
          O site marcou este pedido como duplicado
          {b.duplicate_of_id ? (
            <>
              {" "}
              do pedido{" "}
              <Link
                to={`${base}/bookings/site/${b.duplicate_of_id}`}
                className="underline underline-offset-2"
              >
                {b.duplicate_of_order_number}
              </Link>
            </>
          ) : (
            " de outro"
          )}
          . Confira antes de liberar a vaga.
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
            {veiculo && <Campo label="Veículo" value={veiculo} />}
            <Campo label="Vaga" value={vaga || "-"} />
            <Campo label="Passageiros" value={b.passenger_count ?? "-"} />
            <Campo label="Check-in" value={formatDateTime(b.check_in_at)} />
            <Campo label="Check-out" value={formatDateTime(b.check_out_at)} />
            <Campo label="Valor pago no site" value={valor === null ? "-" : formatBRL(valor)} />
            {b.payment_method_name && (
              <Campo
                label="Forma de pagamento"
                value={wlPaymentMethodLabel(b.payment_method_name)}
              />
            )}
            <Campo label="Comparecimento" value={attendanceLabel(b.attendance_status)} />
            <Campo label="Status no site" value={wlBookingStatusLabel(b.site_status)} />
            {canal && <Campo label="Canal" value={canal} />}
            {utm.length > 0 && <Campo label="Campanha" value={utm.join(" · ")} />}
            {b.is_affiliated && <Campo label="Afiliado" value="Sim, comprou como afiliado" />}
            {audience === "manager" && b.gateway_transaction_id && (
              <Campo
                label="Transação no gateway"
                value={<span className="font-mono text-caption">{b.gateway_transaction_id}</span>}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Linha do tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-body-sm" data-testid="linha-do-tempo">
              {linha.map((e, i) => (
                <li key={i} className={e.tone === "error" ? "text-error" : "text-muted"}>
                  {e.at ? `${formatDateTime(e.at)}: ` : ""}
                  {e.text}
                </li>
              ))}
              {audience === "manager" && (
                <li className="text-muted">Copiada do site em {formatDateTime(b.synced_at)}</li>
              )}
            </ol>
          </CardContent>
        </Card>
      </div>

      {itens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Itens do pedido</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-hairline text-body-sm" data-testid="itens">
              {itens.map((it, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-2">
                  <span className="text-ink">
                    {it.product_name ?? it.product_slug ?? "Item"}
                    {it.quantity > 1 ? ` × ${it.quantity}` : ""}
                    {it.is_spot ? <span className="text-muted"> (vaga)</span> : null}
                  </span>
                  <span className="tabular-nums text-ink">
                    {formatBRL(it.unit_price * it.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            {/* Os itens guardam o preço de tabela; o que o cliente pagou já vem com cupom e promoção do site. */}
            {valor !== null && Math.abs(somaItens - valor) >= 0.01 && (
              <dl
                className="mt-2 space-y-1 border-t border-hairline pt-2 text-body-sm"
                data-testid="itens-desconto"
              >
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">
                    {somaItens > valor ? "Desconto no site" : "Acréscimo no site"}
                  </dt>
                  <dd className="tabular-nums text-ink">{formatBRL(valor - somaItens)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted">Pago no site</dt>
                  <dd className="tabular-nums text-ink">{formatBRL(valor)}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      )}

      {trocas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Trocas de placa</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-body-sm" data-testid="trocas-de-placa">
              {trocas.map((t) => (
                <li key={t.id} className="text-ink">
                  {String(t.data.old_plate ?? "-")} para {String(t.data.new_plate ?? "-")}
                  {t.note ? `: ${t.note}` : ""}
                  <span className="text-muted">
                    {" "}
                    (
                    {[t.actor, t.occurred_at ? formatDateTime(t.occurred_at) : null]
                      .filter(Boolean)
                      .join(", ")}
                    )
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <WlBookingActions booking={wlListRowToBooking(b)} />
    </div>
  );
}
