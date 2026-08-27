import { describe, expect, it } from "vitest";
import type { ConversaDaLista } from "./api";
import { contarNaoLidas, filtrar, naoLida, quando, rotuloDoTelefone } from "./inbox.logic";

const linha = (over: Partial<ConversaDaLista> = {}): ConversaDaLista => ({
  id: "movepark-hub:whatsapp:whatsapp:456:5541988149449",
  telefone: "5541988149449",
  titulo: "whatsapp conversation",
  ultima_em: "2026-08-27T20:00:00.000Z",
  ultimo_papel: "signal",
  ultimo_texto: "quero reservar no Virapark",
  total: 4,
  lida_ate: null,
  assumida_por: null,
  assumida_em: null,
  ...over,
});

describe("não lida", () => {
  it("é não lida quando a última fala é do cliente e ninguém marcou", () => {
    expect(naoLida(linha())).toBe(true);
  });

  it("não é não lida quando o agente já respondeu", () => {
    // A conversa foi atendida: destacá-la em negrito seria pedir atenção à toa.
    expect(naoLida(linha({ ultimo_papel: "assistant" }))).toBe(false);
  });

  it("volta a ser não lida quando o cliente escreve depois da marca", () => {
    expect(naoLida(linha({ lida_ate: "2026-08-27T19:00:00.000Z" }))).toBe(true);
  });

  it("deixa de ser não lida quando a marca é posterior", () => {
    expect(naoLida(linha({ lida_ate: "2026-08-27T21:00:00.000Z" }))).toBe(false);
  });

  it("conversa sem mensagem nenhuma não conta", () => {
    expect(naoLida(linha({ ultima_em: null, total: 0 }))).toBe(false);
  });

  it("conta quantas estão não lidas, que é o número do menu", () => {
    expect(contarNaoLidas([linha(), linha({ ultimo_papel: "assistant" }), linha()])).toBe(2);
    expect(contarNaoLidas(undefined)).toBe(0);
  });
});

describe("telefone", () => {
  it("mostra no formato que a pessoa reconhece", () => {
    expect(rotuloDoTelefone("5541988149449")).toBe("(41) 98814-9449");
    expect(rotuloDoTelefone("554133334444")).toBe("(41) 3333-4444");
  });

  it("não inventa quando o número é curto", () => {
    expect(rotuloDoTelefone("123")).toBe("123");
    expect(rotuloDoTelefone("")).toBe("sem número");
  });
});

describe("quando", () => {
  it("mostra a hora no mesmo dia e a data nos outros", () => {
    const agora = new Date("2026-08-27T20:00:00.000Z");
    expect(quando("2026-08-27T13:05:00.000Z", agora)).toMatch(/\d{2}:\d{2}/);
    expect(quando("2026-08-20T13:05:00.000Z", agora)).toMatch(/\d{2}\/\d{2}/);
  });

  it("data inválida ou ausente não vira 'Invalid Date' na tela", () => {
    expect(quando(null)).toBe("");
    expect(quando("nao-e-data")).toBe("");
  });
});

describe("busca e filtro", () => {
  const lista = [
    linha({ id: "a", telefone: "5541988149449", ultimo_texto: "quero reservar" }),
    linha({ id: "b", telefone: "5511987727182", ultimo_texto: "cadê meu voucher", ultimo_papel: "assistant" }),
    linha({ id: "c", telefone: "5519999999999", ultimo_texto: "obrigado", assumida_por: "uid-1" }),
  ];

  it("sem termo, devolve tudo", () => {
    expect(filtrar(lista, "todas", "").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("filtra as não lidas", () => {
    // 'b' já foi respondida pelo agente.
    expect(filtrar(lista, "nao-lidas", "").map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("filtra as assumidas, para elas não sumirem no meio da lista", () => {
    expect(filtrar(lista, "assumidas", "").map((c) => c.id)).toEqual(["c"]);
  });

  it("acha pelo telefone mesmo digitado com formatação", () => {
    expect(filtrar(lista, "todas", "41 98814").map((c) => c.id)).toEqual(["a"]);
    expect(filtrar(lista, "todas", "(11) 98772").map((c) => c.id)).toEqual(["b"]);
  });

  it("acha pelo texto da prévia, sem diferenciar caixa", () => {
    expect(filtrar(lista, "todas", "VOUCHER").map((c) => c.id)).toEqual(["b"]);
  });

  it("busca e filtro valem juntos", () => {
    expect(filtrar(lista, "nao-lidas", "voucher")).toEqual([]);
  });

  it("lista ausente não quebra", () => {
    expect(filtrar(undefined, "todas", "x")).toEqual([]);
  });
});
