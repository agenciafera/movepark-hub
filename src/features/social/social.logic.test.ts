import { describe, expect, it } from "vitest";
import {
  abaDoStatus,
  dataNoFuturo,
  deCampoDeData,
  formatarDia,
  mensagemDoErro,
  jaSaiuPostHoje,
  paraCampoDeData,
  partirGancho,
  perguntaDePublicarAgora,
  podeAprovar,
  podePublicarAgora,
  ROTULO_EVENTO,
  sugestaoDeData,
} from "./social.logic";

const AGORA = new Date("2026-10-21T15:00:00Z");

describe("abaDoStatus", () => {
  it("põe o atrasado junto do que espera aprovação, e esconde o recusado", () => {
    expect(abaDoStatus("pending_review")).toBe("para-aprovar");
    expect(abaDoStatus("overdue")).toBe("para-aprovar");
    expect(abaDoStatus("approved")).toBe("agendados");
    expect(abaDoStatus("publishing")).toBe("agendados");
    expect(abaDoStatus("published")).toBe("publicados");
    expect(abaDoStatus("failed")).toBe("falhas");
    expect(abaDoStatus("rejected")).toBeNull();
  });
});

describe("partirGancho", () => {
  it("separa os 125 caracteres que aparecem antes do mais", () => {
    const legenda = "a".repeat(130);
    expect(partirGancho(legenda)).toEqual({ gancho: "a".repeat(125), resto: "aaaaa" });
  });
});

describe("podeAprovar", () => {
  const limpo = {
    status: "pending_review" as const,
    validation: { blockers: [], warnings: ["x"] },
    scheduled_at: "2026-10-22T15:00:00Z",
  };

  it("aprova post limpo com data futura, mesmo com aviso", () => {
    expect(podeAprovar(limpo, AGORA)).toEqual({ ok: true });
  });
  it("trava com bloqueio", () => {
    expect(podeAprovar({ ...limpo, validation: { blockers: ["b"], warnings: [] } }, AGORA).ok).toBe(
      false,
    );
  });
  it("trava com data passada", () => {
    expect(podeAprovar({ ...limpo, scheduled_at: "2026-10-21T14:00:00Z" }, AGORA).ok).toBe(false);
  });
  it("trava fora de pending_review", () => {
    expect(podeAprovar({ ...limpo, status: "approved" }, AGORA).ok).toBe(false);
  });
});

describe("campo de data", () => {
  it("mostra a hora de São Paulo e volta ao mesmo instante", () => {
    expect(paraCampoDeData("2026-10-28T15:00:00.000Z")).toBe("2026-10-28T12:00");
    expect(deCampoDeData("2026-10-28T12:00")).toBe("2026-10-28T15:00:00.000Z");
  });
});

describe("formatarDia", () => {
  it("escreve a data no formato brasileiro", () => {
    expect(formatarDia("2026-10-21")).toBe("21/10/2026");
  });
});

describe("mensagemDoErro", () => {
  it("usa o texto de qualquer erro que traga message, inclusive o objeto simples da RPC", () => {
    expect(mensagemDoErro(new Error("Falhou aqui"))).toBe("Falhou aqui");
    expect(mensagemDoErro({ message: "Já existe post agendado ou publicado nesse dia." })).toBe(
      "Já existe post agendado ou publicado nesse dia.",
    );
  });

  it("cai no texto padrão quando não há mensagem em texto", () => {
    expect(mensagemDoErro(undefined)).toBe("Não deu certo. Tente de novo.");
    expect(mensagemDoErro(null)).toBe("Não deu certo. Tente de novo.");
    expect(mensagemDoErro("quebrou")).toBe("Não deu certo. Tente de novo.");
    expect(mensagemDoErro({ message: 42 })).toBe("Não deu certo. Tente de novo.");
    expect(mensagemDoErro({ message: "  " })).toBe("Não deu certo. Tente de novo.");
    expect(mensagemDoErro({}, "Não deu para salvar.")).toBe("Não deu para salvar.");
  });
});

describe("sugestaoDeData", () => {
  it("mantém a data do post enquanto ela ainda está no futuro", () => {
    expect(sugestaoDeData("2026-10-28T15:00:00.000Z", AGORA)).toBe("2026-10-28T12:00");
  });

  it("sugere amanhã ao meio-dia de São Paulo quando a data já passou", () => {
    expect(sugestaoDeData("2026-10-20T15:00:00.000Z", AGORA)).toBe("2026-10-22T12:00");
    // Igual a agora também não serve: o servidor recusa data que não é posterior.
    expect(sugestaoDeData(AGORA.toISOString(), AGORA)).toBe("2026-10-22T12:00");
  });

  it("conta o dia em São Paulo, não em UTC", () => {
    // 22/10 02:30 UTC ainda é 21/10 23:30 em São Paulo, então amanhã é 22/10.
    const quaseMeiaNoite = new Date("2026-10-22T02:30:00Z");
    expect(sugestaoDeData("2026-10-01T12:00:00.000Z", quaseMeiaNoite)).toBe("2026-10-22T12:00");
    expect(dataNoFuturo("2026-10-22T12:00", quaseMeiaNoite)).toBe(true);
  });
});

describe("dataNoFuturo", () => {
  it("só aceita data completa depois de agora, lida em São Paulo", () => {
    expect(dataNoFuturo("2026-10-21T12:01", AGORA)).toBe(true);
    expect(dataNoFuturo("2026-10-21T12:00", AGORA)).toBe(false);
    expect(dataNoFuturo("2026-10-20T12:00", AGORA)).toBe(false);
    expect(dataNoFuturo("", AGORA)).toBe(false);
    expect(dataNoFuturo("2026-10-28", AGORA)).toBe(false);
  });
});

describe("ROTULO_EVENTO", () => {
  it("as chamadas à Meta descrevem o pedido, não o resultado (a linha serve também para o HTTP 500)", () => {
    expect(ROTULO_EVENTO.container_child).toBe("Envio do slide à Meta");
    expect(ROTULO_EVENTO.container_parent).toBe("Envio do post à Meta");
    expect(ROTULO_EVENTO.container_status).toBe("Consulta da situação do envio");
    expect(ROTULO_EVENTO.media_publish).toBe("Pedido de publicação à Meta");
    expect(ROTULO_EVENTO.permalink).toBe("Leitura do link do post");
    for (const k of [
      "container_child",
      "container_parent",
      "container_status",
      "media_publish",
      "permalink",
    ]) {
      expect(ROTULO_EVENTO[k], k).not.toMatch(/criado|publicado|lido\b/i);
    }
  });

  it("todo tipo de evento da tabela tem rótulo em português", () => {
    const tipos = [
      "draft_received",
      "caption_edited",
      "approved",
      "rejected",
      "rescheduled",
      "dry_run",
      "container_child",
      "container_parent",
      "container_status",
      "media_publish",
      "permalink",
      "consulta",
      "reconciled",
      "overdue",
      "failed",
      "publish_now",
    ];
    for (const k of tipos) expect(ROTULO_EVENTO[k], k).toBeTruthy();
    expect(Object.keys(ROTULO_EVENTO).sort()).toEqual([...tipos].sort());
  });

  it("o pedido de publicar agora tem o rótulo do briefing", () => {
    expect(ROTULO_EVENTO.publish_now).toBe("Publicar agora pedido");
  });
});

describe("podePublicarAgora", () => {
  const sem = { blockers: [], warnings: ["aviso não trava"] };
  const com = { blockers: ["Promessa de transação"], warnings: [] };

  it("vale nos estados que a RPC aceita, sem bloqueio da conferência", () => {
    for (const status of ["pending_review", "approved", "overdue", "failed"] as const) {
      expect(podePublicarAgora({ status, validation: sem }), status).toBe(true);
    }
  });

  it("não vale com bloqueio, nem em post publicado, publicando ou recusado", () => {
    expect(podePublicarAgora({ status: "pending_review", validation: com })).toBe(false);
    expect(podePublicarAgora({ status: "approved", validation: com })).toBe(false);
    for (const status of ["published", "publishing", "rejected"] as const) {
      expect(podePublicarAgora({ status, validation: sem }), status).toBe(false);
    }
  });
});

describe("jaSaiuPostHoje e a pergunta de publicar agora", () => {
  // 21/10/2026 às 12h em São Paulo.
  const post = (id: string, published_at: string | null) => ({ id, published_at });

  it("conta outro post publicado no mesmo dia de São Paulo, e não o próprio post", () => {
    expect(jaSaiuPostHoje([post("a", "2026-10-21T10:00:00Z")], "x", AGORA)).toBe(true);
    // 23h30 de 20/10 em São Paulo ainda é ontem, mesmo sendo 21/10 em UTC.
    expect(jaSaiuPostHoje([post("a", "2026-10-21T02:30:00Z")], "x", AGORA)).toBe(false);
    expect(jaSaiuPostHoje([post("x", "2026-10-21T10:00:00Z")], "x", AGORA)).toBe(false);
    expect(jaSaiuPostHoje([post("a", null)], "x", AGORA)).toBe(false);
    expect(jaSaiuPostHoje(undefined, "x", AGORA)).toBe(false);
  });

  it("a pergunta diz a conta e, quando já saiu post hoje, avisa da disputa de alcance", () => {
    const base =
      "Publicar agora no Instagram? O post vai ao ar em seguida na conta @moveparkestacionamento.";
    expect(perguntaDePublicarAgora([], "x", AGORA)).toBe(base);
    expect(perguntaDePublicarAgora([post("a", "2026-10-21T10:00:00Z")], "x", AGORA)).toBe(
      `${base} Já saiu um post hoje, e os dois vão disputar alcance.`,
    );
  });
});
