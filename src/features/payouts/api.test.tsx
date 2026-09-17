import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { toPayoutAccountPayload, type PayoutKycForm } from "./kyc";
import { edge, falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import {
  useAcceptContract,
  useSavePayoutAccountAdmin,
  useSavePayoutAccountSelf,
  useSetCompanyGatewaySplit,
  useSetRefundHybrid,
  useSyncRecipient,
  useGatewayMasterBalance,
  useManualRefunds,
  useRefreshGatewayBalances,
  useWithdraw,
  useSetCompanyPayoutReleaseDays,
} from "./api";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { http, HttpResponse } from "msw";
import { server } from "@/test/msw/server";

const BASE = import.meta.env.VITE_SUPABASE_URL;

function renderQuery<T>(hook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
}

/**
 * Contrato de rede do repasse. É a área que decide para onde o dinheiro do parceiro
 * vai, e a que carrega dado de KYC: conta bancária, documento, endereço.
 *
 * O que estes testes prendem é o payload. Errar um campo aqui não quebra a tela, muda
 * a conta de destino.
 */

/**
 * O payload é a saída de `toPayoutAccountPayload`, então o fixture parte de um
 * formulário válido e passa pela transformação real. Montar o objeto à mão aqui
 * envelheceria: o dia em que o KYC ganhar um campo, o teste continuaria verde
 * gravando uma conta incompleta.
 */
function validForm(): PayoutKycForm {
  const addr = {
    zip_code: "01310-930",
    street: "Av. Paulista",
    street_number: "1000",
    complement: "Sala 12",
    neighborhood: "Bela Vista",
    city: "São Paulo",
    state: "SP",
    reference_point: "Em frente ao MASP",
  };
  return {
    company: {
      legal_name: "Estac LTDA",
      trade_name: "EstacioneJá",
      document: "11.222.333/0001-81",
      email: "contato@estac.com",
      annual_revenue: 1000000, // reais = R$ 1.000.000
      founding_date: "10/10/2010",
      corporation_type: "LTDA",
      phone: "+5511999998888",
      address: addr,
    },
    representative: {
      name: "Tony Stark",
      document: "390.533.447-05",
      email: "tony@estac.com",
      birthdate: "12/10/1985",
      monthly_income: 12000, // reais = R$ 12.000
      professional_occupation: "Sócio",
      mother_name: "Maria",
      self_declared_legal_representative: true,
      phone: "+5511988887777",
      address: addr,
    },
    bank: {
      bank_code: "341",
      branch_number: "1234",
      branch_check_digit: "5",
      account_number: "67890",
      account_check_digit: "1",
      account_type: "checking",
      holder_name: "Estac LTDA",
    },
  };
}

const CONTA = toPayoutAccountPayload(validForm());

describe("useSavePayoutAccountAdmin", () => {
  it("faz upsert com a empresa e o payload recebidos", async () => {
    const up = tabela("company_payout_account", "post", { json: [] });

    const { result } = renderMutation(() => useSavePayoutAccountAdmin());
    await result.current.mutateAsync({ company_id: "c1", payload: CONTA });

    expect(up.ultimoBody).toMatchObject({ company_id: "c1", ...CONTA });
  });

  it("ressuscita conta apagada: manda deleted_at null junto", async () => {
    // Sem isto, um parceiro que teve a conta removida e recadastrou continuaria com
    // a linha marcada como apagada, e o repasse não sairia.
    const up = tabela("company_payout_account", "post", { json: [] });

    const { result } = renderMutation(() => useSavePayoutAccountAdmin());
    await result.current.mutateAsync({ company_id: "c1", payload: CONTA });

    expect((up.ultimoBody as { deleted_at: unknown }).deleted_at).toBeNull();
  });

  it("propaga o erro do servidor em vez de fingir sucesso", async () => {
    falha("tabela", "company_payout_account", 403, "sem permissão");

    const { result } = renderMutation(() => useSavePayoutAccountAdmin());
    await expect(
      result.current.mutateAsync({ company_id: "c1", payload: CONTA }),
    ).rejects.toThrow();
  });
});

describe("useSavePayoutAccountSelf", () => {
  it("escreve na mesma tabela e com o mesmo payload do admin", async () => {
    // As duas existem porque a AUTORIZAÇÃO difere (RLS de dono contra hub_admin), não
    // o dado. Se um dia divergirem no payload, é bug: quem é dono gravaria diferente
    // de quem é admin na mesma ficha.
    const up = tabela("company_payout_account", "post", { json: [] });

    const { result } = renderMutation(() => useSavePayoutAccountSelf());
    await result.current.mutateAsync({ company_id: "c1", payload: CONTA });

    expect(up.ultimoBody).toMatchObject({ company_id: "c1", ...CONTA, deleted_at: null });
  });
});

describe("useAcceptContract", () => {
  it("chama a RPC com a empresa, e a versão vai junto quando informada", async () => {
    const espiao = rpc("operator_accept_contract", { json: null });

    const { result } = renderMutation(() => useAcceptContract());
    await result.current.mutateAsync({ company_id: "c1", version: "2026-08" });

    expect(espiao.ultimoBody).toMatchObject({ p_company_id: "c1" });
    expect(JSON.stringify(espiao.ultimoBody)).toContain("2026-08");
  });

  it("propaga a recusa da RPC", async () => {
    falha("rpc", "operator_accept_contract", 400, "contrato já aceito");

    const { result } = renderMutation(() => useAcceptContract());
    await expect(result.current.mutateAsync({ company_id: "c1" })).rejects.toThrow();
  });
});

describe("useSyncRecipient", () => {
  function comSessao(token: string | null) {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: token ? ({ access_token: token } as never) : null },
      error: null,
    } as never);
  }

  it("recusa sem sessao, antes de tocar a rede", async () => {
    // Criar recebedor manda documento e conta bancaria para o gateway. Sem sessao a
    // chamada nao pode sair, nem para receber um 401 do outro lado.
    comSessao(null);
    const espiao = edge("sync-recipient", { json: { ok: true } });

    const { result } = renderMutation(() => useSyncRecipient());
    await expect(
      result.current.mutateAsync({ company_id: "c1", action: "create" }),
    ).rejects.toThrow(/Sess/);
    expect(espiao.chamadas).toHaveLength(0);
  });

  it("chama a Edge sync-recipient com os argumentos recebidos", async () => {
    comSessao("token-de-teste");
    const espiao = edge("sync-recipient", {
      json: { ok: true, status: "pending", external_recipient_id: "rp_1", kyc_url: null },
    });

    const { result } = renderMutation(() => useSyncRecipient());
    await result.current.mutateAsync({ company_id: "c1", action: "create" });

    expect(espiao.chamadas).toHaveLength(1);
    expect(espiao.ultimoBody).toMatchObject({ company_id: "c1", action: "create" });
  });

  it("a ação vai íntegra: reemitir KYC não pode virar criar", async () => {
    // As três ações têm efeitos diferentes no gateway, e reissue_kyc INVALIDA o link
    // que o parceiro já tem aberto, reiniciando os 20 minutos de validade. Trocar uma
    // pela outra mataria a prova de vida em andamento.
    const espiao = edge("sync-recipient", { json: { ok: true, status: "pending" } });

    const { result } = renderMutation(() => useSyncRecipient());
    await result.current.mutateAsync({ company_id: "c1", action: "reissue_kyc" });

    expect((espiao.ultimoBody as { action: string }).action).toBe("reissue_kyc");
  });

  it("erro da Edge sobe com a mensagem do servidor, não com um genérico", async () => {
    // O parceiro precisa ler o motivo real da recusa do gateway, senão fica preso
    // sem saber qual documento arrumar.
    comSessao("token-de-teste");
    edge("sync-recipient", { status: 400, json: { error: "documento inválido" } });

    const { result } = renderMutation(() => useSyncRecipient());
    await expect(
      result.current.mutateAsync({ company_id: "c1", action: "create" }),
    ).rejects.toThrow(/documento inválido/);
  });
});

describe("useSetCompanyGatewaySplit", () => {
  it("chama a RPC com a empresa e o valor, para ligar e para desligar", async () => {
    const espiao = rpc("company_set_gateway_split", { json: null });

    const { result } = renderMutation(() => useSetCompanyGatewaySplit());
    await result.current.mutateAsync({ company_id: "c1", enabled: true });
    expect(espiao.ultimoBody).toMatchObject({ p_company_id: "c1", p_enabled: true });

    await result.current.mutateAsync({ company_id: "c1", enabled: false });
    expect(espiao.ultimoBody).toMatchObject({ p_company_id: "c1", p_enabled: false });
  });

  it("propaga a recusa da RPC (sem recebedor ativo ela nao liga)", async () => {
    falha("rpc", "company_set_gateway_split", 400, "A empresa precisa de recebedor ativo no gateway antes de ligar o split.");

    const { result } = renderMutation(() => useSetCompanyGatewaySplit());
    await expect(result.current.mutateAsync({ company_id: "c1", enabled: true })).rejects.toThrow(/recebedor ativo/);
  });
});

describe("useSetRefundHybrid", () => {
  it("grava a chave em app_setting por upsert, como texto 'true'/'false'", async () => {
    const chamada = tabela("app_setting", "post", { json: [] });
    const { result } = renderMutation(() => useSetRefundHybrid());
    await result.current.mutateAsync(true);
    expect(chamada.ultimoBody).toEqual({ key: "pagarme_refund_hybrid_enabled", value: "true" });
    await result.current.mutateAsync(false);
    expect(chamada.ultimoBody).toEqual({ key: "pagarme_refund_hybrid_enabled", value: "false" });
  });
});

// Regressão (16/09/2026): `supabase.from` era passado por cast SEM `bind`, e o método usa `this`.
// O card do master e a fila manual falhavam em silêncio ("Cannot read properties of undefined
// (reading 'rest')"), o card devolvia null e ninguém via o saldo do master em produção.
describe("hooks com `from` por cast ficam amarrados ao client", () => {
  it("useGatewayMasterBalance lê saldo e chaves de verdade", async () => {
    server.use(
      http.get(`${BASE}/rest/v1/gateway_account_balance`, () =>
        HttpResponse.json({ available_cents: 15635, waiting_cents: 0, transferred_cents: 0, synced_at: "2026-09-16T17:11:07Z" }),
      ),
      http.get(`${BASE}/rest/v1/app_setting`, () =>
        HttpResponse.json([
          { key: "pagarme_master_float_cents", value: "300000" },
          { key: "pagarme_refund_hybrid_enabled", value: "true" },
        ]),
      ),
    );
    const { result } = renderQuery(() => useGatewayMasterBalance());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      balance: { available_cents: 15635, waiting_cents: 0, transferred_cents: 0, synced_at: "2026-09-16T17:11:07Z" },
      float_cents: 300000,
      split_enabled: true,
      refund_hybrid_enabled: true,
    });
  });

  it("useManualRefunds lista a fila de verdade", async () => {
    server.use(http.get(`${BASE}/rest/v1/payout_refund_manual`, () => HttpResponse.json([])));
    const { result } = renderQuery(() => useManualRefunds());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useRefreshGatewayBalances", () => {
  it("chama a Edge refresh-recipients com force: true e o JWT do usuário", async () => {
    const chamada = edge("refresh-recipients", { json: { ok: true, balances: 2, master: true, forced: true } });
    const { result } = renderMutation(() => useRefreshGatewayBalances());
    const r = await result.current.mutateAsync();
    expect(chamada.ultimoBody).toEqual({ force: true });
    expect(r.forced).toBe(true);
  });
});

describe("useWithdraw", () => {
  it("pede o saque à Edge recipient-withdraw com empresa e valor em centavos", async () => {
    const chamada = edge("recipient-withdraw", { json: { ok: true, withdrawal_id: "w1", status: "created", requested_cents: 5000, amount_cents: 4633, fee_cents: 367 } });
    const { result } = renderMutation(() => useWithdraw());
    const r = await result.current.mutateAsync({ company_id: "c1", amount_cents: 5000 });
    expect(chamada.ultimoBody).toEqual({ company_id: "c1", amount_cents: 5000 });
    expect(r.status).toBe("created");
  });

  it("propaga a recusa do pré-voo (saldo não cobre)", async () => {
    falha("edge", "recipient-withdraw", 409, "Saldo disponível não cobre o saque.");
    const { result } = renderMutation(() => useWithdraw());
    await expect(result.current.mutateAsync({ company_id: "c1", amount_cents: 5000 })).rejects.toThrow(/não cobre/);
  });
});

describe("useSetCompanyPayoutReleaseDays", () => {
  it("grava o prazo da empresa pela RPC, e null volta a herdar o global", async () => {
    const chamada = rpc("company_set_payout_release_days", { json: null });
    const { result } = renderMutation(() => useSetCompanyPayoutReleaseDays());
    await result.current.mutateAsync({ company_id: "c1", days: 7 });
    expect(chamada.ultimoBody).toEqual({ p_company_id: "c1", p_days: 7 });
    await result.current.mutateAsync({ company_id: "c1", days: null });
    expect(chamada.ultimoBody).toEqual({ p_company_id: "c1", p_days: null });
  });
});
