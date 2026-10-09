/**
 * Exportar a lista de reservas (fase 6 das reservas unificadas, 09/10/2026): o que o backoffice do
 * white-label já fazia (CSV de pedidos), agora para a lista única, com as duas origens.
 *
 * As linhas saem da mesma consulta da tela (`bookings_list_page`, paginada), então o arquivo tem
 * exatamente o recorte dos filtros. A coluna Origem só existe para quem tem white-label (§ 2), e
 * Empresa só no Manager. Valor segue a tela: diárias no Operator, total no Manager.
 */
import { BOOKING_STATUS_LABELS } from "@/components/shared/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { csvMoney } from "@/lib/csv";
import { unifiedRowView } from "./unifiedBookingRow.logic";
import type { UnifiedBookingRow } from "@/types/domain";

/** Teto do arquivo: acima disso a tela pede para encurtar o período. */
export const EXPORT_MAX_ROWS = 10_000;

export type ExportOptions = { showSource: boolean; showCompany: boolean; valueMode: "total" | "parking" };

export function exportHeaders(o: ExportOptions): string[] {
  return [
    ...(o.showSource ? ["Origem"] : []),
    "Reserva",
    "Criada em",
    "Status",
    "Canal",
    "Cliente",
    "Telefone",
    "E-mail",
    "Placa",
    ...(o.showCompany ? ["Empresa"] : []),
    "Unidade",
    "Check-in",
    "Check-out",
    "Pagamento",
    o.valueMode === "parking" ? "Diárias (R$)" : "Valor (R$)",
  ];
}

const data = (v: string | null) => (v ? formatDateTime(v) : "");

export function exportRow(row: UnifiedBookingRow, o: ExportOptions): Record<string, string> {
  const v = unifiedRowView(row, { showSource: o.showSource, valueMode: o.valueMode });
  const contato =
    row.source === "wl"
      ? { phone: row.wl.customer_phone, email: row.wl.customer_email, plate: row.wl.license_plate }
      : {
          phone: row.booking.customer_phone,
          email: row.booking.customer_email,
          plate: row.booking.vehicle?.license_plate ?? null,
        };
  const out: Record<string, string> = {};
  if (o.showSource) out["Origem"] = v.sourceLabel ?? "";
  out["Reserva"] = v.code;
  out["Criada em"] = data(v.createdAt);
  out["Status"] = BOOKING_STATUS_LABELS[v.status] ?? v.status;
  out["Canal"] = v.channel ?? "";
  out["Cliente"] = v.customer ?? "";
  out["Telefone"] = contato.phone ?? "";
  out["E-mail"] = contato.email ?? "";
  out["Placa"] = contato.plate ?? "";
  if (o.showCompany) out["Empresa"] = v.companyName ?? "";
  out["Unidade"] = v.unitName ?? "";
  out["Check-in"] = data(v.checkIn);
  out["Check-out"] = data(v.checkOut);
  out["Pagamento"] = [v.payment.method, v.payment.badge?.label].filter(Boolean).join(" · ");
  out[o.valueMode === "parking" ? "Diárias (R$)" : "Valor (R$)"] = csvMoney(v.value);
  return out;
}
