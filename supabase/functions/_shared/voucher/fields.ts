// Mapeamento puro booking → campos do voucher (sem Deno/PDF), para ser testável.
// Compartilhado entre a Edge `voucher-pdf` (geração sob demanda, com JWT do dono) e o
// `pagarme-webhook` (pré-geração server-side no `pago`).

export interface VoucherBooking {
  code: string;
  check_in_at: string;
  check_out_at: string;
  total_amount: number;
  currency?: string | null;
  company_name: string;
  location_name: string;
  location_address: string | null;
  parking_type_name: string | null;
  vehicle: { license_plate: string; model: string | null } | null;
}

export interface VoucherLine {
  label: string;
  value: string;
}

export function voucherFilename(code: string): string {
  return `voucher-${code}.pdf`;
}

export function formatBRDateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatBRL(value: number, currency = "BRL"): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

/** Linhas (label/valor) exibidas no corpo do voucher, na ordem. */
export function voucherFields(b: VoucherBooking): VoucherLine[] {
  const lines: VoucherLine[] = [
    { label: "Operadora", value: b.company_name },
    { label: "Unidade", value: b.location_name },
  ];
  if (b.location_address) lines.push({ label: "Endereço", value: b.location_address });
  lines.push({ label: "Tipo de vaga", value: b.parking_type_name ?? "Vaga" });
  lines.push({ label: "Check-in", value: formatBRDateTime(b.check_in_at) });
  lines.push({ label: "Check-out", value: formatBRDateTime(b.check_out_at) });
  if (b.vehicle) {
    const v = b.vehicle.model
      ? `${b.vehicle.license_plate} · ${b.vehicle.model}`
      : b.vehicle.license_plate;
    lines.push({ label: "Veículo", value: v });
  }
  lines.push({ label: "Valor", value: formatBRL(b.total_amount, b.currency ?? "BRL") });
  return lines;
}

/** Statuses da reserva em que o voucher pode existir (pós-confirmação de pagamento). */
export const VOUCHER_BOOKING_STATUSES = ["confirmed", "checked_in", "completed"] as const;

/** Select padrão para montar o voucher (mesmas colunas no caminho RLS e no service role). */
export const VOUCHER_BOOKING_SELECT =
  `id, code, status, check_in_at, check_out_at, total_amount, currency,
   location:location!inner(name, address, company:company!inner(name)),
   vehicle:vehicle(license_plate, model),
   items:booking_item(item_type, parking_type:parking_type(name))`;

/** Mapeia a linha de `booking` (com VOUCHER_BOOKING_SELECT) → VoucherBooking. */
// deno-lint-ignore no-explicit-any
export function mapBookingRowToVoucher(b: any): VoucherBooking {
  // deno-lint-ignore no-explicit-any
  const parkingItem = (b.items ?? []).find((i: any) => i.item_type === "parking");
  return {
    code: b.code,
    check_in_at: b.check_in_at,
    check_out_at: b.check_out_at,
    total_amount: Number(b.total_amount),
    currency: b.currency,
    company_name: b.location.company.name,
    location_name: b.location.name,
    location_address: b.location.address,
    parking_type_name: parkingItem?.parking_type?.name ?? null,
    vehicle: b.vehicle
      ? { license_plate: b.vehicle.license_plate, model: b.vehicle.model }
      : null,
  };
}
