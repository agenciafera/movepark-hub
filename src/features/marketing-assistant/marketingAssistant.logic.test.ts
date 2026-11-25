import { describe, expect, it } from "vitest";
import {
  type Cartao,
  carregarConversa,
  CHAVE_CONVERSA,
  linhasDoCartao,
  paginaDoCaminho,
  RECARREGOU,
  resumoDoResultado,
  rotuloDaFerramenta,
  salvarConversa,
  ultimasMensagens,
} from "./marketingAssistant.logic";

const UUID = "11111111-1111-1111-1111-111111111111";

describe("paginaDoCaminho", () => {
  it("reconhece a campanha aberta", () => {
    expect(paginaDoCaminho(`/manager/marketing/campanhas/${UUID}`)).toEqual({
      caminho: `/manager/marketing/campanhas/${UUID}`,
      campaign_id: UUID,
    });
  });
  it("fora de uma campanha manda só o caminho", () => {
    expect(paginaDoCaminho("/manager/marketing/segmentos")).toEqual({ caminho: "/manager/marketing/segmentos" });
  });
});

describe("rotuloDaFerramenta", () => {
  it("diz o que foi feito em português", () => {
    expect(rotuloDaFerramenta("marketing_get_rfm", true)).toBe("consultou o RFM");
    expect(rotuloDaFerramenta("marketing_save_segment", true)).toBe("salvou o segmento");
  });
  it("marca a falha", () => {
    expect(rotuloDaFerramenta("marketing_save_segment", false)).toBe("não conseguiu: salvou o segmento");
  });
  it("tool desconhecida aparece pelo nome", () => {
    expect(rotuloDaFerramenta("marketing_nova", true)).toBe("marketing_nova");
  });
});

describe("ultimasMensagens", () => {
  it("manda só papel e texto, nas últimas 20", () => {
    const falas = Array.from({ length: 25 }, (_, i) => ({
      id: `f${i}`,
      papel: (i % 2 === 0 ? "usuario" : "assistente") as "usuario" | "assistente",
      texto: `m${i}`,
      ferramentas: [],
      cartaoIds: [],
    }));
    const r = ultimasMensagens(falas);
    expect(r).toHaveLength(20);
    expect(r[19]).toEqual({ papel: "usuario", texto: "m24" });
  });
});

describe("conversa na sessão", () => {
  it("salva e carrega", () => {
    const conversa = {
      falas: [{ id: "f1", papel: "usuario" as const, texto: "oi", ferramentas: [], cartaoIds: [] }],
      cartoes: {},
    };
    salvarConversa(conversa, sessionStorage);
    expect(carregarConversa(sessionStorage)).toEqual(conversa);
  });
  it("cartão que executava quando a página recarregou não volta a oferecer o botão", () => {
    salvarConversa(
      {
        falas: [],
        cartoes: {
          c1: { id: "c1", tool: "marketing_run_campaign", args: {}, resumo: {}, status: "executando" },
        },
      },
      sessionStorage,
    );
    expect(carregarConversa(sessionStorage).cartoes.c1).toMatchObject({
      status: "falhou",
      resultado: RECARREGOU,
    });
  });
  it("conteúdo estragado volta vazio", () => {
    sessionStorage.setItem(CHAVE_CONVERSA, "{nao e json");
    expect(carregarConversa(sessionStorage)).toEqual({ falas: [], cartoes: {} });
  });
});

describe("linhasDoCartao", () => {
  const base: Cartao = {
    id: "c1",
    tool: "marketing_run_campaign",
    args: { campaign_id: "x" },
    status: "aberta",
    resumo: {
      campanha: "Volta 90 dias",
      segmento: "Sumidos",
      publico: 31,
      alcance_email: 30,
      alcance_whatsapp: 0,
      disparo_ligado: false,
      problemas: [],
    },
  };

  it("execução com disparo desligado avisa que nada sai", () => {
    const l = linhasDoCartao(base);
    expect(l.titulo).toBe("Executar a campanha");
    expect(l.linhas).toContain("Volta 90 dias");
    expect(l.linhas).toContain("Segmento Sumidos: 31 pessoas, 30 com e-mail e 0 com WhatsApp.");
    expect(l.linhas).toContain("Disparo real desligado: as mensagens ficam seguradas e ninguém recebe nada.");
    expect(l.podeConfirmar).toBe(true);
  });

  it("fluxo com problema não deixa confirmar", () => {
    const l = linhasDoCartao({ ...base, resumo: { ...base.resumo, problemas: ["E-mail sem assunto."] } });
    expect(l.podeConfirmar).toBe(false);
    expect(l.linhas).toContain("O fluxo tem problema e não roda: E-mail sem assunto.");
  });

  it("chave geral mostra o pedido, o motivo e o estado de agora", () => {
    const l = linhasDoCartao({
      id: "c2",
      tool: "marketing_set_dispatch_enabled",
      args: { enabled: true, reason: "dezembro" },
      status: "aberta",
      resumo: { ligar: true, motivo: "dezembro", disparo_ligado_agora: false },
    });
    expect(l.titulo).toBe("Ligar o disparo real");
    expect(l.linhas).toContain("Motivo: dezembro");
    expect(l.linhas).toContain("Agora ele está desligado.");
  });
});

describe("resumoDoResultado", () => {
  it("execução conta o que saiu e o que ficou segurado", () => {
    expect(
      resumoDoResultado("marketing_run_campaign", { sent: 0, skipped: 31, suppressed: 0, failed: 0 }),
    ).toBe("Feito: 0 enviadas, 31 seguradas, 0 bloqueadas.");
  });
  it("chave geral diz o estado novo", () => {
    expect(resumoDoResultado("marketing_set_dispatch_enabled", { enabled: false })).toBe(
      "Feito: disparo real desligado.",
    );
  });
});
