import * as React from "react";
import { Copy } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDateTime } from "@/lib/format";
import { useBookingGatewayTrail, type GatewayTrailEvent, type GatewayTrailPayment } from "./api";

const brl = (cents: number) => formatBRL(cents / 100);

const KIND_LABEL: Record<string, string> = {
  charge_created: "Cobrança criada",
  charge_failed: "Cobrança recusada",
  refund: "Estorno",
  payables: "Recebíveis apurados",
  withdrawal: "Saque",
  chargeback: "Chargeback",
};

function kindLabel(kind: string): string {
  if (kind.startsWith("webhook:")) return `Webhook ${kind.slice(8)}`;
  return KIND_LABEL[kind] ?? kind;
}

function Id({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 rounded-sm bg-surface-soft px-2 py-0.5 font-mono text-caption text-ink hover:bg-surface-strong"
      title={`Copiar ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => toast.success(`${label} copiado`)).catch(() => {});
      }}
    >
      <span className="text-muted">{label}</span> {value} <Copy size={12} className="text-muted" />
    </button>
  );
}

/**
 * Rastro do gateway na reserva (E0.3.9): tudo que a Pagar.me devolveu, sempre visível para a
 * equipe. Ids copiáveis, split como foi, estorno com quem pagou, taxa e liberação, e cada
 * chamada com a resposta crua num bloco expansível.
 */
export function GatewayTrail({ bookingId }: { bookingId: string }) {
  const { data, isLoading, isError } = useBookingGatewayTrail(bookingId);
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (isError || !data) return null;
  // Resposta fora do formato (RPC antiga, stub de teste) não derruba a tela da reserva.
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const events = Array.isArray(data.events) ? data.events : [];
  if (payments.length === 0 && events.length === 0) {
    return <p className="text-body-sm text-muted">Nenhuma chamada ao gateway nesta reserva.</p>;
  }
  return (
    <div className="space-y-3" data-testid="gateway-trail">
      {payments.map((p) => (
        <PaymentCard key={p.id} p={p} />
      ))}
      {events.length > 0 && (
        <ol className="space-y-1">
          {events.map((e) => (
            <EventRow key={e.id} e={e} />
          ))}
        </ol>
      )}
    </div>
  );
}

function PaymentCard({ p }: { p: GatewayTrailPayment }) {
  const partner = p.split?.find((r) => r.role === "partner") ?? null;
  const movepark = p.split?.find((r) => r.role === "movepark") ?? null;
  return (
    <div className="rounded-md border border-hairline bg-surface-soft p-3 text-body-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink">
          {p.method === "pix" ? "PIX" : p.method === "card" ? `Cartão${p.installments ? ` ${p.installments}x` : ""}` : p.method}
          {" · "}
          {formatBRL(Number(p.amount))} · {p.status}
        </span>
        <Id label="order" value={p.provider_payment_id} />
        <Id label="charge" value={p.provider_charge_id} />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-caption text-muted">
        <span>criado {formatDateTime(p.created_at)}</span>
        {p.paid_at && <span>pago {formatDateTime(p.paid_at)}</span>}
        {p.expires_at && !p.paid_at && <span>expira {formatDateTime(p.expires_at)}</span>}
        {p.gateway_fee_cents != null && <span>taxa do gateway {brl(p.gateway_fee_cents)}</span>}
        {p.partner_release_at && <span>parte do parceiro libera {formatDateTime(p.partner_release_at)}</span>}
      </div>
      {p.split && p.split.length > 0 && (
        <div className="mt-1 text-caption text-muted" data-testid="trail-split">
          split {p.split_sent_to_gateway ? "enviado ao gateway" : "só no razão"}:
          {partner && ` parceiro ${brl(partner.amount)}${partner.recipientId ? ` (${partner.recipientId})` : ""}`}
          {movepark && ` · Movepark ${brl(movepark.amount)}${movepark.liable ? " (liable)" : ""}`}
          {p.debt_recovered_cents > 0 && ` · abatimento de dívida ${brl(p.debt_recovered_cents)}`}
        </div>
      )}
      {p.refunded_at && (
        <div className="mt-1 text-caption text-error" data-testid="trail-refund">
          estorno {formatBRL(Number(p.refunded_amount ?? 0))} em {formatDateTime(p.refunded_at)}
          {p.refund_reason ? ` · ${p.refund_reason}` : ""}
          {p.refund_partner_cents > 0
            ? ` · gateway debitou ${brl(p.refund_partner_cents)} do parceiro`
            : p.refund_absorbed_by_master
              ? " · 100% do master (virou dívida do parceiro)"
              : ""}
        </div>
      )}
    </div>
  );
}

function EventRow({ e }: { e: GatewayTrailEvent }) {
  const [open, setOpen] = React.useState(false);
  const http = e.http_status;
  const tone = http == null ? "text-muted" : http >= 200 && http < 300 ? "text-success" : "text-error";
  return (
    <li className="rounded-sm border border-hairline px-2 py-1 text-caption">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left" onClick={() => setOpen((v) => !v)}>
        <span className="text-ink">
          {kindLabel(e.kind)}
          {e.note ? <span className="text-muted"> · {e.note}</span> : null}
        </span>
        <span className="flex items-center gap-2 text-muted">
          {http != null && <span className={tone}>HTTP {http}</span>}
          <span>{formatDateTime(e.created_at)}</span>
          <span>{open ? "−" : "+"}</span>
        </span>
      </button>
      {open && (
        <div className="mt-1 grid gap-1 tablet:grid-cols-2">
          <pre className="max-h-64 overflow-auto rounded-sm bg-canvas p-2 text-[11px] text-muted">
            {"pedido\n"}
            {JSON.stringify(e.request ?? null, null, 2)}
          </pre>
          <pre className="max-h-64 overflow-auto rounded-sm bg-canvas p-2 text-[11px] text-muted">
            {"resposta\n"}
            {JSON.stringify(e.response ?? null, null, 2)}
          </pre>
        </div>
      )}
    </li>
  );
}
