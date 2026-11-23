// Mapeamento puro booking → campos do voucher (sem Deno/PDF), para ser testável.
// Compartilhado entre a Edge `voucher-pdf` (geração sob demanda, com JWT do dono) e o
// `pagarme-webhook` (pré-geração server-side no `pago`).

export interface VoucherBooking {
  /**
   * Voucher gerado para o balcão (papel Operação, sem `finance:read`): sai sem a linha "Valor".
   * O voucher do cliente continua com o valor.
   */
  hide_amount?: boolean;
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
  /**
   * Logo de quem opera a vaga (docs/specs/logo-do-estacionamento.md): `light` para fundo claro
   * (e-mail, PDF), `dark` para fundo escuro (só o topo navy do voucher na conta, no front). Sem ele
   * o e-mail e o voucher saem como antes.
   */
  parking_logo?: ParkingLogo | null;
  /** Coordenadas e primeira foto da unidade, para o bloco foto + mapa do e-mail. */
  location_lat?: number | null;
  location_lng?: number | null;
  location_photo?: string | null;
  /**
   * Preenchidos por quem envia (`withEmailMedia`, em booking-confirmation.ts), não pelo select:
   * a foto só entra se a versão JPG existir, e o mapa só com a chave do Google configurada.
   */
  email_photo_url?: string | null;
  email_map_url?: string | null;
  /**
   * Aviso do estacionamento (`location.partner_notice_md`, Markdown restrito): política do
   * parceiro que o cliente precisa saber antes de chegar, como cobrança por mala extra. Sai no
   * e-mail e no PDF só quando preenchido (docs/specs/aviso-do-estacionamento.md).
   */
  partner_notice_md?: string | null;
}

export interface ParkingLogo {
  light: string | null;
  dark: string | null;
}

type LogoFields = { logo_url?: string | null; logo_dark_url?: string | null } | null | undefined;

function cleanUrl(url: string | null | undefined): string | null {
  const v = (url ?? "").trim();
  return v ? v : null;
}

/**
 * Unidade antes da empresa. Em fundo escuro o logo do parceiro sai todo branco (regra de
 * 23/11/2026): a tela pinta de branco o arquivo que tiver, então o escuro cai no colorido quando
 * não há versão própria. O contrário não vale, porque um logo branco some no fundo claro.
 * Espelho de `src/lib/parkingLogo.ts`; ao mudar um, mude o outro.
 */
export function resolveParkingLogo(location: LogoFields, company: LogoFields): ParkingLogo {
  const light = cleanUrl(location?.logo_url) ?? cleanUrl(company?.logo_url);
  return {
    light,
    dark: cleanUrl(location?.logo_dark_url) ?? cleanUrl(company?.logo_dark_url) ?? light,
  };
}

/**
 * Versão da foto que o e-mail consegue mostrar. As fotos do site são AVIF/WebP em
 * `/Estacionamentos/<marca>/<arquivo>`, que o Outlook e parte dos clientes de e-mail não abrem; a
 * versão de e-mail é um JPG de 560px em `/Estacionamentos/<marca>/email/<arquivo>.jpg`, gerado
 * por `scripts/fotos-email.sh`. URL absoluta já em JPG/PNG passa direto; o resto não tem versão.
 * Quem envia confere se o arquivo existe antes de usar (`withEmailMedia`).
 */
export function emailPhotoUrl(site: string, photo: string | null | undefined): string | null {
  const p = (photo ?? "").trim();
  if (!p) return null;
  if (/^https:\/\/\S+\.(jpe?g|png)$/i.test(p)) return p;
  const m = p.match(/^\/(Estacionamentos\/[^?#]+)\/([^/?#]+)\.(avif|webp|jpe?g|png)$/i);
  if (!m) return null;
  return `${site.replace(/\/+$/, "")}/${encodeURI(m[1])}/email/${encodeURIComponent(m[2])}.jpg`;
}

/**
 * Miniatura do mapa (Google Static Maps) centrada na unidade, com o pino na cor da marca. Sem
 * `key` não há mapa: a API não está ativada na chave do site (403 em 23/11/2026), e o e-mail cai
 * num cartão com o endereço e o link do Maps. A chave é dedicada ao e-mail e restrita à Static
 * Maps API, porque vai visível no HTML (docs/specs/logo-do-estacionamento.md).
 */
export function staticMapUrl(
  lat: number | null | undefined,
  lng: number | null | undefined,
  key: string | null | undefined,
): string | null {
  const k = (key ?? "").trim();
  if (!k || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const c = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const params = new URLSearchParams({
    center: c,
    zoom: "15",
    size: "280x210",
    scale: "2",
    markers: `color:0x5D5FEF|${c}`,
    key: k,
  });
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
}

/**
 * Pedaço de select (dentro de `location:location!inner(...)`) com o que o e-mail precisa para pôr o
 * estacionamento no topo: nome da empresa e logos (docs/specs/logo-do-estacionamento.md).
 */
export const LOCATION_BRAND_SELECT =
  "logo_url, logo_dark_url, company:company!inner(name, logo_url, logo_dark_url)";

/** Nome da empresa e logo resolvido, a partir da `location` lida com `LOCATION_BRAND_SELECT`. */
// deno-lint-ignore no-explicit-any
export function locationBrand(location: any): { company_name: string | null; parking_logo: ParkingLogo } {
  return {
    company_name: (location?.company?.name as string | undefined) ?? null,
    parking_logo: resolveParkingLogo(location, location?.company),
  };
}

/** Link do Google Maps para o endereço da unidade (o mesmo que o checkout usa). */
export function mapsSearchUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
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
    { label: "Estacionamento", value: b.company_name },
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
  if (!b.hide_amount) {
    lines.push({ label: "Valor", value: formatBRL(b.total_amount, b.currency ?? "BRL") });
  }
  return lines;
}

/** Statuses da reserva em que o voucher pode existir (pós-confirmação de pagamento). */
export const VOUCHER_BOOKING_STATUSES = ["confirmed", "checked_in", "completed"] as const;

/** Select padrão para montar o voucher (mesmas colunas no caminho RLS e no service role). */
export const VOUCHER_BOOKING_SELECT =
  `id, code, status, check_in_at, check_out_at, total_amount, currency,
   location:location!inner(name, address, logo_url, logo_dark_url, latitude, longitude, photos, partner_notice_md,
     company:company!inner(name, logo_url, logo_dark_url)),
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
    parking_logo: resolveParkingLogo(b.location, b.location.company),
    location_lat: b.location.latitude != null ? Number(b.location.latitude) : null,
    location_lng: b.location.longitude != null ? Number(b.location.longitude) : null,
    location_photo: Array.isArray(b.location.photos) && typeof b.location.photos[0] === "string"
      ? b.location.photos[0]
      : null,
    partner_notice_md: typeof b.location.partner_notice_md === "string" ? b.location.partner_notice_md : null,
  };
}
