import { describe, expect, it } from "vitest";

import type { ProspectCard } from "@/types/domain";
import { postsDoLote, precoPesquisado } from "./loteMapeadoPreco.logic";

function lote(over: Partial<ProspectCard> = {}): ProspectCard {
  return {
    id: "p1",
    name: "Bandeira Park",
    slug: "bandeira-park",
    public_slug: "bandeira-park",
    public_name: "Bandeira Park",
    address: null,
    latitude: 0,
    longitude: 0,
    google_maps_url: null,
    amenities: [],
    description: null,
    distance_km: 2.89,
    reference_name: null,
    google_place_id: null,
    google_rating: null,
    google_rating_count: 0,
    google_fetched_at: null,
    researched_daily_brl: 18.49,
    researched_weekly_brl: 93.17,
    researched_biweekly_brl: 152.7,
    researched_monthly_brl: 239.4,
    researched_at: "2026-09-08T00:00:00Z",
    research_source: null,
    ...over,
  } as ProspectCard;
}

describe("precoPesquisado", () => {
  // Achado de 08/09/2026: a MESMA ficha do Bandeira Park dizia "Preço: não informado" no
  // topo e "R$ 18,49" na FAQ, e a tabela do destino mostrava a linha com data de pesquisa.
  // As colunas existiam; só esta tela não as lia.
  it("devolve as quatro durações pesquisadas, com valor por diária", () => {
    const p = precoPesquisado(lote())!;
    expect(p.researchedAt).toBe("2026-09-08T00:00:00Z");
    expect(p.linhas.map((l) => [l.label, l.total])).toEqual([
      ["1 diária", 18.49],
      ["7 diárias", 93.17],
      ["15 diárias", 152.7],
      ["30 diárias", 239.4],
    ]);
    expect(p.linhas[3].perDay).toBeCloseTo(7.98, 2);
  });

  it("mostra só o que foi pesquisado, sem inventar duração", () => {
    // O caso real da maioria dos lotes de VCP: diária e semana pesquisadas, o resto não.
    const p = precoPesquisado(
      lote({ researched_biweekly_brl: null, researched_monthly_brl: null }),
    )!;
    expect(p.linhas.map((l) => l.days)).toEqual([1, 7]);
  });

  it("sem data não há preço, mesmo com valor preenchido", () => {
    // Preço de terceiro sem data é afirmação sem lastro, e a constraint do banco já diz.
    expect(precoPesquisado(lote({ researched_at: null }))).toBeNull();
  });

  it("sem valor nenhum devolve null, para a ficha voltar a dizer 'não informado'", () => {
    expect(
      precoPesquisado(
        lote({
          researched_daily_brl: null,
          researched_weekly_brl: null,
          researched_biweekly_brl: null,
          researched_monthly_brl: null,
        }),
      ),
    ).toBeNull();
  });

  it("ignora zero, que não é preço", () => {
    expect(precoPesquisado(lote({ researched_daily_brl: 0, researched_weekly_brl: null, researched_biweekly_brl: null, researched_monthly_brl: null }))).toBeNull();
  });

  it("aceita numeric vindo como string do PostgREST", () => {
    const p = precoPesquisado(lote({ researched_daily_brl: "18.49" as unknown as number }))!;
    expect(p.linhas[0].total).toBe(18.49);
  });
});

describe("postsDoLote", () => {
  const posts = [
    { slug: "estacionamento-coberto-em-viracopos" },
    { slug: "bandeira-park-viracopos" },
    { slug: "virapark-viracopos" },
    { slug: "estacionamento-viracopos-azul" },
  ];

  it("põe o post da própria marca na frente", () => {
    expect(postsDoLote(posts, "bandeira-park").map((p) => p.slug)).toEqual([
      "bandeira-park-viracopos",
      "estacionamento-coberto-em-viracopos",
      "virapark-viracopos",
    ]);
  });

  it("sem post da marca, mantém a ordem do destino", () => {
    expect(postsDoLote(posts, "km64").map((p) => p.slug)).toEqual([
      "estacionamento-coberto-em-viracopos",
      "bandeira-park-viracopos",
      "virapark-viracopos",
    ]);
  });

  it("aguenta lista e slug ausentes", () => {
    expect(postsDoLote(undefined, "bandeira-park")).toEqual([]);
    expect(postsDoLote(posts, null).map((p) => p.slug)).toEqual(posts.slice(0, 3).map((p) => p.slug));
  });
});
