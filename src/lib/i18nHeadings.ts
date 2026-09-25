/**
 * Os cabeçalhos da página de destino, por idioma.
 *
 * O português NÃO passa pelo dicionário: ele delega para `@/lib/seo`, onde cada
 * variação é uma decisão medida no Search Console. A diferença é fina e some fácil:
 * a lista de unidades leva o código IATA ("Estacionamentos Aeroporto Guarulhos
 * (GRU)") e os demais H2 não ("Quanto custa estacionar no Aeroporto Guarulhos"),
 * porque repetir o mesmo bigrama em toda a estrutura é sinal de spam, não de
 * relevância.
 *
 * Achatar isso num dicionário de uma string por chave já apagou o código IATA do H2
 * da lista em 24/09/2026, e o teste de contrato pegou. Este módulo existe para que
 * acrescentar idioma nunca mais toque no português.
 */

import { LOCALE_PADRAO, type Locale } from "./i18n";
import { textos } from "./i18nTextos";
import {
  destinationHeading,
  destinationListHeading,
  faqHeading,
  locationHeading,
  priceHeading,
  proximityHeading,
  seoLabelPrimary,
  shuttleHeading,
  type SeoDestination,
} from "./seo";

export type Headings = {
  h1: string;
  lista: string;
  preco: string;
  distancia: string;
  traslado: string;
  ondeFica: string;
  faq: string;
  leiaTambem: string;
  outrosDestinos: string;
  perguntasGerais: string;
};

export function headings(locale: Locale, d: SeoDestination, rotuloTraduzido?: string): Headings {
  if (locale === LOCALE_PADRAO) {
    return {
      h1: destinationHeading(d),
      lista: destinationListHeading(d),
      preco: priceHeading(d),
      distancia: proximityHeading(d),
      traslado: shuttleHeading(d),
      ondeFica: locationHeading(d),
      faq: faqHeading(d),
      leiaTambem: textos(locale).leiaTambem(seoLabelPrimary(d)),
      outrosDestinos: textos(locale).outrosDestinos,
      perguntasGerais: textos(locale).perguntasGerais,
    };
  }

  const t = textos(locale);
  const rotulo = rotuloTraduzido?.trim() || seoLabelPrimary(d);
  return {
    h1: t.h1(rotulo),
    lista: t.listaDeEstacionamentos(rotulo),
    preco: t.precoHeading(rotulo),
    distancia: t.distanciaHeading(rotulo),
    traslado: t.trasladoHeading(rotulo),
    ondeFica: t.ondeFicaHeading(rotulo),
    faq: t.faqHeading(rotulo),
    leiaTambem: t.leiaTambem(rotulo),
    outrosDestinos: t.outrosDestinos,
    perguntasGerais: t.perguntasGerais,
  };
}
