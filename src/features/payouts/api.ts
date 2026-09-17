import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CompanyPayoutAccount, PayoutRecipient, PayoutWithdrawal } from "@/types/domain";
import type { toPayoutAccountPayload } from "./kyc";

/** Payload de upsert da conta de repasse (saída de `toPayoutAccountPayload`). */
export type PayoutAccountPayload = ReturnType<typeof toPayoutAccountPayload>;

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-recipient`;
const REFRESH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-recipients`;
const WITHDRAW_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recipient-withdraw`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Pendência de KYC/verificação normalizada (coluna `requirements` jsonb). */
export type PayoutRequirement = { code: string; message: string };

export const payoutKeys = {
  all: ["payout-recipients"] as const,
  detail: (companyId: string) => [...payoutKeys.all, "detail", companyId] as const,
};

export const payoutAccountKeys = {
  all: ["payout-accounts"] as const,
  detail: (companyId: string) => [...payoutAccountKeys.all, "detail", companyId] as const,
};

async function fetchAccount(companyId: string): Promise<CompanyPayoutAccount | null> {
  const { data, error } = await supabase
    .from("company_payout_account")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** Lê a conta de repasse (banco/KYC) de uma empresa. */
export function usePayoutAccount(companyId: string | undefined) {
  return useQuery({
    queryKey: payoutAccountKeys.detail(companyId ?? ""),
    queryFn: () => fetchAccount(companyId!),
    enabled: !!companyId,
  });
}

/** Salva a conta de repasse como hub_admin (escrita direta via RLS admin_all). */
export function useSavePayoutAccountAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; payload: PayoutAccountPayload }) => {
      const { error } = await supabase
        .from("company_payout_account")
        .upsert({ company_id: args.company_id, ...args.payload, deleted_at: null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payoutAccountKeys.all });
      // O overview de recebedores depende do KYC (gate do "Criar recebedor") → refaz.
      qc.invalidateQueries({ queryKey: payoutKeys.all });
    },
  });
}

/**
 * Salva a conta de repasse do PRÓPRIO operador (dono). Mesma escrita direta do admin, mas
 * autorizada pela RLS de dono (company_payout_account_owner_write/update). E1.3.
 */
export function useSavePayoutAccountSelf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; payload: PayoutAccountPayload }) => {
      const { error } = await supabase
        .from("company_payout_account")
        .upsert({ company_id: args.company_id, ...args.payload, deleted_at: null });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payoutAccountKeys.all });
      qc.invalidateQueries({ queryKey: payoutKeys.all });
    },
  });
}

export const contractKeys = {
  all: ["company-contract"] as const,
  detail: (companyId: string) => [...contractKeys.all, companyId] as const,
};

/** Lê o status do contrato (assinado quando `contract_accepted_at` existe). */
export function useContractStatus(companyId: string | undefined) {
  return useQuery({
    queryKey: contractKeys.detail(companyId ?? ""),
    enabled: !!companyId,
    queryFn: async (): Promise<{ acceptedAt: string | null; version: string | null }> => {
      const { data, error } = await supabase
        .from("company")
        .select("contract_accepted_at, contract_version")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw error;
      return {
        acceptedAt: data?.contract_accepted_at ?? null,
        version: data?.contract_version ?? null,
      };
    },
  });
}

/** Assinatura (simulada) do contrato com a Movepark. Só o dono (RPC gateia). E1.3. */
export function useAcceptContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; version?: string }) => {
      const { error } = await supabase.rpc("operator_accept_contract", {
        p_company_id: args.company_id,
        p_version: args.version ?? "v1",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: contractKeys.all }),
  });
}

async function fetchRecipient(companyId: string): Promise<PayoutRecipient | null> {
  const { data, error } = await supabase
    .from("payout_recipient")
    .select("*")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export function useRecipient(companyId: string | undefined) {
  return useQuery({
    queryKey: payoutKeys.detail(companyId ?? ""),
    queryFn: () => fetchRecipient(companyId!),
    enabled: !!companyId,
  });
}

/** Linha crua do overview (company + recebedor embutido) — mapeada em finance-recipients.logic. */
type RawRecipient = {
  provider: string;
  status: string;
  external_recipient_id: string | null;
  kyc_url: string | null;
  kyc_url_expires_at: string | null;
  requirements: unknown;
  deleted_at: string | null;
  /** O gateway respondeu que este recebedor não existe (E0.3.5). */
  gateway_missing_at?: string | null;
  /** Saldo real no gateway, lido pelo cron ou pela atualização do Manager (16/09/2026). */
  balance_available_cents?: number | null;
  balance_waiting_cents?: number | null;
  balance_transferred_cents?: number | null;
  balance_synced_at?: string | null;
};
type RawAccount = { deleted_at: string | null };

export type RawCompanyRecipient = {
  id: string;
  name: string;
  onboarding_status: string;
  /** A cobrança desta empresa vai com split (E0.3.5). */
  gateway_split_enabled?: boolean;
  // PostgREST devolve 1:N como array e 1:1 como objeto — aceitamos os dois (normalizado na lógica).
  payout_recipient: RawRecipient[] | RawRecipient | null;
  company_payout_account: RawAccount[] | RawAccount | null;
};

/** Overview de recebedores por empresa (Manager, hub_admin) — uma linha por empresa. */
export function useRecipientsOverview() {
  return useQuery({
    queryKey: [...payoutKeys.all, "overview"] as const,
    queryFn: async (): Promise<RawCompanyRecipient[]> => {
      const { data, error } = await supabase
        .from("company")
        .select(
          "id, name, onboarding_status, gateway_split_enabled, payout_recipient(provider, status, external_recipient_id, kyc_url, kyc_url_expires_at, requirements, deleted_at, gateway_missing_at, balance_available_cents, balance_waiting_cents, balance_transferred_cents, balance_synced_at), company_payout_account(deleted_at)",
        )
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as RawCompanyRecipient[];
    },
  });
}

type SyncArgs = {
  company_id: string;
  action: "create" | "refresh" | "reissue_kyc";
  provider?: string;
};

/**
 * Liga ou desliga o split por empresa (E0.3.5). Só hub_admin; a RPC recusa ligar sem recebedor
 * ativo e reconhecido pelo gateway.
 */
export function useSetCompanyGatewaySplit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; enabled: boolean }) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
        a: Record<string, unknown>,
      ) => Promise<{ error: { message: string } | null }>;
      const { error } = await rpc("company_set_gateway_split", {
        p_company_id: args.company_id,
        p_enabled: args.enabled,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

async function callSyncRecipient(args: SyncArgs) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessão expirada. Entre novamente.");
  const res = await fetch(FN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Falha (HTTP ${res.status})`);
  return body as {
    ok: boolean;
    status: string;
    external_recipient_id: string | null;
    kyc_url: string | null;
    kyc_url_expires_at: string | null;
    requirements: PayoutRequirement[];
  };
}

export function useSyncRecipient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: callSyncRecipient,
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

/** Config de repasse por empresa (E0.3.3): cadência de transferência e/ou antecipação. */
// ── Reconciliação do split / extrato de repasses (E0.3.3) ───────────────────

export type PayoutStatementLine = {
  booking_code: string;
  event_at: string;
  status: string;
  partner_cents: number;
  movepark_cents: number;
  /** Taxa do gateway na cobrança. 0 quando ainda não apurada (ver reconcile-gateway-fees). */
  gateway_fee_cents: number;
};

export type PayoutStatementCompany = {
  company_id: string;
  company_name: string;
  gross_partner_cents: number;
  refunded_partner_cents: number;
  /** Dos estornos, quanto o gateway debitou do próprio parceiro (E0.3.6; não virou dívida). */
  refunded_by_partner_cents?: number;
  net_partner_cents: number;
  movepark_commission_cents: number;
  /**
   * Taxa do gateway no período. Com a custódia ligada a cobrança inteira cai na Movepark, então
   * isto é custo NOSSO: não desconta nada do parceiro, e a margem real é comissão menos esta taxa.
   */
  gateway_fee_cents: number;
  paid_count: number;
  refunded_count: number;
  lines: PayoutStatementLine[] | null;
};

export type PayoutStatement = {
  period: { from: string; to: string };
  companies: PayoutStatementCompany[];
};

export type PayoutBalance = {
  company_id: string;
  /** Tudo que o parceiro ganhou, tenha o gateway creditado na hora ou não. */
  net_partner_cents: number;
  /** Quanto a Movepark deve (vendas em custódia), antes de descontar o já repassado. */
  owed_cents: number;
  /**
   * Creditado direto pelo gateway no recebedor do parceiro (venda com split enviado). Zero enquanto
   * a custódia estiver ligada. É o complemento de `owed_cents` sobre o mesmo conjunto de vendas, e
   * é o que impede a tela dele de mostrar zero no dia em que o split voltar.
   */
  gateway_credited_cents: number;
  /** Já repassado pela Movepark ao recebedor do parceiro (inclui o que está em curso). */
  transferred_cents: number;
  /** Sacado pelo parceiro do recebedor dele para o banco. Não desconta a dívida. */
  withdrawn_cents: number;
  balance_cents: number;
  /** Dívida do parceiro com a Movepark (split dinâmico, E0.3.5). Travada em zero. */
  debt_cents?: number;
  /** A mesma dívida sem travar: negativa quando o abatimento passou (assunto do Manager). */
  debt_raw_cents?: number;
};

/** Extrato de repasse reconciliado do split (RPC payout_statement). */
export function usePayoutStatement(args: {
  from: string;
  to: string;
  companyId?: string | null;
  includeLines?: boolean;
}) {
  return useQuery({
    queryKey: ["payout-statement", args.from, args.to, args.companyId ?? "all", !!args.includeLines],
    queryFn: async (): Promise<PayoutStatement> => {
      const { data, error } = await supabase.rpc("payout_statement", {
        p_from: args.from,
        p_to: args.to,
        p_company_id: args.companyId ?? undefined,
        p_include_lines: args.includeLines ?? false,
      });
      if (error) throw error;
      return data as unknown as PayoutStatement;
    },
  });
}

/** Saques (transferências) registrados — RLS escopa por empresa. */
export function usePayoutWithdrawals(companyId?: string) {
  return useQuery({
    queryKey: ["payout-withdrawals", companyId ?? "all"],
    queryFn: async (): Promise<PayoutWithdrawal[]> => {
      let q = supabase
        .from("payout_withdrawal")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PayoutWithdrawal[];
    },
  });
}

/** Saldo a repassar = líquido − saques pagos (RPC payout_balance). */
export function usePayoutBalance(companyId: string | undefined) {
  return useQuery({
    queryKey: ["payout-balance", companyId ?? ""],
    enabled: !!companyId,
    queryFn: async (): Promise<PayoutBalance> => {
      const { data, error } = await supabase.rpc("payout_balance", { p_company_id: companyId! });
      if (error) throw error;
      return data as unknown as PayoutBalance;
    },
  });
}

// ── Repasse ao parceiro (E0.3.4) ────────────────────────────────────────────

/** Uma empresa com dívida aberta, como a RPC `payout_owed_overview` devolve. */
export type PayoutOwedRow = {
  company_id: string;
  company_name: string;
  /** Total devido pela Movepark (vendas em custódia, líquidas de estorno). */
  owed_cents: number;
  /** Já repassado (inclui o que está em curso). */
  transferred_cents: number;
  /** O que cabe repassar agora. */
  available_cents: number;
  /** Repassado a mais (tipicamente estorno depois do repasse). Zero no caminho normal. */
  overpaid_cents: number;
  target_recipient_id: string | null;
  recipient_status: string | null;
  /**
   * O gateway respondeu que este recebedor não existe. Repassar para ele morre em 404, então a tela
   * avisa e não oferece o botão. O `recipient_status` continua "active" de propósito: rebaixá-lo no
   * banco deslistaria o parceiro do site por causa de uma leitura de API.
   */
  recipient_missing?: boolean;
  em_andamento: boolean;
  /**
   * O repasse em andamento, se houver. `enviado` = já tem id do gateway (quem fecha é a conciliação
   * ou o webhook). Não enviado = retomável pela tela, e retomar reusa a MESMA linha e a mesma chave.
   */
  pendente?: {
    id: string;
    status: string;
    amount_cents: number;
    enviado: boolean;
    failed_reason: string | null;
    requested_at: string;
  } | null;
};

/** Quem está devendo repasse na rede. Só hub_admin (a RPC recusa o resto). */
export function usePayoutOwed() {
  return useQuery({
    queryKey: [...payoutKeys.all, "owed"] as const,
    queryFn: async (): Promise<PayoutOwedRow[]> => {
      // `payout_owed_overview` não está em `database.ts` porque o `supabase gen types` vem
      // derrubando funções que existem no banco (marketing_rfm_*, manager_price_research_*,
      // prospect_price_research), e regenerar aqui apagaria os tipos delas. O cast fica nesta
      // linha só, e some quando a geração voltar a sair inteira.
      // `.bind(supabase)`: sem isso o método sai desamarrado do cliente e quebra no `this`.
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: string,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
      const { data, error } = await rpc("payout_owed_overview");
      if (error) throw new Error(error.message);
      return (data ?? []) as PayoutOwedRow[];
    },
  });
}

export type PayoutTransferArgs = { company_id: string; amount_cents: number };

/**
 * Dispara o repasse. MOVE DINHEIRO REAL: a tela só chama isto depois de confirmação explícita, e o
 * valor é conferido de novo no servidor (a RPC recalcula o devido e recusa o que passar disso).
 */
async function callCreatePayoutTransfer(args: PayoutTransferArgs) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sessão expirada. Entre novamente.");
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payout-transfer`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(args),
    },
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Falha (HTTP ${res.status})`);
  return body as {
    ok: boolean;
    reused: boolean;
    external_transfer_id: string | null;
    status: string | null;
    amount_cents: number;
  };
}

export function useRequestPayoutTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: callCreatePayoutTransfer,
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

// ── Dívida do parceiro e split dinâmico (E0.3.5) ────────────────────────────

/** Uma linha do que o parceiro vê: origem, abatimento ou acerto. */
export type PayoutDebtOrigin = { booking_code: string; at: string | null; reason: string | null; cents: number };
export type PayoutDebtRecovery = { booking_code: string; at: string | null; cents: number; status: string };
export type PayoutDebtSettlement = { at: string; cents: number; kind: "manual_payment" | "adjustment"; note: string | null };

export type PayoutDebtLines = {
  /** O que a tela mostra (travado em zero). */
  debt_cents: number;
  /** Pode ser negativo (abatimento a mais); assunto do Manager. */
  debt_raw_cents: number;
  origins: PayoutDebtOrigin[];
  recoveries: PayoutDebtRecovery[];
  settlements: PayoutDebtSettlement[];
};

// `payout_debt_*`, `payout_refund_manual_mark_paid` e `gateway_account_balance` não estão em
// `database.ts` pelo mesmo motivo do `payout_owed_overview`: o `supabase gen types` vem derrubando
// funções que existem no banco. O cast fica em `rpcSolto` só, e some quando a geração voltar.
const rpcSolto = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Dívida e movimentos de uma empresa (parceiro dono ou hub_admin). */
export function usePayoutDebtLines(companyId?: string) {
  return useQuery({
    queryKey: [...payoutKeys.all, "debt-lines", companyId ?? "none"] as const,
    enabled: !!companyId,
    queryFn: async (): Promise<PayoutDebtLines> => {
      const { data, error } = await rpcSolto("payout_debt_lines", { p_company_id: companyId });
      if (error) throw new Error(error.message);
      return data as PayoutDebtLines;
    },
  });
}

export type PayoutDebtOverviewRow = {
  company_id: string;
  company_name: string;
  debt_cents: number;
  debt_raw_cents: number;
  since: string | null;
  last_recovery_at: string | null;
};

/** Dívida por empresa na rede. Só hub_admin. */
export function usePayoutDebtOverview() {
  return useQuery({
    queryKey: [...payoutKeys.all, "debt-overview"] as const,
    queryFn: async (): Promise<PayoutDebtOverviewRow[]> => {
      const { data, error } = await rpcSolto("payout_debt_overview");
      if (error) throw new Error(error.message);
      return (data ?? []) as PayoutDebtOverviewRow[];
    },
  });
}

export type SettleDebtArgs = {
  company_id: string;
  amount_cents: number;
  kind: "manual_payment" | "adjustment";
  note?: string;
};

/** Acerto manual da dívida (parceiro pagou por fora, ou ajuste). Só hub_admin; a RPC recusa o resto. */
export function useSettlePayoutDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: SettleDebtArgs) => {
      const { error } = await rpcSolto("payout_debt_settle", {
        p_company_id: args.company_id,
        p_amount_cents: args.amount_cents,
        p_kind: args.kind,
        p_note: args.note ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

export type ManualRefundRow = {
  id: string;
  booking_id: string;
  payment_id: string;
  amount_cents: number;
  reason: "gateway_deadline" | "gateway_no_balance" | "gateway_refused";
  status: "pending" | "paid" | "canceled";
  note: string | null;
  created_at: string;
  paid_at: string | null;
  booking: { code: string; customer_name: string | null; customer_email: string | null } | null;
};

/** Fila de reembolso manual (o gateway recusou de forma definitiva). Só hub_admin lê, por RLS. */
export function useManualRefunds() {
  return useQuery({
    queryKey: [...payoutKeys.all, "manual-refunds"] as const,
    queryFn: async (): Promise<ManualRefundRow[]> => {
      const from = supabase.from.bind(supabase) as unknown as (t: string) => {
        select: (q: string) => {
          order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
      const { data, error } = await from("payout_refund_manual")
        .select("id, booking_id, payment_id, amount_cents, reason, status, note, created_at, paid_at, booking:booking_id(code, customer_name, customer_email)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as ManualRefundRow[];
    },
  });
}

/** Marca um reembolso manual como pago: o `payment` vira `refunded` e a dívida do parceiro entra. */
export function useMarkManualRefundPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: string; note?: string }) => {
      const { error } = await rpcSolto("payout_refund_manual_mark_paid", {
        p_id: args.id,
        p_note: args.note ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

export type GatewayMasterBalance = {
  available_cents: number;
  waiting_cents: number;
  transferred_cents: number;
  synced_at: string;
} | null;

/** Saldo do master no gateway (lido pelo cron) e o colchão configurado. Só hub_admin, por RLS. */
export function useGatewayMasterBalance() {
  return useQuery({
    queryKey: [...payoutKeys.all, "master-balance"] as const,
    queryFn: async (): Promise<{
      balance: GatewayMasterBalance;
      float_cents: number;
      split_enabled: boolean;
      /** Estorno híbrido (E0.3.6): o gateway debita o parceiro quando o saldo dele cobre. */
      refund_hybrid_enabled: boolean;
    }> => {
      const from = supabase.from.bind(supabase) as unknown as (t: string) => {
        select: (q: string) => {
          eq: (c: string, v: string) => { maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }> };
          in: (c: string, v: string[]) => Promise<{ data: unknown; error: { message: string } | null }>;
        };
      };
      const [{ data: b }, { data: s }] = await Promise.all([
        from("gateway_account_balance").select("available_cents, waiting_cents, transferred_cents, synced_at").eq("provider", "pagarme").maybeSingle(),
        from("app_setting").select("key, value").in("key", ["pagarme_master_float_cents", "pagarme_split_enabled", "pagarme_refund_hybrid_enabled"]),
      ]);
      const settings = Object.fromEntries(((s ?? []) as { key: string; value: string }[]).map((r) => [r.key, r.value]));
      const float = Number(settings.pagarme_master_float_cents ?? 0);
      return {
        balance: (b as GatewayMasterBalance) ?? null,
        float_cents: Number.isFinite(float) && float > 0 ? Math.round(float) : 0,
        split_enabled: (settings.pagarme_split_enabled ?? "true").trim().toLowerCase() !== "false",
        refund_hybrid_enabled: (settings.pagarme_refund_hybrid_enabled ?? "false").trim().toLowerCase() === "true",
      };
    },
  });
}

/**
 * Liga ou desliga o estorno híbrido (E0.3.6). Escreve `app_setting.pagarme_refund_hybrid_enabled`
 * pela RLS de hub_admin; as Edges leem a chave a cada estorno, então o efeito é imediato e desligar
 * volta ao 100% master na hora.
 */
export function useSetRefundHybrid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("app_setting")
        .upsert({ key: "pagarme_refund_hybrid_enabled", value: enabled ? "true" : "false" }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

/**
 * Lê AGORA os saldos no gateway (recebedores ativos e master), em vez de esperar o cron
 * (16/09/2026). Chama a Edge `refresh-recipients` com o JWT do hub_admin e `force: true`; a
 * Edge relê o que tem mais de 30 s. As telas de Repasses e Recebedores chamam ao abrir e no
 * botão "Atualizar saldos", e o que aparece é o saldo da Pagar.me daquele instante.
 */
export function useRefreshGatewayBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Entre novamente.");
      const res = await fetch(REFRESH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ force: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha (HTTP ${res.status})`);
      return body as { ok: boolean; balances: number; master: boolean; forced: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: payoutKeys.all }),
  });
}

// ── Conta do parceiro (E0.3.7) ───────────────────────────────────────────────

import type { AccountStatement } from "./account.logic";

export const accountKeys = {
  all: ["partner-account"] as const,
  statement: (companyId: string, from: string, to: string) =>
    [...accountKeys.all, companyId, from, to] as const,
};

/**
 * Extrato estilo conta bancária de uma empresa (RPC `partner_account_statement`): cabeçalho com
 * saldo real do gateway, ciclo de transferência e dívida; movimentos com venda, estorno, dívida,
 * acerto, repasse e saque. hub_admin lê qualquer empresa; membro precisa de `finance:read`.
 */
export function usePartnerAccountStatement(args: { companyId?: string; from: string; to: string }) {
  return useQuery({
    queryKey: accountKeys.statement(args.companyId ?? "none", args.from, args.to),
    enabled: !!args.companyId,
    queryFn: async (): Promise<AccountStatement> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "partner_account_statement",
        a: { p_company_id: string; p_from: string; p_to: string },
      ) => PromiseLike<{ data: AccountStatement | null; error: { message: string } | null }>;
      const { data, error } = await rpc("partner_account_statement", {
        p_company_id: args.companyId!,
        p_from: args.from,
        p_to: args.to,
      });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Extrato vazio.");
      return data;
    },
    placeholderData: (previous) => previous,
  });
}

/**
 * Saque do saldo do recebedor para a conta bancária do parceiro (Edge `recipient-withdraw`).
 * hub_admin ou o Dono (`payouts:write`). A Edge lê o saldo ao vivo antes e recusa se não cobre.
 */
export function useWithdraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; amount_cents: number; force?: boolean }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Sessão expirada. Entre novamente.");
      const res = await fetch(WITHDRAW_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: ANON,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(args),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Falha (HTTP ${res.status})`);
      return body as {
        ok: boolean;
        withdrawal_id: string | null;
        status: string;
        /** O que o parceiro pediu (sai do saldo). */
        requested_cents: number;
        /** O que cai na conta: pedido menos a taxa. */
        amount_cents: number;
        fee_cents: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all });
      qc.invalidateQueries({ queryKey: payoutKeys.all });
      qc.invalidateQueries({ queryKey: ["payout-withdrawals"] });
    },
  });
}

/** O que `payout_withdrawable` devolve: o disponível para saque calculado do nosso lado (E0.3.8). */
export type PayoutWithdrawable = {
  company_id: string;
  /** Dias depois do pagamento para a venda liberar (global, ou o da empresa). */
  release_days: number;
  /** Vendas já liberadas pelo prazo (líquidas) mais repasses da custódia. */
  released_cents: number;
  /** Vendas pagas ainda dentro do prazo. */
  retained_cents: number;
  debt_cents: number;
  /** Saques pagos ou em curso, com a taxa. */
  withdrawn_cents: number;
  gateway_available_cents: number | null;
  gateway_waiting_cents: number | null;
  gateway_synced_at: string | null;
  recipient_status: string | null;
  recipient_missing: boolean;
  /** O teto do saque: liberado − dívida − saques, limitado ao disponível real na Pagar.me. */
  available_cents: number;
  /** Taxa por saque, cobrada do saldo além do valor (app_setting.payout_withdrawal_fee_cents). */
  withdrawal_fee_cents: number;
  /** O maior valor que dá para pedir: disponível menos a taxa. */
  max_withdraw_cents: number;
};

/**
 * Disponível para saque (E0.3.8): o número é nosso, não o saldo bruto da Pagar.me. O parceiro saca
 * até ele; a Movepark também, e só passa dele com confirmação explícita.
 */
export function usePayoutWithdrawable(companyId: string | undefined) {
  return useQuery({
    queryKey: [...accountKeys.all, "withdrawable", companyId ?? "none"] as const,
    enabled: !!companyId,
    queryFn: async (): Promise<PayoutWithdrawable> => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "payout_withdrawable",
        a: { p_company_id: string },
      ) => PromiseLike<{ data: PayoutWithdrawable | null; error: { message: string } | null }>;
      const { data, error } = await rpc("payout_withdrawable", { p_company_id: companyId! });
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Sem saldo calculado.");
      return data;
    },
  });
}

/** Prazo de liberação de UMA empresa (dias depois do pagamento). `null` volta a herdar o global. */
export function useSetCompanyPayoutReleaseDays() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { company_id: string; days: number | null }) => {
      const rpc = supabase.rpc.bind(supabase) as unknown as (
        fn: "company_set_payout_release_days",
        a: { p_company_id: string; p_days: number | null },
      ) => PromiseLike<{ error: { message: string } | null }>;
      const { error } = await rpc("company_set_payout_release_days", { p_company_id: args.company_id, p_days: args.days });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.all });
      qc.invalidateQueries({ queryKey: payoutKeys.all });
    },
  });
}

