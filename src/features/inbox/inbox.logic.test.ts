import { describe, expect, it } from "vitest";
import type { ConversaDaLista } from "./api";
import {
  contarNaoLidas,
  conversaEmTexto,
  juntarPaginas,
  filtrar,
  naoLida,
  quando,
  paraExibicao,
  previa,
  rotuloDoTelefone,
  textoDaFala,
  ordenarPorPrioridade,
  slaEstourado,
  minutosEsperando,
} from "./inbox.logic";

const linha = (over: Partial<ConversaDaLista> = {}): ConversaDaLista => ({
  id: "movepark-hub:whatsapp:whatsapp:456:5541988149449",
  telefone: "5541988149449",
  origem: "whatsapp",
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
    // O sentinela da bolinha de teste: formatado daria "(00) 00000-0000", que na
    // lista passa por cliente de verdade.
    expect(rotuloDoTelefone("5500000000000")).toBe("Teste sem cliente");
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

describe("texto da fala", () => {
  it("anexo vira frase curta, e não marcador de integração", () => {
    // Chegava cru na conversa: "\[Image]\n[Attached image/jpeg file]".
    expect(textoDaFala("\\[Image]\n[Attached image/jpeg file]")).toBe("(imagem)");
    expect(textoDaFala("[Audio]")).toBe("(áudio)");
    expect(textoDaFala("[Sticker]")).toBe("(figurinha)");
  });

  it("legenda do anexo sobrevive", () => {
    expect(textoDaFala("\\[Image] olha a placa")).toBe("(imagem) olha a placa");
  });

  it("texto normal passa intacto", () => {
    expect(textoDaFala("quero reservar [amanhã]")).toBe("quero reservar [amanhã]");
  });
});

describe("prévia da lista", () => {
  it("tira a marcação, que numa linha só atrapalha", () => {
    expect(previa("O endereço da unidade **Aeropark** em Guarulhos")).toBe(
      "O endereço da unidade Aeropark em Guarulhos",
    );
    expect(previa("Sim, o *Virapark* tem _vaga coberta_")).toBe("Sim, o Virapark tem vaga coberta");
    expect(previa("## Contato")).toBe("Contato");
  });

  it("colapsa quebra de linha, porque a lista mostra uma linha", () => {
    expect(previa("linha um\n\nlinha dois")).toBe("linha um linha dois");
  });

  it("anexo continua legível na prévia", () => {
    expect(previa("\\[Image]\n[Attached image/jpeg file]")).toBe("(imagem)");
  });

  it("vazio não vira 'null'", () => {
    expect(previa(null)).toBe("");
  });
});

describe("dialeto do WhatsApp na tela", () => {
  it("negrito de um asterisco vira negrito de verdade", () => {
    // A resposta e' guardada como sai para o cliente, em dialeto do WhatsApp. A bolha
    // interpreta markdown padrao, entao "*Virapark*" chegava com os asteriscos a mostra.
    expect(paraExibicao("Localizei no *Virapark*!")).toBe("Localizei no **Virapark**!");
    expect(paraExibicao("• *Reserva:* #260820")).toBe("• **Reserva:** #260820");
  });

  it("nao mexe em negrito que ja e markdown", () => {
    expect(paraExibicao("o **Virapark**")).toBe("o **Virapark**");
  });

  it("tira o escape que o WhatsApp poe no nome de arquivo", () => {
    expect(paraExibicao("voucher\\_359049.pdf")).toBe("voucher_359049.pdf");
  });
});

describe("marcador de anexo com nome de arquivo", () => {
  it("some da bolha, porque quem diz o que é é o anexo", () => {
    // Escapava do casamento exato: o marcador traz o nome dentro dele.
    expect(textoDaFala("\\[Document: voucher\\_359049.pdf]")).toBe("(documento)");
    expect(textoDaFala("[Image: foto.jpg]")).toBe("(imagem)");
  });

  it("nao engole texto que so parece marcador", () => {
    expect(textoDaFala("[não é anexo] e segue o texto")).toBe("[não é anexo] e segue o texto");
  });
});

describe("juntarPaginas", () => {
  it("a mesma conversa em duas páginas aparece uma vez", () => {
    // A lista se reordena sozinha: quando o polling recarrega as paginas abertas, uma
    // conversa da pagina 2 pode ter subido para a 1 e vir nas duas.
    const a = linha({ id: "a" });
    const b = linha({ id: "b" });
    expect(juntarPaginas([{ conversas: [a, b] }, { conversas: [b] }]).map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("página sem lista não vira buraco", () => {
    expect(juntarPaginas([{ conversas: undefined }, { conversas: [linha({ id: "a" })] }]).length).toBe(1);
    expect(juntarPaginas(undefined)).toEqual([]);
  });
});

describe("conversaEmTexto", () => {
  const fala = (over: Partial<Parameters<typeof conversaEmTexto>[0][number]> = {}) => ({
    papel: "cliente" as const,
    autor: "",
    texto: "ola",
    em: "2026-08-28T23:00:00.000Z",
    anexos: [],
    ...over,
  });

  it("escreve no formato que o WhatsApp exporta", () => {
    const texto = conversaEmTexto(
      [
        fala({ texto: "quero reservar" }),
        fala({ papel: "agente", autor: "Mia", texto: "Para quais **datas**?" }),
        fala({ papel: "agente", autor: "Kallef", texto: "Eu assumo daqui." }),
      ],
      "5541988149449",
    );

    const linhas = texto.split("\n");
    // Quem falou vem no lugar do nome: o cliente pelo numero, a Mia e a equipe pelo nome.
    expect(linhas[0]).toMatch(/^\[\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}\] \(41\) 98814-9449: quero reservar$/);
    expect(linhas[1]).toContain("Mia: Para quais datas?");
    expect(linhas[2]).toContain("Kallef: Eu assumo daqui.");
  });

  it("o anexo aparece pelo que era, não some", () => {
    // O arquivo nao viaja no texto. Omitir deixaria a mensagem vazia, escondendo que
    // existiu um audio ali, que costuma ser justamente o ponto da conversa.
    const texto = conversaEmTexto(
      [
        fala({ texto: "", anexos: [{ parte: 0, mime: "audio/ogg", tipo: "audio", nome: "", bytes: 10 }] }),
        fala({
          texto: "segue",
          anexos: [{ parte: 1, mime: "application/pdf", tipo: "arquivo", nome: "voucher.pdf", bytes: 20 }],
        }),
      ],
      "5541988149449",
    );
    expect(texto).toContain("<audio>");
    expect(texto).toContain("segue <arquivo: voucher.pdf>");
  });

  it("a quebra de linha da mensagem sobrevive", () => {
    // A lista achata tudo numa linha. A copia nao pode: a lista de contatos que a Mia
    // manda em tres linhas viraria um paragrafo emendado.
    const texto = conversaEmTexto(
      [fala({ papel: "agente", autor: "Mia", texto: "Contatos:\n- WhatsApp\n- E-mail" })],
      "5541988149449",
    );
    expect(texto).toContain("Contatos:\n- WhatsApp\n- E-mail");
  });

  it("conversa vazia vira texto vazio, e não uma linha solta", () => {
    expect(conversaEmTexto([], "5541988149449")).toBe("");
  });
});

// 23/09/2026: suporte prioritário da Superflex (Q-028)
describe("prioridade na fila", () => {
  const base = (o: Partial<ConversaDaLista>): ConversaDaLista => ({
    id: "x", telefone: "5541", origem: "whatsapp", titulo: null, ultima_em: "2026-09-23T12:00:00Z",
    ultimo_papel: "cliente", ultimo_texto: "oi", total: 1, lida_ate: null, assumida_por: null, assumida_em: null, ...o,
  });
  const sf = { tier: "superflex", reserva: "MP-1", sla_minutos: 15 };

  it("Superflex esperando resposta vai para o topo, a mais antiga primeiro; depois os outros por chegada", () => {
    const cs = [
      base({ id: "comum-nova", ultima_em: "2026-09-23T12:30:00Z" }),
      base({ id: "sf-2", prioridade: sf, ultima_em: "2026-09-23T12:10:00Z" }),
      base({ id: "sf-1", prioridade: sf, ultima_em: "2026-09-23T12:00:00Z" }),
      base({ id: "sf-respondida", prioridade: sf, ultimo_papel: "agente", ultima_em: "2026-09-23T12:40:00Z" }),
      base({ id: "comum-velha", ultima_em: "2026-09-23T11:00:00Z" }),
    ];
    expect(ordenarPorPrioridade(cs).map((c) => c.id)).toEqual(["sf-1", "sf-2", "sf-respondida", "comum-nova", "comum-velha"]);
  });

  it("SLA estoura depois dos minutos combinados, só enquanto o cliente espera", () => {
    const agora = new Date("2026-09-23T12:20:00Z");
    expect(minutosEsperando(base({}), agora)).toBe(20);
    expect(slaEstourado(base({ prioridade: sf }), agora)).toBe(true);
    expect(slaEstourado(base({ prioridade: sf, ultima_em: "2026-09-23T12:10:00Z" }), agora)).toBe(false);
    expect(slaEstourado(base({ prioridade: sf, ultimo_papel: "agente" }), agora)).toBe(false);
    expect(slaEstourado(base({}), agora)).toBe(false);
  });
});
