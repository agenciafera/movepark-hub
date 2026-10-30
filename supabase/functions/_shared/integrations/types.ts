// Contrato dos provedores de integração (docs/specs/integracoes.md § 5.5).
//
// O domínio (reserva, voucher, fila) fala só com `AccessProvider`, no mesmo espírito da camada
// `PaymentGateway` do ADR-004: provedor novo é adaptador novo, sem mexer em quem consome.

/** Chaves dos provedores. Espelha o CHECK de `integration_connection.provider`. */
export type ProviderKey = "cloudpark";

/** O que o Hub sabe da reserva na hora de mandar ao provedor. Datas em ISO (UTC). */
export interface ReserveInput {
  bookingCode: string;
  checkInAt: string;
  checkOutAt: string;
  plate: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  totalAmount: number;
  passengerCount: number | null;
  hasPcd: boolean;
  vehicleModel: string | null;
  vehicleColor: string | null;
  parkingTypeId: string | null;
  parkingTypeName: string | null;
}

/**
 * Por que a chamada falhou, e o que fazer com isso:
 *   transient → tentar de novo (rede, tempo esgotado, 5xx, 429, 200 sem código)
 *   rejected  → o provedor recusou o dado; repetir não muda nada
 *   auth      → token recusado; a conexão fica marcada até trocarem o token
 */
export type FailureKind = "transient" | "rejected" | "auth";

export type ReserveOutcome =
  | {
    ok: true;
    code: string;
    httpStatus: number;
    durationMs: number;
    request: Record<string, unknown>;
    response: unknown;
  }
  | {
    ok: false;
    kind: FailureKind;
    error: string;
    httpStatus: number | null;
    durationMs: number;
    request: Record<string, unknown>;
    response: unknown;
  };

export interface TestOutcome {
  ok: boolean;
  kind?: FailureKind;
  detail: string;
  plans?: { id: number; name: string }[];
}

export interface CallOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AccessProvider<C = unknown> {
  key: ProviderKey;
  /** Nome de exibição (alertas e, na Fase 2, o catálogo). */
  name: string;
  /** Valida e normaliza a config gravada na conexão. Lança se não servir. */
  parseConfig(raw: unknown): C;
  testConnection(cfg: C, secret: string, opts?: CallOptions): Promise<TestOutcome>;
  reserve(cfg: C, secret: string, input: ReserveInput, opts?: CallOptions): Promise<ReserveOutcome>;
}
