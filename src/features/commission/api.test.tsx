import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import { useDeleteCommissionRule, useSaveCommissionRule, useSetBookingCommission } from "./api";
import type { RulePayload } from "./rule.logic";

/**
 * Contrato de rede das regras de comissão. O que estes testes prendem é o payload: um campo
 * errado aqui não quebra a tela, muda quanto o estacionamento recebe em toda venda do canal.
 */
const REGRA: RulePayload = {
  name: "Site do parceiro",
  company_id: "c1",
  utm_sources: ["abbapark"],
  match_white_label: true,
  take_rate_bps: 500,
  gateway_fee_payer: "partner",
  chargeback_bearer: "partner",
  priority: 0,
  is_active: true,
  valid_from: null,
  valid_until: null,
};

describe("useSaveCommissionRule", () => {
  it("sem id insere a regra inteira", async () => {
    const ins = tabela("commission_rule", "post", { json: { id: "r1", ...REGRA } });
    const { result } = renderMutation(() => useSaveCommissionRule());
    await result.current.mutateAsync(REGRA);
    expect(ins.ultimoBody).toEqual(REGRA);
  });

  it("com id atualiza só aquela regra, e o id não vai no corpo", async () => {
    const upd = tabela("commission_rule", "patch", { json: { id: "r1", ...REGRA } });
    const { result } = renderMutation(() => useSaveCommissionRule());
    await result.current.mutateAsync({ id: "r1", ...REGRA, take_rate_bps: 700 });
    expect(upd.chamadas[0].url).toContain("id=eq.r1");
    expect(upd.ultimoBody).toEqual({ ...REGRA, take_rate_bps: 700 });
  });

  it("UTM repetido: a recusa do banco chega com a mensagem", async () => {
    falha("tabela", "commission_rule", 409, 'O utm_source "abbapark" já está em outra regra ativa deste dono.');
    const { result } = renderMutation(() => useSaveCommissionRule());
    await expect(result.current.mutateAsync(REGRA)).rejects.toThrow(/já está em outra regra/);
  });
});

describe("useDeleteCommissionRule", () => {
  it("é soft delete e desliga a regra, para reserva antiga não perder o nome do canal", async () => {
    const upd = tabela("commission_rule", "patch", { status: 204 });
    const { result } = renderMutation(() => useDeleteCommissionRule());
    await result.current.mutateAsync("r1");
    expect(upd.chamadas[0].url).toContain("id=eq.r1");
    const body = upd.ultimoBody as { deleted_at: string; is_active: boolean };
    expect(body.is_active).toBe(false);
    expect(Number.isNaN(new Date(body.deleted_at).getTime())).toBe(false);
  });
});

describe("useSetBookingCommission", () => {
  it("manda reserva, regra e motivo para a RPC que grava o histórico", async () => {
    const espiao = rpc("admin_set_booking_commission", { json: { channel: "Site do parceiro" } });
    const { result } = renderMutation(() => useSetBookingCommission());
    await result.current.mutateAsync({ bookingId: "b1", ruleId: "r1", reason: "veio do site dele" });
    expect(espiao.ultimoBody).toEqual({ p_booking_id: "b1", p_rule_id: "r1", p_reason: "veio do site dele" });
  });

  it("regra nula devolve a reserva ao padrão do Hub", async () => {
    const espiao = rpc("admin_set_booking_commission", { json: { channel: "hub" } });
    const { result } = renderMutation(() => useSetBookingCommission());
    await result.current.mutateAsync({ bookingId: "b1", ruleId: null, reason: "atribuição errada" });
    expect((espiao.ultimoBody as { p_rule_id: unknown }).p_rule_id).toBeNull();
  });

  it("reserva já paga: a recusa do banco chega", async () => {
    falha("rpc", "admin_set_booking_commission", 400, "A reserva já foi paga");
    const { result } = renderMutation(() => useSetBookingCommission());
    await expect(result.current.mutateAsync({ bookingId: "b1", ruleId: null, reason: "x" })).rejects.toThrow(/já foi paga/);
  });
});
