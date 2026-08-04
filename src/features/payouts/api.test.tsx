import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import { toPayoutAccountPayload, type PayoutKycForm } from "./kyc";
import { edge, falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import {
  useAcceptContract,
  useSavePayoutAccountAdmin,
  useSavePayoutAccountSelf,
  useSyncRecipient,
} from "./api";

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
