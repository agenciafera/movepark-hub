/**
 * Idiomas do conteúdo público: rota, URL e hreflang.
 *
 * Nasceu da auditoria de 24/09/2026. A Bandeira Park publica 84 páginas em inglês e
 * 84 em espanhol e nós nenhuma; LLM responde na língua da pergunta, e consulta em
 * inglês sobre estacionamento em GRU não tinha versão nossa para citar. O detalhe que
 * abre espaço: eles publicam as duas línguas e **não declaram `hreflang` em página
 * nenhuma**, então cada versão vive sozinha, sem o buscador saber que são a mesma
 * página. Dá para fazer melhor já na primeira versão.
 *
 * ── Português é a fonte, não uma tradução ────────────────────────────────────
 *
 * O pt-BR mora nas colunas originais e na URL sem prefixo. `en` e `es` moram nas
 * tabelas `*_i18n` e ganham prefixo. Tratar o português como mais um idioma abriria o
 * estado de existirem duas versões do texto canônico.
 *
 * ── Segmento traduzido, e não só prefixo ─────────────────────────────────────
 *
 * `/en/airport-parking/...`, e não `/en/estacionamentos/...`. A palavra do caminho é
 * a que se busca naquele idioma, e é exatamente onde o concorrente deixa valor na
 * mesa: ele publica `/en/estacionamento-aeroporto-viracopos`, com o segmento em
 * português dentro da versão inglesa.
 */

export const LOCALE_PADRAO = "pt-BR" as const;
export const LOCALES_TRADUZIDOS = ["en", "es"] as const;

export type LocaleTraduzido = (typeof LOCALES_TRADUZIDOS)[number];
export type Locale = typeof LOCALE_PADRAO | LocaleTraduzido;

/** Todos os idiomas, com o padrão na frente. */
export const LOCALES: readonly Locale[] = [LOCALE_PADRAO, ...LOCALES_TRADUZIDOS];

/** Valor do atributo `lang` do `<html>`. */
export const LANG_HTML: Record<Locale, string> = {
  "pt-BR": "pt-BR",
  en: "en",
  es: "es",
};

/**
 * Segmento de caminho por família e idioma.
 *
 * Mantido à mão, e não derivado, porque tradução de URL é decisão editorial: o termo
 * certo é o que as pessoas digitam naquele idioma, não o que o dicionário devolve.
 */
export const SEGMENTO: Record<string, Record<Locale, string>> = {
  destino: { "pt-BR": "estacionamentos", en: "airport-parking", es: "estacionamiento-aeropuerto" },
  blog: { "pt-BR": "blog", en: "blog", es: "blog" },
  faq: { "pt-BR": "faq", en: "faq", es: "preguntas-frecuentes" },
};

export function ehLocaleTraduzido(v: string): v is LocaleTraduzido {
  return (LOCALES_TRADUZIDOS as readonly string[]).includes(v);
}

/**
 * O caminho público de um conteúdo num idioma.
 *
 * `slug` é o do idioma quando existe, e o original quando não. Idioma sem prefixo só
 * para o padrão: `/en/` e `/es/` sempre prefixam, inclusive na home.
 */
export function caminhoLocalizado(args: {
  familia: keyof typeof SEGMENTO;
  slug: string;
  locale: Locale;
  /** Sufixo depois do slug, como `/precos`. Entra sem tradução por enquanto. */
  sufixo?: string;
}): string {
  const seg = SEGMENTO[args.familia][args.locale];
  const prefixo = args.locale === LOCALE_PADRAO ? "" : `/${args.locale}`;
  return `${prefixo}/${seg}/${args.slug}${args.sufixo ?? ""}`;
}

export type Alternativa = { locale: Locale; caminho: string };

/**
 * O cluster de `hreflang` de uma URL.
 *
 * Três invariantes, e todas já derrubaram cluster de site grande:
 *
 * 1. **Auto-referência.** A própria página entra na lista. Sem ela o Google descarta
 *    o grupo inteiro, porque não consegue fechar o ciclo.
 * 2. **Só idioma que existe.** Uma entrada apontando para tradução não publicada é
 *    404 ou, pior, uma página em português servida como inglesa. O portão é o
 *    `is_published` da linha de tradução, e quem não passou simplesmente não aparece.
 * 3. **`x-default` no padrão.** É para onde o buscador manda quem não casa com
 *    idioma nenhum da lista, e aqui isso é o pt-BR.
 *
 * Devolve vazio quando só existe o original: página sozinha não tem cluster, e emitir
 * um `hreflang` de um item só é ruído que alguns validadores tratam como erro.
 */
export function clusterHreflang(alternativas: Alternativa[]): { hreflang: string; href: string }[] {
  const traduzidas = alternativas.filter((a) => a.locale !== LOCALE_PADRAO);
  if (traduzidas.length === 0) return [];

  const padrao = alternativas.find((a) => a.locale === LOCALE_PADRAO);
  const ordenadas = [
    ...(padrao ? [padrao] : []),
    ...traduzidas.sort((a, b) => a.locale.localeCompare(b.locale)),
  ];

  const saida = ordenadas.map((a) => ({ hreflang: LANG_HTML[a.locale], href: a.caminho }));
  if (padrao) saida.push({ hreflang: "x-default", href: padrao.caminho });
  return saida;
}

/**
 * O idioma pedido pela URL, e o resto do caminho.
 *
 * `/en/airport-parking/gru` devolve `en` e `/airport-parking/gru`. Caminho sem
 * prefixo conhecido é português, e é por isso que a checagem é por lista fechada:
 * um `/es-algo/` qualquer não pode virar idioma por acidente.
 */
export function localeDoCaminho(caminho: string): { locale: Locale; resto: string } {
  const m = caminho.match(/^\/([^/]+)(\/.*)?$/);
  const primeiro = m?.[1] ?? "";
  if (ehLocaleTraduzido(primeiro)) {
    return { locale: primeiro, resto: m?.[2] || "/" };
  }
  return { locale: LOCALE_PADRAO, resto: caminho };
}
