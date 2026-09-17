import { describe, expect, it } from "vitest";

import {
  blocoMarkdown,
  divergencias,
  extrairBloco,
  frasePatio,
  numerosDaFrase,
  periodoDaNota,
  patiosDoDestino,
  TITULO,
} from "./bloco-de-fato.mjs";

const GRU = {
  nome: "Aeroporto Internacional de São Paulo/Guarulhos",
  code: "GRU",
  publicSlug: "aeroporto-guarulhos",
};
const HOJE = new Date(Date.UTC(2026, 8, 17));

const aeropark = {
  nome: "Aeropark",
  distanciaM: 1884,
  ponto: "Terminal 1",
  traslado: 10,
  minimo: 2,
  diaria: NaN,
  semana: 93.17,
  mes: 239.4,
  tipo: "descoberta",
};
const extrasAeropark = { frequencia: 30, tolerancia: 60, vinteQuatroHoras: true };

describe("periodoDaNota", () => {
  it("meses diferentes no mesmo ano", () => {
    expect(periodoDaNota({ desde: "2026-03-04T10:00:00Z", ate: "2026-09-17T10:00:00Z" })).toBe(
      "de março a setembro de 2026",
    );
  });
  it("tudo no mesmo mês vira uma data só", () => {
    expect(periodoDaNota({ desde: "2026-09-02T10:00:00Z", ate: "2026-09-17T10:00:00Z" })).toBe(
      "em setembro de 2026",
    );
  });
  it("sem avaliação não inventa período", () => {
    expect(periodoDaNota(null)).toBeNull();
    expect(periodoDaNota({ desde: null, ate: "2026-09-17T10:00:00Z" })).toBeNull();
  });
});

describe("frasePatio · avaliação (Conteúdo 30)", () => {
  const comNota = (nota) => ({ ...extrasAeropark, nota });

  it("publica nota, contagem e período juntos quando há volume", () => {
    const f = frasePatio(
      aeropark,
      GRU,
      comNota({ avg: 4.7, count: 38, periodo: "de março a setembro de 2026" }),
      "setembro de 2026",
    );
    expect(f).toContain("**4,7** em **38 avaliações** de clientes Movepark");
    expect(f).toContain("de março a setembro de 2026");
  });

  /** O erro que a atividade mandou fechar: nota 5,0 apoiada em uma opinião. */
  it("cala abaixo do piso de volume, mesmo com nota cheia", () => {
    const f = frasePatio(
      aeropark,
      GRU,
      comNota({ avg: 5, count: 2, periodo: "em setembro de 2026" }),
      "setembro de 2026",
    );
    expect(f).not.toContain("avaliações de clientes");
    expect(f).not.toContain("**5,0**");
  });

  it("sem período a nota não sai, porque os três andam juntos", () => {
    const f = frasePatio(
      aeropark,
      GRU,
      comNota({ avg: 4.9, count: 120, periodo: null }),
      "setembro de 2026",
    );
    expect(f).not.toContain("avaliações de clientes");
  });
});

describe("frasePatio", () => {
  it("põe entidade, distância, traslado, preço e condição na mesma frase", () => {
    const f = frasePatio(aeropark, GRU, extrasAeropark, "setembro de 2026");
    expect(f).toContain("**Aeropark**");
    expect(f).toContain("**1,88 km** do Terminal 1");
    expect(f).toContain("traslado de **10 minutos**");
    expect(f).toContain("van a cada **30 minutos**");
    expect(f).toContain("**R$ 93,17** por 7 diárias");
    expect(f).toContain("estadia mínima de **2 diárias**");
    expect(f).toContain("em setembro de 2026");
  });

  it("omite a diária avulsa do pátio que não vende uma", () => {
    expect(frasePatio(aeropark, GRU, extrasAeropark, "setembro de 2026")).not.toContain(
      "na diária avulsa",
    );
  });

  it("diz que o campo não está declarado, em vez de estimar", () => {
    const semTraslado = { ...aeropark, nome: "Aerovalet", traslado: null, minimo: null };
    const f = frasePatio(
      semTraslado,
      GRU,
      { tolerancia: 60, vinteQuatroHoras: true },
      "setembro de 2026",
    );
    expect(f).toContain("não declara o tempo de traslado na ficha");
    expect(f).toContain("sem estadia mínima declarada");
  });

  it("não promete transação, que é o que o ADR-009 proíbe", () => {
    const f = frasePatio(aeropark, GRU, extrasAeropark, "setembro de 2026");
    expect(f).not.toMatch(/garant|cancelamento|reserve|vaga assegurada|grátis/i);
  });
});

describe("patiosDoDestino", () => {
  const destino = {
    units: [
      {
        company_name: "Aerovalet",
        parking_type_name: "Vaga Coberta",
        distance_m: 4549,
        shuttle_minutes: null,
        min_stay_days: null,
        prices: [
          { days: 1, total: 22.19 },
          { days: 7, total: 111.79 },
          { days: 30, total: 287.4 },
        ],
      },
      {
        company_name: "Aerovalet",
        parking_type_name: "Vaga Descoberta",
        distance_m: 4549,
        shuttle_minutes: null,
        min_stay_days: null,
        prices: [
          { days: 1, total: 18.49 },
          { days: 7, total: 93.17 },
          { days: 30, total: 239.4 },
        ],
      },
    ],
  };

  it("resume o pátio pelo tipo de vaga mais barato na semana", () => {
    const [patio] = patiosDoDestino(destino);
    expect(patio.tipo).toBe("descoberta");
    expect(patio.semana).toBe(93.17);
  });

  it("prefere a distância medida até o terminal mais próximo", () => {
    const [patio] = patiosDoDestino(destino, [
      { company_name: "Aerovalet", point_name: "Terminal 3", distance_m: 5000 },
      { company_name: "Aerovalet", point_name: "Terminal 1", distance_m: 4848 },
    ]);
    expect(patio.distanciaM).toBe(4848);
    expect(patio.ponto).toBe("Terminal 1");
  });

  it("cai na distância do destino quando a praça não tem ponto cadastrado", () => {
    const [patio] = patiosDoDestino(destino, []);
    expect(patio.distanciaM).toBe(4549);
    expect(patio.ponto).toBeNull();
  });
});

describe("extrairBloco", () => {
  const bloco = blocoMarkdown(GRU, [aeropark], new Map([["Aeropark", extrasAeropark]]), HOJE);
  const post = `Abertura do post.\n\n${bloco}\n\n## Outra seção\n\nTexto que vem depois.`;

  it("acha o bloco pelo título e para no próximo H2", () => {
    const achado = extrairBloco(post, GRU.nome);
    expect(achado).toContain(TITULO(GRU.nome));
    expect(achado).toContain("**Aeropark**");
    expect(achado).not.toContain("Texto que vem depois");
  });

  it("devolve null em post sem bloco", () => {
    expect(extrairBloco("Post qualquer sem bloco.", GRU.nome)).toBeNull();
  });
});

describe("numerosDaFrase", () => {
  it("lê distância, traslado, frequência, mínimo e preços", () => {
    const n = numerosDaFrase(frasePatio(aeropark, GRU, extrasAeropark, "setembro de 2026"));
    expect(n).toMatchObject({ metros: 1880, traslado: 10, frequencia: 30, minimo: 2 });
    expect(n.precos).toEqual([93.17, 239.4]);
  });
});

describe("divergencias", () => {
  const esperado = new Map([
    ["Aeropark", { metros: 1884, traslado: 10, frequencia: 30, minimo: 2, precos: [93.17, 239.4] }],
  ]);
  const bloco = blocoMarkdown(GRU, [aeropark], new Map([["Aeropark", extrasAeropark]]), HOJE);

  it("aceita o bloco recém-gerado, arredondamento incluído", () => {
    expect(divergencias(bloco, esperado)).toEqual([]);
  });

  it("barra distância que o PostGIS desmente", () => {
    const torto = bloco.replace("**1,88 km**", "**0,48 km**");
    const [achado] = divergencias(torto, esperado);
    expect(achado).toMatchObject({ nome: "Aeropark", barra: true });
    expect(achado.detalhe).toContain("PostGIS");
  });

  it("barra traslado e estadia mínima que a ficha não declara", () => {
    const torto = bloco
      .replace("traslado de **10 minutos**", "traslado de **4 minutos**")
      .replace("estadia mínima de **2 diárias**", "estadia mínima de **5 diárias**");
    expect(divergencias(torto, esperado).filter((a) => a.barra)).toHaveLength(2);
  });

  it("avisa, sem barrar, quando o preço do bloco não é mais o da tabela", () => {
    const torto = bloco.replace("**R$ 93,17** por 7 diárias", "**R$ 111,30** por 7 diárias");
    const achados = divergencias(torto, esperado);
    expect(achados).toHaveLength(1);
    expect(achados[0].barra).toBe(false);
  });

  it("ignora pátio que o destino não tem", () => {
    const outro = bloco.replace("**Aeropark**", "**Pátio Fantasma**");
    expect(divergencias(outro, esperado)).toEqual([]);
  });
});
