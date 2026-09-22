/**
 * Rótulos de SEO derivados do destino: uma fonte única para `<title>`, H1 e H2.
 *
 * Por que existe, medido no Search Console (export de 13/08/2026, 3 meses):
 *
 *   "estacionamento aeroporto <X>" colado ....... 647 cliques / 50.402 impressões
 *   "estacionamento <prep> aeroporto <X>" ....... 177 cliques / 14.061 impressões
 *   consulta contendo "aeroporto" ............... 40,6% dos cliques
 *
 * O título antigo quebrava o bigrama com duas preposições ("Estacionamento no Aeroporto de
 * Curitiba") e o H1 nem trazia a palavra "aeroporto" ("Estacionamento em Afonso Pena").
 * Aqui o rótulo já vem do banco na ordem em que as pessoas digitam, e estas funções só
 * montam as variações. Lógica pura, sem rede, para o teste travar a regressão.
 *
 * A regra de repetição importa tanto quanto a de correspondência: título e H1 usam a forma
 * exata, os H2 variam. Repetir o mesmo bigrama em toda a estrutura da página é sinal de
 * spam, não de relevância.
 */

/** O mínimo que estas funções precisam saber de um destino. */
export type SeoDestination = {
  seo_label?: string | null;
  short_name?: string | null;
  name: string;
  type?: string | null;
};

/**
 * Rótulo completo, com a variante secundária e o código: "Aeroporto Curitiba, Afonso Pena (CWB)".
 * Cai para `short_name` e depois `name` quando o destino ainda não tem rótulo escrito.
 */
export function seoLabel(d: SeoDestination): string {
  return d.seo_label?.trim() || d.short_name?.trim() || d.name;
}

/** Tira o código entre parênteses do fim: "Aeroporto Curitiba (CWB)" vira "Aeroporto Curitiba". */
function semCodigo(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

/**
 * Só a primeira forma de chamar o destino, sem a variante secundária e sem o código:
 * "Aeroporto Curitiba, Afonso Pena (CWB)" vira "Aeroporto Curitiba".
 *
 * É o que entra em título de unidade e em H2, onde o rótulo inteiro estouraria o tamanho.
 */
export function seoLabelPrimary(d: SeoDestination): string {
  return semCodigo(seoLabel(d)).split(",")[0].trim();
}

/** A primeira forma com o código de volta: "Aeroporto Curitiba (CWB)". */
export function seoLabelPrimaryWithCode(d: SeoDestination): string {
  const label = seoLabel(d);
  const codigo = label.match(/\(([^)]*)\)\s*$/)?.[0] ?? "";
  const primary = seoLabelPrimary(d);
  return codigo ? `${primary} ${codigo.trim()}` : primary;
}

/**
 * A palavra-chave do destino, na forma em que a pessoa digita: "Estacionamento Aeroporto
 * Guarulhos (GRU)". É o que abre `<title>` e meta description de toda página comercial do
 * destino (destino, preços, mais barato, calculadora), para as quatro dizerem a mesma coisa.
 *
 * O "Aeroporto" entra na frente quando o rótulo não o traz: em `destination` o `seo_label` já
 * vem escrito ("Aeroporto Curitiba, Afonso Pena"), mas a matriz de preço só carrega o
 * `short_name` ("Guarulhos (GRU)"), e sem o prefixo o título perderia o bigrama que responde
 * por 40,6% dos cliques.
 */
export function destinationKeyword(d: SeoDestination): string {
  const label = seoLabelPrimaryWithCode(d);
  const jaNomeado = /^(aeroporto|rodovi|terminal|centro|jardim|bairro)/i.test(label);
  if (!jaNomeado && d.type === "airport") return `Estacionamento Aeroporto ${label}`;
  return `Estacionamento ${label}`;
}

/** `<title>` do destino: "Estacionamento Aeroporto Curitiba, Afonso Pena (CWB) | Movepark". */
export function destinationTitle(d: SeoDestination): string {
  return `Estacionamento ${seoLabel(d)} | Movepark`;
}

/**
 * H1 do destino: "Estacionamento Aeroporto Curitiba, Afonso Pena".
 * Sem o código, que já está no título e na trilha e só polui a leitura do cabeçalho.
 */
export function destinationHeading(d: SeoDestination): string {
  return `Estacionamento ${semCodigo(seoLabel(d))}`;
}

/** H2 da lista de unidades: "Estacionamentos Aeroporto Curitiba (CWB)". */
export function destinationListHeading(d: SeoDestination): string {
  return `Estacionamentos ${seoLabelPrimaryWithCode(d)}`;
}

/** Verdadeiro quando o destino é aeroporto, o que muda a âncora da distância. */
function ehAeroporto(d: SeoDestination): boolean {
  return d.type === "airport";
}

/**
 * O artigo que acompanha o rótulo do destino, pelo tipo.
 *
 * Existe porque os H2 do destino que não é aeroporto caíam num texto genérico ("Localização",
 * "Como funciona o traslado") só para não errar o gênero, e aí a página do Tietê perdia a
 * palavra-chave em dois cabeçalhos. Rodoviária é o único feminino do catálogo; aeroporto,
 * centro e bairro são masculinos. Um tipo novo entra aqui junto com o artigo dele.
 */
function artigo(d: SeoDestination): "o" | "a" {
  return d.type === "bus_terminal" ? "a" : "o";
}

/** H2 do bloco de traslado: "Traslado até o Aeroporto Curitiba", "até a Rodoviária Tietê". */
export function shuttleHeading(d: SeoDestination): string {
  return `Traslado até ${artigo(d)} ${seoLabelPrimary(d)}`;
}

/** H2 do mapa. "onde fica o aeroporto de confins" tem 729 impressões e zero clique hoje. */
export function locationHeading(d: SeoDestination): string {
  return `Onde fica ${artigo(d)} ${seoLabelPrimary(d)}?`;
}

/** H2 da FAQ: "Perguntas frequentes: estacionamento Aeroporto Curitiba". */
export function faqHeading(d: SeoDestination): string {
  return `Perguntas frequentes: estacionamento ${seoLabelPrimary(d)}`;
}

/** H2 do bloco de melhores notas: "Mais bem avaliados no Aeroporto Curitiba". */
export function topRatedHeading(d: SeoDestination): string {
  return `Mais bem avaliados n${artigo(d)} ${seoLabelPrimary(d)}`;
}

/**
 * H2 da tabela de preços. Casa com a consulta como ela é digitada ("quanto custa
 * estacionar no aeroporto de viracopos"), que é a de maior intenção comercial da
 * página e a que o comparador concorrente responde em tabela.
 */
export function priceHeading(d: SeoDestination): string {
  return `Quanto custa estacionar n${artigo(d)} ${seoLabelPrimary(d)}?`;
}

/**
 * H2 do ranking de distância. Em aeroporto a âncora é o terminal, que é o que a
 * pessoa quer alcançar; nos demais destinos o ponto de referência é o próprio
 * destino, e "terminal" seria mentira.
 */
export function proximityHeading(d: SeoDestination): string {
  return ehAeroporto(d)
    ? `Distância até o terminal do ${seoLabelPrimary(d)}`
    : `Distância até ${artigo(d)} ${seoLabelPrimary(d)}`;
}

/** Sufixo da distância na lista: "328 m do terminal" em aeroporto e rodoviária. */
export function proximityAnchorLabel(d: SeoDestination): string | null {
  return d.type === "airport" || d.type === "bus_terminal" ? "do terminal" : null;
}

/**
 * `<title>` da unidade: "Abbapark: Estacionamento Aeroporto Curitiba, Vaga Coberta | Movepark".
 *
 * A marca vem primeiro porque consulta de marca de parceiro vale 785 cliques e 114.327
 * impressões no período, o maior bloco isolado da demanda, e o título antigo ("Vaga Coberta ·
 * Aeroporto Afonso Pena") não trazia a marca em lugar nenhum. O tipo de vaga fecha a frase e
 * é o que diferencia as três páginas da mesma unidade.
 */
export function listingTitle(args: {
  publicName?: string | null;
  companyName: string;
  /** Aceito e ignorado: o mesmo objeto alimenta a descrição, que usa o tipo de vaga. */
  parkingTypeName?: string | null;
  destination?: SeoDestination | null;
  locationName: string;
}): string {
  return `${nomeDaFicha(args)} | Movepark`;
}

/**
 * O nome canônico da ficha: "{marca} - Estacionamento {destino}".
 *
 * Sai de `location.public_name`, escrito e revisado no banco. A composição aqui é o plano B
 * para unidade que ainda não foi nomeada, e usa a mesma fórmula, para as duas nunca
 * divergirem na tela.
 */
export function nomeDaFicha(args: {
  publicName?: string | null;
  companyName: string;
  parkingTypeName?: string | null;
  destination?: SeoDestination | null;
  locationName: string;
}): string {
  if (args.publicName?.trim()) return args.publicName.trim();
  const lugar = args.destination ? seoLabelPrimary(args.destination) : args.locationName;
  return `${args.companyName} - Estacionamento ${lugar}`;
}

/**
 * H1 da unidade: "Abbapark · Vaga Coberta · Aeroporto Curitiba".
 *
 * O separador evita o artigo, que mudaria de gênero em destino que não é aeroporto, e o tipo
 * de vaga no meio é o que faz as três páginas da mesma unidade deixarem de ter H1 idêntico.
 */
export function listingHeading(args: {
  publicName?: string | null;
  companyName: string;
  parkingTypeName?: string | null;
  destination?: SeoDestination | null;
  locationName: string;
}): string {
  return nomeDaFicha(args);
}

/**
 * Meta description da unidade, na estrutura do site: palavra-chave, menor preço, CTA.
 *
 * O `<meta name="description">` e o `description` do JSON-LD **não** são a mesma frase, e é
 * de propósito. O schema recebe o resumo factual (`buildListingTldr`), que é o que a IA cita;
 * a SERP recebe esta, que é o que a pessoa lê antes de clicar. O resumo factual abria com o
 * tipo de vaga ("Vaga Coberta no Aeropark"), que não é a consulta de ninguém.
 *
 * `hubCheckout` vem do ADR-009: onde a reserva fecha no parceiro, o CTA convida a comparar,
 * não promete um checkout de dois minutos que a Movepark não roda ali.
 */
export function listingDescription(args: {
  companyName: string;
  parkingTypeName: string;
  destination?: SeoDestination | null;
  locationName: string;
  city?: string | null;
  /** Diária mais barata da unidade, já filtrada (zero de catálogo não é preço). */
  fromPrice?: number | null;
  hubCheckout?: boolean;
}): string {
  const lugar = args.destination ? seoLabelPrimary(args.destination) : args.locationName;
  return buildMetaDescription({
    keyword: `Estacionamento ${lugar}: ${args.parkingTypeName} no ${args.companyName}`,
    extra: args.city,
    price: priceHook(args.fromPrice),
    cta: args.hubCheckout ? "reservar" : "comparar",
  });
}

// ---------------------------------------------------------------------------
// Meta description: a estrutura única do site
// ---------------------------------------------------------------------------

/**
 * Toda meta description do Movepark tem a mesma estrutura, em três partes e nesta ordem:
 *
 *   1. **palavra-chave** da página, na abertura, na forma em que a pessoa digita;
 *   2. **menor preço real**, com o período a que ele se refere ("a partir de R$ 18,49 a diária");
 *   3. **CTA** no imperativo, escolhido pela capacidade da página (ADR-009).
 *
 * Por que o preço: snippet com número ganha de snippet sem número na mesma SERP, e a
 * consulta que traz essa gente é de preço. Por que o CTA: description sem verbo descreve
 * a página em vez de vender o clique.
 *
 * O número **nunca** é escrito à mão aqui: entra o mesmo valor que a página mostra, vindo
 * do motor de reservas. Página sem preço não inventa um: cai na prova alternativa (quantos
 * parceiros compara) e no CTA que ela consegue cumprir. Prometer no snippet o que a página
 * não entrega é a mesma quebra de promessa do ADR-009, só que antes do clique.
 */

/**
 * Teto do `<title>`. O Google corta em torno de 580px, e 62 caracteres é a aproximação
 * prática que o projeto usa desde a varredura de 22/09/2026.
 */
export const TITLE_MAX = 62;

/**
 * O título que couber, na ordem em que as partes importam.
 *
 * Título de página gerada varia de tamanho com o nome do aeroporto e com o texto da
 * pergunta: `Estacionamento mais barato em Guarulhos (GRU): setembro/2026 | Movepark` deu
 * 71 caracteres em produção, e o que o Google cortou foi justamente a marca. Em vez de
 * escrever o corte em cada rota, cada uma lista as variações da mais completa para a mais
 * enxuta e esta função devolve a primeira que cabe. Se nenhuma couber, corta a última em
 * palavra inteira, porque título pela metade de palavra é pior que título curto.
 */
export function pickTitle(...variacoes: string[]): string {
  const limpas = variacoes.map((v) => v.trim()).filter(Boolean);
  for (const v of limpas) if (v.length <= TITLE_MAX) return v;
  const ultima = limpas.at(-1) ?? "";
  return ultima.length <= TITLE_MAX ? ultima : cortarEmPalavra(ultima, TITLE_MAX);
}

/** O teto que o Google corta. Abaixo do piso, a description desperdiça espaço da SERP. */
export const META_MIN = 120;
export const META_MAX = 160;

/**
 * CTA por capacidade. Só a página cuja reserva fecha no Hub promete o tempo de checkout;
 * onde a reserva fecha no parceiro, o verbo é comparar, que é o que a Movepark entrega ali.
 */
export const META_CTA = {
  /** Reserva fecha no Hub (`checkout_mode = 'hub'`). */
  reservar: "Reserve online em 2 minutos.",
  /** Vitrine com preço: compara e leva ao parceiro. Serve para checkout externo. */
  comparar: "Compare e reserve pela Movepark.",
  /** Página sem preço e sem reserva (lote mapeado, institucional). */
  consultar: "Veja as opções e como chegar.",
  /** Conteúdo (blog, FAQ): o clique é para a informação, não para o carrinho. */
  conferir: "Confira a tabela atualizada.",
} as const;

export type MetaCta = keyof typeof META_CTA;

const brlMeta = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** "a partir de R$ 18,49 a diária" / "... em 7 diárias". Valor inválido não vira frase. */
export function priceHook(from: number | null | undefined, days = 1): string | null {
  if (from == null || !Number.isFinite(from) || from <= 0) return null;
  const periodo = days === 1 ? "a diária" : `em ${days} diárias`;
  return `A partir de ${brlMeta.format(from)} ${periodo}.`;
}

/**
 * Monta a description na estrutura acima, cabendo em `META_MAX`.
 *
 * A ordem de descarte protege o que não pode faltar: se estourar, sai primeiro o `extra`
 * (a geografia, que é enfeite), depois o preço. A palavra-chave e o CTA nunca saem, porque
 * são os dois motivos de a frase existir.
 */
export function buildMetaDescription(args: {
  /** Abre a frase. É a palavra-chave da página, sem ponto final. */
  keyword: string;
  /**
   * Texto que entra colado na palavra-chave (`chave: texto`) e é **encurtado para caber**,
   * em vez de descartado. É o caso da resposta numa página de FAQ: ela é o snippet, então
   * ela cede espaço ao preço, mas não sai da frase. Abaixo de `FILL_MIN` sai inteiro.
   */
  fill?: string | null;
  /** Prova de preço pronta (`priceHook`) ou qualquer outra prova numérica. */
  price?: string | null;
  /** Complemento da abertura: bairro, cidade, quantos parceiros. Sem ponto final. */
  extra?: string | null;
  cta: MetaCta;
}): string {
  const cta = META_CTA[args.cta];
  const preco = args.price?.trim() || null;
  const extra = args.extra?.trim().replace(/[.\s]+$/, "") || null;

  // Espaço que sobra para o `fill` com a frase inteira montada: chave + ": " + fill + "." +
  // " " + preço + " " + CTA. Sem esta conta o `fill` era um número fixo e a description
  // fechava em 115 caracteres, jogando fora um quarto do que o Google mostra.
  const fixo = args.keyword.length + 2 + 1 + (preco ? preco.length + 1 : 0) + cta.length + 1;
  const fill = args.fill?.trim() ? encolher(args.fill.trim(), META_MAX - fixo) : null;

  const abertura = fill && fill.length >= FILL_MIN ? `${args.keyword}: ${fill}` : args.keyword;

  const montar = (comExtra: boolean, comPreco: boolean) =>
    [
      `${abertura}${comExtra && extra ? `, ${extra}` : ""}.`,
      comPreco && preco ? preco : null,
      cta,
    ]
      .filter(Boolean)
      .join(" ");

  for (const [comExtra, comPreco] of [
    [true, true],
    [false, true],
    [true, false],
    [false, false],
  ] as const) {
    const texto = montar(comExtra, comPreco);
    if (texto.length <= META_MAX) return texto;
  }

  // Nem a palavra-chave com o CTA coube: a palavra-chave é o que resta, porque ela é a
  // frase, e o corte fecha em palavra inteira. Fatiar em `META_MAX` cru publicava um "Compare
  // e reserv" no fim do snippet.
  const soChave = `${args.keyword}.`;
  return soChave.length <= META_MAX ? soChave : cortarEmPalavra(soChave, META_MAX);
}

/** Abaixo disto o `fill` vira um toco e sai inteiro da frase. */
const FILL_MIN = 40;

/** Corta em `max` sem quebrar palavra e sem reticência: o texto segue sendo uma frase. */
function encolher(texto: string, max: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  if (max <= 0) return "";
  if (limpo.length <= max) return limpo;
  const corte = limpo.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return (espaco > 0 ? corte.slice(0, espaco) : corte).replace(/[.,;:]+$/, "");
}

/** Corta em `max` sem quebrar palavra, fechando com reticência e sem pontuação solta. */
function cortarEmPalavra(texto: string, max: number): string {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > 0 ? corte.slice(0, espaco) : corte).replace(/[.,;:]$/, "")}…`;
}
