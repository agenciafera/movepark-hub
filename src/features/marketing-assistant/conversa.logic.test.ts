import { describe, expect, it } from "vitest";
import {
  colunasDaAmostra,
  ehPerigosa,
  esperandoTitulo,
  grupoDaTool,
  houveGravacao,
  linhasDoCartao,
  linkDaGravacao,
  normalizarMarkdown,
  ondeMostrar,
  organizarMensagem,
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
  it("as tools novas aparecem em destaque", () => {
    for (const nome of ["marketing_get_opportunities", "marketing_get_breakdown", "marketing_get_trend", "marketing_get_calendar", "marketing_measure_campaign"]) {
      expect(ondeMostrar(grupoDaTool(nome))).toBe("destaque");
    }
    expect(rotuloDaTool("marketing_get_opportunities", "rodando")).toBe("Procurando as oportunidades de hoje…");
  });

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

describe("normalizarMarkdown", () => {
  it("troca título por negrito, tira linha e crase", () => {
    const entrada = "Oi.\n\n### Filtros indicados:\n1. **Carrinho:** `abandoned = true`\n\n---\n\n## Diagnóstico\nTexto.";
    expect(normalizarMarkdown(entrada)).toBe("Oi.\n\n**Filtros indicados:**\n1. **Carrinho:** abandoned = true\n\n**Diagnóstico**\nTexto.");
  });

  it("não deixa três quebras seguidas", () => {
    expect(normalizarMarkdown("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("ondeMostrar", () => {
  it("o que o admin precisa ver fica aberto; gráfico fica a um clique; bastidor não aparece", () => {
    expect(ondeMostrar("proposta")).toBe("destaque");
    expect(ondeMostrar("gravacao")).toBe("destaque");
    expect(ondeMostrar("segmento")).toBe("destaque");
    expect(ondeMostrar("mensagem")).toBe("destaque");
    expect(ondeMostrar("rfm")).toBe("sob_demanda");
    expect(ondeMostrar("campanha")).toBe("sob_demanda");
    expect(ondeMostrar("generico")).toBe("nada");
    expect(ondeMostrar("campanhas")).toBe("nada");
  });
});

describe("organizarMensagem", () => {
  const tool = (nome: string, output: unknown, state = "output-available") => ({
    type: `tool-${nome}`,
    toolCallId: `${nome}-${Math.random()}`,
    state,
    input: {},
    output,
  });

  it("separa passos, texto e destaques, e o segmento medido três vezes aparece uma vez só", () => {
    const m = organizarMensagem([
      tool("marketing_list_locations", { unidades: [] }),
      tool("marketing_preview_segment", { problems: [], preview: { total: 1 } }),
      tool("marketing_list_leads", { leads: [] }),
      tool("marketing_preview_segment", { problems: [], preview: { total: 3 } }),
      { type: "step-start" },
      { type: "text", text: "### Título\nTexto." },
    ]);
    expect(m.passos.map((p) => p.nome)).toEqual([
      "marketing_list_locations",
      "marketing_preview_segment",
      "marketing_list_leads",
      "marketing_preview_segment",
    ]);
    expect(m.textos).toEqual(["**Título**\nTexto."]);
    expect(m.destaques.map((d) => (d.saida as { preview: { total: number } }).preview.total)).toEqual([3]);
  });

  it("cada proposta e cada gravação viram destaque próprio", () => {
    const m = organizarMensagem([
      tool("marketing_save_segment", { segment_id: "s1" }),
      tool("marketing_save_coupon", { coupon_id: "c1" }),
      tool("marketing_run_campaign", { status: "proposta", proposta_id: "p1", tool: "marketing_run_campaign", resumo: {} }),
    ]);
    expect(m.destaques.map((d) => d.nome)).toEqual(["marketing_save_segment", "marketing_save_coupon", "marketing_run_campaign"]);
  });

  it("tool que ainda roda ou falhou não vira destaque", () => {
    const m = organizarMensagem([
      tool("marketing_preview_segment", undefined, "input-available"),
      tool("marketing_save_segment", { ok: false, erro: "x" }),
    ]);
    expect(m.destaques).toEqual([]);
    expect(m.passos).toHaveLength(2);
  });
});
