import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { falha, renderMutation, rpc } from "@/test/msw/supabase";
import { useDecidePriceResearch, usePriceResearchPending } from "./api";

/**
 * Contrato de rede da fila do robô de pesquisa de preço.
 *
 * Quem prova que aplicar substitui os quatro valores e carimba a data do acesso é o pgTAP.
 * Aqui a pergunta é outra: o cliente manda o que disse que manda e deixa a recusa chegar.
 * Numa tela de decisão isso importa mais que o normal, porque o botão "Aplicar" publica um
 * preço de terceiro, e um erro engolido viraria "cliquei e não sei se foi".
 */

/** Uma linha crua da RPC: `numeric` sai como string no PostgREST. */
const LINHA_CRUA = {
  id: "r-1",
  prospect_location_id: "pl-1",
  prospect_name: "Park Confins",
  destination_name: "Aeroporto de Confins",
  status: "pending",
  source_url: "https://exemplo.com.br/precos",
  fetched_at: "2026-11-12T10:00:00Z",
  daily_brl: "34.90",
  weekly_brl: "169.30",
  biweekly_brl: null,
  monthly_brl: null,
  evidence: "Diarias a partir de R$ 34,90",
  model: "gemini-2.5-flash",
  notes: null,
  created_at: "2026-11-12T10:00:00Z",
  atual_daily_brl: "35.00",
  atual_weekly_brl: "149.00",
  atual_biweekly_brl: null,
  atual_monthly_brl: null,
  atual_researched_at: "2026-08-29",
};

describe("usePriceResearchPending", () => {
  it("converte os preços para número, os do robô e os que já estão publicados", async () => {
    // Sem isso a tela compararia "34.90" com "35.00" como texto e o operador decidiria
    // olhando string.
    rpc("manager_price_research_pending", { json: [LINHA_CRUA] });

    const { result } = renderMutation(() => usePriceResearchPending());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const linha = result.current.data![0];
    expect(linha.daily_brl).toBe(34.9);
    expect(linha.weekly_brl).toBe(169.3);
    expect(linha.biweekly_brl).toBeNull();
    expect(linha.atual_daily_brl).toBe(35);
    expect(linha.evidence).toBe("Diarias a partir de R$ 34,90");
  });

  it("propaga a recusa de quem não é hub_admin", async () => {
    // Fila vazia por falta de permissão se disfarçaria de "o robô não achou nada", que é
    // a leitura errada: alguém fecharia a tela achando que não há o que decidir.
    falha("rpc", "manager_price_research_pending", 403, "Sem permissão para a pesquisa de preço.");

    const { result } = renderMutation(() => usePriceResearchPending());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useDecidePriceResearch", () => {
  it("manda id e ação no corpo, sem nota quando não há", async () => {
    const decidir = rpc("manager_price_research_decide", { json: null });

    const { result } = renderMutation(() => useDecidePriceResearch());
    await result.current.mutateAsync({ id: "r-1", action: "apply" });

    expect(decidir.ultimoBody).toEqual({ p_id: "r-1", p_action: "apply" });
  });

  it("leva a nota da recusa quando existe", async () => {
    const decidir = rpc("manager_price_research_decide", { json: null });

    const { result } = renderMutation(() => useDecidePriceResearch());
    await result.current.mutateAsync({
      id: "r-1",
      action: "reject",
      note: "preço é de mensalista",
    });

    expect(decidir.ultimoBody).toEqual({
      p_id: "r-1",
      p_action: "reject",
      p_note: "preço é de mensalista",
    });
  });

  it("deixa a recusa do servidor chegar à tela", async () => {
    falha(
      "rpc",
      "manager_price_research_decide",
      400,
      "Proposta sem fonte e sem data não pode ser aplicada.",
    );

    const { result } = renderMutation(() => useDecidePriceResearch());
    await expect(result.current.mutateAsync({ id: "r-1", action: "apply" })).rejects.toThrow();
  });
});
