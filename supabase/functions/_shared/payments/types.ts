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

/** Contrato que todo gateway de pagamento deve implementar. */
export interface PaymentGateway {
  readonly provider: string;
  /** Cria/registra o recebedor no gateway a partir dos dados agnósticos. */
  createRecipient(input: RecipientInput): Promise<RecipientResult>;
  /** Relê o estado atual do recebedor no gateway. */
  getRecipient(externalId: string): Promise<RecipientResult>;
}

/** Erro de configuração do gateway (ex.: secret ausente) — separado de erro de negócio. */
export class GatewayConfigError extends Error {}
