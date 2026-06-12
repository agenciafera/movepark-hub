// Mapeamento puro booking → campos do voucher (sem Deno/PDF), para ser testável.

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
