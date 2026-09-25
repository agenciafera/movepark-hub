import { describe, expect, it } from "vitest";

import { LOCALES, type Locale } from "./i18n";
import { textos, type Textos } from "./i18nTextos";

const CHAVES = Object.keys(textos("pt-BR")) as (keyof Textos)[];

describe("dicionário da casca", () => {
  /**
   * A casca precisa existir nos três idiomas ANTES de qualquer tradução de conteúdo.
   * Sem isso, a primeira página traduzida sairia com cabeçalho em português em volta
   * de um texto em inglês, que é pior do que não ter a página.
   */
  it.each(LOCALES)("%s tem todas as chaves, nenhuma vazia", (locale) => {
    const t = textos(locale as Locale);
    for (const k of CHAVES) {
      const v = t[k];
      // `traducaoParcial` é vazio no português de propósito: o aviso só existe quando
      // há o que avisar, e no idioma fonte nunca há.
      if (k === "traducaoParcial" && locale === "pt-BR") continue;
      if (typeof v === "string") {
        expect(v.length, `${locale}.${k}`).toBeGreaterThan(0);
      } else if (Array.isArray(v)) {
        // `trasladoPassos` é a única lista: cada passo precisa de título e texto nos
        // três idiomas, senão o bloco sai com um degrau vazio.
        expect(v.length, `${locale}.${k}`).toBeGreaterThan(0);
        for (const passo of v as { t: string; d: string }[]) {
          expect(passo.t.length, `${locale}.${k}.t`).toBeGreaterThan(0);
          expect(passo.d.length, `${locale}.${k}.d`).toBeGreaterThan(0);
        }
      } else {
        expect(typeof v, `${locale}.${k}`).toBe("function");
      }
    }
  });

  it("nenhum idioma perdeu ou ganhou chave em relação ao português", () => {
    for (const locale of LOCALES) {
      expect(Object.keys(textos(locale as Locale)).sort()).toEqual([...CHAVES].sort());
    }
  });

  it("a frase carrega o nome do destino, que é como a consulta é digitada", () => {
    // "airport parking guarulhos", e não "parking" solto.
    expect(textos("en").precoHeading("Guarulhos Airport")).toContain("Guarulhos Airport");
    expect(textos("es").distanciaHeading("Viracopos")).toContain("Viracopos");
  });

  it("pluraliza a duração em cada idioma", () => {
    expect(textos("pt-BR").duracao(1)).toBe("1 diária");
    expect(textos("pt-BR").duracao(7)).toBe("7 diárias");
    expect(textos("en").duracao(1)).toBe("1 day");
    expect(textos("en").duracao(30)).toBe("30 days");
    expect(textos("es").duracao(1)).toBe("1 día");
    expect(textos("es").duracao(15)).toBe("15 días");
  });

  it("o aviso de tradução parcial existe só nos idiomas traduzidos", () => {
    // Servir português no meio do inglês sem avisar é o que corrói confiança; dizer
    // que falta tradução é honesto e não quebra a página.
    expect(textos("pt-BR").traducaoParcial).toBe("");
    expect(textos("en").traducaoParcial).toMatch(/Portuguese/);
    expect(textos("es").traducaoParcial).toMatch(/portugués/);
  });

  it("nenhum texto usa travessão (regra de marca do CLAUDE.md)", () => {
    for (const locale of LOCALES) {
      const t = textos(locale as Locale);
      for (const k of CHAVES) {
        const v = t[k];
        const s =
          typeof v === "function"
            ? (v as (x: never) => string)(7 as never)
            : Array.isArray(v)
              ? JSON.stringify(v)
              : v;
        expect(String(s), `${locale}.${k}`).not.toMatch(/[—–]/);
      }
    }
  });
  /**
   * O defeito que mais se repetiu nesta superfície: uma chave nova entra no dicionário
   * `en`/`es` com o texto português copiado. O typecheck aprova (o tipo só exige que a
   * chave exista) e a página sai meio traduzida.
   *
   * A checagem é por IGUALDADE com o português, não por vocabulário. A primeira versão
   * deste teste procurava marcas do idioma ("ção", "você") e deixou passar
   * `faqAtualizado: "Atualizado em"` no dicionário inglês, que não tem marca nenhuma.
   * Copiar é o que a pessoa faz de fato, então é copiar que o teste tem que ver.
   *
   * Hoje nenhuma chave colide de propósito. Se um dia uma colidir (um rótulo que é o
   * mesmo nos três idiomas), ela entra numa allowlist nomeada aqui, com o motivo, em
   * vez de o teste ser afrouxado.
   */
  it("nenhuma chave de en/es é cópia crua do português", () => {
    const valor = (locale: Locale, k: keyof Textos): string => {
      const v = textos(locale)[k];
      const s =
        typeof v === "function"
          ? (v as (x: never) => unknown)({ semParceiro: false } as never)
          : v;
      return typeof s === "string" ? s : JSON.stringify(s);
    };
    for (const locale of ["en", "es"] as const) {
      for (const k of CHAVES) {
        const pt = valor("pt-BR", k);
        // Função cujo retorno depende só do argumento pode coincidir sem ser cópia;
        // string vazia (`traducaoParcial` no pt) não é sinal de nada.
        if (!pt) continue;
        expect(valor(locale, k), `${locale}.${String(k)} repete o português`).not.toBe(pt);
      }
    }
  });
});
