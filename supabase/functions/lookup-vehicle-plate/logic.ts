// Lógica pura de lookup-vehicle-plate (testável sem rede):
// validação/normalização de placa, mapa de cor (API → nossas 9 opções) e normalização
// da resposta Strapi do serviço de consulta (services.movepark.co/api/vehicles).

/** Placa BR (7 chars): antiga ABC1234 ou Mercosul ABC1D23. */
const PLATE_RE = /^[A-Z]{3}[0-9][0-9A-Z][0-9]{2}$/;

/** Deixa só A-Z0-9 em maiúsculo, no máximo 7 chars. */
export function normalizePlate(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

/** true se a placa (já normalizada) é um formato BR válido (antiga ou Mercosul). */
export function isValidPlate(plate: string): boolean {
  return PLATE_RE.test(plate);
}

/** As 9 opções de cor do form (VehicleForm.tsx). Mantê-las em sincronia. */
export const COLOR_OPTIONS = [
  "Branco",
  "Preto",
  "Prata",
  "Cinza",
  "Vermelho",
  "Azul",
  "Verde",
  "Marrom",
  "Outro",
] as const;

/**
 * Mapeia a cor do Detran (maiúscula, às vezes composta como "AZUL MARINHO" ou no feminino
 * "BRANCA") para uma das 9 opções. Casa por prefixo/substring; desconhecida → "Outro".
 */
export function mapColor(raw: string | null | undefined): string {
  const c = (raw ?? "").toUpperCase().trim();
  if (!c) return "Outro";
  if (c.includes("BRANC")) return "Branco";
  if (c.includes("PRET")) return "Preto";
  if (c.includes("PRAT")) return "Prata";
  if (c.includes("CINZ")) return "Cinza";
  if (c.includes("VERMELH")) return "Vermelho";
  if (c.includes("AZUL")) return "Azul";
  if (c.includes("VERDE")) return "Verde";
  if (c.includes("MARRO")) return "Marrom";
  return "Outro";
}

/** Atributos relevantes do registro Strapi retornado pela API externa. */
export interface StrapiVehicleAttrs {
  LicensePlate?: string;
  Brand?: string;
  Model?: string;
  Description?: string;
  Color?: string;
  RegistrationYear?: string;
  Fuel?: string;
  Seats?: string;
  Type?: string;
}

/** Veículo já normalizado pro nosso domínio (campos existentes + extras só de exibição). */
export interface NormalizedVehicle {
  license_plate: string;
  model: string | null; // vai pra vehicle.model
  color: string; // uma das 9 opções → vehicle.color
  raw_color: string | null; // cor crua da API, só pra dica visual
  brand: string | null; // exibição
  year: string | null; // exibição
  fuel: string | null; // exibição
}

export interface LookupResult {
  found: boolean;
  vehicle?: NormalizedVehicle;
}

/** Monta a URL da API externa (Strapi) para a placa dada. */
export function buildLookupUrl(baseUrl: string, plate: string): string {
  const base = (baseUrl ?? "").replace(/\/+$/, "");
  return `${base}/api/vehicles/?filters[LicensePlate][$eq]=${encodeURIComponent(plate)}&country=BRA`;
}

/**
 * Normaliza a resposta da API. `data` vazio → não encontrado. Caso contrário, mapeia o 1º
 * registro. `typedPlate` é a placa que o usuário digitou (fallback se a API não devolver).
 */
export function normalizeLookupResponse(json: unknown, typedPlate: string): LookupResult {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data) || data.length === 0) return { found: false };
  const attrs = ((data[0] as { attributes?: StrapiVehicleAttrs })?.attributes ?? {}) as StrapiVehicleAttrs;
  const model = (attrs.Description || attrs.Model || attrs.Brand || "").trim() || null;
  return {
    found: true,
    vehicle: {
      license_plate: (attrs.LicensePlate || typedPlate || "").toUpperCase(),
      model,
      color: mapColor(attrs.Color),
      raw_color: attrs.Color?.trim() || null,
      brand: attrs.Brand?.trim() || null,
      year: attrs.RegistrationYear?.trim() || null,
      fuel: attrs.Fuel?.trim() || null,
    },
  };
}
