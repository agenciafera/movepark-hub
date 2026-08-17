import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useActiveSection } from "./useActiveSection";
import {
  baseDaFaixa,
  ROOT_MARGIN,
  SCROLL_MT_PX,
  secaoAtiva,
  TOPO_FAIXA_PX,
  type Medida,
} from "./useActiveSection.logic";

/**
 * Os números vêm de medição na /faq, janela de 900px, e não de chute: ao clicar em
 * `#cancelamento` a seção pousa em 96.09 e a anterior termina no mesmo 96.09,
 * porque as duas encostam e o scroll arredonda. Com a faixa abrindo nos mesmos
 * 96px do `scroll-mt`, a anterior entrava por 0.09px e ganhava a disputa.
 */
const AO_CLICAR_NA_TERCEIRA: Medida[] = [
  { id: "reservas", topo: -654.0, base: -280.0 },
  { id: "pagamentos", topo: -279.91, base: 96.09 },
  { id: "cancelamento", topo: 96.09, base: 319.09 },
  { id: "check-in", topo: 319.09, base: 813.09 },
];

/** Fim da rolagem: o rodapé ocupa a tela e a última seção termina acima da faixa. */
const NO_FIM_DA_PAGINA: Medida[] = [
  { id: "teresina", topo: -1703, base: -1126 },
  { id: "viracopos", topo: -1126, base: -573 },
  { id: "vitoria", topo: -573, base: 5 },
];

describe("faixa de leitura", () => {
  /**
   * Regressão: a faixa abria exatamente onde a âncora pousa a seção
   * (`rootMargin: "-96px ..."` contra `scroll-mt-24`), e encostar as duas bordas
   * é o que deixava a seção anterior acesa.
   */
  it("começa abaixo de onde a âncora pousa a seção", () => {
    expect(TOPO_FAIXA_PX).toBeGreaterThan(SCROLL_MT_PX);
  });

  it("o rootMargin publica o mesmo topo que a escolha usa", () => {
    expect(ROOT_MARGIN.startsWith(`-${TOPO_FAIXA_PX}px `)).toBe(true);
  });

  it("a base acompanha a altura da janela", () => {
    expect(baseDaFaixa(900)).toBe(360);
  });
});

describe("secaoAtiva", () => {
  /** O caso que o Peu viu: clicar na terceira seção e a segunda continuar acesa. */
  it("clicar numa seção acende ela, não a de cima que encostou na borda", () => {
    const escolhida = secaoAtiva(AO_CLICAR_NA_TERCEIRA, TOPO_FAIXA_PX, baseDaFaixa(900));
    expect(escolhida).toBe("cancelamento");
  });

  /** Prova de que a folga é o que corrige: com a faixa antiga, dá a anterior. */
  it("com a faixa antiga, a de cima ganhava por 0.09px", () => {
    expect(secaoAtiva(AO_CLICAR_NA_TERCEIRA, SCROLL_MT_PX, baseDaFaixa(900))).toBe("pagamentos");
  });

  it("no fim da página vale a última seção, mesmo sem ninguém na faixa", () => {
    expect(secaoAtiva(NO_FIM_DA_PAGINA, TOPO_FAIXA_PX, baseDaFaixa(900))).toBe("vitoria");
  });

  /**
   * O trilho do post de blog usa este mesmo hook, e lá os alvos são `h2` de 24px.
   * Clicado, o `h2` ocupa de 96 a 120: a folga tem que deixá-lo dentro da faixa,
   * senão ele fica pendurado na borda e a detecção passa a depender do resto.
   */
  it("alvo baixo, como o h2 do blog, entra na faixa", () => {
    const h2 = { id: "secao-3", topo: SCROLL_MT_PX, base: SCROLL_MT_PX + 24 };
    const medidas: Medida[] = [
      { id: "secao-2", topo: -400, base: SCROLL_MT_PX },
      h2,
      { id: "secao-4", topo: 900, base: 924 },
    ];
    expect(h2.base).toBeGreaterThan(TOPO_FAIXA_PX);
    expect(secaoAtiva(medidas, TOPO_FAIXA_PX, baseDaFaixa(900))).toBe("secao-3");
  });

  it("entre duas seções na faixa, vale a de cima", () => {
    const medidas: Medida[] = [
      { id: "a", topo: 130, base: 200 },
      { id: "b", topo: 200, base: 600 },
    ];
    expect(secaoAtiva(medidas, TOPO_FAIXA_PX, baseDaFaixa(900))).toBe("a");
  });

  /** Página no topo: ninguém chegou na faixa, e quem decide é o hook. */
  it("sem ninguém na faixa e ninguém acima dela, não escolhe", () => {
    const medidas: Medida[] = [{ id: "a", topo: 958, base: 1329 }];
    expect(secaoAtiva(medidas, TOPO_FAIXA_PX, baseDaFaixa(900))).toBeNull();
  });
});

/** Observer falso: guarda o callback e o `rootMargin` pedidos pelo hook. */
function fingirObserver() {
  const registro: { rootMargin?: string; disparar: () => void } = { disparar: () => {} };
  class FakeIO {
    constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
      registro.rootMargin = opts?.rootMargin;
      registro.disparar = () => cb([], this as unknown as IntersectionObserver);
    }
    observe() {}
    disconnect() {}
    unobserve() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal("IntersectionObserver", FakeIO);
  return registro;
}

function montarSecoes(medidas: Medida[]) {
  document.body.innerHTML = medidas.map((m) => `<section id="${m.id}"></section>`).join("");
  for (const m of medidas) {
    const el = document.getElementById(m.id)!;
    el.getBoundingClientRect = () =>
      ({ top: m.topo, bottom: m.base, height: m.base - m.topo }) as DOMRect;
  }
}

describe("useActiveSection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("acende a seção clicada assim que o observer avisa", () => {
    const io = fingirObserver();
    montarSecoes(AO_CLICAR_NA_TERCEIRA);
    vi.stubGlobal("innerHeight", 900);

    const { result } = renderHook(() => useActiveSection(AO_CLICAR_NA_TERCEIRA.map((m) => m.id)));
    expect(io.rootMargin).toBe(ROOT_MARGIN);

    act(() => io.disparar());
    expect(result.current).toBe("cancelamento");
  });

  it("no fim da página acende a última", () => {
    const io = fingirObserver();
    montarSecoes(NO_FIM_DA_PAGINA);
    vi.stubGlobal("innerHeight", 900);

    const { result } = renderHook(() => useActiveSection(NO_FIM_DA_PAGINA.map((m) => m.id)));
    act(() => io.disparar());
    expect(result.current).toBe("vitoria");
  });

  it("na abertura, com a página no topo, vale a primeira", () => {
    const io = fingirObserver();
    const medidas: Medida[] = [
      { id: "a", topo: 958, base: 1329 },
      { id: "b", topo: 1329, base: 1700 },
    ];
    montarSecoes(medidas);
    vi.stubGlobal("innerHeight", 900);

    const { result } = renderHook(() => useActiveSection(["a", "b"]));
    act(() => io.disparar());
    expect(result.current).toBe("a");
  });
});
