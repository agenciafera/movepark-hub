import { describe, expect, it } from "vitest";
import {
  colunasDaAmostra,
  ehPerigosa,
  esperandoTitulo,
  grupoDaTool,
  houveGravacao,
  linhasDoCartao,
  linkDaGravacao,
  parteDeTool,
  pedidoDoTurno,
  propostaDaSaida,
  rotuloDaTool,
} from "./conversa.logic";

describe("parteDeTool", () => {
  it("lê a parte de tool estática do AI SDK", () => {
    const p = parteDeTool({ type: "tool-marketing_get_rfm", toolCallId: "c1", state: "output-available", input: {}, output: { a: 1 } });
    expect(p).toEqual({ nome: "marketing_get_rfm", id: "c1", estado: "pronta", entrada: {}, saida: { a: 1 }, erro: null });
  });

  it("lê a parte dinâmica", () => {
    expect(parteDeTool({ type: "dynamic-tool", toolName: "marketing_get_rfm", toolCallId: "c1", state: "input-available" })?.estado).toBe("rodando");
  });

  it("erro do servidor e erro devolvido como dado viram estado erro", () => {
    expect(parteDeTool({ type: "tool-x", state: "output-error", errorText: "caiu" })?.erro).toBe("caiu");
    expect(parteDeTool({ type: "tool-x", state: "output-available", output: { ok: false, erro: "Segmento inválido." } })).toMatchObject({
      estado: "erro",
      erro: "Segmento inválido.",
    });
  });

  it("parte de texto não é tool", () => {
    expect(parteDeTool({ type: "text", text: "oi" })).toBeNull();
  });
});

describe("grupos e rótulos", () => {
  it("cada tool cai no componente certo", () => {
    expect(grupoDaTool("marketing_preview_segment")).toBe("segmento");
    expect(grupoDaTool("marketing_get_funnel")).toBe("funil");
    expect(grupoDaTool("marketing_save_coupon")).toBe("gravacao");
    expect(grupoDaTool("marketing_run_campaign")).toBe("proposta");
    expect(grupoDaTool("marketing_list_leads")).toBe("generico");
  });

  it("o rótulo muda enquanto roda, quando termina e quando falha", () => {
    expect(rotuloDaTool("marketing_preview_segment", "rodando")).toBe("Medindo o segmento…");
    expect(rotuloDaTool("marketing_preview_segment", "pronta")).toBe("Mediu o segmento");
    expect(rotuloDaTool("marketing_save_segment", "erro")).toBe("Não conseguiu salvar o segmento");
    expect(rotuloDaTool("marketing_xyz", "rodando")).toBe("Consultando a base…");
  });
});

describe("houveGravacao", () => {
  it("só conta gravação que terminou bem", () => {
    const gravou = { parts: [{ type: "tool-marketing_save_segment", state: "output-available", output: { segment_id: "s" } }] };
    const leu = { parts: [{ type: "tool-marketing_get_rfm", state: "output-available", output: {} }] };
    const falhou = { parts: [{ type: "tool-marketing_save_segment", state: "output-available", output: { ok: false, erro: "x" } }] };
    expect(houveGravacao(gravou)).toBe(true);
    expect(houveGravacao(leu)).toBe(false);
    expect(houveGravacao(falhou)).toBe(false);
  });
});

describe("linkDaGravacao", () => {
  it("leva à tela do item gravado", () => {
    expect(linkDaGravacao("marketing_save_campaign", {}, { campaign_id: "c-1" })).toEqual({
      rotulo: "Abrir a campanha",
      href: "/manager/marketing/campanhas/c-1",
    });
    expect(linkDaGravacao("marketing_save_coupon", {}, {})?.href).toBe("/manager/marketing/cupons");
    expect(linkDaGravacao("marketing_move_lead", {}, {})?.href).toBe("/manager/marketing/leads");
  });
});

describe("proposta", () => {
  it("lê a proposta devolvida pela tool", () => {
    expect(propostaDaSaida({ status: "proposta", proposta_id: "p-1", tool: "marketing_run_campaign", resumo: { publico: 3 } })).toEqual({
      id: "p-1",
      tool: "marketing_run_campaign",
      resumo: { publico: 3 },
    });
    expect(propostaDaSaida({ ok: false, erro: "x" })).toBeNull();
  });

  it("cartão da campanha com problema não oferece Confirmar", () => {
    const c = linhasDoCartao("marketing_run_campaign", {
      campanha: "Volta",
      segmento: "Sumidos",
      publico: 31,
      alcance_email: 30,
      alcance_whatsapp: 0,
      disparo_ligado: false,
      problemas: ["Falta o gatilho."],
    });
    expect(c.podeConfirmar).toBe(false);
    expect(c.linhas).toContain("Disparo real desligado: as mensagens ficam seguradas e ninguém recebe nada.");
  });

  it("ligar a chave geral é perigoso", () => {
    expect(ehPerigosa("marketing_set_dispatch_enabled", { ligar: true })).toBe(true);
    expect(ehPerigosa("marketing_run_campaign", { disparo_ligado: false })).toBe(false);
    expect(ehPerigosa("marketing_run_campaign", { disparo_ligado: true })).toBe(true);
  });
});

describe("colunasDaAmostra", () => {
  it("mostra as colunas conhecidas que existem na amostra, na ordem", () => {
    const cols = colunasDaAmostra([{ doc: { phone: "x", email: "a@b", bookings_count: 2, outro: 1 } }]);
    expect(cols.map((c) => c.rotulo)).toEqual(["E-mail", "Telefone", "Reservas"]);
  });
});

describe("pedidoDoTurno", () => {
  it("manda só a última fala, com a conversa", () => {
    const msgs = [
      { id: "1", role: "user", parts: [{ type: "text", text: "a" }] },
      { id: "2", role: "assistant", parts: [] },
      { id: "3", role: "user", parts: [{ type: "text", text: "b" }] },
    ];
    expect(pedidoDoTurno("conv", msgs)).toEqual({ acao: "conversar", conversa_id: "conv", mensagem: msgs[2] });
  });
});

describe("esperandoTitulo", () => {
  it("recarrega só enquanto há conversa recente sem título", () => {
    const agora = new Date("2026-11-26T12:00:00Z").getTime();
    expect(esperandoTitulo([{ titulo: "", atualizada_em: "2026-11-26T11:59:30Z" }], agora)).toBe(true);
    expect(esperandoTitulo([{ titulo: "Volta", atualizada_em: "2026-11-26T11:59:30Z" }], agora)).toBe(false);
    expect(esperandoTitulo([{ titulo: "", atualizada_em: "2026-11-26T11:58:00Z" }], agora)).toBe(false);
  });
});
