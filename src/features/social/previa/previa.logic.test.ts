import { describe, expect, it } from "vitest";
import { LIMITE_GANCHO } from "../social.logic";
import {
  AVATAR,
  comentariosFicticios,
  formatarDataPrevia,
  numerosFicticios,
  partirLegendaFeed,
  postsDaGrade,
  proximoIndice,
  STORY_INICIAL,
  STORY_MS,
  STORY_TICK_MS,
  storyReducer,
  tokenizarLegenda,
  USUARIO,
} from "./previa.logic";

const IDS = Array.from({ length: 300 }, (_, i) => `post-${i}-${i * 7919}`);

describe("constantes da prévia", () => {
  it("usa a conta e o avatar da Movepark", () => {
    expect(USUARIO).toBe("moveparkestacionamento");
    expect(AVATAR).toBe("/icon-192.png");
    expect(STORY_MS).toBe(5000);
  });
});

describe("numerosFicticios", () => {
  it("dá o mesmo número para o mesmo id, para a prévia não mudar a cada abertura", () => {
    expect(numerosFicticios("abc")).toEqual(numerosFicticios("abc"));
    expect(numerosFicticios("abc")).toEqual(numerosFicticios("abc"));
  });

  it("fica dentro das faixas: curtidas de 80 a 420 e comentários de 3 a 24", () => {
    for (const id of IDS) {
      const { curtidas, comentarios } = numerosFicticios(id);
      expect(Number.isInteger(curtidas)).toBe(true);
      expect(curtidas).toBeGreaterThanOrEqual(80);
      expect(curtidas).toBeLessThanOrEqual(420);
      expect(Number.isInteger(comentarios)).toBe(true);
      expect(comentarios).toBeGreaterThanOrEqual(3);
      expect(comentarios).toBeLessThanOrEqual(24);
    }
  });

  it("varia de um id para outro, e não é um número só", () => {
    const curtidas = new Set(IDS.map((id) => numerosFicticios(id).curtidas));
    const comentarios = new Set(IDS.map((id) => numerosFicticios(id).comentarios));
    expect(curtidas.size).toBeGreaterThan(50);
    expect(comentarios.size).toBeGreaterThan(10);
  });
});

describe("comentariosFicticios", () => {
  it("devolve 2 comentários, sempre os mesmos para o mesmo id", () => {
    const a = comentariosFicticios("abc");
    expect(a).toHaveLength(2);
    expect(comentariosFicticios("abc")).toEqual(a);
  });

  it("não repete o comentário nem o usuário dentro do mesmo post", () => {
    for (const id of IDS) {
      const [x, y] = comentariosFicticios(id);
      expect(x.texto).not.toBe(y.texto);
      expect(x.usuario).not.toBe(y.usuario);
    }
  });

  it("usa mais de dois comentários do banco ao longo dos posts", () => {
    const textos = new Set(IDS.flatMap((id) => comentariosFicticios(id).map((c) => c.texto)));
    expect(textos.size).toBe(8);
  });

  it("não promete nada nem cita preço, desconto ou concorrente", () => {
    const todos = IDS.flatMap((id) => comentariosFicticios(id));
    for (const c of todos) {
      expect(c.texto).not.toMatch(/garantid/i);
      expect(c.texto).not.toMatch(/R\$|\d|desconto|grátis|gratis|cancel/i);
      expect(c.texto).not.toMatch(/[\u2014\u2013]/);
      expect(c.usuario).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });
});

describe("partirLegendaFeed", () => {
  it("legenda de até 125 caracteres aparece inteira, sem o mais", () => {
    const curta = "a".repeat(LIMITE_GANCHO);
    expect(partirLegendaFeed(curta)).toEqual({ visivel: curta, temMais: false });
    expect(partirLegendaFeed("")).toEqual({ visivel: "", temMais: false });
  });

  it("legenda longa corta em até 125 caracteres sem partir palavra", () => {
    const longa = "Estacionar no aeroporto de Confins sai mais barato do que parece ".repeat(6).trim();
    const { visivel, temMais } = partirLegendaFeed(longa);
    expect(temMais).toBe(true);
    expect(visivel.length).toBeLessThanOrEqual(LIMITE_GANCHO);
    expect(longa.startsWith(visivel)).toBe(true);
    // O que sobrou começa em espaço: a última palavra do trecho veio inteira.
    expect(longa.charAt(visivel.length)).toMatch(/\s/);
    expect(visivel).toBe(visivel.trimEnd());
  });

  it("se o 125º caractere já fecha uma palavra, corta exatamente em 125", () => {
    const legenda = `${"a".repeat(100)} ${"b".repeat(24)} cde`;
    expect(legenda.charAt(LIMITE_GANCHO)).toBe(" ");
    expect(partirLegendaFeed(legenda)).toEqual({
      visivel: legenda.slice(0, LIMITE_GANCHO),
      temMais: true,
    });
  });

  it("volta até o último espaço quando ele está nos últimos 20 caracteres", () => {
    const legenda = `${"a".repeat(110)} ${"b".repeat(30)}`;
    expect(partirLegendaFeed(legenda)).toEqual({ visivel: "a".repeat(110), temMais: true });
  });

  it("quebra de linha também fecha a palavra", () => {
    const legenda = `${"a".repeat(110)}\n${"b".repeat(30)}`;
    expect(partirLegendaFeed(legenda).visivel).toBe("a".repeat(110));
  });

  it("sem espaço nos últimos 20 caracteres, corta seco em 125", () => {
    const legenda = `${"a".repeat(100)} ${"b".repeat(60)}`;
    expect(partirLegendaFeed(legenda).visivel).toBe(legenda.slice(0, LIMITE_GANCHO));
    expect(partirLegendaFeed("a".repeat(300)).visivel).toHaveLength(LIMITE_GANCHO);
  });
});

describe("tokenizarLegenda", () => {
  it("separa hashtag acentuada e menção do texto corrido", () => {
    expect(
      tokenizarLegenda("Veja #GrátisNão e fale com @moveparkestacionamento hoje"),
    ).toEqual([
      { tipo: "texto", valor: "Veja " },
      { tipo: "hashtag", valor: "#GrátisNão" },
      { tipo: "texto", valor: " e fale com " },
      { tipo: "mencao", valor: "@moveparkestacionamento" },
      { tipo: "texto", valor: " hoje" },
    ]);
  });

  it("hashtag termina na pontuação e aceita número e sublinhado", () => {
    expect(tokenizarLegenda("#voo_123, #ônibus.")).toEqual([
      { tipo: "hashtag", valor: "#voo_123" },
      { tipo: "texto", valor: ", " },
      { tipo: "hashtag", valor: "#ônibus" },
      { tipo: "texto", valor: "." },
    ]);
  });

  it("o ponto final depois de uma menção não faz parte dela", () => {
    expect(tokenizarLegenda("Fale com @movepark.co.")).toEqual([
      { tipo: "texto", valor: "Fale com " },
      { tipo: "mencao", valor: "@movepark.co" },
      { tipo: "texto", valor: "." },
    ]);
  });

  it("e-mail não vira menção", () => {
    expect(tokenizarLegenda("Escreva para contato@fera.ag agora")).toEqual([
      { tipo: "texto", valor: "Escreva para contato@fera.ag agora" },
    ]);
  });

  it("preserva as quebras de linha dentro do texto", () => {
    expect(tokenizarLegenda("Primeira linha\n\nSegunda #tag")).toEqual([
      { tipo: "texto", valor: "Primeira linha\n\nSegunda " },
      { tipo: "hashtag", valor: "#tag" },
    ]);
  });

  it("juntar os pedaços devolve a legenda original", () => {
    const legenda =
      "Confins: a conta muda pelo traslado.\n\n#confins #estacionamentoaeroporto @movepark. contato@fera.ag";
    expect(
      tokenizarLegenda(legenda)
        .map((t) => t.valor)
        .join(""),
    ).toBe(legenda);
  });

  it("texto vazio não gera pedaço", () => {
    expect(tokenizarLegenda("")).toEqual([]);
  });
});

describe("proximoIndice", () => {
  it("anda um passo para cada lado", () => {
    expect(proximoIndice(2, 6, 1)).toBe(3);
    expect(proximoIndice(2, 6, -1)).toBe(1);
  });

  it("para nos limites, sem dar a volta", () => {
    expect(proximoIndice(0, 6, -1)).toBe(0);
    expect(proximoIndice(5, 6, 1)).toBe(5);
    expect(proximoIndice(0, 1, 1)).toBe(0);
  });

  it("sem itens, fica em zero", () => {
    expect(proximoIndice(0, 0, 1)).toBe(0);
  });
});

describe("formatarDataPrevia", () => {
  it("mostra o dia por extenso, em minúsculas", () => {
    expect(formatarDataPrevia("2026-10-22T15:00:00Z")).toBe("22 de outubro");
  });

  it("usa o dia de São Paulo, e não o de Greenwich", () => {
    // 01:30 UTC de 22/10 ainda é noite de 21/10 em São Paulo (-03:00).
    expect(formatarDataPrevia("2026-10-22T01:30:00Z")).toBe("21 de outubro");
  });
});

describe("postsDaGrade", () => {
  const slides = [{ url: "u", path: "p", alt: null, texto: null }];
  function item(id: string, status: string, scheduled_at: string, published_at: string | null = null) {
    return { id, status, slides, scheduled_at, published_at } as Parameters<
      typeof postsDaGrade
    >[1][number];
  }

  it("fica com publicados, publicando e agendados, e deixa de fora este post e o resto", () => {
    const fila = [
      item("a", "published", "2026-10-01T15:00:00Z"),
      item("b", "publishing", "2026-10-02T15:00:00Z"),
      item("c", "approved", "2026-10-03T15:00:00Z"),
      item("este", "approved", "2026-10-04T15:00:00Z"),
      item("d", "rejected", "2026-10-05T15:00:00Z"),
      item("e", "pending_review", "2026-10-06T15:00:00Z"),
      item("f", "failed", "2026-10-07T15:00:00Z"),
      item("g", "overdue", "2026-10-08T15:00:00Z"),
    ];
    expect(postsDaGrade("este", fila).map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("ordena do mais recente para o mais antigo e corta em 5", () => {
    const fila = Array.from({ length: 8 }, (_, i) =>
      item(`p${i}`, "published", `2026-10-0${i + 1}T15:00:00Z`),
    );
    expect(postsDaGrade("x", fila).map((p) => p.id)).toEqual(["p7", "p6", "p5", "p4", "p3"]);
  });

  it("para o publicado vale a hora em que saiu, e não a que estava marcada", () => {
    const fila = [
      item("marcado-cedo", "published", "2026-10-01T15:00:00Z", "2026-10-09T15:00:00Z"),
      item("marcado-tarde", "published", "2026-10-05T15:00:00Z", "2026-10-05T15:01:00Z"),
    ];
    expect(postsDaGrade("x", fila).map((p) => p.id)).toEqual(["marcado-cedo", "marcado-tarde"]);
  });

  it("não altera a lista recebida", () => {
    const fila = [
      item("a", "published", "2026-10-01T15:00:00Z"),
      item("b", "published", "2026-10-02T15:00:00Z"),
    ];
    postsDaGrade("x", fila);
    expect(fila.map((p) => p.id)).toEqual(["a", "b"]);
  });
});

describe("storyReducer", () => {
  const TOTAL = 3;
  const tick = (e = STORY_INICIAL) => storyReducer(e, { tipo: "tick" }, TOTAL);
  const ate = (e: typeof STORY_INICIAL, ms: number) => {
    let atual = e;
    for (let t = 0; t < ms; t += STORY_TICK_MS) atual = tick(atual);
    return atual;
  };

  it("enche a barra do story atual a cada tick", () => {
    expect(tick()).toEqual({ indice: 0, decorrido: STORY_TICK_MS, terminou: false });
  });

  it("depois de STORY_MS passa para o próximo e zera a barra", () => {
    expect(ate(STORY_INICIAL, STORY_MS)).toEqual({ indice: 1, decorrido: 0, terminou: false });
  });

  it("no último, para no fim e marca que terminou", () => {
    const ultimo = ate({ indice: 2, decorrido: 0, terminou: false }, STORY_MS);
    expect(ultimo).toEqual({ indice: 2, decorrido: STORY_MS, terminou: true });
    expect(tick(ultimo)).toBe(ultimo);
  });

  it("próximo e anterior zeram a barra e respeitam os limites", () => {
    const meio = { indice: 1, decorrido: 2000, terminou: false };
    expect(storyReducer(meio, { tipo: "proximo" }, TOTAL)).toEqual({
      indice: 2,
      decorrido: 0,
      terminou: false,
    });
    expect(storyReducer(meio, { tipo: "anterior" }, TOTAL)).toEqual({
      indice: 0,
      decorrido: 0,
      terminou: false,
    });
    // Voltar no primeiro recomeça o primeiro, em vez de ir para um índice negativo.
    expect(
      storyReducer({ indice: 0, decorrido: 3000, terminou: false }, { tipo: "anterior" }, TOTAL),
    ).toEqual(STORY_INICIAL);
  });

  it("próximo no último termina; anterior depois de terminar retoma o story de trás", () => {
    const fim = storyReducer({ indice: 2, decorrido: 100, terminou: false }, { tipo: "proximo" }, TOTAL);
    expect(fim).toEqual({ indice: 2, decorrido: STORY_MS, terminou: true });
    expect(storyReducer(fim, { tipo: "anterior" }, TOTAL)).toEqual({
      indice: 1,
      decorrido: 0,
      terminou: false,
    });
  });

  it("reiniciar volta ao primeiro", () => {
    const fim = { indice: 2, decorrido: STORY_MS, terminou: true };
    expect(storyReducer(fim, { tipo: "reiniciar" }, TOTAL)).toEqual(STORY_INICIAL);
  });

  it("com um slide só, o tempo dele acaba e termina", () => {
    expect(storyReducer(STORY_INICIAL, { tipo: "proximo" }, 1).terminou).toBe(true);
  });
});
