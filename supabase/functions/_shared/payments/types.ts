// Camada de abstração de gateway de pagamento (ADR-004).
// O domínio fala SEMPRE com estas interfaces — nunca com o SDK/HTTP de um gateway específico.
// Trocar de gateway = escrever um novo adapter que implementa `PaymentGateway`, sem tocar no domínio.
//
// Escopo desta etapa (E0.1.1): apenas o ciclo de RECEBEDOR (recipient). As operações de cobrança
// (createCharge/refund) entram em E0.1.2/.3 — a interface já reserva o lugar delas.

/** Status normalizado da ficha do recebedor — espelha o enum SQL `payout_recipient_status`. */
export type RecipientStatus =
  | "draft"
  | "pending"
  | "action_required"
  | "active"
  | "refused"
  | "suspended";

/** Pendência normalizada (o que falta o parceiro resolver), pronta para exibir. */
export interface RecipientRequirement {
  code: string;
  message: string;
}

/** Telefone no formato do gateway (DDD + número). */
export interface RecipientKycPhone {
  ddd?: string | null;
  number?: string | null;
}

/** Endereço (espelha `kyc_details.address`). */
export interface RecipientKycAddress {
  zip_code?: string | null;
  street?: string | null;
  street_number?: string | null;
  complement?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  reference_point?: string | null;
}

/** Representante legal (managing_partner) — espelha `kyc_details.representative`. */
export interface RecipientKycRepresentative {
  name?: string | null;
  document?: string | null;
  email?: string | null;
  birthdate?: string | null; // DD/MM/AAAA (como o Pagar.me espera)
  monthly_income?: number | null; // reais (int)
  professional_occupation?: string | null;
  mother_name?: string | null;
  self_declared_legal_representative?: boolean | null;
  phone?: RecipientKycPhone | null;
  address?: RecipientKycAddress | null;
}

/** register_information além de banco/identidade — espelha `company_payout_account.kyc_details`. */
export interface RecipientKyc {
  email?: string | null;
  trade_name?: string | null; // nome fantasia (company_name)
  annual_revenue?: number | null; // reais (int)
  founding_date?: string | null; // DD/MM/AAAA
  corporation_type?: string | null;
  phone?: RecipientKycPhone | null;
  address?: RecipientKycAddress | null;
  representative?: RecipientKycRepresentative | null;
}

/** Dados agnósticos de repasse do parceiro (vêm de `company_payout_account`). */
export interface RecipientInput {
  /** Referência estável no nosso lado (company_id) — vai como `code` no gateway. */
  externalCode: string;
  legalName: string | null;
  document: string | null;
  documentType: "cnpj" | "cpf" | null;
  email?: string | null;
  bank: {
    code: string | null;
    branchNumber: string | null;
    branchCheckDigit: string | null;
    accountNumber: string | null;
    accountCheckDigit: string | null;
    type: "checking" | "savings" | null;
  };
  holderName: string | null;
  holderDocument: string | null;
  /** register_information completo (endereço, telefone, representante…) quando coletado (E1.3). */
  kyc?: RecipientKyc | null;
  /** Cadência de saque (diluir a taxa: transferir agregado, não por transação — E0.3.3). */
  transferSettings?: { enabled: boolean; interval: string; day: number } | null;
}

/** Resultado normalizado de qualquer operação de recebedor. */
export interface RecipientResult {
  /** Id do recebedor no gateway (null se ainda não criado). */
  externalId: string | null;
  status: RecipientStatus;
  /** Status cru do gateway, preservado para diagnóstico. */
  rawStatus: string | null;
  /** Link de verificação/KYC fornecido pelo gateway, quando houver. */
  kycUrl: string | null;
  requirements: RecipientRequirement[];
  /** Resposta crua (já redigida de segredos) para o log. */
  raw: unknown;
  /** Status HTTP da chamada, para o evento de auditoria. */
  httpStatus: number | null;
}

// ── Cobrança (E0.1.2: PIX com split) ────────────────────────────────────────

/** Status normalizado da cobrança (espelha o enum SQL `payment_status`). */
export type ChargeStatus = "pending" | "authorized" | "paid" | "failed" | "refunded" | "canceled";

/** Uma perna do split: quanto vai pra qual recebedor e quem arca taxa/risco. */
export interface SplitRule {
  recipientId: string;
  /** Em centavos quando type='flat'; em % (0–100) quando type='percentage'. */
  amount: number;
  type: "flat" | "percentage";
  /** Responsável por chargeback/estorno. */
  liable: boolean;
  /** Arca (parte d)a taxa de processamento do gateway. */
  chargeProcessingFee: boolean;
  /** Recebe o restante de centavos não divisível. */
  chargeRemainderFee: boolean;
}

export interface ChargeCustomer {
  name: string;
  email: string;
  document: string | null;
  type: "individual" | "company";
  phone?: { ddd: string; number: string } | null;
}

export interface ChargeItem {
  amount: number; // centavos
  description: string;
  quantity: number;
}

export interface PixChargeInput {
  /** Referência no nosso lado (código da reserva) → vira `code` na order. */
  externalCode: string;
  amountCents: number;
  customer: ChargeCustomer;
  items: ChargeItem[];
  split: SplitRule[];
  expiresInSeconds: number;
  /** Repassado em metadata da order (p/ casar no webhook). */
  metadata?: Record<string, string>;
}

/** Cobrança com cartão de crédito (E0.1.3). Token é single-use; cartão salvo usa cardId. */
export interface CardChargeInput {
  externalCode: string;
  /** Total efetivamente cobrado (com juros de parcelamento, se houver). */
  amountCents: number;
  customer: ChargeCustomer;
  items: ChargeItem[];
  split: SplitRule[];
  /** token (tokenização client-side, single-use) OU cardId (cartão salvo). */
  card: { cardToken?: string; cardId?: string };
  installments: number;
  statementDescriptor?: string;
  metadata?: Record<string, string>;
}

/** Resultado normalizado de uma cobrança. */
export interface ChargeResult {
  orderId: string | null;
  chargeId: string | null;
  status: ChargeStatus;
  /** PIX copia-e-cola. */
  qrCode: string | null;
  /** URL da imagem do QR. */
  qrCodeUrl: string | null;
  expiresAt: string | null;
  raw: unknown;
  httpStatus: number | null;
}

// ── Estorno (E0.3.2) ────────────────────────────────────────────────────────

/** Entrada do estorno. amountCents omitido = estorno total; presente = parcial. */
export interface RefundInput {
  /** charge.id do gateway (NÃO o order id). */
  chargeId: string;
  amountCents?: number;
}

/** Resultado normalizado de um estorno. */
export interface RefundResult {
  chargeId: string | null;
  /** Status da cobrança após o estorno (esperado "refunded"; PIX pode vir "pending"). */
  status: ChargeStatus;
  refundedAmountCents: number | null;
  raw: unknown;
  httpStatus: number | null;
}

/** Contrato que todo gateway de pagamento deve implementar. */
export interface PaymentGateway {
  readonly provider: string;
  /** Cria/registra o recebedor no gateway a partir dos dados agnósticos. */
  createRecipient(input: RecipientInput): Promise<RecipientResult>;
  /** Relê o estado atual do recebedor no gateway. */
  getRecipient(externalId: string): Promise<RecipientResult>;
  /** Cria uma cobrança PIX com split. */
  createPixCharge(input: PixChargeInput): Promise<ChargeResult>;
  /** Cria uma cobrança com cartão de crédito (parcelado) + split. */
  createCardCharge(input: CardChargeInput): Promise<ChargeResult>;
  /** Relê o estado atual de uma cobrança (pelo id da order). */
  getCharge(orderId: string): Promise<ChargeResult>;
  /** Estorna uma cobrança (total ou parcial). O split é revertido proporcionalmente pelo gateway. */
  refundCharge(input: RefundInput): Promise<RefundResult>;
}

/** Erro de configuração do gateway (ex.: secret ausente) — separado de erro de negócio. */
export class GatewayConfigError extends Error {}
