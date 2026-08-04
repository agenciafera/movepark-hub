import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useSetCompanyTakeRate } from "./api";

/**
 * Contrato de rede da comissão da Movepark (ADR-004). O `take_rate_bps` é por empresa
 * e entra no split de toda cobrança daquele parceiro, então o número que sai daqui
 * decide quanto sobra para os dois lados em cada reserva.
 *
 * A unidade é BASIS POINT, não porcentagem: 1500 é 15%. É a confusão mais fácil de
 * cometer nesse campo, e a que multiplica o erro por cem.
 */

describe("useSetCompanyTakeRate", () => {
  it("manda a empresa e a taxa em basis points", async () => {
    const espiao = rpc("set_company_take_rate", { json: { id: "c1", take_rate_bps: 1500 } });

    const { result } = renderMutation(() => useSetCompanyTakeRate());
    await result.current.mutateAsync({ companyId: "c1", takeRateBps: 1500 });

    expect(espiao.ultimoBody).toEqual({ p_company_id: "c1", p_take_rate_bps: 1500 });
  });

  it("o valor vai inteiro, sem conversão no caminho", async () => {
    // Se alguém dividisse por 100 aqui achando que a RPC quer porcentagem, 1500
    // viraria 15 basis points, ou seja 0,15%: a Movepark deixaria de cobrar quase
    // tudo e ninguém notaria até o fechamento do mês.
    const espiao = rpc("set_company_take_rate", { json: { id: "c1" } });

    const { result } = renderMutation(() => useSetCompanyTakeRate());
    await result.current.mutateAsync({ companyId: "c1", takeRateBps: 1500 });

    expect((espiao.ultimoBody as { p_take_rate_bps: number }).p_take_rate_bps).toBe(1500);
  });

  it("comissão zero é valor legítimo e chega ao servidor", async () => {
    // Zero é o acordo de parceiro sem comissão. Um guard truthy transformaria isso em
    // "não mudou nada", e a empresa seguiria pagando a taxa anterior.
    const espiao = rpc("set_company_take_rate", { json: { id: "c1" } });

    const { result } = renderMutation(() => useSetCompanyTakeRate());
    await result.current.mutateAsync({ companyId: "c1", takeRateBps: 0 });

    expect((espiao.ultimoBody as { p_take_rate_bps: number }).p_take_rate_bps).toBe(0);
  });

  it("devolve a empresa atualizada, para a tela não precisar adivinhar", async () => {
    rpc("set_company_take_rate", { json: { id: "c1", take_rate_bps: 2000 } });

    const { result } = renderMutation(() => useSetCompanyTakeRate());
    const atualizada = await result.current.mutateAsync({ companyId: "c1", takeRateBps: 2000 });

    expect((atualizada as { take_rate_bps: number }).take_rate_bps).toBe(2000);
  });

  it("recusa do servidor sobe, em vez de a tela dizer que salvou", async () => {
    // A RPC é hub_admin-only e valida a faixa. Engolir esse erro faria o admin achar
    // que mudou a comissão de um parceiro que continua na antiga.
    falha("rpc", "set_company_take_rate", 403, "apenas hub_admin");

    const { result } = renderMutation(() => useSetCompanyTakeRate());
    await expect(
      result.current.mutateAsync({ companyId: "c1", takeRateBps: 1500 }),
    ).rejects.toThrow();
  });
});
