// Adapter Pagar.me (Core API v5) para a interface `PaymentGateway`.
// O Pagar.me só existe AQUI — o resto do código fala via `PaymentGateway`/`RecipientResult`.
//
// ⚠️ O CORPO EXATO de POST /recipients e a forma do link de KYC dependem da Recipients API doc
// (ainda a confirmar). A lógica isolada abaixo (base URL por chave, Basic auth, mapeamento de
// status, normalização de pendências, montagem do body) é testável sem rede; os campos de KYC
// completos (endereço, sócios, nascimento, etc.) são coletados em E1.3.

import type {
  PaymentGateway,
  RecipientInput,
  RecipientKycAddress,
  RecipientKycPhone,
  RecipientRequirement,
  RecipientResult,
  RecipientStatus,
} from "./types.ts";
import { GatewayConfigError } from "./types.ts";

const SANDBOX_BASE = "https://sdx-api.pagar.me/core/v5";
const LIVE_BASE = "https://api.pagar.me/core/v5";

/** Base URL pelo prefixo da chave — segrega staging (`sk_test_`) de produção. */
export function pagarmeBaseUrl(secretKey: string): string {
  return secretKey.startsWith("sk_test_") ? SANDBOX_BASE : LIVE_BASE;
}

/** Basic auth do Pagar.me: secret key como usuário, senha vazia. */
export function pagarmeAuthHeader(secretKey: string): string {
  return "Basic " + btoa(`${secretKey}:`);
}

/**
 * Status normalizados em que a prova de vida (KYC) AINDA pode ser exigida — vale a pena consultar
 * o link. `active`/`refused`/`suspended`/`draft` não precisam (aprovado, recusado ou sem id).
 */
export function recipientCanNeedKyc(status: RecipientStatus): boolean {
  return status === "pending" || status === "action_required";
}

/** Mapeia o status cru do recebedor Pagar.me → status normalizado da ficha. */
export function mapRecipientStatus(raw: string | null | undefined): RecipientStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "active":
      return "active";
    case "refused":
      return "refused";
    case "suspended":
    case "blocked":
    case "inactive":
      return "suspended";
    case "registration":
    case "affiliation":
    case "":
      return "pending";
    default:
      return "pending";
  }
}

/**
 * Normaliza pendências de KYC/verificação retornadas pelo gateway para `{code, message}`.
 * Defensivo: aceita as formas conhecidas (`kyc_details`, `verification`, `errors`) sem quebrar
 * se a doc trouxer outra. Filtra entradas vazias.
 */
export function normalizeRequirements(body: unknown): RecipientRequirement[] {
  const out: RecipientRequirement[] = [];
  if (!body || typeof body !== "object") return out;
  const b = body as Record<string, unknown>;

  const pushFrom = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === "string") {
        out.push({ code: "requirement", message: item });
      } else if (item && typeof item === "object") {
        const o = item as Record<string, unknown>;
        const message =
          (o.message as string) ?? (o.description as string) ?? (o.reason as string) ?? null;
        if (message) {
          out.push({ code: (o.code as string) ?? (o.type as string) ?? "requirement", message });
        }
      }
    }
  };

  // Formas conhecidas/plausíveis da v5.
  pushFrom(b.errors);
  const kyc = b.kyc_details as Record<string, unknown> | undefined;
  if (kyc) pushFrom(kyc.pending ?? kyc.requirements ?? kyc.errors);
  const verification = b.verification as Record<string, unknown> | undefined;
  if (verification) pushFrom(verification.pending ?? verification.requirements);

  return out;
}

/** Extrai o link de verificação/KYC da resposta, se presente. */
export function extractKycUrl(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.kyc_url === "string") return b.kyc_url;
  const kyc = b.kyc_details as Record<string, unknown> | undefined;
  if (kyc && typeof kyc.url === "string") return kyc.url;
  return null;
}

const undef = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** DD/MM/AAAA → AAAA-MM-DD (founding_date do Pagar.me). Passa adiante se já não bater o formato. */
function brDateToIso(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : value;
}

function mapAddress(a: RecipientKycAddress | null | undefined) {
  if (!a) return undefined;
  return {
    street: undef(a.street),
    complementary: undef(a.complement),
    street_number: undef(a.street_number),
    neighborhood: undef(a.neighborhood),
    city: undef(a.city),
    state: undef(a.state),
    zip_code: undef(a.zip_code),
    reference_point: undef(a.reference_point),
  };
}

function mapPhones(p: RecipientKycPhone | null | undefined) {
  if (!p || (!p.ddd && !p.number)) return undefined;
  return [{ ddd: undef(p.ddd), number: undef(p.number), type: "mobile" }];
}

/**
 * Monta o corpo de POST /recipients a partir dos dados agnósticos.
 * Para PJ (cnpj) com KYC coletado (E1.3), monta o register_information completo (endereço,
 * telefone, faturamento, fundação, tipo societário e representante legal). Sem KYC, faz o corpo
 * mínimo — o gateway então responde com pendências (`requirements`), que é o fluxo de verificação.
 */
export function buildCreateRecipientBody(input: RecipientInput): Record<string, unknown> {
  const isCompany = input.documentType === "cnpj";
  const k = input.kyc;

  const register: Record<string, unknown> = isCompany
    ? {
        type: "corporation",
        company_name: undef(k?.trade_name) ?? undef(input.legalName),
        trading_name: undef(input.legalName),
        email: undef(k?.email) ?? undef(input.email),
        document: undef(input.document),
        annual_revenue: undef(k?.annual_revenue),
        corporation_type: undef(k?.corporation_type),
        founding_date: brDateToIso(k?.founding_date),
        main_address: mapAddress(k?.address),
        phone_numbers: mapPhones(k?.phone),
        managing_partners: k?.representative
          ? [
              {
                name: undef(k.representative.name),
                email: undef(k.representative.email),
                document: undef(k.representative.document),
                type: "individual",
                birthdate: undef(k.representative.birthdate),
                monthly_income: undef(k.representative.monthly_income),
                professional_occupation: undef(k.representative.professional_occupation),
                mother_name: undef(k.representative.mother_name),
                self_declared_legal_representative: undef(
                  k.representative.self_declared_legal_representative,
                ),
                address: mapAddress(k.representative.address),
                phone_numbers: mapPhones(k.representative.phone),
              },
            ]
          : undefined,
      }
    : {
        type: "individual",
        name: undef(input.legalName) ?? undef(input.holderName),
        email: undef(k?.email) ?? undef(input.email),
        document: undef(input.document),
      };

  return {
    code: input.externalCode,
    register_information: register,
    default_bank_account: {
      holder_name: undef(input.holderName),
      holder_type: isCompany ? "company" : "individual",
      holder_document: undef(input.holderDocument) ?? undef(input.document),
      bank: undef(input.bank.code),
      branch_number: undef(input.bank.branchNumber),
      branch_check_digit: undef(input.bank.branchCheckDigit),
      account_number: undef(input.bank.accountNumber),
      account_check_digit: undef(input.bank.accountCheckDigit),
      type: undef(input.bank.type),
    },
  };
}

/** Constrói o `RecipientResult` normalizado a partir da resposta crua do gateway. */
export function buildRecipientResult(httpStatus: number, body: unknown): RecipientResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawStatus = (b.status as string) ?? null;
  const kycUrl = extractKycUrl(body);
  const requirements = normalizeRequirements(body);
  let status = mapRecipientStatus(rawStatus);
  // Se o gateway pede verificação (link de KYC ou pendências) e ainda não recusou/ativou,
  // a ficha exige ação do parceiro.
  if ((kycUrl || requirements.length > 0) && (status === "pending")) {
    status = "action_required";
  }
  return {
    externalId: (b.id as string) ?? null,
    status,
    rawStatus,
    kycUrl,
    requirements,
    raw: body,
    httpStatus,
  };
}

export class PagarmeGateway implements PaymentGateway {
  readonly provider = "pagarme";
  private readonly secretKey: string;

  constructor(secretKey: string | undefined) {
    if (!secretKey) {
      throw new GatewayConfigError("PAGARME_SECRET_KEY ausente — configure o secret no Supabase.");
    }
    this.secretKey = secretKey;
  }

  private async request(method: string, path: string, body?: unknown): Promise<RecipientResult> {
    const res = await fetch(`${pagarmeBaseUrl(this.secretKey)}${path}`, {
      method,
      headers: {
        Authorization: pagarmeAuthHeader(this.secretKey),
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return buildRecipientResult(res.status, parsed);
  }

  /**
   * Gera o link de Prova de Vida (KYC) — POST /recipients/{id}/kyc_link.
   * Só existe quando o recebedor precisa da prova de vida; se não precisar (ex.: staging
   * aprovado automaticamente), o gateway responde 404 e devolvemos null.
   */
  private async fetchKycLink(externalId: string): Promise<string | null> {
    const res = await fetch(
      `${pagarmeBaseUrl(this.secretKey)}/recipients/${externalId}/kyc_link`,
      {
        method: "POST",
        headers: {
          Authorization: pagarmeAuthHeader(this.secretKey),
          "Content-Type": "application/json",
        },
      },
    );
    if (!res.ok) return null; // 404 = prova de vida não aplicável; 400 = sem id
    const body = (await res.json().catch(() => null)) as { url?: string } | null;
    return body?.url ?? null;
  }

  /** Se o recebedor não está aprovado, tenta anexar o link de prova de vida. */
  private async withKycLink(result: RecipientResult): Promise<RecipientResult> {
    if (!result.externalId || !recipientCanNeedKyc(result.status)) return result;
    const url = await this.fetchKycLink(result.externalId);
    if (!url) return result;
    return { ...result, kycUrl: url, status: "action_required" };
  }

  async createRecipient(input: RecipientInput): Promise<RecipientResult> {
    const result = await this.request("POST", "/recipients", buildCreateRecipientBody(input));
    return this.withKycLink(result);
  }

  async getRecipient(externalId: string): Promise<RecipientResult> {
    const result = await this.request("GET", `/recipients/${externalId}`);
    return this.withKycLink(result);
  }
}
