import { describe, expect, it } from "vitest";
import { falha, renderMutation, rpc, tabela } from "@/test/msw/supabase";
import {
  useCreateLocationParkingType,
  useEnableCompanyParkingType,
  useOperatorSetPricing,
  useSimulatePrice,
  useTriggerWlMirror,
  useUpdateCompanyParkingType,
  useUpdateLocationParkingType,
} from "./api";

/**
 * Contrato de rede dos tipos de vaga. Aqui moram as duas coisas que o consumidor vê
 * no anúncio e paga no checkout: a CAPACIDADE e o PREÇO.
 *
 * Capacidade errada vira overbooking, e o custo cai na portaria do parceiro, com o
 * cliente já no aeroporto. Preço errado vira cobrança errada. Nos dois casos a tela
 * não acusa nada: ela mostra o número que gravou.
 */

describe("useUpdateLocationParkingType", () => {
  it("aplica o patch no tipo de vaga certo", async () => {
    const patch = tabela("location_parking_type", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateLocationParkingType());
    await result.current.mutateAsync({ id: "lpt-9", patch: { capacity: 80 } });

    expect(patch.chamadas[0].url).toContain("id=eq.lpt-9");
    expect(patch.ultimoBody).toEqual({ capacity: 80 });
  });

  it("manda só o que mudou, não a linha inteira", async () => {
    // Um patch gordo sobrescreveria os campos que a tela não editou (mínimo de
    // diária, mensagem de lotação) com o que estava no estado do formulário.
    const patch = tabela("location_parking_type", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateLocationParkingType());
    await result.current.mutateAsync({ id: "lpt-9", patch: { is_active: false } });

    expect(Object.keys(patch.ultimoBody as object)).toEqual(["is_active"]);
  });

  it("capacidade zero é valor legítimo e vai para o servidor", async () => {
    // Zero é como o parceiro fecha o tipo de vaga sem apagar a configuração. Um
    // guard truthy no caminho transformaria isso em "não mudou nada".
    const patch = tabela("location_parking_type", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateLocationParkingType());
    await result.current.mutateAsync({ id: "lpt-9", patch: { capacity: 0 } });

    expect(patch.ultimoBody).toEqual({ capacity: 0 });
  });

  it("propaga a recusa do servidor", async () => {
    // A checagem de capacidade menor que as reservas ativas é do banco. A tela
    // precisa mostrar esse motivo, não um erro genérico.
    falha("tabela", "location_parking_type", 400, "capacidade menor que reservas ativas");

    const { result } = renderMutation(() => useUpdateLocationParkingType());
    await expect(
      result.current.mutateAsync({ id: "lpt-9", patch: { capacity: 1 } }),
    ).rejects.toThrow();
  });
});

describe("useCreateLocationParkingType", () => {
  it("insere o tipo de vaga com o payload recebido", async () => {
    const ins = tabela("location_parking_type", "post", { json: [{ id: "lpt-1" }] });

    const { result } = renderMutation(() => useCreateLocationParkingType());
    await result.current.mutateAsync({
      location_id: "l1",
      company_parking_type_id: "cpt-1",
      capacity: 50,
    });

    expect(ins.ultimoBody).toMatchObject({
      location_id: "l1",
      company_parking_type_id: "cpt-1",
      capacity: 50,
    });
  });
});

describe("useEnableCompanyParkingType", () => {
  it("insere o tipo no catálogo da empresa e devolve a linha criada", async () => {
    // O retorno importa: a tela encadeia a criação do location_parking_type com o id
    // que volta daqui. Sem ele, o passo seguinte criaria órfão.
    // Objeto e nao array: o hook fecha com .single(), e o PostgREST responde um
    // objeto cru quando o Accept pede uma linha so.
    tabela("company_parking_type", "post", { json: { id: "cpt-novo", base_price: 30 } });

    const { result } = renderMutation(() => useEnableCompanyParkingType());
    const criado = await result.current.mutateAsync({
      company_id: "c1",
      parking_type_id: "pt-1",
      base_price: 30,
      default_capacity: 20,
    });

    expect((criado as { id: string }).id).toBe("cpt-novo");
  });
});

describe("useUpdateCompanyParkingType", () => {
  it("aplica o patch pelo id do catálogo da empresa", async () => {
    const patch = tabela("company_parking_type", "patch", { json: [] });

    const { result } = renderMutation(() => useUpdateCompanyParkingType());
    await result.current.mutateAsync({ id: "cpt-9", patch: { base_price: 45 } });

    expect(patch.chamadas[0].url).toContain("id=eq.cpt-9");
    expect(patch.ultimoBody).toEqual({ base_price: 45 });
  });
});

describe("useOperatorSetPricing", () => {
  it("manda tipo de vaga, preço base, regra e faixas para a RPC", async () => {
    const espiao = rpc("operator_set_pricing", { json: null });

    const { result } = renderMutation(() => useOperatorSetPricing());
    await result.current.mutateAsync({
      locationParkingTypeId: "lpt-9",
      basePrice: 39.9,
      rule: { strategy: "uniform_by_duration" },
      tiers: [{ from_day: 1, to_day: 3, unit_price: 39.9, total_price: null }],
    });

    expect(espiao.ultimoBody).toMatchObject({
      p_location_parking_type_id: "lpt-9",
      p_base_price: 39.9,
    });
  });

  it("preço base nulo chega como null, não some do payload", async () => {
    // Null é o que zera o preço base e devolve a decisão para as faixas. Se o campo
    // sumisse, a RPC manteria o preço antigo e a tela mostraria o novo.
    const espiao = rpc("operator_set_pricing", { json: null });

    const { result } = renderMutation(() => useOperatorSetPricing());
    await result.current.mutateAsync({
      locationParkingTypeId: "lpt-9",
      basePrice: null,
      rule: {},
      tiers: [],
    });

    expect(espiao.ultimoBody).toHaveProperty("p_base_price", null);
  });

  it("as faixas vão inteiras, na ordem em que a tela montou", async () => {
    const espiao = rpc("operator_set_pricing", { json: null });
    const tiers = [
      { from_day: 1, to_day: 3, unit_price: 40, total_price: null },
      { from_day: 4, to_day: null, unit_price: 30, total_price: null },
    ];

    const { result } = renderMutation(() => useOperatorSetPricing());
    await result.current.mutateAsync({
      locationParkingTypeId: "lpt-9",
      basePrice: 40,
      rule: {},
      tiers,
    });

    expect((espiao.ultimoBody as { p_tiers: unknown }).p_tiers).toEqual(tiers);
  });
});

describe("useTriggerWlMirror", () => {
  it("dispara o espelho da vaga certa", async () => {
    // Botão de emergência: o admin aperta quando o preço do white-label divergiu do
    // catálogo. Mandar o id errado sincroniza a vaga errada e deixa a divergente como está.
    const espiao = rpc("wl_mirror_trigger", { json: null });

    const { result } = renderMutation(() => useTriggerWlMirror());
    await result.current.mutateAsync("lpt-9");

    expect(espiao.ultimoBody).toEqual({ p_location_parking_type_id: "lpt-9" });
  });

  it("propaga o erro da RPC em vez de fingir que sincronizou", async () => {
    falha("rpc", "wl_mirror_trigger", 403);

    const { result } = renderMutation(() => useTriggerWlMirror());
    await expect(result.current.mutateAsync("lpt-9")).rejects.toBeTruthy();
  });
});

describe("useSimulatePrice", () => {
  it("consulta o motor com empresa, unidade, tipo e dias", async () => {
    const espiao = rpc("simulate_price", { json: { total: 199.5 } });

    const { result } = renderMutation(() => useSimulatePrice());
    const r = await result.current.mutateAsync({
      company: "c1",
      location: "l1",
      parkingType: "COB",
      days: 5,
    });

    expect(espiao.ultimoBody).toMatchObject({
      p_company: "c1",
      p_location: "l1",
      p_parking_type: "COB",
      p_days: 5,
    });
    expect(r).toEqual({ total: 199.5 });
  });
});
